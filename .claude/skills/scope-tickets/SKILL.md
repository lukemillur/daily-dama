---
name: scope-tickets
description: Turn a Ready-for-scoping user story in BACKLOG_STORIES.md into one or more mechanically verifiable TASKS.md entries, using codebase context to decide area, planning requirement, and exit criteria. Use when the user asks to scope, promote, or turn a backlog story into a ticket. Does not judge product value or priority — that decision already happened in the product-manager skill.
---

# Daily Dama Ticket Scoping

Translate a user story that product thinking has already validated into a concrete, buildable `TASKS.md` entry. This skill is purely technical scoping: given a story and the real codebase, decide what changes, where, how big, and how it's verified. It does not evaluate whether the story is worth building — treat `Ready for scoping` as a settled decision, not something to re-litigate.

If a story looks like weak product reasoning, over-scoped, or duplicative, say so and stop — send it back to `product-manager` rather than scoping it anyway or silently fixing the product problem yourself.

## Input

- A named story ID (e.g. `S014`) or "the ready ones" — resolve to entries in `BACKLOG_STORIES.md` with `Status: Ready for scoping`.
- If no story is named and more than one is ready, list them and ask which to scope, unless the user said "all of them."
- If a named story isn't `Ready for scoping`, stop and say so — don't scope a `Proposed` or `Rejected` story just because it was named.

## Codebase context gathering

Read what the story actually touches before scoping it — don't guess:

1. `AGENTS.md`, especially the state/persistence domain boundaries, custom-trick invariants, and Sesh/Stats behavior sections relevant to the story.
2. `TASKS.md` from top to bottom: current scoping rules, ID sequence, active platform scope, and any existing task that already covers or overlaps this story.
3. `TASKS_DONE.md` for recently completed work the story might build on or duplicate.
4. Feature handoffs relevant to the story's area (`TRICK_VIZ_HANDOFF.md`, `DEPLOYMENT_HANDOFF.md`).
5. The actual routes, components, reducers, persistence adapters, and tests the story would touch — enough to judge size and risk, not a full implementation plan.

## Scoping decisions

For each story, work out:

- **Area** — one feature area or persistence domain. If the story spans more than one, either split it into sequential child tasks or send it back to `product-manager` as two stories.
- **Size** — must fit one focused commit. If it can't, use an umbrella task plus numbered S-sized children for a genuinely sequential chain; don't force an oversized single task.
- **Planning: Required vs Implementer** — `Required` for persistence/schema changes, state machines, concurrency, architectural boundaries, unfamiliar APIs, or expensive-to-undo work. `Implementer` only for genuinely local, low-risk work.
- **Exit criteria** — mechanical and checkable: a test, a command, or a specific browser behavior. Never "looks right" alone.
- **Platform scope** — web only. If the story's acceptance criteria can only be fulfilled with native work, stop and flag it rather than writing a task the repo's active scope forbids, unless the user has explicitly resumed mobile hardening in this conversation.

Follow `TASKS.md`'s own conventions exactly — ID sequence, `Needs scoping` vs `Backlog` placement, existing formatting — over anything written here if the two disagree; this file describes intent, `TASKS.md` is the format's source of truth.

Use this format when drafting a ticket:

```md
### [T###] <short imperative title>

- **Area:** <one feature area or persistence domain>
- **Priority:** High / Medium / Low
- **Status:** Not started
- **Planning:** Required / Implementer
- **Description:** <what changes and why, in 1–3 sentences>
- **Exit criteria:** <one coherent, mechanical verification>
- **Notes:** <assumptions, dependencies, deferred ideas>
```

Carry `Priority` over from the story unless the codebase surfaces a reason to disagree — if so, flag the conflict to the user rather than silently overriding it.

## Traceability

Scoping a story is not done when `TASKS.md` is written — it's done when `BACKLOG_STORIES.md` reflects it too. The two writes are one unit of work, not a main step plus an optional follow-up:

- Update the source story's `Status` to `Scoped → T###` (or one `Scoped →` line per child task if it split into several) in the same turn you write the `TASKS.md` entry.
- Do not touch any other field while doing this — the status line is the only thing this step changes.
- A story left at `Ready for scoping` after its ticket exists in `TASKS.md` is a bug in this skill's own output, not a stylistic choice — treat it as a reason to go back and fix the status before considering the run finished.
- If scoping a story is deferred, rejected, or sent back to `product-manager` instead of promoted (see the opening section), that is also a status change worth recording — don't leave `BACKLOG_STORIES.md` silently stale either way. Deferred/rejected/sent-back stories are never removed — only a promoted (`Scoped → T###`) story is a removal candidate, per the cleanup step below.

## Cleanup: remove scoped stories from the backlog

As the final step of a scoping run, delete each story entry this run promoted to `Scoped → T###` from `BACKLOG_STORIES.md` entirely — heading, all fields, everything. `TASKS.md` is the entry's permanent record from this point forward (the ticket's own `Description`/`Notes` carry the "why," and the batch-note comment above each ticket range already cites the originating story ID), so the backlog no longer needs to hold it.

- Only delete entries that reached `Scoped → T###` in *this* run. Don't sweep up older `Scoped →` entries left over from previous runs as a side effect — that's a separate, deliberate cleanup pass, not an automatic consequence of running this skill.
- Never delete a `Proposed`, `Ready for scoping`, or `Rejected` entry, or one sent back to `product-manager` this run — only a promoted entry qualifies.
- Do this after the status-flip write, not instead of it — the sequence is: write `TASKS.md`, flip the status to `Scoped → T###`, then remove that same entry. Even though both edits land in the same diff, skipping straight to deletion without ever writing `Scoped → T###` leaves no intermediate record of which story produced which ticket.
- Show the deleted entry (or a summary of which story IDs were removed and their resulting ticket IDs) in the response, since it no longer exists in the file for the user to see afterward.

## File ownership and safe writes

`TASKS.md` is the actionable source of truth for implementation work; this skill is one of its writers. `BACKLOG_STORIES.md` is owned by `product-manager`, but this skill is responsible for flipping a story's `Status` field as part of promotion, and for removing the entry per the cleanup step above once that's done — every `TASKS.md` write this skill makes has a matching `BACKLOG_STORIES.md` status update followed by that entry's removal. Touch nothing else in that file.

Before writing:

- inspect `git status --short --branch`;
- preserve unrelated changes in both files;
- check for duplicate task IDs, existing related tasks, and dependencies not yet in `TASKS_DONE.md`;
- show the intended `TASKS.md` and `BACKLOG_STORIES.md` changes in the response or explain them clearly;
- do not commit, push, open PRs, or invoke `newTicket`/implementation agents unless separately requested.

After writing, run a focused structural check covering both files — inspect the diff and confirm every new `TASKS.md` entry has the required fields and a real, mechanical exit criterion, that every story promoted this run was removed from `BACKLOG_STORIES.md` (not just status-flipped), and that no non-promoted entry was touched. Full application verification isn't needed; this skill doesn't change application code.
