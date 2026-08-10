---
name: newTicket
description: Claims a Daily Dama backlog task — a specific one if named, otherwise the next available one — and drives it end-to-end against `development` via the ticket-cycle agent (plan, implement, merge). No plan-approval gate. When no task is named, keeps going: drives one task after another, each in a fresh subagent so context never accumulates, until the backlog is exhausted, a blocker is hit, or the session's usage limit is reached.
allowed-tools: Read, Agent
---

Drive task(s) from `TASKS.md` to merged PRs against `development`. All the actual work — selecting, claiming, planning, implementing, merging — happens inside the `ticket-cycle` subagent (`.claude/agents/ticket-cycle.md`), invoked fresh for every task. This skill itself is just the calling loop: it never touches git or `TASKS.md` directly.

## Usage-limit handling

There's no way to proactively check remaining usage before starting a cycle — this session has no tool that exposes the 5-hour window's remaining capacity. The guard is reactive instead: `ticket-cycle` watches its own calls to the planner and implementer subagents and reports `STATUS: usage-limit` if either one fails or indicates the session hit its usage/rate limit, rather than retrying or pushing on into a half-done task. Treat that status as a stop signal, not a blocker — the task stays claimed for a future session to resume, nothing is wrong with the task itself.

## Named task vs. continuous mode

Check whether a specific task was named when this skill was invoked — e.g. `/newTicket T003`, `/newTicket T005.2`, or plain language like "work on the laced count task." There's no special argument syntax to parse for this; just read what the user actually said.

**If a specific task was named:** invoke `ticket-cycle` once (`Agent` tool, `subagent_type: "ticket-cycle"`, foreground), passing it that task ID. Report its outcome and stop — regardless of `STATUS`.

**If no task was named (continuous mode):** repeatedly invoke `ticket-cycle` (foreground, no task ID — let it select the next actionable task itself) in a loop:

1. Invoke `ticket-cycle` with no task ID.
2. Read its `STATUS` line and append the outcome (task ID, PR URL if merged, or blocker/limit detail) to a running tally you keep in your own reply text — not in any file.
3. If `STATUS: success` — go back to step 1 and start the next cycle immediately, with no pause for confirmation (this is pre-authorized, matching the rest of the protocol's no-review-gate design).
4. If `STATUS: backlog-exhausted` — stop the loop. This isn't an error; report the full tally of everything completed this run.
5. If `STATUS: blocked` or `STATUS: usage-limit` — stop the loop immediately. Never skip a blocked task and move to the next one. Report the full tally plus the blocker/limit detail from the cycle that stopped it.

Each cycle is a fresh subagent with no memory of prior cycles, by design — this keeps context from accumulating across a long continuous run. Don't try to shortcut that by doing the work inline yourself instead of delegating to `ticket-cycle`.

## Report

Summarize plainly. Single-task mode: which task, the branch name, the PR URL — or the blocker/usage-limit detail if it didn't finish. Continuous mode: the full tally of every task's outcome this run, and why the loop stopped.
