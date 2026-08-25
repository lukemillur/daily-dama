---
name: newTicket
description: Claims a Daily Dama backlog task — a specific one if named, otherwise the next available one — and drives it end-to-end against `development`: deterministic claim script, then the ticket-planner and ticket-implementer agents (plan, implement, merge). No plan-approval gate. When no task is named, keeps going: one task after another, each in fresh subagents so context never accumulates, by default in TASKS.md file order — pass `ranked` (`/newTicket ranked`) to instead pick each cycle's task by unblock value (how many other pending tasks depend on it, then declared Priority). A task that gets blocked (claimed, or blocked at planning/implementation/merge) is recorded and skipped, not fatal — the loop moves on to any other independent task, while a task that actually depends on the blocked one stays correctly skipped too. The loop stops only when the backlog is exhausted, the claim mechanism itself fails, or the session's usage limit is reached. Also resumes an interrupted task with `/newTicket resume T0NN`.
allowed-tools: Agent(ticket-planner), Agent(ticket-implementer), Bash(node .claude/scripts/ticket-claim.mjs:*), Bash(node .claude/scripts/worktree-cleanup.mjs:*)
disallowed-tools: Artifact, AskUserQuestion, BashOutput, Edit, EnterWorktree, ExitWorktree, Glob, Grep, KillShell, Monitor, NotebookEdit, Read, SendMessage, Skill, SlashCommand, TaskCreate, TaskGet, TaskList, TaskStop, TaskUpdate, TodoWrite, ToolSearch, WebFetch, WebSearch, Write, mcp__Claude_Browser__*
---

Drive task(s) from `TASKS.md` to merged PRs against `development`.

**Never read, reference, or act on `TASKS_BACKLOG.md`.** It holds tasks the user has deliberately excluded from automation. This orchestrator's own `disallowed-tools` already blocks `Read`/`Grep`/`Glob`, so you cannot open that file directly — but if a subagent report, a task description, or any other input mentions a task ID or content that only exists in `TASKS_BACKLOG.md` and not in `TASKS.md`, treat it as out of scope and do not claim, plan, or implement it. `ticket-claim.mjs` only ever parses `TASKS.md` and `TASKS_DONE.md`, which is what actually keeps backlog-only tasks out of automated selection — this note exists so no future edit to this skill accidentally points it at the excluded file.

You are the orchestrator. You never edit files, never plan, never implement, and never run git yourself. Everything happens in exactly two places:

- **`node .claude/scripts/ticket-claim.mjs`** — selection, dependency checks, collision detection, branching, the status flip, the claim commit and push. Deterministic; no model context. Prints one JSON object.
- **`ticket-planner` / `ticket-implementer` subagents** — invoked fresh for every task, always with `isolation: "worktree"` and `run_in_background: false`.

**Call the subagents directly from this top-level session.** Never route them through an intermediate subagent that itself calls `Agent` — nested delegation has failed in practice (the inner agent couldn't reach `Agent`, did the work inline, and one call silently processed several tasks). This session is the only place `Agent` gets called.

Claude Code skills do not support a true positive tool allowlist: `allowed-tools`
pre-approves calls but does not hide every unlisted tool. This skill therefore
scopes `Agent` to the two ticket agents, pre-approves only the deterministic
claim/cleanup scripts, and removes unrelated built-in tools with
`disallowed-tools`. Do not use any other Bash command from this orchestrator.

**This session's working directory must already be the repo root** — worktree isolation resolves the repo from cwd, so running this skill from elsewhere breaks every subagent's fetch/checkout and the scripts' relative paths.

Subagents run in isolated worktrees but share this machine's filesystem with the main checkout at that same repo root. Both `ticket-planner` and `ticket-implementer` are instructed to pin themselves to their own worktree root and never `cd` into the main checkout, but if a subagent's report ever mentions edits or test runs having landed in the wrong location, treat it as a real incident: run `git status` in the main checkout yourself before trusting that a stated revert actually happened, and don't wave it off as routine.

## Invocation

Read what the user actually said; there's no argument syntax to parse.

| They said | You run |
| :-- | :-- |
| `/newTicket` (nothing named) | continuous mode: cycles back to back, file order |
| `/newTicket ranked` | continuous mode: cycles back to back, highest-unblock-value order |
| `/newTicket T035`, "work on the laced count task" | one cycle for that task |
| `/newTicket resume T034`, `/newTicket T034 --resume` | one cycle resuming that task's existing claim branch |

`ranked` only changes *which* actionable task continuous mode reaches first each cycle — every other rule on this page (skip/stop conditions, one task per cycle, fresh subagents) is identical. It cannot combine with a task ID or `resume`; both of those already pick one task directly, so `ticket-claim.mjs` rejects the combination as a usage error rather than guessing which one wins.

**Default to file order.** Pass `ranked` to `ticket-claim.mjs` only when the user's own words literally contain `ranked` (e.g. `/newTicket ranked`, "run newTicket ranked"). Do not infer ranked mode from context, from a prior conversation, from this being a "good default," or from any other signal — an invocation with no such word, including a bare `/newTicket`, always means file order.

## One cycle

Exactly one task, claim → plan (maybe) → implement → cleanup. Post a short plain one-line status (no headers, no emoji) as its own message at each checkpoint — you're the only visible progress while a cycle runs.

### 1. Claim

```sh
node .claude/scripts/ticket-claim.mjs                 # continuous: next actionable task, file order
node .claude/scripts/ticket-claim.mjs ranked          # continuous: next actionable task, ranked by unblock value
node .claude/scripts/ticket-claim.mjs T035            # named
node .claude/scripts/ticket-claim.mjs resume T034     # resume
```

Parse the JSON. Its `status` is one of:

- **`claimed`** — post `T0NN: claimed (branch <branch>) — <one-line paraphrase of the task>`. When `ranked` is `true`, also mention `unblockFanOut` in that line (e.g. "— ranked pick, unblock fan-out 4"). Carry `entry`, `branch`, `planFile`, `planExists`, `planning` into step 2.
- **`resumed`** — post `T0NN: resuming <branch> (plan <exists|missing>)`. Same fields; the script did not modify the branch.
- **`blocked`** — post `T0NN: blocked — <blocker.detail>`. Cycle ends. If `blocker.resumeCommand` is present, include it verbatim so the user can pick the task back up. Whether this also ends the *run* (continuous mode) depends on the reason — see Continuous mode below.
- **`backlog-exhausted`** — post `no actionable tasks left in backlog`. Cycle ends; not an error.

The script never steals or rewrites an existing claim branch. In **named** mode (an explicit task ID, or `resume`), a task that already has a remote `task/<ID>-*` branch is reported `blocked` with reason `claimed` — the caller asked for that specific task, so there is nothing to fall back to. In **continuous** mode the same situation is instead recorded in `skipped` (reason `claimed`) and the deterministic scan moves on to the next actionable task on its own — you never see it as this cycle's outcome. See Continuous mode below for the (rarer) case where `claimed` still reaches you there.

### 2. Plan — only when required

Decide from the claim JSON:

| Condition | Do |
| :-- | :-- |
| `planExists: true` | Skip planning. Post `T0NN: plan already exists (resuming)`. Go to step 3 with `planFile`. |
| `planning.policy == "implementer"` | Skip planning. Post `T0NN: planning inline (<planning.reason>)`. Go to step 3 and pass `PLANNING: implementer` instead of a plan path. |
| `planning.policy == "required"` | Run `ticket-planner`. |

Never invent a third route, and never skip a `required` planner to save time — the policy already accounts for cost. `planning.source` tells you why: `field` (the task declared it), `default` (no `**Planning:**` field — safe default is the separate planner), `escalated` (the task said `Implementer` but touches persistence, schema, state machines, concurrency, architecture boundaries or native APIs), `existing-plan`.

Post `T0NN: planning…`, then invoke `ticket-planner` (`subagent_type: "ticket-planner"`, `isolation: "worktree"`, `run_in_background: false`) with the full task entry and branch name.

- `STATUS: blocked` → post `T0NN: blocked at planning — <reason>`; cycle ends `blocked`. The branch stays claimed for a future session. Do not implement against a plan that doesn't exist.
- Usage limit (see below) → cycle ends `usage-limit`.
- Otherwise post `T0NN: plan ready` and take `planFile` and `WORKTREE` from its report.

Run cleanup on the planner's `WORKTREE` path (step 4) before moving on.

### 3. Implement

Post `T0NN: implementing…`, then invoke `ticket-implementer` (`subagent_type: "ticket-implementer"`, `isolation: "worktree"`, `run_in_background: false`) with the task entry, the branch, and either the plan **file path** (never the plan text — it reads the file itself) or `PLANNING: implementer`.

- `RESULT.status: blocked` → post `T0NN: blocked during implementation — <reason>`; cycle ends `blocked`.
- `RESULT.status: blocked-at-merge` → the code is done and the PR is open; only the merge was refused. Post `T0NN: blocked at merge (PR <URL>) — <the exact rejection>`; cycle ends `blocked`. **Do not attempt the merge yourself, with any flags.** The implementer is required to stop rather than force it, and you inherit that boundary. Diagnosing the underlying cause is a separate task, not part of finishing this cycle.
- Usage limit → cycle ends `usage-limit`.
- `RESULT.status: merged` → post `T0NN: PR opened (<URL>)` then `T0NN: merged into development`; cycle ends `success`.

The implementer reports a single `RESULT:` JSON line. Use its read-only
`merge.status` as the source of truth: `merged` means success even if the merge
command itself returned non-zero. A `not-merged` or `unavailable` reconciliation
is the only route to `blocked-at-merge`. Do not make another merge attempt.
Before accepting `success`, confirm every `exitCriteria` record is `passed`;
otherwise report the evidence gap as `blocked` rather than claiming full
verification.

### 4. Clean up the stage worktree

Claude Code holds a `git worktree lock` on an agent's worktree while it runs, so an agent cannot remove its own — that's why they used to accumulate. Removal is yours, after the call returns:

```sh
node .claude/scripts/worktree-cleanup.mjs --path <WORKTREE from the agent's report>
```

Run it after the planner returns, and after a `merged` implementer. Also run it after a `blocked` or `usage-limit` stage — it removes nothing that could lose work: it refuses any worktree that is the main checkout, locked, on a branch, dirty, holding commits that exist nowhere else, has a live process inside it, or sits outside `.claude/worktrees/`. A rejected-merge worktree stays put by design.

If a path comes back `refused` with reason `locked`, the harness lock hasn't released yet — don't force it. Retry the same `--path` at the next checkpoint (start of the next cycle, or end of the run) and report anything still remaining.

Keep a list, in your reply text, of every worktree path that survived cleanup. At the end of the run, retry only paths created by this cycle:

```sh
node .claude/scripts/worktree-cleanup.mjs --path <each deferred path>
```

Never use a broad prefix sweep or clean up worktrees this run did not create — pre-existing worktrees are user-owned. A Codex-specific resume stage is released only by its explicit task-and-branch safety check, not by this Claude workflow.

## Cycle outcomes

A cycle covers exactly one task and ends in exactly one state. Never let a cycle span two tasks, and never substitute your own inline work for a subagent call that failed — that defeats the fresh-context design and the usage-limit guard.

| Outcome | Meaning | Continuous mode |
| :-- | :-- | :-- |
| `success` | merged into `development` | start the next cycle immediately, no confirmation |
| `blocked` at the claim step, reason ≠ `claimed` | the claim mechanism itself failed for this task (stray local branch, failed push with no competing branch, script error) | stop the loop; report the reason — retrying would just hit the same failure on the same task forever |
| `blocked`, reason `claimed`, or blocked during planning/implementation/merge | this specific task can't proceed right now, but the claim/plan/implement machinery is fine | record it, start the next cycle — see Continuous mode below |
| `usage-limit` | an `Agent` call failed for capacity reasons | stop the loop; the task stays claimed and resumable |
| `backlog-exhausted` | no actionable task remains | stop the loop; not an error |

`claimed` and `resumed` are claim-step statuses, not cycle outcomes — a cycle that claims successfully continues to plan/implement and ends in one of the four above.

## Usage-limit handling

Nothing exposes remaining capacity ahead of time, so the guard is reactive: if an `Agent` call fails, errors out, or its result mentions a usage/rate/quota/5-hour limit or a capacity rejection (not a normal tool error), do **not** retry and do **not** do the work yourself. Post `T0NN: usage limit hit during <planning|implementation>` and end the cycle with `usage-limit`.

Nothing is wrong with the task: the branch stays claimed and pushed, and a committed `.claude/plans/<ID>.md` survives. Recover with `/newTicket resume T0NN`, which detects the durable plan and skips straight to implementation.

## Continuous mode

If the user said `ranked`, pass it through to every claim call this run (step 1's command becomes `node .claude/scripts/ticket-claim.mjs ranked`). Nothing else below changes: `ticket-claim.mjs` re-parses `TASKS.md`/`TASKS_DONE.md` and recomputes the ranking fresh on every call, so a merge earlier in the run that unblocks a new ticket is already reflected in the very next cycle's pick — there is no separate re-ranking step for you to remember.

1. Run a cycle with no task ID.
2. Append its outcome (task ID, PR URL, or blocker/limit detail) to a running tally in your reply text — not in any file.
3. `success` → next cycle immediately (pre-authorized, matching the protocol's no-review-gate design).
4. `blocked` at the claim step (step 1) for a reason other than `claimed` → stop the run. This means the claim mechanism itself failed for that task — a stray local branch, a push that failed with no competing branch, or a script error — and blindly retrying would just reselect the same task and hit the same failure again. Report it as you would any blocker.
5. Any other `blocked` — the rare claim-step `claimed` (a lost push race on the task the scan just selected), or a block from planning, implementation, or merge — → record it in the tally and start the next cycle immediately, same as `success`. Do **not** stop the run for this: the task's own claim branch already exists remotely, so the next `ticket-claim.mjs` call skips right past it on its own (continuous-mode selection now treats an already-claimed candidate as a skip, not a stop) and moves on to an unrelated task later in the backlog. A task that genuinely `depends on` the blocked one keeps getting skipped too, automatically, by the script's own dependency check — never work around that check yourself to "unblock" a dependent task early.
6. `usage-limit` or `backlog-exhausted` → stop.

Each cycle's subagents are fresh, with no memory of prior cycles, by design.

## Report

Single-task mode: which task, the branch, the PR URL — or the blocker/usage-limit detail. Resume mode: also say whether a durable plan was reused. Continuous mode: the full tally of every task's outcome and why the loop stopped. Always: any worktrees left behind and why.
