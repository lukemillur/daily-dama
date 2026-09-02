---
name: product-manager
description: Audit Daily Dama product context and refine opportunities, feedback, PRDs, roadmaps, or planning documents into prioritized outcome-level items in BACKLOG_STORIES.md. Use when the user asks what valuable work should happen next, asks to refine a source document into backlog stories or enabling work, or asks to prioritize or prune the Daily Dama product backlog. Stop before writing TASKS.md or TASKS_BACKLOG.md; use scope-tickets for technical scoping.
---

# Daily Dama Product Manager

Separate product judgment from implementation scoping. Produce a small set of valuable, settled outcomes without turning every source bullet into a ticket or forcing infrastructure work into artificial user-story language.

## Modes

Infer the requested mode:

- **Audit:** Report evidence, opportunities, risks, and the recommended next bet without editing backlog files.
- **Propose:** Draft three to five outcome-oriented opportunities. Write them only when authorized.
- **Refine:** Convert a named opportunity or source document into planning items in `BACKLOG_STORIES.md`.
- **Prioritize:** Rank existing planning items against the current iteration objective.
- **Prune:** Recommend merging, deferring, rejecting, or deleting stale items. Mutate only when explicitly authorized.

Never write `TASKS.md`, `TASKS_BACKLOG.md`, or `TASKS_DONE.md`. Do not invoke `scope-tickets` automatically; report which items are ready and preserve a review boundary between product refinement and technical scoping.

## Gather context

Read, in order:

1. `AGENTS.md` and the active platform scope.
2. The named source document in full.
3. `BACKLOG_STORIES.md`, if present.
4. `TASKS.md`, `TASKS_BACKLOG.md`, and `TASKS_DONE.md`, read-only, to avoid duplication.
5. Relevant handoffs, recent commits, working-tree status, and application code only where needed to verify product evidence.

Label claims as observed, inferred, or unknown. Ask only when an unresolved product decision would materially change the output. Treat decisions explicitly recorded in an approved roadmap as settled; do not re-litigate them during refinement.

## Refine source documents

Preserve the source document's hierarchy and traceability while reshaping it:

1. Extract outcomes, constraints, dependencies, deferred work, and hard gates.
2. Group related bullets into the smallest coherent capability. Do not create one planning item per source bullet.
3. Classify each item honestly:
   - `User outcome` for behavior a user can perceive or perform.
   - `Technical enabler` for infrastructure or architecture required by later outcomes.
   - `Security control` for risk-reduction requirements with independently testable evidence.
   - `Launch gate` for an operational condition that must be met before release.
4. Split an item when it contains two independently valuable outcomes or crosses roadmap phases with different readiness.
5. Keep deferred native work at `Proposed` while the repository's active scope is web-only unless the user explicitly resumes mobile hardening.
6. Mark an item `Ready for scoping` only when no open product decision would change what gets built.

Prefer six to ten capability-level items for a substantial roadmap. A later scoping pass may legitimately fan one capability into several technical tickets.

## Prioritize

Use qualitative value, confidence, learning value, and effort. Apply a downward adjustment for new persistence domains, backend providers, authentication boundaries, native dependencies, or recurring cost unless the source document already records an approved decision.

Prioritize the next useful vertical slice rather than pretending an entire multi-phase roadmap is equally active. Keep sequencing and hard dependencies visible without converting them into implementation plans.

## Planning item format

Continue the highest planning-item ID ever referenced in `BACKLOG_STORIES.md`, `TASKS.md`, `TASKS_BACKLOG.md`, or `TASKS_DONE.md`; do not reuse historical IDs merely because their entries were removed after scoping.

Use this format for new items:

```md
### [S###] <outcome-oriented title>

- **Type:** User outcome / Technical enabler / Security control / Launch gate
- **Beneficiary:** <user, operator, product team, or system boundary>
- **Outcome:** <capability or protected condition>
- **Evidence:** <source section and relevant repository evidence>
- **Priority:** High / Medium / Low
- **Status:** Proposed / Ready for scoping / Rejected
- **Acceptance criteria:** <observable product result or independently verifiable control>
- **Notes:** <dependencies, settled decisions, deferred scope, open questions>
```

Preserve older entries using the legacy `As a / I want / So that` shape. Do not rewrite them solely to match the new format.

## Write safely

Before writing, inspect `git status --short --branch` and preserve unrelated work. Never modify `.claude/skills`; those are Claude Code-specific workflow artifacts.

After editing `BACKLOG_STORIES.md`:

- inspect the diff;
- verify unique IDs and every required field;
- confirm no duplicate or already-completed outcome was introduced;
- report which items are ready, proposed, deferred, or rejected.

Do not run application verification for planning-document-only changes.
