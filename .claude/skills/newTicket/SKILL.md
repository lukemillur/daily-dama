---
name: newTicket
description: Claims a Daily Dama backlog task — a specific one if named, otherwise the next available one — and drives it end-to-end against `development` via the ticket-claim, ticket-planner, and ticket-implementer agents (claim, plan, implement, merge). No plan-approval gate. When no task is named, keeps going: drives one task after another, each in fresh subagents so context never accumulates, until the backlog is exhausted, a blocker is hit, or the session's usage limit is reached.
allowed-tools: Read, Agent
---

Drive task(s) from `TASKS.md` to merged PRs against `development`. All the actual work — selecting, claiming, planning, implementing, merging — happens inside three subagents (`.claude/agents/ticket-claim.md`, `ticket-planner.md`, `ticket-implementer.md`), each invoked fresh for every task. This skill itself is the orchestrator: it never touches git or `TASKS.md` directly, and it never does planning or implementation work itself.

**Call all three subagents directly from this top-level session, in sequence, for each task.** Do not route the calls through an intermediate subagent that itself tries to call `Agent` — nested subagent-to-subagent delegation has failed in practice (the inner agent reported it couldn't reach the `Agent` tool and fell back to doing the work inline, which broke the fresh-context guarantee and let one call silently process multiple tasks). This top-level session is the only place `Agent` gets called.

**Always pass `isolation: "worktree"` on all three `Agent` calls** (`ticket-claim`, `ticket-planner`, `ticket-implementer`). This session's own working directory is a real checkout that may hold work of its own (uncommitted edits, a different branch checked out) — without worktree isolation, a subagent's `git checkout` of a task branch operates on that same shared directory and can silently sweep up or clash with whatever's sitting there. Each subagent already does its own branch fetch/checkout/push (see their individual instructions), so an isolated worktree is a drop-in — nothing about the claim/plan/implement logic changes, it just runs somewhere that can't collide with this session or with other cycles.

## One cycle

A "cycle" is exactly one task, taken through claim → plan → implement, via three separate `Agent` calls you make yourself.

**Progress updates:** since these calls are foreground and sequential, you're the only place a status is visible while a cycle is running — the subagents' internal work isn't shown to the user. Post a short, plain one-line status message (no headers, no emoji) as its own message at each checkpoint below, so the user can see progress at a glance without reading full reports. Keep each line to the task ID and what just happened, e.g. `T003: claimed (branch task/T003-...)`.

1. **Claim.** Post `T00x: claiming next task…` (or `T00x: claiming…` if a specific ID was given). Invoke `ticket-claim` (`Agent` tool, `subagent_type: "ticket-claim"`, foreground, `isolation: "worktree"`), passing a task ID if one was named, otherwise nothing.
   - `STATUS: blocked` or `STATUS: backlog-exhausted` — post `T00x: blocked — <reason>` or `no actionable tasks left in backlog`, and the cycle ends here; nothing to plan or implement. Carry the status forward to the cycle's outcome.
   - `STATUS: claimed` — post `T00x: claimed (branch <branch-name>) — <one-line task description>`, where the description is a concise paraphrase (not a verbatim dump) of the task's title/description from the entry `ticket-claim` returned, enough for the user to know what the task is at a glance. Take the task entry, branch name, and plan-file status from its report, and continue to step 2.
2. **Plan.** If `ticket-claim`'s report says `.claude/plans/<ID>.md` already exists on the branch (a resumed task whose planning already completed in an earlier, interrupted run), skip this step entirely: post `T00x: plan already exists (resuming) — skipping planning`, and go straight to step 3 with that file's path. Otherwise:

   Post `T00x: planning…`. Invoke `ticket-planner` (`Agent` tool, `subagent_type: "ticket-planner"`, foreground, `isolation: "worktree"`), giving it the full task entry and branch name from step 1.
   - If it reports a blocker instead of a plan, post `T00x: blocked at planning — <reason>`. The cycle ends with `STATUS: blocked` — the branch stays claimed for a future session. Do not proceed to implementation on a plan that doesn't exist.
   - If this `Agent` call itself fails, errors out, or its result indicates the session hit its usage/rate limit (phrasing like "usage limit", "rate limit", "quota exceeded", "5-hour limit", or the call being rejected for capacity reasons — not a normal tool error) — do not retry and do not do the planning yourself inline. Post `T00x: usage limit hit during planning`. The cycle ends with `STATUS: usage-limit`, noting planning is where it hit. The branch stays claimed and pushed, and if `ticket-planner` got far enough to commit `.claude/plans/<ID>.md` before the limit hit, that's preserved too — recoverable state per `TASKS.md` § *Working across multiple agents* → *Stale claims*.
   - Otherwise post `T00x: plan ready`.
3. **Implement.** Post `T00x: implementing…`. Invoke `ticket-implementer` (`Agent` tool, `subagent_type: "ticket-implementer"`, foreground, `isolation: "worktree"`), passing the task entry and the plan **file path** (`.claude/plans/<ID>.md`) — whether that path came from `ticket-claim`'s report (resumed case) or `ticket-planner`'s report (freshly planned this cycle), it's always a path, never the plan text itself; `ticket-implementer` reads the file directly. Only fall back to relaying full plan text if `ticket-planner` explicitly reported the commit/push failed and no file exists remotely. It handles the rest of `TASKS.md`'s *Completing a task* steps itself, including opening the PR into `development` and attempting the squash-merge.
   - Same usage-limit check as step 2, applied to this call: if it fails or indicates the limit was hit, don't do the implementation yourself inline. Post `T00x: usage limit hit during implementation`. The cycle ends with `STATUS: usage-limit`, noting implementation is where it hit. The plan is already durable in `.claude/plans/<ID>.md` on the branch, so nothing further needs preserving in your reply.
   - If it reports a scoping/blocker problem instead of a finished PR, post `T00x: blocked during implementation — <reason>`. The cycle ends with `STATUS: blocked`.
   - If it reports the code is done, the PR is open, but the merge itself was rejected (a failing check, missing review, branch protection, merge conflict — anything `gh pr merge` refused) — this is a distinct case from a scoping blocker: the implementation is finished, only the merge needs a human or a follow-up investigation. Post `T00x: blocked at merge (PR <URL>) — <the rejection reason ticket-implementer reported>`. The cycle ends with `STATUS: blocked`. Do not attempt the merge yourself, with any flags, to unblock this — `ticket-implementer` is required to have already stopped rather than force it (see its own instructions), and this session inherits that same boundary. Diagnosing or fixing the underlying blocker (e.g. broken CI config) is a separate, explicit task for you or the human to pick up outside this cycle, not something to fold into finishing the cycle.
   - Otherwise, its report will confirm the PR was opened and merged — this only becomes known once the whole call returns, so post both as two short lines back to back: `T00x: PR opened (<PR URL>)` then `T00x: merged into development`. The cycle ends with `STATUS: success`.

A cycle's outcome is always exactly one of `success | blocked | usage-limit | backlog-exhausted`, and covers exactly one task. Never let a single cycle span more than one task, and never substitute your own inline work for a subagent call that failed or was unreachable — that defeats the fresh-context design and the usage-limit guard.

## Usage-limit handling

There's no way to proactively check remaining usage before starting a cycle — this session has no tool that exposes the 5-hour window's remaining capacity. The guard is reactive instead: watch your own calls to `ticket-planner` and `ticket-implementer` (see steps 2–3 above) and treat `usage-limit` as a stop signal, not a blocker — the task stays claimed for a future session to resume, nothing is wrong with the task itself.

## Named task vs. continuous mode

Check whether a specific task was named when this skill was invoked — e.g. `/newTicket T003`, `/newTicket T005.2`, or plain language like "work on the laced count task." There's no special argument syntax to parse for this; just read what the user actually said.

**If a specific task was named:** run one cycle with that task ID. Report its outcome and stop — regardless of status.

**If no task was named (continuous mode):** run cycles back to back:

1. Run one cycle with no task ID (`ticket-claim` selects the next actionable task itself).
2. Append the cycle's outcome (task ID, PR URL if merged, or blocker/limit detail) to a running tally you keep in your own reply text — not in any file.
3. If the cycle's outcome was `success` — start the next cycle immediately, with no pause for confirmation (this is pre-authorized, matching the rest of the protocol's no-review-gate design).
4. If `backlog-exhausted` — stop the loop. This isn't an error; report the full tally of everything completed this run.
5. If `blocked` or `usage-limit` — stop the loop immediately. Never skip a blocked task and move to the next one. Report the full tally plus the blocker/limit detail from the cycle that stopped it.

Each cycle's three subagent calls are fresh, with no memory of prior cycles, by design — this keeps context from accumulating across a long continuous run.

## Report

Summarize plainly. Single-task mode: which task, the branch name, the PR URL — or the blocker/usage-limit detail if it didn't finish. Continuous mode: the full tally of every task's outcome this run, and why the loop stopped.
