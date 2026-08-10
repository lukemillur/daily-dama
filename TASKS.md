# Tasks

Working backlog for Daily Dama **core-functionality** work. This file is the checkpoint mechanism: a session — including a fresh one after context compaction — reads it top to bottom to know what's done, what's next, and how to verify it, instead of relying on conversation memory or a todo list that only exists in-context.

**Scope note:** Trick visualization (`src/features/trick-viz/`) is intentionally excluded from this file right now. Its own backlog lives in [TRICK_VIZ_HANDOFF.md](TRICK_VIZ_HANDOFF.md) §15. Do not pull items from there into this file unless explicitly told to resume that thread.

## How to use this file

**Picking up work:**
1. Read this file top to bottom before touching code.
2. Take the first `Backlog` entry with status `Not started` or `In progress`. Before claiming it, follow the branch-check protocol in *Working across multiple agents* below — this file's status field is a human-readable picture, not the authoritative claim signal.
3. Read its exit criteria before writing anything — that's the definition of done, not a vibe check.
4. If the exit criteria depend on something no longer true (file moved, API changed, decision superseded), stop and flag it rather than guessing.

**Completing a task:**
1. Do the work.
2. Run the task's own exit criteria yourself — don't mark it done on assumption.
3. Run the project's standard verification sequence (`yarn test --runInBand`, `yarn lint`, `yarn tsc --noEmit` — see [AGENTS.md](AGENTS.md)). A task isn't done if it breaks the baseline, even when its own criteria pass.
4. Commit the change on its own, referencing the task ID in the message. Focused commits, never pushed automatically (see AGENTS.md § Git state expectations).
5. In that same commit, move the entry from `Backlog` in this file to [TASKS_DONE.md](TASKS_DONE.md), flipping its status to `Done`.
6. Open a PR into `development` and squash-merge it immediately — no review gate, this is pre-authorized (see [AGENTS.md](AGENTS.md) § Git state expectations). `development`, not `main`, is where task branches land; promoting `development` into `main` is a separate, manual step outside this protocol.

**Getting stuck:**
- If a task turns out bigger than scoped, don't silently expand it. Split it into new entries and mark the original `Blocked` with a one-line reason.
- If a task depends on a product decision, mark it `Blocked` with the specific open question, not a guess — but this should be rare in practice. See *Scoping a task* below: most decisions should already have been surfaced and resolved before an entry ever reached `Backlog`.

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
- **Description:** What changes and why, in 1-3 sentences — enough for a fresh session to start without re-deriving intent.
- **Exit criteria:** Mechanical and checkable.
- **Notes:** Assumptions made, decisions deferred, anything a resuming session needs to know.
```

## Scoping a task

Rough ideas do not go straight into `Backlog`. They land in `Needs scoping` first, and only get promoted once they pass every check below. This is a rigid gate on purpose — a vaguely-scoped entry sitting in `Backlog` is worse than no entry, because it looks actionable and isn't.

**Promotion checklist — an idea may move to `Backlog` only if all four are true:**

1. **Single area.** It stays inside one feature area or persistence domain (see AGENTS.md's three domains — profile, custom tricks, practice history — and the Sesh/Stats/Tricks/navigation split). If it spans two, split it into one entry per area.
2. **One exit criterion.** The definition of done is a single coherent verification of *one* behavior or change — it can involve running a whole suite or several related checks together, as long as they're all confirming the same thing. What doesn't fit: bolting on verification of a second, unrelated behavior ("and also verify X") — that's a second task wearing one entry's clothes.
3. **No embedded decision.** If answering it requires a product or technical call only you can make, it is not ready — it goes to `Blocked` with the specific open question, not into `Not started` with an assumption baked in.

   Push on this *during scoping itself*, not after. While an idea sits in `Needs scoping`, actively hunt for any product or technical question it raises and get it answered in that conversation. The goal is for `Blocked` to be rare and reserved for questions that only became visible during implementation — not a routine landing spot for decisions that could've been asked about in five seconds while scoping.
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
2. Push the branch immediately, *before* starting the actual work — this push is the claim (see the narrow exception to "never push automatically" in AGENTS.md § Git state expectations). If the push is rejected because the branch name already exists, someone beat you to it — stop and pick another task. Never `--force` here; a rejected push is the collision detector working as intended, not an obstacle to push through.
3. Do the work on that branch. Everything under *Completing a task* above still applies — including that moving the entry to `TASKS_DONE.md` happens in a commit on this branch, not a direct edit on `development`.
4. Open a PR into `development` when ready and squash-merge it immediately — this is pre-authorized, no review gate (see AGENTS.md § Git state expectations). CI runs the standard verification sequence on the PR, but the merge itself does not wait on it.
5. Pushing further commits to your own branch, opening the PR, and squash-merging it into `development` are all covered by working normally on a task. Promoting `development` into `main` is a separate, manual step and still needs the usual confirmation.

**Stale claims:** a pushed branch with no activity and no PR is an abandoned claim, not a real one. Deleting it releases the task — ordinary git housekeeping, no special protocol required.

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

### [T004] Display trick unlocked status derived from lace history

- **Area:** Tricks
- **Priority:** High
- **Status:** In progress
- **Description:** Trick list shows a locked/unlocked indicator per trick, where unlocked means at least one completed practice-history record exists for that trick ID.
- **Exit criteria:** A trick with ≥1 practice-history record renders unlocked; a trick with none renders locked — verified by test.
- **Notes:** Derived half only. T006 layers a manual override on top of this.

### [T005] End-of-sesh target criteria (open-ended flow)

- **Area:** Sesh
- **Priority:** High
- **Status:** Not started — umbrella entry, no exit criteria of its own; `Done` only once both children are `Done`.
- **Description:** In the open-ended sesh flow, let the user define a target before starting (land Trick X, Y times) and gate ending the sesh on meeting it, with an explicit override always available.
- **Notes:** Decision resolved during scoping — **hard gate with override**: the primary end action is disabled until the target is met, but an "end anyway" action is always present.

#### [T005.1] Define a sesh-end target before starting

- **Status:** Not started
- **Description:** Open-ended sesh setup lets the user optionally define a target trick + landing count before starting.
- **Exit criteria:** Starting an open-ended sesh with a defined target stores it on the sesh's initial state; starting without one behaves exactly as today — verified by test.

#### [T005.2] Track progress and gate the end action

- **Status:** Not started
- **Description:** Sesh tracks progress toward the defined target through the active session and gates the primary end action until it's met.
- **Exit criteria:** With an unmet target, the primary end action is disabled and a separate "end anyway" action ends the sesh; once the target is met, the primary end action is enabled — verified by test.

### [T006] Manual trick-unlock override

- **Area:** Tricks / persistence
- **Priority:** High
- **Status:** Not started
- **Description:** Allow the user to manually mark a trick as unlocked independent of lace history, as a togglable flag layered on top of (not replacing) T004's lace-derived status.
- **Exit criteria:** Setting the manual flag on a trick with no lace history shows it unlocked; clearing the flag returns it to lace-derived status; a trick with real lace history stays unlocked regardless of the flag — verified by test.
- **Notes:** Decision resolved during scoping — toggle, not a one-way override. Depends on T004 landing first.

### [T007] Auto-promote Kentei rank on completing current rank

- **Area:** Profile / Tricks
- **Priority:** Medium
- **Status:** Not started
- **Description:** When the user has laced every trick in their currently assessed Kentei rank, update the profile's assessed rank to the next one automatically.
- **Exit criteria:** Lacing the last remaining trick in the current rank updates `profile.kenteiRank` to the next rank with no confirmation step — verified by test.
- **Notes:** Decision resolved during scoping — automatic and silent, not confirmation-gated.

### [T008] First-lace celebration

- **Area:** Sesh / Tricks
- **Priority:** Medium
- **Status:** Not started
- **Description:** When a trick is laced for the first time ever (no prior practice-history record for that trick ID), show a distinct celebratory UI moment.
- **Exit criteria:** Completing a sesh that lands a trick with zero prior laces triggers the celebration UI; a trick with prior laces does not — verified by test.
- **Notes:** "Extra flashy" tiering by time/attempts spent before landing is a separate, unscoped idea — see Needs scoping.

### [T009] Home-screen time logged (day/week/month/year)

- **Area:** Home / Stats
- **Priority:** Medium
- **Status:** Not started
- **Description:** Home screen shows total practice time logged for day, week, month, and year. A longer window only renders once enough real time has passed since the user's first recorded practice for that window to be meaningful.
- **Exit criteria:** With practice history spanning less than a window's natural period since the first record, that window is hidden; once enough real time has elapsed, it renders with the correct total — verified by test.
- **Notes:** Decision resolved during scoping — gated on elapsed real time since first use, not merely on a record existing in the window. Reasonable default thresholds, measured from the first practice-history record: hide "week" before 7 days of history, "month" before ~30 days, "year" before ~365 days. Confirm before implementing if these don't match intent.

### [T010] Sesh/trick notes

- **Area:** Tricks / persistence (new domain)
- **Priority:** Medium
- **Status:** Not started — umbrella entry, no exit criteria of its own; `Done` only once both children are `Done`.
- **Description:** Let the user attach a note to a trick, optionally tied to the specific sesh that prompted it, without touching the immutability of practice-history records.
- **Notes:** Decisions resolved during scoping:
  - New standalone "Notes" domain (own reducer/validation/persistence adapter, per the existing per-concern pattern) — not merged into practice history or custom tricks.
  - A note requires a trick ID **and** a trick-name snapshot captured at write time (same convention practice-history already uses), so it survives a later rename or deletion of a custom trick. Standard Kentei tricks can't be deleted, so this only bites for custom tricks, but the record shape doesn't need to special-case that.
  - A note optionally carries a practice-history record ID, for notes born from a specific sesh (see T010.2). General trick notes omit it.
  - The Notes domain itself is **not** immutable — the immutability invariant protects Stats derivation specifically; notes don't feed any derived calculation, so editing/deleting a note later is fine.

#### [T010.1] Notes domain and basic note CRUD on a trick

- **Status:** Not started
- **Description:** Add the Notes persistence domain and a minimal UI to create, view, edit, and delete a note attached to a trick, with an optional sesh reference.
- **Exit criteria:** Test confirms: creating a trick-only note stores the trick ID and name snapshot; creating one with a sesh reference also stores the practice-history record ID; editing and deleting both work; renaming or deleting the source custom trick afterward leaves the note displaying its snapshotted name rather than breaking.

#### [T010.2] Auto-prompt for a note on a no-lace timed sesh

- **Status:** Not started
- **Description:** When a timed sesh completes without landing its trick, prompt the user to add a note, pre-linked to that sesh via its practice-history record ID. Depends on T010.1.
- **Exit criteria:** A timed sesh ending without a lace triggers the prompt, and a note created from it carries the correct sesh reference; a timed sesh that ends with a lace, and any open-ended sesh, never trigger the prompt — verified by test.

### [T011] Custom practice goals

- **Area:** Tricks / persistence (new domain)
- **Priority:** High
- **Status:** Not started — umbrella entry, no exit criteria of its own; `Done` only once both children are `Done`.
- **Description:** Let the user define a standing goal for a specific trick — either a cumulative lace-count target ("land Whirlwind 25 times") or a cumulative practice-time target ("practice Whirlwind for 30 minutes") — with progress tracked automatically across sessions from practice history.
- **Notes:** Decisions resolved during scoping:
  - No streak/"in a row" goal type. Ruled out because there's no failed-attempt tracking, and there deliberately won't be one — a "not landed" confirmation would break practice flow. Goals are cumulative (count or time), not streak-based.
  - "Generic improvement goals" resolved to the time-based variant of the same per-trick mechanic ("practice X for Y time") — not a separate, broader category.
  - Both goal types are scoped to a single trick for v1, not an overall/non-trick-specific goal.
  - Progress is derived from practice history at read time (sum of landings, or sum of sesh duration, for that trick ID) — not stored as a separately-maintained running counter. Same "derive, don't cache" principle Stats already follows, to avoid drift.
  - A goal record needs a trick-name snapshot alongside the trick ID, same convention as T010's Notes, so a goal for a later-deleted or renamed custom trick doesn't break.

#### [T011.1] Goals domain and goal-creation UI

- **Status:** Not started
- **Description:** Add a persistent Goals domain, and UI to create a goal for a trick: either a target lace count or a target cumulative practice time.
- **Exit criteria:** Test confirms creating a count-based goal and a time-based goal each store the trick ID, trick-name snapshot, goal type, and target value correctly; verified in-browser.

#### [T011.2] Goal progress and achievement

- **Status:** Not started
- **Description:** Compute each goal's progress by deriving it from practice history (summed landings, or summed sesh duration, for that trick), and mark the goal achieved once the target is reached. Depends on T011.1.
- **Exit criteria:** Test confirms a count-based goal's progress reflects the trick's total lace count from history and marks achieved once it reaches the target; a time-based goal's progress reflects cumulative sesh duration for that trick and marks achieved the same way.

### [T012] Multi-trick sequential practice (shared core)

- **Area:** Sesh
- **Priority:** High
- **Status:** Not started
- **Description:** A sequencing layer that steps through an ordered list of tricks one at a time, reusing the existing single-trick practice mechanics for each trick (land it, or move on without landing), auto-advancing without requiring the user to manually restart between tricks. Each trick's outcome is recorded as its own practice-history record, exactly as today's single-trick Sesh already does — no change to the practice-history record shape.
- **Exit criteria:** Test confirms that, given an ordered list of 3 tricks, landing or moving past each in turn produces 3 separate practice-history records in the same order, and the run ends after the last trick — verified in-browser.
- **Notes:** Both T013 and T014 depend on this landing first. Resolved during scoping: this is a thin sequencing layer around the existing single-trick mechanics, not a reimplementation of countdown/landing logic and not a change to the Sesh reducer used by regular practice.

### [T013] Kentei assessment

- **Area:** Sesh / Profile
- **Priority:** High
- **Status:** Not started — umbrella entry, no exit criteria of its own; `Done` only once both children are `Done`. Depends on T012.
- **Description:** Formal rank assessment built on T012's shared sequencing core. Three entry flows: full bottom-to-top through all ranks, bottom-to-top starting at a chosen rank, or the user's current rank only. Ranks can be skipped during a run. Each trick shows a static "you have 5 attempts" reminder — no attempt counting or fail state in the app.
- **Notes:** Decisions resolved during scoping:
  - Built on T012, not a reimplementation of practice mechanics.
  - Landings during assessment write to the same practice-history domain as regular practice — T007's existing auto-promotion logic fires naturally on a full rank pass; no assessment-specific promotion wiring needed.
  - Skipping a rank leaves it unassessed — not treated as passed, doesn't touch the user's recorded rank.
  - Must be completed in one sitting for v1 — no persisted in-progress assessment state.
  - "5 attempts" is purely informational text, not a counted or enforced limit — there is no "failed attempt" input anywhere in this feature.

#### [T013.1] Assessment entry flows and trick-list construction

- **Status:** Not started
- **Description:** Entry UI to choose one of the three flows (full bottom-to-top, bottom-to-top from a chosen rank, current rank only), and logic to build the correct ordered trick list to hand to T012 from that choice.
- **Exit criteria:** Test confirms each of the three flows produces the correct ordered trick list — e.g. current-rank-only produces exactly that rank's tricks in order, full bottom-to-top produces every rank's tricks concatenated in rank order — verified in-browser for at least one flow.

#### [T013.2] Rank skipping and attempt messaging

- **Status:** Not started
- **Description:** During a bottom-to-top run, let the user skip an entire rank without attempting it; display the static "5 attempts" reminder per trick during the run. Depends on T013.1.
- **Exit criteria:** Test confirms skipping a rank advances to the next rank's tricks without writing any practice-history records for the skipped tricks and without affecting the user's kentei rank; the attempt-count message renders per trick — verified in-browser.

### [T014] Multi-trick sesh variant

- **Area:** Sesh
- **Priority:** High
- **Status:** Not started. Depends on T012.
- **Description:** A casual practice mode built on T012's shared sequencing core, where the user selects an arbitrary set of tricks (not rank-based) to step through in one run.
- **Exit criteria:** Test confirms selecting N arbitrary tricks and running them through the sequencing core produces N practice-history records, one per trick attempted — verified in-browser.
- **Notes:** Trick-selection UI is left as an implementation-time detail — likely reuses the existing trick-selection UI already used for focused tricks.

## Done

Completed entries live in [TASKS_DONE.md](TASKS_DONE.md) — not part of the top-to-bottom read above; see step 5 under *Completing a task*.
