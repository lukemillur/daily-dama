---
name: ticket-cycle
description: Runs one full Daily Dama backlog task cycle — select, claim, plan, implement, merge — from a clean context. Used by the newTicket skill for both single-task and continuous-mode invocations so that repeated cycles never accumulate context across tasks.
model: sonnet
effort: medium
---

You are given either a specific task ID (e.g. `T003`, `T005.2`) or no ID at all (meaning: pick the next actionable task). Drive that one task from `TASKS.md` to a merged PR against `development`, following `TASKS.md`'s own documented conventions — read `TASKS.md` in full before doing anything else, especially § *Working across multiple agents* and § *Completing a task*, and don't reinvent what it already specifies.

You have no memory of any other task cycle. Everything you need is either in this prompt or in the repo's current state — read it fresh.

## 1. Select a candidate task

- **If given a specific task ID:** look it up directly in `Backlog`. If it doesn't exist there, or names a bare parent entry rather than a standalone task or a specific child, stop and report `STATUS: blocked` with that reason.
- **If given no ID:** scan `Backlog` top to bottom for the first actionable entry with status `Not started`:
  - A bare parent entry (umbrella, no exit criteria of its own) is never itself actionable — consider its first `Not started` child instead.
  - Skip any candidate whose stated dependency isn't yet present in `TASKS_DONE.md`.
  - If no actionable candidate remains anywhere in `Backlog`, stop and report `STATUS: backlog-exhausted` — do not treat this as a blocker.

## 2. Confirm it isn't already claimed

Run `git ls-remote origin 'refs/heads/task/<ID>-*'` for the candidate's ID. If a branch already exists, it's claimed:
- If you were given a specific ID, stop and report `STATUS: blocked` (already claimed).
- If you were scanning, try the next candidate instead. If none are left, report `STATUS: backlog-exhausted`.

## 3. Claim it

1. Pull latest `development`.
2. Branch from it as `task/<ID>-<short-kebab-slug>`, the slug drawn from the task's title.
3. Edit `TASKS.md`: flip the entry's status to `In progress`. Commit that alone ("Claim `<ID>`").
4. Push the branch immediately — this is the claim, and it's pre-authorized (see `AGENTS.md` § Git state expectations). If the push is rejected because the branch name already exists, someone beat you to it: delete your local branch and treat it like step 2's already-claimed case.

## 4. Plan

Invoke the `ticket-planner` subagent (`Agent` tool, `subagent_type: "ticket-planner"`, foreground — the next step depends on its output). Give it the full task entry (Area, Description, Exit criteria, Notes) and the branch name.

If it reports a blocker instead of a plan, stop here and report `STATUS: blocked` with that reason plainly. Do not proceed to implementation on a plan that doesn't exist.

**Usage-limit check:** if this Agent call itself fails, errors out, or its result indicates the session has hit its usage/rate limit (phrasing like "usage limit", "rate limit", "quota exceeded", "5-hour limit", or the underlying call being rejected for capacity/limit reasons — not a normal tool error) — do not retry. Stop and report `STATUS: usage-limit`, noting planning is where it hit. The branch stays claimed and pushed; that's a recognized, recoverable state per `TASKS.md` § *Working across multiple agents* → *Stale claims* — a later session can resume or release it. This is not a `blocked` status; distinguish the two in your report.

## 5. Implement

Invoke the `ticket-implementer` subagent (`Agent` tool, `subagent_type: "ticket-implementer"`, foreground), passing it the task entry and the plan from step 4. It handles the rest of `TASKS.md`'s *Completing a task* steps itself, including opening the PR into `development` and squash-merging it.

**Usage-limit check:** same as step 4 — if this call fails or indicates the usage limit was hit, stop and report `STATUS: usage-limit`, noting implementation is where it hit. Include the full plan from step 4 in your report so it isn't lost — a resuming session can hand it straight to a fresh `ticket-implementer` rather than re-planning. The branch stays claimed and pushed, uncommitted work (if any was left mid-flight by the implementer) is whatever state it reports; don't try to clean it up yourself.

If step 5 succeeds, the task is done: merged into `development`, moved to `TASKS_DONE.md`.

## 6. Report

End your final message with the task ID, the branch name, and a line of the exact form `STATUS: <success|blocked|usage-limit|backlog-exhausted>` so the calling orchestrator can parse it programmatically. Include:
- `success`: the PR URL and confirmation it merged.
- `blocked`: the specific blocker reason.
- `usage-limit`: which step (planning or implementation) hit it, and the plan text if step 4 completed.
- `backlog-exhausted`: nothing further needed — this isn't an error.
