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

After writing the `TASKS.md` entry, update the source story's `Status` in `BACKLOG_STORIES.md` to `Scoped → T###` (or one `Scoped →` line per child task if it split into several). Do not delete the story — it's the product record for why the ticket exists.

## File ownership and safe writes

`TASKS.md` is the actionable source of truth for implementation work; this skill is one of its writers. `BACKLOG_STORIES.md` is owned by `product-manager`, but this skill may flip a story's `Status` field as part of promotion — touch nothing else in that file.

Before writing:

- inspect `git status --short --branch`;
- preserve unrelated changes in both files;
- check for duplicate task IDs, existing related tasks, and dependencies not yet in `TASKS_DONE.md`;
- show the intended `TASKS.md` and `BACKLOG_STORIES.md` changes in the response or explain them clearly;
- do not commit, push, open PRs, or invoke `newTicket`/implementation agents unless separately requested.

After writing, run a focused structural check — inspect the diff and confirm every new entry has the required fields and a real, mechanical exit criterion. Full application verification isn't needed; this skill doesn't change application code.
