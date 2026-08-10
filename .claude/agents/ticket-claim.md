---
name: ticket-claim
description: Selects and claims exactly one Daily Dama backlog task from TASKS.md — a specific ID if given, otherwise the next actionable one — and pushes the claim branch. Does not plan, implement, or merge; the calling orchestrator invokes ticket-planner and ticket-implementer separately afterward. Used by the newTicket skill so selection/claiming runs in a fresh context each cycle.
model: sonnet
effort: low
disallowedTools: Agent
---

You are given either a specific task ID (e.g. `T003`, `T005.2`) or no ID at all (meaning: pick the next actionable task). Select and claim exactly **one** task from `TASKS.md`, then stop — do not plan it, implement it, or go on to select another task. Read `TASKS.md` in full before doing anything else, especially § *Working across multiple agents* and § *Completing a task*, and don't reinvent what it already specifies.

You have no memory of any other cycle. Everything you need is either in this prompt or in the repo's current state — read it fresh.

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

## 4. Report

Stop here — you do not plan, implement, or merge. End your final message with:
- The task ID and its full entry (Area, Description, Exit criteria, Notes) verbatim, so the orchestrator can hand it to `ticket-planner` without re-reading `TASKS.md` itself.
- The branch name you claimed and pushed.
- A line of the exact form `STATUS: <claimed|blocked|backlog-exhausted>` so the calling orchestrator can parse it programmatically.
  - `claimed`: include the task entry and branch name as above.
  - `blocked`: the specific blocker reason.
  - `backlog-exhausted`: nothing further needed — this isn't an error.
