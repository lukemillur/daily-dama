---
name: newTicket
description: Claims a Daily Dama backlog task — a specific one if named, otherwise the next available one — and drives it end-to-end: plans it with a high-effort Sonnet 5 planner, implements it with a medium-effort Sonnet 5 implementer, and opens a PR. No plan-approval gate.
allowed-tools: Read, Edit, Bash, Agent
---

Claim and drive one task from `TASKS.md` to a PR, following its own documented conventions rather than reinventing them. Read `TASKS.md` in full before doing anything else, especially § *Working across multiple agents* and § *Completing a task* — the steps below assume that protocol and don't restate it.

## 1. Select a candidate task

Check whether a specific task was named when this skill was invoked — e.g. `/newTicket T003`, `/newTicket T005.2`, or plain language like "work on the laced count task." There's no special argument syntax to parse for this; just read what the user actually said.

- **If a specific task was named:** look it up directly in `Backlog` by ID. If it doesn't exist there, or names a bare parent entry rather than a standalone task or a specific child, say so plainly and stop — don't silently substitute a different task. Otherwise, that's the candidate; skip the scan below.
- **If no task was named:** scan `Backlog` top to bottom for the first actionable entry with status `Not started`:
  - A bare parent entry (umbrella, no exit criteria of its own) is never itself actionable — consider its first `Not started` child instead.
  - Skip any candidate whose stated dependency isn't yet present in `TASKS_DONE.md`.

## 2. Confirm it isn't already claimed

Run `git ls-remote origin 'refs/heads/task/<ID>-*'` for the candidate's ID. If a branch already exists, it's claimed — go back to step 1 and try the next candidate. If none are left, report that plainly and stop; do not create a branch.

## 3. Claim it

1. Pull latest `main`.
2. Branch from it as `task/<ID>-<short-kebab-slug>`, the slug drawn from the task's title.
3. Edit `TASKS.md`: flip the entry's status to `In progress`. Commit that alone ("Claim `<ID>`").
4. Push the branch immediately — this is the claim, and it's pre-authorized (see `AGENTS.md` § Git state expectations). If the push is rejected because the branch name already exists, someone beat you to it: delete your local branch, go back to step 1, and try another candidate rather than forcing anything.

## 4. Plan

Invoke the `ticket-planner` subagent (`Agent` tool, `subagent_type: "ticket-planner"`, run in the foreground — the next step depends on its output). Give it the full task entry (Area, Description, Exit criteria, Notes) and the branch name.

If it reports a blocker instead of a plan, stop here and report the blocker plainly. Do not proceed to implementation on a plan that doesn't exist.

## 5. Implement

Invoke the `ticket-implementer` subagent (`Agent` tool, `subagent_type: "ticket-implementer"`, foreground), passing it the task entry and the plan from step 4. It handles the rest of `TASKS.md`'s *Completing a task* steps itself, including opening the PR.

## 6. Report

Summarize plainly: which task was claimed, the branch name, the PR URL — or the blocker and where things stopped, if step 4 or 5 didn't complete.
