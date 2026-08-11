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

_This round came out of a review pass over the first batch of completed work (T001–T014). Entries below are either defects in what shipped or follow-on functionality that first pass surfaced. Where an entry corrects a completed task, it names that task — but the archived entry in [TASKS_DONE.md](TASKS_DONE.md) stays as-written; history isn't rewritten._

### Terminology note

The first pass used **locked/unlocked** for "the user can land this trick." User-facing copy in this round switches to **laced/unlaced**, which is what the domain actually calls it. The persisted profile field is still named `manuallyUnlockedTrickIds` and stays that way — renaming a persisted key means either a migration or throwing away real user data, and neither is worth it for a vocabulary change. Rename the copy, not the storage contract.

### [T016] Laced-tricks surface

- **Area:** Tricks
- **Priority:** High
- **Status:** Not started
- **Description:** Umbrella for reworking how "I can land this trick" is both set and displayed. Corrects [T004] and [T006]: the badge-plus-toggle pair jammed into the trick name row wrecked the row layout, and "manual unlock" was implemented as a literal Manual button rather than as an ordinary way to say "I've laced this." Marking moves to a dedicated compact screen; the trick list keeps only a passive signal.
- **Notes:** Umbrella only, no exit criteria of its own. [T016.1] must land before [T016.2] — the marking UI has to exist somewhere before the toggle is removed from the row. Decisions resolved during scoping:
  - The laced grid covers the same trick set as the directory (standard Kentei tricks plus custom tricks), grouped by rank, from `createProfileDirectoryTricks` — not a rank-limited subset.
  - Toggling stays a plain set union with lace-derived status (`selectEffectiveUnlockedTrickIds`), unchanged from [T006]. A trick with real sesh history reads laced regardless of the manual flag; that's existing behavior and is correct.
  - Trick rows show nothing at all for an unlaced trick — no badge, no "0 laces". There's no reason to tell someone they haven't done something yet.

### [T018] Count manually-laced tricks toward Kentei rank promotion

- **Area:** Profile / Tricks
- **Priority:** High
- **Status:** Not started
- **Description:** Corrects [T007], which does not work as intended. `KenteiRankAutoPromotion` derives rank completion purely from practice-history lace counts (`selectLacedCountByTrickId`), so tricks the user marked laced by hand never contribute and the rank never advances. Promotion should consider a trick complete if it's laced by either source.
- **Exit criteria:** Test confirms that marking the last unlaced trick in the current rank as manually laced — with no practice history for it — advances `profile.kenteiRank` to the next rank; verified in-browser.
- **Notes:** `selectEffectiveUnlockedTrickIds` already computes the union; the gap is that `isKenteiRankComplete`/`selectPromotedKenteiRank` take a lace-count map instead of a set of "can land it" trick IDs. Changing those two selectors to take the effective set is the smaller, more honest fix than teaching the component to merge two shapes. `KenteiRankAutoPromotion` already reads both providers, so no new cross-domain wiring is needed. Was out of scope for T007's original ticket; it's in scope now.

### [T019] Rank-up celebration

- **Area:** Profile
- **Priority:** Medium
- **Status:** Not started
- **Description:** When the user's Kentei rank increases, show a celebration reusing the onboarding rank-reveal animation with copy rewritten for a promotion rather than a first-time reveal. It renders as an app-level modal so it can fire from anywhere a promotion can happen — finishing a sesh, marking tricks laced in the grid, completing an assessment.
- **Exit criteria:** Test confirms the celebration renders when the assessed rank advances and does not render on app hydration of an already-advanced profile; verified in-browser that marking the last trick of the current rank as laced in the laced grid triggers it.
- **Notes:** Depends on [T018] to be triggerable from the laced grid at all. Promotion is already funnelled through one place (`advanceKenteiRank`, dispatched only by `KenteiRankAutoPromotion`), so that component is the natural trigger point — it renders as a sibling of `AppTabs` inside all the providers, which is exactly the scope a global modal needs. The hydration case is the trap: a restored profile whose rank is already high must not fire the celebration, so key off the transition, not the value. Reuse `OnboardingRankRevealStep`'s animation, don't fork it — extract the shared piece if the copy can't be parameterised cleanly.

### [T020] Show the first-lace celebration during the sesh

- **Area:** Sesh
- **Priority:** Medium
- **Status:** Not started
- **Description:** Extends [T008]. The first-lace celebration currently appears only on the wrap-up screen. Show it in the active sesh at the moment it happens, reading "You just landed {trick} for the first time!", and keep it on the wrap-up screen with past-tense copy: "You landed {trick} for the first time".
- **Exit criteria:** Test confirms the in-sesh celebration renders on the landing that takes a trick from zero prior laces to one and not on subsequent landings in the same sesh; verified in-browser across both the in-sesh and wrap-up appearances.
- **Notes:** `isFirstLaceForTrick` is currently evaluated once at sesh completion, against history as it stood before recording. In-sesh it has to be evaluated at the landing instead — capture "did this trick have prior laces when the sesh started" once at sesh start and combine it with `landings.length === 1`, rather than re-querying history mid-sesh. Reuse `FirstLaceBanner` from `sesh.tsx` with parameterised copy; don't build a second banner component.

### [T021] Personal-best celebration

- **Area:** Sesh
- **Priority:** Medium
- **Status:** Not started
- **Description:** When a user beats their previous best for a trick at a given duration, celebrate it in the sesh the same way a first lace is celebrated. This must only fire when there's a genuine previous best to beat — a first-ever sesh on a trick is not a personal best.
- **Exit criteria:** Test confirms the celebration fires on the landing that exceeds an existing personal best, and does not fire when no prior comparable attempt exists or when the count merely ties the best; verified in-browser.
- **Notes:** The data is already there — `getPersonalBest` returns `undefined` when there's no comparable prior attempt, which is exactly the "don't celebrate" signal, and `ActiveSesh` already computes `hasBeatenBest` for the live-challenge readout. The work is turning that from a passive status line into a celebration moment, and making it fire regardless of whether the user opted into live challenge display. Note `getPersonalBest` is scoped to timed seshes at a matching planned duration, so open-ended seshes have no personal best by construction — that's existing, deliberate behavior (see `isEligibleTimedAttempt`), not a gap to close here.

### [T022] Prompt for a note at the end of every timed sesh

- **Area:** Sesh / Notes
- **Priority:** Medium
- **Status:** Not started
- **Description:** Extends [T010.2]. Today a note can only be added from the wrap-up screen of a timed sesh that landed nothing, which means the user has no way to capture a thought after a sesh that went well. Prompt on every completed timed sesh, with copy that differs depending on whether the trick was laced.
- **Exit criteria:** Test confirms the prompt appears for a timed sesh with landings and for one without, with different copy for each, and that the note created carries the correct practice-session reference in both cases; verified in-browser.
- **Notes:** `shouldPromptSeshNote` currently returns true only for `timed` + zero landings; widen it to all timed seshes and let `SeshNotePrompt` pick copy from the landing count. Open-ended seshes deliberately stay unprompted — that was the explicit answer during scoping, not an oversight.

### [T023] Show a trick's existing notes during the sesh

- **Area:** Sesh / Notes
- **Priority:** Medium
- **Status:** Not started
- **Description:** When practicing a trick the user has already written notes for, render those notes in the sesh flow so they can be read at a glance. Static text only — not editable, not tappable. The point is to surface the reminders that were written to make the next sesh go better.
- **Exit criteria:** Test confirms a trick with existing notes renders them in the active sesh and a trick with none renders no notes section; verified in-browser.
- **Notes:** `selectNotesForTrick` already exists in the Notes domain. Read via `useNotes()` in the Sesh component and pass down — don't have `ActiveSesh` reach into a provider itself, since it's also driven by `MultiTrickSesh` and the assessment run and should stay a presentational component. Worth deciding during implementation whether long note lists need truncation; a scrolling wall of text mid-sesh defeats "at a glance."

### [T024] Show note count on the trick row's Notes action

- **Area:** Tricks / Notes
- **Priority:** Low
- **Status:** Not started
- **Description:** The Notes row action on a trick reads "NOTES — 2" when that trick has notes, and plain "NOTES" when it has none.
- **Exit criteria:** Test confirms the label includes the count for a trick with ≥1 note and omits the separator and number entirely for a trick with none; verified in-browser.
- **Notes:** Pass a count map into `TrickDirectory` following the `lacedCountByTrickId` precedent rather than having the row query the Notes provider — `TrickDirectory` currently reads no providers and shouldn't start.

### [T025] Show a trick's goals on the sesh wrap-up screen

- **Area:** Sesh / Goals
- **Priority:** Medium
- **Status:** Not started
- **Description:** Goals set for a trick currently exist in isolation from the practice they describe. Render the practiced trick's goals, with their derived progress, on the sesh wrap-up screen.
- **Exit criteria:** Test confirms the wrap-up renders each goal for the practiced trick with progress reflecting history including the just-completed sesh, and renders no goals section for a trick with none; verified in-browser.
- **Notes:** `selectGoalProgress(goal, sessions)` already derives everything needed. The ordering trap: the wrap-up must read history *after* the completed sesh is recorded, or progress will be stale by exactly one sesh — `recordCompletedSesh` runs in an effect on entering `completed`, so re-read `sessions` from the provider at render rather than reusing anything captured at the transition.

### [T026] Celebrate goal achievement in the sesh and on the wrap-up

- **Area:** Sesh / Goals
- **Priority:** Medium
- **Status:** Not started
- **Description:** When a landing takes a goal from unmet to met, celebrate it during the sesh, and show it again on the wrap-up screen. Depends on [T025].
- **Exit criteria:** Test confirms the celebration fires on the landing that crosses a count-based goal's target and not on later landings in the same sesh, and that a goal already achieved before the sesh started never fires; verified in-browser.
- **Notes:** Count-based goals cross on a landing; time-based goals cross on elapsed time and can therefore fire with no user action at all. Handle both, but the failure mode to watch is a time goal crossing repeatedly on every timer tick — latch it once per sesh. Reuse whatever banner component [T020] settles on rather than adding a third celebration style.

### [T027] Standalone trick-goals screen

- **Area:** Tricks / Goals
- **Priority:** Medium
- **Status:** Not started
- **Description:** Goals are currently reachable only per-trick from a row action, which gives no view of what the user is actually working toward. Add a "Trick goals" screen from the Tricks route listing all goals across all tricks, rendering achieved goals visually distinct from outstanding ones.
- **Exit criteria:** Test confirms the screen lists goals from multiple tricks with per-goal derived progress, and that achieved and unachieved goals render distinguishably; verified in-browser.
- **Notes:** Sits alongside the "Laced tricks" entry point from [T016.1] — worth landing them with consistent placement and styling. The existing `TrickGoalsScreen` is scoped to one trick ID; this is a sibling all-tricks view, not a change to that component. `selectGoalProgress` needs no changes.

### [T028] Multi-trick run controls

- **Area:** Sesh
- **Priority:** High
- **Status:** Not started
- **Description:** Umbrella for the controls a multi-trick run is missing. Extends [T012]/[T014]: a run currently steps to the next trick only when the user manually ends each one, offers no way to advance mid-trick, and drops the user back at the picker with no summary of what they just did.
- **Notes:** Umbrella only, no exit criteria of its own. Children are ordered but largely independent; [T028.4] should land last since it reports on everything the others change. Decisions resolved during scoping:
  - "Next trick" **records** the trick being left, with whatever laces occurred — same practice-history write `End Sesh` performs. It means "I'm done with this one", not "discard this." Consequently it feeds Stats, goals, and rank promotion normally. This deliberately differs from assessment's existing "Skip this rank", which records nothing.
  - When both auto-advance-on-lace and a per-trick duration are configured, whichever condition is met first advances the run.
  - These controls belong to the shared `MultiTrickSesh` core so the assessment flow ([T029]) inherits them rather than reimplementing them.

### [T028.1] Advance to the next trick after a single lace

- **Area:** Sesh
- **Priority:** High (inherited from parent T028)
- **Status:** Not started
- **Description:** A checkbox in multi-trick setup that, when enabled, advances the run to the next trick as soon as the current trick is laced once.
- **Exit criteria:** Test confirms that with the option enabled a single landing records the trick and advances to the next one, and that with it disabled the run behaves exactly as it does today; verified in-browser across a 3-trick run.
- **Notes:** `MultiTrickSesh` already advances off the `completed` state, so the mechanism is dispatching `seshEnded` on the first landing rather than adding a second advance path. Keep the option a prop on `MultiTrickSesh` — `MultiTrickSeshEntry` owns the checkbox UI and local setup state.

### [T028.2] Per-trick duration for a multi-trick run

- **Area:** Sesh
- **Priority:** High (inherited from parent T028)
- **Status:** Not started
- **Description:** Let the user set a duration applied to each trick in the run — three tricks at one minute each means the run moves on after a minute on each trick.
- **Exit criteria:** Test confirms that a run configured with a per-trick duration passes a timed plan for each trick and advances when that duration elapses, and that leaving it unset preserves today's open-ended behavior; verified in-browser.
- **Notes:** `MultiTrickSesh` already takes a `plan` and hands it to every trick; the run currently hardcodes `OPEN_ENDED_SESH_PLAN` at both call sites. A timed plan should flow through the existing `timerElapsed` → `completed` → advance path with no new advance logic. Reuse `createTimedSeshPlan`'s existing 1–60 minute validation rather than inventing separate bounds.

### [T028.3] "Next trick" action during a run

- **Area:** Sesh
- **Priority:** High (inherited from parent T028)
- **Status:** Not started
- **Description:** Add a "Next trick" button to the sesh screen during a multi-trick run that records the current trick and moves to the next one.
- **Exit criteria:** Test confirms pressing it writes a practice-history record for the current trick with the laces accumulated so far and advances the run, and that it's absent from a single-trick sesh; verified in-browser.
- **Notes:** Because it records, this is `seshEnded` plus the existing advance effect — not a new code path, and explicitly *not* the `advanceTrickSequenceToIndex` path used by "Skip this rank", which bypasses recording on purpose. Add as an optional prop on `ActiveSesh` alongside `onSkipRank`, absent by default so single-trick `Sesh` is untouched.

### [T028.4] Multi-trick sesh wrap-up screen

- **Area:** Sesh
- **Priority:** High (inherited from parent T028)
- **Status:** Not started
- **Description:** A run through several tricks currently ends by dumping the user back at the trick picker with no summary. Show a wrap-up covering the whole run: each trick attempted, its laces, and its time.
- **Exit criteria:** Test confirms a completed 3-trick run renders one summary entry per attempted trick in run order with correct per-trick lace counts, and that a skipped trick is absent; verified in-browser.
- **Notes:** `MultiTrickSesh` currently discards each `SeshSummary` after recording it and calls `onFinished` immediately. It'll need to accumulate summaries across the run and render the wrap-up itself before calling `onFinished` — the placeholder "Sequence complete" panel at the bottom of that file is where this goes. The per-trick celebrations from [T020]/[T021]/[T026] fire per trick during the run; deciding whether they're also replayed here is deferred, not assumed.

### [T029] Kentei assessment run refinements

- **Area:** Sesh / Profile
- **Priority:** High
- **Status:** Not started
- **Description:** Umbrella for corrections to [T013]'s assessment run. The run currently inherits practice-sesh chrome that misrepresents what an assessment is: a countdown between every trick, a running timer implying time pressure, and an "End sesh" label for what ends an assessment.
- **Notes:** Umbrella only, no exit criteria of its own. [T029.3] depends on [T028.3] ("Next trick" in the shared core) and [T029.4] depends on [T028.1] (advance-on-lace in the shared core) — this entry deliberately doesn't reimplement either. Decision resolved during scoping: hiding the timer is a display change only; assessment records still capture real `durationMs`, since Stats derivation and the time-logged windows shouldn't develop a blind spot for assessment practice.

### [T029.1] Assessment-specific end-action copy

- **Area:** Sesh
- **Priority:** High (inherited from parent T029)
- **Status:** Not started
- **Description:** During an assessment run the end action reads "End assessment" rather than "End Sesh".
- **Exit criteria:** Test confirms the end action renders "End assessment" when the assessment flow drives the run and "End Sesh" otherwise; verified in-browser.
- **Notes:** An optional label prop on `ActiveSesh` defaulting to today's copy, set only by `AssessmentEntry`. Don't branch on a boolean `isAssessment` inside `ActiveSesh` — the component has no business knowing what an assessment is.

### [T029.2] Skip the countdown between assessment tricks

- **Area:** Sesh
- **Priority:** High (inherited from parent T029)
- **Status:** Not started
- **Description:** Moving to the next trick during an assessment goes straight to the active state, without the 3-second countdown.
- **Exit criteria:** Test confirms that in an assessment run advancing to the next trick transitions directly to `active`, while a regular multi-trick run still passes through `countdown`; verified in-browser across a multi-rank assessment.
- **Notes:** `MultiTrickSesh` seeds each trick by dispatching `trickSelected`, which lands in `countdown`. Adding an option to dispatch `countdownCompleted` immediately after is smaller than teaching the reducer a second entry path — keep the reducer's state graph unchanged.

### [T029.3] Hide the timer during an assessment

- **Area:** Sesh
- **Priority:** High (inherited from parent T029)
- **Status:** Not started
- **Description:** The elapsed-time readout isn't rendered during an assessment run — there's nothing to race, and showing a clock makes the user feel rushed.
- **Exit criteria:** Test confirms the timer and its label are absent in an assessment run and present in a regular sesh, while the recorded practice-history record still carries a real non-zero `durationMs`; verified in-browser.
- **Notes:** Display-only. `useNow` should keep running — `ActiveSesh` derives elapsed time from it for the record, and stopping the interval would zero out assessment durations in Stats.

### [T029.4] Auto-advance on lace during an assessment

- **Area:** Sesh
- **Priority:** High (inherited from parent T029)
- **Status:** Not started
- **Description:** Expose [T028.1]'s advance-on-first-lace behavior in the assessment flow, so pressing Laced moves straight to the next trick. Depends on [T028.1].
- **Exit criteria:** Test confirms an assessment run with the option active records the trick and advances on the first landing; verified in-browser.
- **Notes:** Should be wiring only if [T028.1] put the behavior in `MultiTrickSesh` as intended. Whether it's always on for assessments or user-selectable at the entry screen is the one open call — resolve it while implementing and record the choice here; either way it's the same prop.

### [T029.5] Assessment wrap-up screen

- **Area:** Sesh / Profile
- **Priority:** High (inherited from parent T029)
- **Status:** Not started
- **Description:** Show a wrap-up when an assessment run completes, instead of replacing the route to `/profile` with no summary. Covers which tricks were attempted and laced, which ranks were skipped, and the resulting assessed rank.
- **Exit criteria:** Test confirms a completed assessment renders per-trick outcomes and the resulting rank, and that a skipped rank is reported as skipped rather than failed; verified in-browser.
- **Notes:** Builds on [T028.4]'s accumulated summaries; the assessment-specific additions are rank framing and skip reporting. A skipped rank is explicitly *unassessed*, not failed — that's a decision already recorded in [T013] and the copy here must not contradict it. If [T019] has landed, a promotion during the run should surface through that modal rather than being re-rendered inline here.

### [T030] Make the Profile screen scrollable on mobile

- **Area:** Profile / navigation
- **Priority:** High
- **Status:** Not started
- **Description:** On mobile the Profile screen doesn't scroll, the navigation menu paints over the first section, and the assessed-rank tile isn't visible at all. Its content is taller than the viewport with nowhere to go.
- **Exit criteria:** Verified in-browser at 375 px that the assessed-rank tile is visible, unobscured by the navigation, and that every section down to the streak-threshold save action is reachable by scrolling.
- **Notes:** `ProfileScreen` renders its content directly inside `Screen` with `flex: 1; justify-content: center` and no `ScrollView`, so overflow is clipped at both ends rather than scrolling — which is exactly why the top tile disappears. Other screens (`sesh`, `tricks`) already use scroll containers; follow their pattern including the `paddingBottom` allowance for the floating tab bar, and check `Screen`'s web header inset isn't being double-counted. This is a verified-in-browser exit criterion by nature; a unit test asserting a `ScrollView` exists would prove nothing about the actual defect.

## Done

Completed entries live in [TASKS_DONE.md](TASKS_DONE.md) — not part of the top-to-bottom read above; see step 5 under *Completing a task*.
