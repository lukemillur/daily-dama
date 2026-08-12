---
name: newTicket
description: Claims a Daily Dama backlog task — a specific one if named, otherwise the next available one — and drives it end-to-end against `development`: deterministic claim script, then the ticket-planner and ticket-implementer agents (plan, implement, merge). No plan-approval gate. When no task is named, keeps going: one task after another, each in fresh subagents so context never accumulates, until the backlog is exhausted, a blocker is hit, or the session's usage limit is reached. Also resumes an interrupted task with `/newTicket resume T0NN`.
allowed-tools: Agent, Read, Bash(node .claude/scripts/ticket-claim.mjs:*), Bash(node .claude/scripts/worktree-cleanup.mjs:*), Bash(git worktree list:*)
disallowed-tools: Edit, Write, NotebookEdit, WebFetch, WebSearch
---

Drive task(s) from `TASKS.md` to merged PRs against `development`.

You are the orchestrator. You never edit files, never plan, never implement, and never run git yourself. Everything happens in exactly two places:

- **`node .claude/scripts/ticket-claim.mjs`** — selection, dependency checks, collision detection, branching, the status flip, the claim commit and push. Deterministic; no model context. Prints one JSON object.
- **`ticket-planner` / `ticket-implementer` subagents** — invoked fresh for every task, always with `isolation: "worktree"` and `run_in_background: false`.

**Call the subagents directly from this top-level session.** Never route them through an intermediate subagent that itself calls `Agent` — nested delegation has failed in practice (the inner agent couldn't reach `Agent`, did the work inline, and one call silently processed several tasks). This session is the only place `Agent` gets called.

**This session's working directory must already be the repo root** — worktree isolation resolves the repo from cwd, so running this skill from elsewhere breaks every subagent's fetch/checkout and the scripts' relative paths.

## Invocation

Read what the user actually said; there's no argument syntax to parse.

| They said | You run |
| :-- | :-- |
| `/newTicket` (nothing named) | continuous mode: cycles back to back |
| `/newTicket T035`, "work on the laced count task" | one cycle for that task |
| `/newTicket resume T034`, `/newTicket T034 --resume` | one cycle resuming that task's existing claim branch |

## One cycle

Exactly one task, claim → plan (maybe) → implement → cleanup. Post a short plain one-line status (no headers, no emoji) as its own message at each checkpoint — you're the only visible progress while a cycle runs.

### 1. Claim

```sh
node .claude/scripts/ticket-claim.mjs                 # continuous: next actionable task
node .claude/scripts/ticket-claim.mjs T035            # named
node .claude/scripts/ticket-claim.mjs resume T034     # resume
```

Parse the JSON. Its `status` is one of:

- **`claimed`** — post `T0NN: claimed (branch <branch>) — <one-line paraphrase of the task>`. Carry `entry`, `branch`, `planFile`, `planExists`, `planning` into step 2.
- **`resumed`** — post `T0NN: resuming <branch> (plan <exists|missing>)`. Same fields; the script did not modify the branch.
- **`blocked`** — post `T0NN: blocked — <blocker.detail>`. Cycle ends. If `blocker.resumeCommand` is present, include it verbatim so the user can pick the task back up.
- **`backlog-exhausted`** — post `no actionable tasks left in backlog`. Cycle ends; not an error.

The script never steals or rewrites an existing claim branch. A task that already has a remote `task/<ID>-*` branch is reported `blocked` with reason `claimed`, in named *and* continuous mode — continuous mode stops there rather than skipping ahead, because skipping is how claimed work gets forgotten.

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

- `STATUS: blocked` → post `T0NN: blocked during implementation — <reason>`; cycle ends `blocked`.
- `STATUS: blocked-at-merge` → the code is done and the PR is open; only the merge was refused. Post `T0NN: blocked at merge (PR <URL>) — <the exact rejection>`; cycle ends `blocked`. **Do not attempt the merge yourself, with any flags.** The implementer is required to stop rather than force it, and you inherit that boundary. Diagnosing the underlying cause is a separate task, not part of finishing this cycle.
- Usage limit → cycle ends `usage-limit`.
- `STATUS: merged` → post `T0NN: PR opened (<URL>)` then `T0NN: merged into development`; cycle ends `success`.

### 4. Clean up the stage worktree

Claude Code holds a `git worktree lock` on an agent's worktree while it runs, so an agent cannot remove its own — that's why they used to accumulate. Removal is yours, after the call returns:

```sh
node .claude/scripts/worktree-cleanup.mjs --path <WORKTREE from the agent's report>
```

Run it after the planner returns, and after a `merged` implementer. Also run it after a `blocked` or `usage-limit` stage — it removes nothing that could lose work: it refuses any worktree that is the main checkout, locked, on a branch, dirty, holding commits that exist nowhere else, has a live process inside it, or sits outside `.claude/worktrees/`. A rejected-merge worktree stays put by design.

If a path comes back `refused` with reason `locked`, the harness lock hasn't released yet — don't force it. Retry the same `--path` at the next checkpoint (start of the next cycle, or end of the run) and report anything still remaining.

Keep a list, in your reply text, of every worktree path that survived cleanup. At the end of the run:

```sh
node .claude/scripts/worktree-cleanup.mjs --path <each deferred path>
node .claude/scripts/worktree-cleanup.mjs --prefix newticket-claim-
```

The second sweeps temporary claim worktrees left behind by an interrupted claim. Never pass `--prefix agent-` or clean up worktrees this run didn't create — pre-existing ones are user-owned.

## Cycle outcomes

A cycle covers exactly one task and ends in exactly one state. Never let a cycle span two tasks, and never substitute your own inline work for a subagent call that failed — that defeats the fresh-context design and the usage-limit guard.

| Outcome | Meaning | Continuous mode |
| :-- | :-- | :-- |
| `success` | merged into `development` | start the next cycle immediately, no confirmation |
| `blocked` | claim, plan, implementation or merge stopped on a specific reason | stop the loop; report the reason |
| `usage-limit` | an `Agent` call failed for capacity reasons | stop the loop; the task stays claimed and resumable |
| `backlog-exhausted` | no actionable task remains | stop the loop; not an error |

`claimed` and `resumed` are claim-step statuses, not cycle outcomes — a cycle that claims successfully continues to plan/implement and ends in one of the four above.

## Usage-limit handling

Nothing exposes remaining capacity ahead of time, so the guard is reactive: if an `Agent` call fails, errors out, or its result mentions a usage/rate/quota/5-hour limit or a capacity rejection (not a normal tool error), do **not** retry and do **not** do the work yourself. Post `T0NN: usage limit hit during <planning|implementation>` and end the cycle with `usage-limit`.

Nothing is wrong with the task: the branch stays claimed and pushed, and a committed `.claude/plans/<ID>.md` survives. Recover with `/newTicket resume T0NN`, which detects the durable plan and skips straight to implementation.

## Continuous mode

1. Run a cycle with no task ID.
2. Append its outcome (task ID, PR URL, or blocker/limit detail) to a running tally in your reply text — not in any file.
3. `success` → next cycle immediately (pre-authorized, matching the protocol's no-review-gate design).
4. `blocked`, `usage-limit` or `backlog-exhausted` → stop. Never skip a blocked task to reach the next one.

Each cycle's subagents are fresh, with no memory of prior cycles, by design.

## Report

Single-task mode: which task, the branch, the PR URL — or the blocker/usage-limit detail. Resume mode: also say whether a durable plan was reused. Continuous mode: the full tally of every task's outcome and why the loop stopped. Always: any worktrees left behind and why.
