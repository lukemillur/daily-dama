# Tasks

Working backlog for Daily Dama **core-functionality** work. This file is the checkpoint mechanism: a session — including a fresh one after context compaction — reads it top to bottom to know what's done, what's next, and how to verify it, instead of relying on conversation memory or a todo list that only exists in-context.

**Scope note:** Trick visualization (`src/features/trick-viz/`) is intentionally excluded from this file right now. Its own backlog lives in [TRICK_VIZ_HANDOFF.md](TRICK_VIZ_HANDOFF.md) §15. Do not pull items from there into this file unless explicitly told to resume that thread.

## How to use this file

**Picking up work:**

1. Read this file top to bottom before touching code.
2. Take the first `Backlog` entry with status `Not started` or `In progress`. Before claiming it, follow the branch-check protocol in _Working across multiple agents_ below — this file's status field is a human-readable picture, not the authoritative claim signal.
3. Read its exit criteria before writing anything — that's the definition of done, not a vibe check.
4. If the exit criteria depend on something no longer true (file moved, API changed, decision superseded), stop and flag it rather than guessing.

**Completing a task:**

1. Do the work.
2. Run the task's own exit criteria yourself — don't mark it done on assumption.
3. Run the project's standard verification sequence (`yarn test --runInBand`, `yarn lint`, `yarn tsc --noEmit` — see [AGENTS.md](AGENTS.md)). A task isn't done if it breaks the baseline, even when its own criteria pass.
4. Commit the change on its own, referencing the task ID in the message. Focused commits, never pushed automatically (see AGENTS.md § Git state expectations).
5. In that same commit, move the entry from `Backlog` in this file to [TASKS_DONE.md](TASKS_DONE.md), flipping its status to `Done`. If this task was the last remaining child of a parent umbrella entry (every sibling child is now `Done`), move the parent entry to `TASKS_DONE.md` as well, in the same commit, flipping its status to `Done` too — an umbrella with no exit criteria of its own is done exactly when its children are.
6. Open a PR into `development` and squash-merge it immediately — no review gate, this is pre-authorized (see [AGENTS.md](AGENTS.md) § Git state expectations). `development`, not `main`, is where task branches land; promoting `development` into `main` is a separate, manual step outside this protocol.

**Getting stuck:**

- If a task turns out bigger than scoped, don't silently expand it. Split it into new entries and mark the original `Blocked` with a one-line reason.
- If a task depends on a product decision, mark it `Blocked` with the specific open question, not a guess — but this should be rare in practice. See _Scoping a task_ below: most decisions should already have been surfaced and resolved before an entry ever reached `Backlog`.

## Status legend

- `Not started`
- `In progress` — being actively worked. If you find a task already in this state at the start of a session, verify how far it actually got (check the commit log) rather than trusting the label alone.
- `Blocked` — reason required, one line, specific enough to unblock without a meeting.
- `Done` — moved to [TASKS_DONE.md](TASKS_DONE.md), not left in Backlog.

## Task template

Copy this shape for every new entry. Keep exit criteria mechanical — a test that passes, a command that exits 0, a specific behavior checked in-browser — never "looks right" or "seems fine."

```
### [T###] Short imperative title

- **Area:** e.g. Sesh, Stats, Tricks, persistence, navigation
- **Priority:** High / Medium / Low
- **Status:** Not started
- **Planning:** Required / Implementer
- **Description:** What changes and why, in 1-3 sentences — enough for a fresh session to start without re-deriving intent.
- **Exit criteria:** Mechanical and checkable.
- **Notes:** Assumptions made, decisions deferred, anything a resuming session needs to know.
```

### The Planning field

`Planning` decides whether the [newTicket workflow](.claude/skills/newTicket/SKILL.md) spends a separate high-rigor planning pass on the task before implementing it.

- **`Required`** — run the separate planner and keep its durable plan at `.claude/plans/<ID>.md`. Use this for persistence or schema changes, state-machine and concurrency work, changes that move an architectural boundary, unfamiliar native/platform APIs, and anything where being wrong is expensive to undo.
- **`Implementer`** — the implementer writes a short plan for itself and gets straight to work. Use this for genuinely local S-sized tickets: one or two files, a known pattern, no open questions.

Rules that hold regardless of what an entry says:

- **Omitting the field is safe.** An entry with no `Planning` line gets the separate planner, so every pre-existing task keeps its old behavior.
- **Priority is not complexity.** A High-priority label change is still `Implementer`; a Low-priority reducer change is still `Required`.
- **The workflow can escalate but never de-escalate.** An entry marked `Implementer` whose title, area, description or notes name persistence, schema/migration, reducers/state machines/concurrency, architectural boundaries, or native/iOS/Android APIs is promoted back to the separate planner automatically, and the run says so.

## Scoping a task

Rough ideas do not go straight into `Backlog`. They land in `Needs scoping` first, and only get promoted once they pass every check below. This is a rigid gate on purpose — a vaguely-scoped entry sitting in `Backlog` is worse than no entry, because it looks actionable and isn't.

**Promotion checklist — an idea may move to `Backlog` only if all four are true:**

1. **Single area.** It stays inside one feature area or persistence domain (see AGENTS.md's three domains — profile, custom tricks, practice history — and the Sesh/Stats/Tricks/navigation split). If it spans two, split it into one entry per area.
2. **One exit criterion.** The definition of done is a single coherent verification of _one_ behavior or change — it can involve running a whole suite or several related checks together, as long as they're all confirming the same thing. What doesn't fit: bolting on verification of a second, unrelated behavior ("and also verify X") — that's a second task wearing one entry's clothes.
3. **No embedded decision.** If answering it requires a product or technical call only you can make, it is not ready — it goes to `Blocked` with the specific open question, not into `Not started` with an assumption baked in.

   Push on this _during scoping itself_, not after. While an idea sits in `Needs scoping`, actively hunt for any product or technical question it raises and get it answered in that conversation. The goal is for `Blocked` to be rare and reserved for questions that only became visible during implementation — not a routine landing spot for decisions that could've been asked about in five seconds while scoping.

4. **One commit.** The whole thing lands in a single focused commit. If it can't, it isn't one task — see sizing below.

If an idea fails any check, either split it into entries that each pass all four, or resolve the open question first. Don't force a fit.

**Sizing — by checkpoint count, not duration:**

- **S — single commit.** One exit criterion, one commit. This is the target size; most `Backlog` entries should be S.
- **M — a chain of S's.** Only for genuinely sequential steps that can't be reordered or done independently. Written as a parent entry (`[T010]`) plus numbered children (`[T010.1]`, `[T010.2]`, ...), each S-sized with its own exit criteria. The parent is an umbrella only — it has no exit criteria of its own and is marked `Done` when every child is `Done`.

Nothing else is a valid size. An idea that doesn't reduce to S or a numbered M-chain isn't scoped yet — leave it in `Needs scoping` and keep discussing it rather than forcing it into a template.

## Working across multiple agents

Tasks here may be picked up by more than one agent at a time — possibly different harnesses, possibly different machines. Real-time coordination happens through git, not through this file: a pushed branch is the authoritative claim, and this file's `Status` field is the human-readable picture that catches up whenever that branch eventually merges. Don't trust `Status` alone to mean a task is actually free.

**Before claiming a task:**

1. Pull latest `development`.
2. Check whether a branch already exists for it: `git ls-remote origin 'refs/heads/task/T0NN-*'` (substitute the real ID, e.g. `T003` or a child like `T005.1`). If one exists, it's already claimed — pick a different task.
3. If the task notes a dependency (e.g. T013 depends on T012), confirm that dependency is actually in [TASKS_DONE.md](TASKS_DONE.md), not just referenced as resolved in a conversation. From another agent's perspective, only a merged, archived task is really done.

**Claiming and working:**

1. Create a branch named `task/T0NN-short-slug`, using the task's own ID, branched from `development`.
2. Push the branch immediately, _before_ starting the actual work — this push is the claim (see the narrow exception to "never push automatically" in AGENTS.md § Git state expectations). If the push is rejected because the branch name already exists, someone beat you to it — stop and pick another task. Never `--force` here; a rejected push is the collision detector working as intended, not an obstacle to push through.
3. Do the work on that branch. Everything under _Completing a task_ above still applies — including that moving the entry to `TASKS_DONE.md` happens in a commit on this branch, not a direct edit on `development`.
4. Open a PR into `development` when ready and squash-merge it immediately — this is pre-authorized, no review gate (see AGENTS.md § Git state expectations). CI runs the standard verification sequence on the PR, but the merge itself does not wait on it.
5. Pushing further commits to your own branch, opening the PR, and squash-merging it into `development` are all covered by working normally on a task. Promoting `development` into `main` is a separate, manual step and still needs the usual confirmation.

**Stale claims:** a pushed branch with no activity and no PR is an abandoned claim, not a real one. Deleting it releases the task — ordinary git housekeeping, no special protocol required. Deleting it is a deliberate human decision: no agent or script may take over a claim branch on its own, and branch age is never treated as proof that a claim was abandoned.

**Resuming your own interrupted task:** if a run stopped partway — a usage limit, a crashed session — the claim branch and any committed `.claude/plans/<ID>.md` are still there, and that's exactly what recovery uses. Resume it explicitly with `/newTicket resume T0NN`. Resuming reads the branch, never rewrites it: it stops with a blocker if no branch matches the ID, if more than one does, or if the branch doesn't actually contain that task. If a durable plan is on the branch, implementation continues from it instead of planning again.

**Claiming is scripted, not improvised.** `node .claude/scripts/ticket-claim.mjs` performs selection, the dependency check, the collision check, the branch, the status flip, the claim commit and the claim push, inside a temporary worktree it removes itself. It never force-pushes, never deletes a branch it doesn't own, and never touches the checkout it's invoked from. Run it with `--dry-run` to see which task would be picked without changing anything.

## Needs scoping

_Raw ideas land here — a name and a one-line description, nothing more. Discuss and apply the promotion checklist above before moving an entry down to Backlog._

- **Custom app theming** (Medium) — undecided: what's themeable, curated presets vs. full customization, where preferences persist.
- **Lesson programs** (Medium) — structured content moving a user from one rank to the next; content model and authoring are entirely undefined.
- **First-lace "extra flashy" tiering** (Medium, follow-on to T008) — escalate the celebration based on time/attempts/sessions spent before landing; thresholds undefined.
- **Competition mode** (Low) — trick lists by competition skill level, portable into sesh mode.
- **Longest-grind-per-trick metric** (Low) — time-to-first-lace per trick; display surface (Stats?) undecided.
- **Double-digit lace animation** (Low) — animation design undefined.
- **Buzzer-beater lace animation** (Low) — landing with under 10s remaining; threshold is clear, animation design is not.
- **Time-of-day success correlation** (Low) — surface whether the user lands more in morning vs. night seshes; what counts as a meaningful difference is undefined.
- **Line generator** (Low) — random line of tricks; trick pool source (all / unlocked / selected) undecided.
- **Collection management** (Low) — photos + metadata for physical kendama collection, with kendama-specific lace lists. Likely a new persistence domain; substantial scope on its own.

## Backlog

_This round came out of a review pass over the first batch of completed work (T001–T014). Entries below are either defects in what shipped or follow-on functionality that first pass surfaced. Where an entry corrects a completed task, it names that task — but the archived entry in [TASKS_DONE.md](TASKS_DONE.md) stays as-written; history isn't rewritten._

### Terminology note

The first pass used **locked/unlocked** for "the user can land this trick." User-facing copy in this round switches to **laced/unlaced**, which is what the domain actually calls it. The persisted profile field is still named `manuallyUnlockedTrickIds` and stays that way — renaming a persisted key means either a migration or throwing away real user data, and neither is worth it for a vocabulary change. Rename the copy, not the storage contract.

_This next batch (T045–T069) comes from a QA pass over PR 55's suggested checklist (the `development` → `main` release covering T002–T041), worked top to bottom. Where an entry names the task that shipped the behavior it's correcting, the archived entry in [TASKS_DONE.md](TASKS_DONE.md) stays as-written — history isn't rewritten, same as above._

### [T069] Convert Tricks' nested pseudo-screens into real routes with back navigation

- **Area:** Navigation / Tricks
- **Priority:** Medium
- **Status:** Not started
- **Description:** Every "nested" view reachable from Tricks — trick edit, delete-confirm, notes (list/add/edit), all-notes archive, goals (list/add), all-trick-goals, laced-tricks grid, custom-trick creation — is conditional local-state rendering inside the single `src/app/tricks.tsx` route (confirmed: no `src/app/tricks/` directory exists), each dismissed only by its own hand-rolled "Close" button. None has its own URL, and none gets real back-button semantics for free. Give them real routes.
- **Notes:** Umbrella only — complete T069.1 and T069.2. This was T027's deliberate design at the time ("standalone trick-goals screen," confirmed Close-returns-to-directory as intended), not an oversight — this task is a deliberate revisit, not a regression fix. [T068] already covers the tab-press-returns-home behavior as a faster standalone fix; this chain should verify that behavior still holds (adapting T068's mechanism as needed) once views become real routes, not re-solve it from scratch.

### [T069.2] Apply the established convention to the remaining nested Tricks screens

- **Area:** Navigation / Tricks
- **Priority:** Medium (inherited from parent T069)
- **Status:** Not started
- **Planning:** Required
- **Description:** Apply T069.1's pattern to the remaining nested views: trick notes, all-notes archive, all-trick-goals, laced-tricks grid, and custom-trick create/edit/delete. Depends on T069.1.
- **Exit criteria:** Every screen listed is reachable via its own route with real back navigation and no "Close" button remaining anywhere in the Tricks feature area; Tricks-tab-returns-home verified from each, on web and both native platforms.
- **Notes:** Notes has the same internal list/add/edit nesting `TrickGoalsScreen` does (and one extra wrinkle: exiting a note *edit* fully back to Tricks home today takes two taps — Cancel to the notes list, then Close — worth resolving as part of this pass, not carrying forward).

### [T042] Complete native tab iconography

- **Area:** Navigation
- **Priority:** Medium
- **Status:** Not started
- **Planning:** Required
- **Description:** Give Sesh, Tricks, Stats, and Profile distinct, subject-appropriate native tab icons rather than relying on incomplete or repeated icon treatment.
- **Exit criteria:** Deliberate iOS and Android checks confirm all five native tabs have distinct, route-appropriate icons that remain legible and unclipped in selected and unselected states, while the existing web navigation and its verified 320 px fit remain unchanged.
- **Notes:** This is native navigation polish, not a web-navigation redesign. Update navigation tests or snapshots where they provide useful regression protection.

### [T043] Harden active Sesh behavior across app backgrounding

- **Area:** Sesh
- **Priority:** High
- **Status:** Not started
- **Description:** Make timed, open-ended, paused, and multi-trick Sesh behavior reliable when the app moves between foreground and background.
- **Notes:** Umbrella only — complete T043.1 and T043.2. Route-navigation and process-death recovery are intentionally out of scope for this task — they are a separate concern from foreground/background reconciliation and are not tracked anywhere in this file.

### [T043.1] Reconcile active Sesh state after foregrounding

- **Area:** Sesh
- **Priority:** High (inherited from parent T043)
- **Status:** Not started
- **Planning:** Required
- **Description:** Add explicit app-lifecycle coordination that reconciles timed, open-ended, paused, and multi-trick Sesh state against timestamps when the app returns to the foreground.
- **Exit criteria:** Automated state-transition tests confirm an overdue timed Sesh completes at its logical deadline, an open-ended Sesh reports correct elapsed active time, a paused Sesh remains paused without accruing active duration, and a multi-trick run retains coherent current-trick state after a background/foreground cycle.
- **Notes:** Keep timestamp acquisition and app-state effects outside the reducer, passing explicit timestamps through actions. Do not add persisted in-progress Sesh state.

### [T043.2] Verify backgrounded Sesh behavior on iOS and Android

- **Area:** Sesh
- **Priority:** High (inherited from parent T043)
- **Status:** Not started
- **Planning:** Required
- **Description:** Exercise T043.1's lifecycle behavior on both native platforms and fix any platform-specific integration defects without changing the Sesh domain model. Depends on T043.1.
- **Exit criteria:** Deliberate iOS and Android checks cover timed, open-ended, paused, and multi-trick Sesh background/foreground cycles, confirm any overdue timer resolves at its logical deadline, and confirm the wake lock releases after completion or cancellation; any platform-specific regressions found are covered by an automated test where practical.
- **Notes:** This is native hardening of the lifecycle model established in T043.1, not process-death recovery or route-leave protection.

### [T044] Prevent mobile keyboards from obscuring form actions

- **Area:** Forms / mobile layout
- **Priority:** Medium
- **Status:** Not started
- **Description:** Establish a reusable keyboard-aware form layout and apply it to custom-trick editing, notes, goals, Profile streak editing, and the access gate.
- **Notes:** Umbrella only — complete T044.1 and T044.2. Use safe-area and keyboard behavior rather than fixed device-specific offsets; preserve existing web layouts.

### [T044.1] Establish a shared keyboard-aware form layout

- **Area:** Forms / mobile layout
- **Priority:** Medium (inherited from parent T044)
- **Status:** Not started
- **Planning:** Required
- **Description:** Create the smallest reusable layout primitive or convention needed to keep long mobile forms scrollable and their primary actions reachable while the keyboard is open, proving it through the custom-trick form.
- **Exit criteria:** On representative small iOS and Android viewports, the custom-trick form's final input and primary action remain reachable with the keyboard open, scrolling and keyboard dismissal behave predictably, safe-area and tab-bar insets do not overlap content, and the web layout remains unchanged.
- **Notes:** Avoid fixed device-specific offsets. Keep the abstraction narrow enough to accommodate screen-specific headers and action layouts rather than forcing every form into an identical visual shell.

### [T044.2] Apply the keyboard-aware layout to remaining forms

- **Area:** Forms / mobile layout
- **Priority:** Medium (inherited from parent T044)
- **Status:** Not started
- **Planning:** Required
- **Description:** Apply T044.1's proven layout pattern to notes, goals, Profile streak editing, and the access gate. Depends on T044.1.
- **Exit criteria:** Focused checks on representative small iOS and Android viewports confirm the final input and primary action remain reachable with the keyboard open on every notes, goals, Profile streak, and access-gate form; scrolling, dismissal, safe-area, and tab-bar behavior are consistent and web rendering is unchanged.
- **Notes:** Adapt the shared convention where a screen's structure requires it; do not introduce fixed offsets or unrelated form redesigns.

## Done

Completed entries live in [TASKS_DONE.md](TASKS_DONE.md) — not part of the top-to-bottom read above; see step 5 under _Completing a task_.
