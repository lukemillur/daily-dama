---
name: scope-tickets
description: Turn a Ready-for-scoping user story in BACKLOG_STORIES.md into one or more mechanically verifiable TASKS.md entries, using codebase context to decide area, planning requirement, and exit criteria. Every run publishes the newly scoped tickets as an interactive review Artifact (per-ticket "reviewed" toggle, comments, a "Compile feedback" export) so the user can review and react without reading raw TASKS.md diffs. Use when the user asks to scope, promote, or turn a backlog story into a ticket. Does not judge product value or priority — that decision already happened in the product-manager skill.
---

# Daily Dama Ticket Scoping

Translate a user story that product thinking has already validated into a concrete, buildable `TASKS.md` entry. This skill is purely technical scoping: given a story and the real codebase, decide what changes, where, how big, and how it's verified. It does not evaluate whether the story is worth building — treat `Ready for scoping` as a settled decision, not something to re-litigate.

If a story looks like weak product reasoning, over-scoped, or duplicative, say so and stop — send it back to `product-manager` rather than scoping it anyway or silently fixing the product problem yourself.

## Input

- A named story ID (e.g. `S014`) or "the ready ones" — resolve to entries in `BACKLOG_STORIES.md` with `Status: Ready for scoping`.
- If no argument is given at all (bare `/scope-tickets` invocation), default to scoping every `Ready for scoping` story, in the order they appear in `BACKLOG_STORIES.md`, without asking — the same result as if the user had said "all of them." If there are zero ready stories, say so and stop instead of scoping anything.
- If the user names a specific subset, or otherwise makes clear they want to choose rather than default to all, list the ready stories and ask which to scope.
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

- Only delete entries that reached `Scoped → T###` in _this_ run. Don't sweep up older `Scoped →` entries left over from previous runs as a side effect — that's a separate, deliberate cleanup pass, not an automatic consequence of running this skill.
- Never delete a `Proposed`, `Ready for scoping`, or `Rejected` entry, or one sent back to `product-manager` this run — only a promoted entry qualifies.
- Do this after the status-flip write, not instead of it — the sequence is: write `TASKS.md`, flip the status to `Scoped → T###`, then remove that same entry. Even though both edits land in the same diff, skipping straight to deletion without ever writing `Scoped → T###` leaves no intermediate record of which story produced which ticket.
- Show the deleted entry (or a summary of which story IDs were removed and their resulting ticket IDs) in the response, since it no longer exists in the file for the user to see afterward.

## Publish a review artifact

Every scoping run that writes at least one `TASKS.md` entry ends by publishing an interactive review artifact for the batch just written — not only when explicitly asked. This is the primary way the user reviews new tickets and leaves feedback; don't skip it just because the tickets were already shown in the chat response.

Call the `artifact-design` skill before writing it. This page is a utilitarian review tool — scanned card by card, not read top to bottom — so calibrate to that: clear typographic hierarchy and a considered palette, no hero treatment, restrained flourishes. Ground the palette and type pairing in Daily Dama's own visual language (`src/constants/theme.ts`'s `AppColors`, the typography components in `src/components/ui/typography.tsx`), not a generic default.

Structure, adapted from the same shape the `qa-handoff` skill uses for its checklist artifact:

- **Sticky header**: an eyebrow naming the batch's source (the story IDs it came from, or "scoped during conversation" for a ticket like a T111 with no story), an `<h1>` naming the batch (e.g. "T111–T112.6 — Pre-app landing page"), and a progress bar + `reviewed / total` counter (tabular numerals) that updates live.
- **One card per ticket written this run** (umbrella parents included): ticket ID (monospace, accent color) + title (display face), small badges for Area / Priority, the full Description, Exit criteria, and Notes text, and a "Mark reviewed" toggle — clicking it flips a visual state (checkmark badge, soft dim/strikethrough on the title), the same interaction `qa-handoff`'s checkboxes use. "Reviewed" means "I've looked at this ticket's scoping and I'm satisfied with it," not that any work has happened — don't imply otherwise in the copy.
- **Planning badge is clickable**: unlike Area/Priority, the `Planning` badge toggles between `Required` and `Implementer` on click — this is the one scoping call a reviewer is most likely to want to flip without writing a sentence about it. A badge whose value no longer matches what was actually written to `TASKS.md` gets a distinct visual (e.g. filled accent background, a small "changed" glyph) so an override reads at a glance, not just on hover. Store overrides separately from comments, keyed by ticket ID, in the same `localStorage` blob.
- **Per-ticket comment**: same unobtrusive toggle-to-reveal pattern as `qa-handoff` — a small "note" affordance opens a free-text field under that ticket's card, with a persistent marker (dot, filled icon, border tint) once it holds text. A comment is independent of the reviewed toggle: a reviewed ticket can still carry a "fine, but reconsider the priority" note.
- **Persistence**: both the reviewed toggles and comment text in `localStorage`, keyed by this run's ticket IDs, so a reload keeps state. No backend or artifact runtime capability — plain client-side storage. Include a confirm-before-clearing "Reset all" control.
- **Compile feedback**: a button that gathers every ticket with a non-empty comment _or_ a `Planning` override into a markdown block and shows it in a read-only, auto-selected textarea, plus a "Copy to clipboard" button with a manual-copy fallback if `navigator.clipboard.writeText` throws. A ticket with only a flipped `Planning` badge and no comment still belongs in the export — that toggle is itself the feedback. Format:
  ```
  ### <Ticket ID> — <ticket title>
  Reviewed: yes|no
  Planning: <original> → <overridden>   (only when changed)
  Comment: <comment text>                (only when non-empty)
  ```
  Only include tickets with a comment and/or a planning override; state at the top which scoping run/date it came from. Below the per-ticket block, a single free-text **general feedback** field (also persisted) for anything not tied to one ticket — appended under its own `### General feedback` heading when non-empty.
- Both light and dark themes, per `artifact-design`'s token rules.

Write the file to the scratchpad directory, then publish with `Artifact` — title it after the batch (e.g. "T111–T112.6 Scoping Review"), a one-sentence `description` naming what's inside, and favicon `📋` (keep this favicon stable across future scope-tickets artifacts — it's how the user recognizes this skill's pages in a gallery of many). Each scoping run publishes a fresh artifact for its own batch rather than updating a previous run's page — a review page is scoped to the tickets it reviews, not a running log.

Send the artifact link as part of the response, alongside (not instead of) the existing story→ticket summary this skill already produces.

## Feedback loop back into scoping

Same shape as `qa-handoff`'s loop back into the backlog, adapted for a scoping decision instead of a QA finding:

1. The user reviews the artifact, toggling tickets and leaving comments on anything they want changed.
2. They click "Compile feedback" and paste the resulting block into chat.
3. Read each comment for what kind of change it's asking for: a scoping-level tweak (wrong exit criterion, wrong area, should split further, wrong `Planning` value) is a direct edit back into that `TASKS.md` entry — go make it. A comment that actually reverses a product decision (the ticket shouldn't exist, the story behind it was wrong) is not this skill's call — send it back to `product-manager` instead of quietly rewriting the ticket to match.
4. Don't invoke `product-manager` automatically on a pasted-back comment — say which tickets look like a product-level disagreement and let the user (or their explicit instruction) trigger that skill.

## File ownership and safe writes

`TASKS.md` is the actionable source of truth for implementation work; this skill is one of its writers. `BACKLOG_STORIES.md` is owned by `product-manager`, but this skill is responsible for flipping a story's `Status` field as part of promotion, and for removing the entry per the cleanup step above once that's done — every `TASKS.md` write this skill makes has a matching `BACKLOG_STORIES.md` status update followed by that entry's removal. Touch nothing else in that file.

Before writing:

- inspect `git status --short --branch`;
- preserve unrelated changes in both files;
- check for duplicate task IDs, existing related tasks, and dependencies not yet in `TASKS_DONE.md`;
- show the intended `TASKS.md` and `BACKLOG_STORIES.md` changes in the response or explain them clearly;
- do not commit, push, open PRs, or invoke `newTicket`/implementation agents unless separately requested.

After writing, run a focused structural check covering both files — inspect the diff and confirm every new `TASKS.md` entry has the required fields and a real, mechanical exit criterion, that every story promoted this run was removed from `BACKLOG_STORIES.md` (not just status-flipped), and that no non-promoted entry was touched. Then publish the review artifact per the section above — a scoping run isn't finished until the artifact link has been sent, same as it isn't finished with a story left at `Ready for scoping`. Full application verification isn't needed; this skill doesn't change application code.
