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

### [T045] Auto-dismiss in-sesh celebration banners

- **Area:** Sesh
- **Priority:** Medium
- **Status:** Not started
- **Planning:** Required
- **Description:** During an active sesh, `CelebrationBanner`-based banners (`FirstLaceBanner`, `PersonalBestBanner`, and `GoalCelebrationBanner` for both count- and time-based goals, all in `src/features/sesh/components/sesh.tsx`) have an entrance animation but no exit animation or timer — each stays visible until the next "Laced" press flips its underlying `landings.length`-derived condition false. Make them auto-fade after a few seconds instead.
- **Exit criteria:** Test confirms each of the four banner types dismisses on its own a few seconds after appearing (fake timers), without requiring another Laced press; the time-based goal celebration in particular no longer latches for the rest of the sesh once shown (today `celebratingTimeGoalIds` in `sesh.tsx` is append-only and nothing ever clears it — worse than the other three, which at least clear on the next lace). `CompletedSesh`'s wrap-up rendering of `FirstLaceBanner`/`GoalCelebrationBanner` is a static summary screen with no Laced button to race against and is unaffected by this change; `RankUpCelebrationModal` (`src/features/profile/components/rank-up-celebration-modal.tsx`) is a separate, deliberately tap-to-dismiss mechanism, also unaffected.
- **Notes:** `CelebrationBanner` (`sesh.tsx`) uses the plain `Animated` API (not Reanimated) with `Animated.parallel([Animated.spring(scale, ...), Animated.timing(opacity, ...)])` on mount only — the fade-out needs a symmetric timing call back toward 0, gated by a timer independent of `landings.length`. None of these three banners render during a Kentei assessment or ad hoc multi-trick run today — `MultiTrickSesh` passes `personalBest={undefined}`, `liveChallengeEnabled={false}`, and omits `hadPriorLaceAtSeshStart`/`goalBaselines` (a deliberate T028.4 scope decision) — so this fix is scoped to the single-trick `Sesh` path only; no duplicate work needed elsewhere. Existing tests in `sesh.test.tsx` (`findBanner`/`findGoalBanner`/`findPersonalBestBanner` helpers) assert today's landing-count-driven visibility and will need updating.

### [T046] Fix transient timer glitch on Sesh pause/resume

- **Area:** Sesh
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Resuming a paused sesh briefly renders a displayed time equal to the pause duration before flipping to the correct value, for both timed (counts down) and open-ended (counts up) plans. Root cause: `useNow` (`src/features/sesh/components/sesh.tsx`) freezes `now` entirely while paused and only refreshes it via a 250ms `setInterval` that doesn't (re)start until after the resume render commits, so for one or more renders a freshly up-to-date `pausedDurationMs` (already includes the full pause) combines with a stale `now` (unchanged since before/at the pause), under-counting elapsed time by exactly the pause duration.
- **Exit criteria:** Test simulates pause at time T, waits several seconds while paused, then resumes — asserts the *first* rendered displayed time after resume is already correct (no transient wrong frame), for both a timed and an open-ended plan. `sesh.test.tsx` currently uses `jest.useFakeTimers()` but has no test that advances fake time across an actual pause→resume transition; this is new coverage, not a regression fix to an existing test.
- **Notes:** Fix belongs in `useNow`/`ActiveSesh` (component-level timer effect), not the reducer — `seshPaused`/`seshResumed` (`src/features/sesh/model/sesh.ts`) are already correct and covered by existing reducer tests (`sesh.test.ts`); this is purely about `now` not being refreshed synchronously enough on resume. Likely fix shape: force an immediate `setNow(Date.now())` when `isPaused` flips from true to false, rather than waiting for the next interval tick.

### [T047] Allow backing out of the pre-sesh countdown

- **Area:** Sesh
- **Priority:** Medium
- **Status:** Not started
- **Planning:** Required
- **Description:** The 3-2-1 `Countdown` screen (`src/features/sesh/components/sesh.tsx`) that runs before a sesh goes active has no cancel control today — a user who starts a sesh by accident is stuck watching it complete. Add a way to back out during the countdown.
- **Exit criteria:** From the countdown screen, a visible Back/cancel control returns to trick/setup selection without recording a session — verified for single-trick Sesh (`src/app/sesh/index.tsx`) at minimum, dispatching the existing `seshReset` action (already unconditional in the reducer — `sesh.ts`'s `seshReset` case matches from any status, so this is UI-only wiring, not a reducer change).
- **Notes:** Scope decision: wire this only at the *first* countdown of a run (single-trick Sesh's `choosing → countdown` transition, and — if picked up together — the first trick's countdown in ad hoc multi-trick/assessment entry, returning to that flow's setup/flow-picker step). Do not wire it between tricks mid-run in a multi-trick sequence; the reported complaint is specifically about accidentally starting a sesh, not about backing out mid-sequence, and later countdowns are a different UX moment not asked for here. This is distinct from the existing "Skip this rank" control (`SkipRankButton`, only present in multi-rank assessment/skip-enabled flows) — skip moves forward past a rank, it isn't a cancel. Distinct also from [T051] (multi-trick setup screen back button), which is about leaving the setup screen *before* countdown even starts.

### [T048] Persist open-ended sesh target laces across sessions

- **Area:** Sesh / persistence (profile domain)
- **Priority:** Medium
- **Status:** Not started
- **Planning:** Required
- **Description:** A target lace count defined for an open-ended sesh (T005.1/T005.2) only lives for the run it was set on — every fresh visit to Sesh setup resets the target field to blank, even though `lastSesh` (`src/features/profile/model/user-profile.ts`) already persists the last-used trick and plan across visits. Persist the target too, carrying it forward until the user changes it.
- **Exit criteria:** Test: set a target, complete (or end) an open-ended sesh, revisit Sesh setup fresh (not via "Repeat sesh") — the previously-set target pre-fills; changing it and starting again persists the new value on the next fresh visit; a profile with no persisted target (including all existing pre-fix profiles) behaves exactly as today, no migration needed.
- **Notes:** Two independent gaps to close, both in `src/features/profile/model/user-profile.ts` / `src/app/sesh/index.tsx`: (1) `LastSeshPlan`'s `openEnded` variant carries no target field, and `createLastSesh` discards `plan.target` unconditionally when writing it; (2) even if carried, `sesh/index.tsx`'s `initialPlan` derivation unconditionally falls back to the bare `OPEN_ENDED_SESH_PLAN` constant (no target) for any non-timed `lastSesh` — both need fixing together. Add the new field as optional so it's backward-compatible with already-persisted profiles (no migration infrastructure needed, consistent with how `lastSesh` itself is already handled as optional). This is a profile-domain persistence change per AGENTS.md — plan the exact field shape and validator update before implementing.

### [T049] Split multi-trick sesh setup into a two-step wizard

- **Area:** Sesh
- **Priority:** Medium
- **Status:** Not started
- **Planning:** Required
- **Description:** `MultiTrickSeshEntry` (`src/features/sesh/components/multi-trick-sesh-entry.tsx`) currently renders trick selection and all run configuration (time per trick, advance-after-one-lace, Start sesh) in a single step/screen — the trick list and the timing/start controls are visible together, which reads as cluttered. Split it into two steps: pick tricks, then configure timing and start.
- **Exit criteria:** Verified in-browser: step 1 shows only the trick-selection list plus a way to proceed (disabled/unavailable with zero tricks selected); step 2 shows only the timing/advance-on-lace/Start-sesh controls plus a Back control that returns to step 1 with the prior selection preserved; starting a run behaves exactly as today.
- **Notes:** `src/features/sesh/components/assessment-entry.tsx` already implements a real 3-step local state machine (`choosingFlow → choosingRank → running`) with an explicit "Back" button (`setStep({ kind: 'choosingFlow' })`) — use that as the in-repo precedent for shape/style rather than inventing a new pattern. This is local component state only, no reducer/router involvement, consistent with how `assessment-entry.tsx` does it. Overlaps textually with [T050] (both touch `MultiTrickSeshEntry`'s picker step) and [T051] (both touch its entry/first step) — independently shippable, no hard ordering dependency, but expect minor rebase friction if worked concurrently.

### [T050] Sort focused tricks to the top of the multi-trick picker

- **Area:** Sesh
- **Priority:** Low
- **Status:** Not started
- **Planning:** Implementer
- **Description:** The multi-trick setup screen's trick list has no focused-trick treatment — it's plain rank order, unlike the main Tricks screen which sections the user's focused tricks first via `TrickDirectory`'s existing `showFocusedSection` prop. Give the multi-trick picker the same treatment.
- **Exit criteria:** Test: a user with N focused tricks (profile `selectedTrickIds`) opens multi-trick setup — those N tricks render in a "Focused" section at the top regardless of rank, matching `src/app/tricks.tsx`'s existing behavior; toggling a trick's in-progress selection for this run does not change section placement.
- **Notes:** Not a regression — T014's notes in `TASKS_DONE.md` explicitly recorded `showFocusedSection` as omitted for simplicity at the time. The fix is not just flipping the flag: `TrickDirectory`'s `showFocusedSection` currently sections by whatever list is passed as `selection.selectedTrickIds`, and in `MultiTrickSeshEntry` that list is the run's own in-progress ad hoc picks (local `useState`), not the persisted profile focus list — reusing it directly would section tricks by "checked so far," which is circular. `MultiTrickSeshEntry` needs to read the real `useUserProfile().selectedTrickIds` and pass it as a distinct focused-list input, separate from the run's own selection state (mirroring how `src/app/tricks.tsx` is able to reuse the same list for both purposes only because, there, they genuinely are the same list).

### [T051] Add a back button to the multi-trick sesh setup screen

- **Area:** Sesh / Navigation
- **Priority:** Medium
- **Status:** Not started
- **Planning:** Implementer
- **Description:** There is no way to navigate from `/sesh/multi-trick` back to `/sesh` before starting a run — no header (the route's `_layout.tsx` sets `headerShown: false`, app-wide convention) and no in-content control either. Add one.
- **Exit criteria:** From the multi-trick setup screen (before a run starts), a visible Back control returns to the Sesh screen — verified in-browser.
- **Notes:** No back-button precedent exists anywhere in this app's routing (`headerShown: false` everywhere, no icon library/assets in the project, no `BackHandler`/hardware-back handling). The closest in-repo precedent for "exit a sub-flow" is `assessment-entry.tsx`'s literal text "Back" button (local step state, not router-level) or the various Tricks nested screens' "Close" buttons (see [T068]/[T069] for that broader pattern). A plain text button dispatching `router.back()` (or `router.replace('/sesh')`) matches this app's existing visual language better than a header back-arrow, which nothing else in the app uses.

### [T052] Hide "Next trick" on the final trick of a multi-trick run

- **Area:** Sesh
- **Priority:** Low
- **Status:** Not started
- **Planning:** Implementer
- **Description:** `NextTrickButton` (`src/features/sesh/components/sesh.tsx`) renders whenever `onNextTrick` is supplied, with no awareness of position in the sequence — `multi-trick-sesh.tsx` passes it unconditionally for any active trick, including the last one, where it's functionally identical to "End Sesh" (both dispatch the same `seshEnded` action) but mislabeled.
- **Exit criteria:** Test: on the final trick of a multi-trick run, "Next trick" is not rendered; "End Sesh" and the Laced flow continue to work as today; on any non-final trick, "Next trick" still renders as today.
- **Notes:** Both `sequence.currentIndex` and `sequence.tricks.length` are already in scope where `onNextTrick` is wired (`multi-trick-sesh.tsx`) — the fix is a single added condition, not new state. Independent of [T057] (which removes "Next trick" from the Kentei assessment flow entirely, regardless of position) — the two fixes gate on different conditions and don't conflict, but touch the same prop wiring, so implement with awareness of whichever lands first.

### [T053] Add breathing room before auto-advancing on a lace

- **Area:** Sesh
- **Priority:** Medium
- **Status:** Not started
- **Planning:** Required
- **Description:** In ad hoc multi-trick practice (`MultiTrickSeshEntry`/`MultiTrickSesh`) with "advance after one lace" enabled, landing a trick and moving to the next happens in one synchronous beat (`trickLaced` then `seshEnded` dispatched back-to-back in `handleLaced`, `src/features/sesh/components/multi-trick-sesh.tsx`) — the user never sees an acknowledgment of the landing before the next trick's countdown appears. Insert a brief (roughly 1-3 second) "Trick landed"-style acknowledgment before advancing.
- **Exit criteria:** Test: with advance-on-lace enabled in ad hoc multi-trick practice, landing a trick shows acknowledgment copy for the configured window before the next trick's countdown begins.
- **Notes:** Scoped to the ad hoc multi-trick flow (`MultiTrickSeshEntry`) only, not the Kentei assessment flow, which shares the same `MultiTrickSesh`/`handleLaced` mechanism but deliberately opted into zero friction here via `skipCountdownBetweenTricks` + `advanceOnFirstLace` (T029.2/T029.4) — adding a mandatory pause there would silently undo that prior, deliberate work. Implement as an opt-in prop on `MultiTrickSesh` (default off) so `AssessmentEntry` is unaffected unless explicitly turned on later. This is an assumption, not confirmed with the user — flag if assessment should get this too. There is no existing `SeshState` status for "just landed, pausing" (`sesh.ts`'s `SeshState` union is only `choosing | countdown | active | completed`); implement as a component-local transient render state in `MultiTrickSesh` that delays the existing `seedNextTrick` call, not as a new reducer status — keeps timer effects out of the reducer, consistent with the project's stated convention. The existing one-tick "Sequence complete" fallback panel in `multi-trick-sesh.tsx` is explicitly documented as imperceptible/not a resting state and isn't a usable hook for this — it's end-of-run copy, not per-trick.

### [T054] Add spacing above the Laced button

- **Area:** Sesh
- **Priority:** Low
- **Status:** Not started
- **Planning:** Implementer
- **Description:** `AttemptsReminder` ("You have 5 attempts.") has only a 10px top margin and no bottom margin, and `LacedButton` has no top margin, so when the timer is hidden (as in a Kentei assessment) and there are no trick notes to show, the reminder text and the Laced button sit cramped together with nothing but that 10px between them.
- **Exit criteria:** Visual check confirms clear spacing between "You have 5 attempts." and the Laced button in the cramped case (`hideTimer` true, no trick notes); layouts where the timer is visible are unaffected.
- **Notes:** Both components are in `src/features/sesh/components/sesh.tsx`'s styled-components (`ActiveContent` has no `gap`, so spacing is entirely per-child margins today). Same `AttemptsReminder` also renders in `Countdown` above the countdown number — confirm that placement still looks correct after the change, though it wasn't the reported complaint.

### [T055] Show current rank/class standing during a Kentei assessment run

- **Area:** Sesh (Kentei assessment)
- **Priority:** Medium
- **Status:** Not started
- **Planning:** Required
- **Description:** While working through an assessment, nothing on screen shows which rank/class the user is currently on — `Countdown`/`ActiveSesh` (`src/features/sesh/components/sesh.tsx`) render a generic "Sesh in progress" eyebrow regardless of context, even though the trick objects flowing through already carry `kenteiRank`/`kenteiLevel`/`kenteiClass` (`TrickSummary`, via `selectAssessmentTricks`).
- **Exit criteria:** During an active/countdown trick within a Kentei assessment, the current rank/class is visibly rendered; regular single-trick Sesh and ad hoc multi-trick screens (where custom tricks may have no Kentei metadata at all) are unchanged.
- **Notes:** Gate this to assessment context specifically (e.g. a prop threaded from `AssessmentEntry`) rather than rendering unconditionally in the shared `Countdown`/`ActiveSesh` components, since regular Sesh and ad hoc multi-trick tricks may lack `kenteiRank`/`kenteiLevel`/`kenteiClass` entirely. Independent of [T056] (skip-rank trick preview) — related by theme (both are "surface rank context during assessment") but touch different UI moments and are separately shippable.

### [T056] Show the rank's trick list before skipping it in a Kentei assessment

- **Area:** Sesh (Kentei assessment)
- **Priority:** Medium
- **Status:** Not started
- **Planning:** Required
- **Description:** "Skip this rank" (`SkipRankButton`, `src/features/sesh/components/sesh.tsx`) is a bare text link with no preview of what it skips — no trick list, no count, no confirmation. A user can't tell what they're giving up before tapping it. The only place a description of what got skipped appears (`describeSkippedRange`, e.g. "Rank 10 — 3 tricks skipped") is after the fact, on the final wrap-up screen.
- **Exit criteria:** Tapping "Skip this rank" surfaces the specific tricks in that rank before the skip is committed; canceling leaves the run unaffected; confirming skips exactly as today (no history written for skipped tricks, unchanged).
- **Notes:** Independent of [T055], related by theme only. `selectAssessmentTricks`/the rank's trick list is already computable from data in scope (`kentei-assessment-run.ts`) — this is new UI (a preview or confirmation step), not new data plumbing.

### [T057] Remove the redundant "Next trick" button from the Kentei assessment flow

- **Area:** Sesh (Kentei assessment)
- **Priority:** Low
- **Status:** Not started
- **Planning:** Implementer
- **Description:** In assessment, `advanceOnFirstLace` makes pressing "Laced" on an untouched trick dispatch the identical `seshEnded` action "Next trick" and "End assessment" both use (`src/features/sesh/components/multi-trick-sesh.tsx`) — on any untouched trick all three buttons converge on "advance," making "Next trick" pure redundant chrome specific to assessment. Stop rendering it there.
- **Exit criteria:** Test: during an assessment trick, only "Laced" and "End assessment" are present, no "Next trick"; non-assessment multi-trick runs (no `advanceOnFirstLace`) keep "Next trick" exactly as today, since there it's genuinely non-redundant (confirmed by existing coverage in `multi-trick-sesh.test.tsx`: without `advanceOnFirstLace`, "Laced" just accumulates landings and only "Next trick" advances).
- **Notes:** Gate on the same `advanceOnFirstLace` flag already used for the auto-advance behavior, not on "is this an assessment" as a separate signal. Independent of [T052] (final-trick hiding) — different gating condition, no conflict, but both touch `onNextTrick` wiring in `multi-trick-sesh.tsx`.

### [T058] Let "End assessment" actually end a multi-rank run early

- **Area:** Sesh
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** "End assessment"/"End Sesh" (`multi-trick-sesh.tsx`) only ever completes the *current* trick and lets the run's completion effect auto-advance to the next one — there is no "abort the whole run" action. For a long sequence (a full bottom-to-top or from-rank Kentei assessment, dozens of tricks) this means a user has to click through every remaining trick one at a time to reach the wrap-up screen, which reads as the button simply not working. `handleSkipRank` already proves the sequence can be jumped to its end (`advanceTrickSequenceToIndex`) — "End" needs the equivalent.
- **Exit criteria:** Test: starting a full (multi-rank) Kentei assessment and pressing "End assessment" partway through immediately reaches the wrap-up screen, not the next trick; the current trick's landings-so-far are recorded exactly as today's per-trick End already does; remaining un-started tricks are not recorded as attempted (consistent with "Skip this rank" writing no history for tricks it skips). As part of verifying this fix, also manually confirm the rank-skip messaging on the wrap-up screen (`describeSkippedRange`/`WrapUpSkippedText`) renders correctly when a rank was skipped during the run this fix makes it fast to reach — this closes out the one item PR 55's QA checklist left unchecked ("confirm rank-skip messaging is correct when a rank is skipped"), which the messaging logic itself doesn't need a fix for (see below) but which couldn't practically be exercised until now.
- **Notes:** Scoped at the shared `MultiTrickSesh` level (not assessment-only) since ad hoc multi-trick practice has the identical latent one-trick-at-a-time limitation on its own "End Sesh" button, just less visible with typically-short user-configured runs — fixing it here benefits both callers with no observed downside. Assumption, not confirmed with the user: ending early records the current trick's progress-so-far (matching today's per-trick End behavior) and leaves remaining tricks unrecorded, following the existing "skip writes nothing" precedent — flag if a different treatment (e.g. explicitly marking remaining tricks as "not attempted" in the wrap-up) is wanted instead. Investigated separately whether rank-skip messaging itself was broken (the unchecked PR 55 QA item): it is not — `describeSkippedRange`, `handleSkipRank`, and `MultiTrickWrapUp`'s rendering are all correct and covered by `multi-trick-sesh.test.tsx`. The QA box most likely went unchecked because the fast/obvious verification path ("Current rank only") has no Skip button at all (`skipTarget` is `undefined` whenever `flow.kind === 'currentRankOnly'`), and the only path that does have one was blocked by this exact bug.

### [T059] Navigate to Home from the Kentei assessment wrap-up screen

- **Area:** Sesh (Kentei assessment)
- **Priority:** Low
- **Status:** Not started
- **Planning:** Implementer
- **Description:** The assessment wrap-up's final button is labeled "Finish sesh" and navigates to `/profile` (`onFinished` in `src/features/sesh/components/assessment-entry.tsx`) — both the copy and the destination are wrong for this context; the user should land on Home.
- **Exit criteria:** Completing a Kentei assessment and tapping the final wrap-up button lands on Home (`/`); its copy describes that destination rather than "Finish sesh."
- **Notes:** Scoped to the assessment call site only (`assessment-entry.tsx`'s `onFinished={() => router.replace('/profile')}`) — the ad hoc multi-trick flow (`multi-trick-sesh-entry.tsx`) has its own separate `handleFinished` that resets local state rather than navigating, and is unaffected. `RankUpCelebrationModal` is mounted at the app root independent of route, so it will still fire correctly on top of Home if a promotion happens at the end of the run.

### [T060] Explain when a Kentei rank didn't advance after an assessment

- **Area:** Sesh / Profile (Kentei assessment)
- **Priority:** Medium
- **Status:** Not started
- **Planning:** Required
- **Description:** `selectPromotedKenteiRank` (`src/features/tricks/model/trick-directory.ts`) requires gapless completion from the user's current stored rank upward, by design — confirmed correct, not a bug. But "Start from a rank" and "Skip this rank" both let a user generate real lace history far above their stored rank while lower ranks stay incomplete (or, for skipped ranks, get zero history at all), which permanently caps promotion at the first gap with no explanation anywhere in the UI. Per product decision, promotion logic itself is not changing — add messaging so this isn't silent.
- **Exit criteria:** Completing an out-of-order assessment (e.g. via "Start from a rank" above the current stored rank, or after skipping ranks) that does not result in a promotion shows copy explaining that earlier/skipped ranks still need to be cleared; a normal in-order assessment that does promote shows no such message.
- **Notes:** Decision resolved during scoping (conversation that created this batch of tasks): keep `selectPromotedKenteiRank`'s gapless-from-current-rank behavior exactly as-is; add transparency only — a larger rework of promotion semantics was explicitly declined in favor of this smaller, lower-risk fix. Simplest correct signal is comparing the profile's `kenteiRank` before vs. after the run — if landings were recorded but the rank didn't move, show the explanatory copy; no deeper per-rank diagnosis is required for a first pass. Consider also (implementer's judgment on whether it fits this same ticket or is worth splitting off) a heads-up at the point of choosing "Start from a rank" above the current stored rank, so the expectation is set before the run rather than only explained after. Related to but independent of [T058]/[T059] — different concern (post-hoc rank-promotion clarity vs. mid-run early-exit), both happen to touch `assessment-entry.tsx`/the wrap-up area.

### [T061] Remove Profile's "Retake assessment" section in favor of Kentei Assessment

- **Area:** Profile
- **Priority:** Medium
- **Status:** Not started
- **Planning:** Implementer
- **Description:** The Profile screen (`src/app/profile/index.tsx`) shows two adjacent, overlapping-in-purpose sections: "Assessment" ("Retake assessment", which resets `kenteiRank`/`hasCompletedOnboarding` and routes the user back through the first-run `KenteiOnboarding` self-report quiz) and "Kentei assessment" (the real, timed, promotion-only flow at `/profile/kentei-assessment`). Remove the former; keep the latter as Profile's sole assessment entry point.
- **Exit criteria:** Profile screen no longer shows a "Retake assessment" section or button; the "Kentei assessment" section is unchanged; onboarding's first-run flow (fresh profile, `hasCompletedOnboarding: false`) still renders and completes correctly, unchanged.
- **Notes:** Confirmed surgical: "Retake assessment" only calls `restartOnboarding()` (dispatches `onboardingRestarted`) — it imports nothing from `src/features/onboarding/` and shares no component code with it. Removing the button and its Profile-side wiring cannot affect the onboarding flow itself, since nothing in `src/features/onboarding/` references Profile. Per AGENTS.md, onboarding's own flow must not be modified by this task — confirmed unnecessary here, since the two are already independent.

### [T062] Exclude Kentei-assessment sessions from Stats and Home aggregation

- **Area:** Stats / Home / persistence (practice-history domain)
- **Priority:** Medium
- **Status:** Not started
- **Description:** Landings recorded during a Kentei assessment write ordinary `PracticeSessionRecord`s — identical in shape to regular Sesh/ad hoc multi-trick practice, with no field distinguishing origin — so they currently dilute the Stats screen's "By trick" list and Overview metrics, the per-trick history/personal-best page, and Home's momentum/streak/recent-session summary, all of which pull the full unfiltered practice-history pool.
- **Notes:** Umbrella only — complete T062.1 and T062.2. Kentei rank promotion (`KenteiRankAutoPromotion`/`selectLacedTrickIds`) deliberately depends on assessment-sourced landings flowing into the same session pool ("a full pass through a rank promotes you automatically" is Profile's own stated promise) — any fix must filter *display* reads only, never what gets written or what promotion logic counts. Going-forward only: sessions already recorded from past assessments predate any new origin tag and can't be reliably reclassified after the fact; no retroactive cleanup/migration is in scope, consistent with this being local-first prototype data.

### [T062.1] Tag practice-history records with their originating flow

- **Area:** persistence (practice-history domain)
- **Priority:** Medium (inherited from parent T062)
- **Status:** Not started
- **Planning:** Required
- **Description:** Add an optional origin/source field to `PracticeSessionRecord` (`src/features/stats/model/practice-history.ts`) and thread it through from wherever a session is recorded, so a Kentei-assessment-sourced landing can be distinguished from regular Sesh/ad hoc multi-trick practice at read time.
- **Exit criteria:** Test confirms a session recorded via the Kentei assessment flow carries a distinguishing value on this new field, a session recorded via regular Sesh or ad hoc multi-trick does not (or carries the "regular" value), and existing persisted records with no value at all round-trip correctly (treated as regular practice, no migration required).
- **Notes:** `createPracticeSessionRecord` (`practice-history.ts`) is the single construction site for every `PracticeSessionRecord`, called from both `Sesh` (`sesh.tsx`) and `MultiTrickSesh` (`multi-trick-sesh.tsx`, shared by both the ad hoc multi-trick route and `AssessmentEntry`) — the new field needs to originate as a prop/param passed into `MultiTrickSesh`/`Sesh` (distinguishing `AssessmentEntry`'s usage from `MultiTrickSeshEntry`'s) and flow through `SeshSummary` to the record. Practice-history's persistence schema/validator (`src/features/stats/persistence/practice-history-persistence.ts`) needs the corresponding optional-field update. This is a persistence-domain schema change per AGENTS.md.

### [T062.2] Filter Stats and Home reads to exclude Kentei-assessment sessions

- **Area:** Stats / Home
- **Priority:** Medium (inherited from parent T062)
- **Status:** Not started
- **Planning:** Required
- **Description:** Using T062.1's new field, exclude Kentei-assessment-sourced sessions from Stats' Overview metrics and "By trick" list (`src/app/stats/index.tsx`), the per-trick detail/personal-best page (`src/app/stats/[trickId].tsx`, a separate independent read site — does not inherit filtering from the Stats index screen), the neglected-tricks "Needs attention" section, and Home's momentum/streak/recent-session summary (`src/app/index.tsx`). Depends on T062.1.
- **Exit criteria:** Test: a practice-history pool containing both regular and Kentei-assessment-tagged sessions for the same trick produces Stats/Home aggregates that reflect only the regular sessions; `KenteiRankAutoPromotion`'s rank-promotion behavior is unchanged (still sees assessment-sourced landings) — verified by an explicit test that promotion still fires correctly off assessment-only lacing.
- **Notes:** Four independent read sites identified, all need the same filter applied since none of them share a filtered intermediate value today: `src/app/stats/index.tsx` (feeds Overview, By-trick, and neglected-tricks in one `sessions` pull), `src/app/stats/[trickId].tsx` (its own separate `usePracticeHistory()` call), and `src/app/index.tsx` (Home). Do not filter at the `PracticeHistoryProvider`/`usePracticeHistory()` level itself, since `KenteiRankAutoPromotion` reads from the same hook and must keep seeing everything.

### [T063] Add a preselected-trick "Start sesh" variant for practice entry points

- **Area:** Sesh / Navigation
- **Priority:** Medium
- **Status:** Not started
- **Planning:** Required
- **Description:** Every existing "Practice" deep link into Sesh (`Link href={{ pathname: '/sesh', params: { trickId } }}`) still renders the full setup picker — format choice, duration/target input, and the complete trick list — with the linked trick only cosmetically pinned to the top and labeled "Up next." Add a distinct variant that shows just the preselected trick and a "Start sesh" button, reachable only from explicit practice entry points, not from a plain visit to the Sesh tab.
- **Exit criteria:** Test: visiting Sesh via each of the identified practice-entry call sites (Tricks-row Practice action, Stats "Needs attention" Practice action, Home "Practice again" hero button, Home "In rotation" queue rows, Stats trick-detail "Challenge" action) renders the preselected trick plus a Start-sesh action only, with no other setup UI, and starting immediately begins that trick's countdown; a plain visit to the Sesh tab — including for a returning user whose `lastSesh` would otherwise prefill a trick — still renders the full setup picker exactly as today, unchanged.
- **Notes:** "Should only be accessible via the practice flow" is the requester's own scoping language. This must be a genuinely distinct signal from the existing `trickId`/`lastSesh` mechanism in `src/app/sesh/index.tsx` — that mechanism is *already* the everyday returning-user experience (every plain Sesh visit reads `lastSesh.trickId` the same way an explicit deep link reads its `trickId` param), so reusing it as-is for this variant would silently change the default Sesh-tab UX for all returning users, which is out of scope. Likely shape: a new param (e.g. a `mode`/`practice` flag) alongside `trickId`, and a new early-return branch in `Sesh`/`TrickPicker` gated on both that flag and `validatedPreferredTrickId` (already computed in `sesh.tsx`, confirms the trick is actually practiceable) being present. [T066] (goal → practice entry point) depends on this landing first — it's meant to be one of the "distinct instances of the practice UX flow" that converge on this new variant rather than the legacy full-picker link.

### [T064] Baseline goal progress at creation time

- **Area:** Goals
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** `selectGoalProgress` (`src/features/goals/model/goal.ts`) sums laces/duration across *all* historical practice sessions for a goal's trick, with no filter against when the goal was created — so a goal set against a trick with existing lace history shows inflated progress immediately, e.g. a trick with 50 prior laces and a new "land it 100 times" goal reads 50/100 on creation, not 0/100.
- **Exit criteria:** Test: a trick with N prior laces, then a new goal with target M created against it — progress reads 0/M immediately after creation, not N/M; lacing the trick after creation increments progress normally; existing in-Sesh goal-achievement-celebration detection (`isGoalNewlyAchieved`/`goalBaselines` in `sesh.tsx` — an unrelated use of "baseline," see note) continues to fire correctly, unaffected by this change.
- **Notes:** `Goal`/`GoalBase` (`goal.ts`) already carries a `createdAt` timestamp — this doesn't need a new persisted field or schema/migration, just filtering `selectGoalProgress`'s session sum to `session.completedAt >= goal.createdAt`. Marked Required despite the small fix because `selectGoalProgress` has several call sites (`trick-goals-screen.tsx`, `all-trick-goals-screen.tsx`/`selectGoalProgressByTrick`, and four places in `sesh.tsx`) and the file already uses "baseline" for a different, unrelated concept (`goalBaselines` = progress snapshotted at trick-selection time *within* a sesh, used to detect newly-crossed goals mid-session) — worth a careful pass to avoid conflating the two or missing a call site.

### [T065] Show a per-trick goal count in the Tricks list

- **Area:** Tricks
- **Priority:** Low
- **Status:** Not started
- **Planning:** Implementer
- **Description:** Each trick row's "Goals" action (`src/features/tricks/components/trick-directory.tsx`) always renders the bare label "Goals," unlike the adjacent "Notes" action, which shows a count via T024's `selectNoteCountByTrickId` pattern. Add the equivalent for goals.
- **Exit criteria:** Test: a trick with N goals shows "Goals — N" on its row; a trick with 0 goals shows plain "Goals" — matching the notes-count zero-state convention exactly.
- **Notes:** Direct mirror of T024: add `selectGoalCountByTrickId` in `src/features/tricks/model/trick-directory.ts` (same shape as `selectNoteCountByTrickId`), thread a `goalCountByTrickId` prop through `TrickDirectory` into the existing Goals `RowAction`, wire it from `src/app/tricks.tsx`. Assumption: count includes all goals for the trick (achieved and unachieved), mirroring notes' count exactly, per "similar to the notes count" in the request — flag if an active/unachieved-only count was intended instead.

### [T066] Add a practice entry point from a rendered goal

- **Area:** Goals
- **Priority:** Medium
- **Status:** Not started
- **Planning:** Required
- **Description:** A goal, wherever it's rendered (per-trick or all-trick goals screen), has no action to jump directly into Sesh for that trick — a user has to leave the goals screen and find the trick's separate Practice action. Add one, using copy oriented around advancing the goal rather than generic "Practice."
- **Exit criteria:** Test: a rendered goal exposes a practice action; activating it lands on Sesh with that trick preselected via [T063]'s preselected "Start sesh" variant, not the legacy full-picker link.
- **Notes:** Depends on [T063] landing first — this is explicitly meant to be one of the "distinct instances of the practice UX flow" the request asks to unify under the new preselected variant, not a sixth use of the legacy `/sesh?trickId=` full-picker pattern. Exact copy ("Practice toward this goal" or similar) left to implementer discretion.

### [T067] Add goal creation to the all-trick "Trick Goals" screen

- **Area:** Goals
- **Priority:** Medium
- **Status:** Not started
- **Planning:** Implementer
- **Description:** Goal creation exists today only on the per-trick goals screen (`TrickGoalsScreen`'s "Add goal" step, reached via a trick row's own Goals action) — the cross-trick "Trick goals" screen reached from the Tricks header button (`AllTrickGoalsScreen`) has no add-goal affordance at all; its own empty-state copy says "Set one from a trick's Goals action" as the only path. Add goal creation there too.
- **Exit criteria:** Test: from the all-trick-goals screen, a user can create a new goal by selecting a trick and defining a target, and it appears in that screen's list afterward.
- **Notes:** Interpreting "the 'Trick Goals' screen" as `AllTrickGoalsScreen` specifically (the screen behind the header button literally labeled "Trick goals" in `src/app/tricks.tsx`) rather than the per-trick `TrickGoalsScreen`, which already has this capability — flag if the per-trick screen was actually meant. Unlike the per-trick screen, there's no trick already in context here, so this needs an added trick-selection step before the existing `GoalForm`/`addGoal` flow; reusing `TrickDirectory`'s selection UI is one option, implementer's call.

### [T068] Return to Tricks home when the Tricks tab is pressed from a nested view

- **Area:** Navigation / Tricks
- **Priority:** Medium
- **Status:** Not started
- **Planning:** Required
- **Description:** Every nested view under Tricks (trick edit/delete, notes, goals, laced-tricks grid, custom-trick creation — all local `useState` in `src/app/tricks.tsx`) is invisible to the tab bar itself, since the URL never leaves `/tricks`. Pressing the Tricks tab while already on one of these views is a confirmed complete no-op on web today — `expo-router/ui`'s `TabTrigger` only dispatches a tab switch when the pressed tab is *not* already focused, and it already is. Make re-pressing Tricks from a nested view return to the trick list.
- **Exit criteria:** From any of the nested Tricks views listed above, pressing the Tricks tab returns to the trick list — verified on web, iOS, and Android (native uses a different tab primitive, `NativeTabs`, which may already handle this via a platform default or may not — confirm rather than assume).
- **Notes:** This is a narrower, faster fix than [T069]'s full route conversion, addressing the same reported friction without waiting on that larger effort — likely superseded/adapted once (or if) screens migrate to real routes there, since this fix necessarily targets today's local-state mechanism (probably: detect "Tricks tab pressed while already focused" and explicitly reset all of `tricks.tsx`'s nested-view state vars, on both `app-tabs.web.tsx` and `app-tabs.tsx`).

### [T069] Convert Tricks' nested pseudo-screens into real routes with back navigation

- **Area:** Navigation / Tricks
- **Priority:** Medium
- **Status:** Not started
- **Description:** Every "nested" view reachable from Tricks — trick edit, delete-confirm, notes (list/add/edit), all-notes archive, goals (list/add), all-trick-goals, laced-tricks grid, custom-trick creation — is conditional local-state rendering inside the single `src/app/tricks.tsx` route (confirmed: no `src/app/tricks/` directory exists), each dismissed only by its own hand-rolled "Close" button. None has its own URL, and none gets real back-button semantics for free. Give them real routes.
- **Notes:** Umbrella only — complete T069.1 and T069.2. This was T027's deliberate design at the time ("standalone trick-goals screen," confirmed Close-returns-to-directory as intended), not an oversight — this task is a deliberate revisit, not a regression fix. [T068] already covers the tab-press-returns-home behavior as a faster standalone fix; this chain should verify that behavior still holds (adapting T068's mechanism as needed) once views become real routes, not re-solve it from scratch.

### [T069.1] Establish the nested-route and back-navigation convention via the trick-goals screen

- **Area:** Navigation / Tricks
- **Priority:** Medium (inherited from parent T069)
- **Status:** Not started
- **Planning:** Required
- **Description:** Convert the per-trick goals screen (`TrickGoalsScreen`, today's `goalsTrick` local state in `src/app/tricks.tsx`) into a real nested route with its own URL and a back control in place of its "Close" button, establishing the pattern the rest of this chain will reuse.
- **Exit criteria:** Navigating Tricks → a trick's Goals is a real, distinct route; a back control (not a "Close" button) returns to Tricks home; pressing the Tricks tab while on that route also returns to Tricks home ([T068]'s behavior, confirmed still working or adapted for the new route); verified on web and both native platforms.
- **Notes:** Also decide and document the convention for the second layer of nesting this screen already has internally (its own `list`/`add` local steps) — whether that becomes sub-routes too or stays local state within the new route — since [T069.2] will need to apply the same call consistently to Notes' equivalent internal `list`/`add`/`edit` steps.

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
