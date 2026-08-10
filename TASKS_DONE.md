# Tasks — Done Archive

Completed entries move here from `TASKS.md`'s `Backlog`, in the same commit that closes them out. This file is history, not a work queue — it is intentionally **not** part of the top-to-bottom read `TASKS.md` asks for when picking up new work, since a finished task has no bearing on what to do next. Consult it only when you need context on a specific completed task — its resolved decisions, exit criteria, or notes — that isn't already captured elsewhere (commit messages, code comments where warranted).

Entries keep their content as it was at completion. Don't retroactively edit a description or exit criteria after the fact; if something about a completed task turns out to be wrong or misleading, note that in a new entry or in code, not by rewriting history here.

---

### [T001] Add laced count to trick list

- **Area:** Tricks
- **Priority:** High
- **Status:** Done
- **Description:** Trick list items display how many times each trick has been laced (landed), derived from practice history.
- **Exit criteria:** Test confirms the trick list renders the correct laced count per trick from a given set of practice-history records; spot-checked in-browser against real data.
- **Notes:** Purely derived/display — no new persistence.

### [T002] Keep device awake during active sesh

- **Area:** Sesh
- **Priority:** High
- **Status:** Done
- **Description:** Prevent the device screen from sleeping while a sesh is in the active (or countdown) state; restore normal sleep behavior once the sesh ends or isn't active.
- **Exit criteria:** Keep-awake engages on entering the active sesh state and releases on leaving it — verified via a state-transition test; screen-stays-on behavior confirmed manually on-device, since actual screen-sleep isn't something an automated test can observe.
- **Notes:** Manual on-device check is a necessary supplement to the automated test here, not a substitute for it. Web-verified (Screen Wake Lock API) via the dev server across the full countdown → active → completed lifecycle, with no console errors; iOS/Android on-device screen-sleep behavior is still an open verification item consistent with the project's overall "web first" posture (see AGENTS.md § Verification and local development). Implementation: `shouldKeepScreenAwake` in `src/features/sesh/model/sesh.ts` derives whether the screen should stay awake from Sesh status (countdown/active); `src/features/sesh/components/sesh.tsx` drives `expo-keep-awake`'s `activateKeepAwakeAsync`/`deactivateKeepAwake` off that derivation, tagged `sesh-active`, with `.catch` no-ops since wake-lock support/permission varies by browser and is a best-effort enhancement, not a blocker for practicing.

### [T003] Link directly into Sesh from any trick in Tricks list

- **Area:** Tricks / Sesh
- **Priority:** High
- **Status:** Done
- **Description:** Add an action on each trick-list item that starts a Sesh containing that trick, regardless of whether it's currently in the user's focused/selected tricks.
- **Exit criteria:** Tapping the action for any trick — focused or not — navigates to Sesh with that trick loaded and ready to practice; verified in-browser for one focused and one unfocused trick.
- **Notes:** Check whether Sesh's entry points currently assume the trick is in `selectedTrickIds` (`src/app/sesh.tsx` / Sesh state machine) before implementing. Confirmed during implementation: `src/app/sesh.tsx` and `selectSeshPracticeTricks` in `src/features/sesh/model/sesh.ts` already handle a `trickId` param independent of `selectedTrickIds` (the preferred trick is prepended even when not focused), so no Sesh-side changes were needed. Added a "Practice" row action to every trick in `TrickDirectory` (`src/features/tricks/components/trick-directory.tsx`), using an Expo Router `Link` to `/sesh?trickId=<id>`, for both standard and custom tricks, focused or not. Verified in-browser for a focused trick and, after unfocusing it, the same now-unfocused trick.

### [T004] Display trick unlocked status derived from lace history

- **Area:** Tricks
- **Priority:** High
- **Status:** Done
- **Description:** Trick list shows a locked/unlocked indicator per trick, where unlocked means at least one completed practice-history record exists for that trick ID.
- **Exit criteria:** A trick with ≥1 practice-history record renders unlocked; a trick with none renders locked — verified by test.
- **Notes:** Derived half only. T006 layers a manual override on top of this. Implementation: `selectUnlockedTrickIds` in `src/features/tricks/model/trick-directory.ts` derives the unlocked set from practice-history session `trickId`s (a trick counts as unlocked even if its only record has zero laces, same convention as the existing `selectLacedCountByTrickId`). `TrickDirectory` (`src/features/tricks/components/trick-directory.tsx`) takes an optional `unlockedTrickIds` prop and renders an "Unlocked"/"Locked" badge next to the trick name when it's supplied; `src/app/tricks.tsx` wires it from `usePracticeHistory()`. Verified by unit test and spot-checked in-browser against real practice history.

### [T005.1] Define a sesh-end target before starting

- **Status:** Done
- **Description:** Open-ended sesh setup lets the user optionally define a target trick + landing count before starting.
- **Exit criteria:** Starting an open-ended sesh with a defined target stores it on the sesh's initial state; starting without one behaves exactly as today — verified by test.
- **Notes:** Parent [T005] stays `Not started` — [T005.2] (gating the end action on the target) is still outstanding. Implementation: `src/features/sesh/model/sesh.ts` adds a `SeshTarget` (`{ landingCount }`) carried as an optional `target` on the `openEnded` `SeshPlan` variant, plus `createOpenEndedSeshPlan(landingCount?)` (mirrors `createTimedSeshPlan`'s validation pattern, 1–999 whole laces) and `isValidSeshTargetLandingCount`. No reducer changes were needed — `SeshPlan` already flows unchanged from `trickSelected` through to the `active`/`completed` states, so a defined target lands on the sesh's initial state for free. `TrickPicker` in `src/features/sesh/components/sesh.tsx` gained an optional "Target laces" field shown only for the open-ended format; leaving it blank reproduces today's untargeted plan exactly. T005.2 is left to read `state.plan.target` and `landings.length` to compute progress and gate the end action — nothing here computes or displays progress yet.

### [T005] End-of-sesh target criteria (open-ended flow)

- **Area:** Sesh
- **Priority:** High
- **Status:** Done
- **Description:** In the open-ended sesh flow, let the user define a target before starting (land Trick X, Y times) and gate ending the sesh on meeting it, with an explicit override always available.
- **Notes:** Decision resolved during scoping — hard gate with override: the primary end action is disabled until the target is met, but an "end anyway" action is always present. Both children ([T005.1], [T005.2]) are now `Done`.

### [T005.2] Track progress and gate the end action

- **Area:** Sesh
- **Priority:** High
- **Status:** Done
- **Description:** Sesh tracks progress toward the defined target through the active session and gates the primary end action until it's met.
- **Exit criteria:** With an unmet target, the primary end action is disabled and a separate "end anyway" action ends the sesh; once the target is met, the primary end action is enabled — verified by test.
- **Notes:** Implementation: `src/features/sesh/model/sesh.ts` adds two pure derivations — `getSeshTargetLandingCount(plan)` (the plan's target landing count, or `undefined` for timed/untargeted plans) and `isSeshTargetMet(plan, landingCount)` (always `true` when there's no target, so the UI can apply it unconditionally). No reducer changes — this is a UI-only gate; "end anyway" dispatches the same `seshEnded` action as the primary button. `ActiveSesh` in `src/features/sesh/components/sesh.tsx` computes `targetLandingCount`/`targetMet` from these, disables `EndButton` (`disabled`, `accessibilityState`, `$disabled` opacity, mirroring the existing `LacedButton`/`TrickChoice` pattern) until met, renders a progress readout (`TargetStatus`, modeled on `ChallengeStatus`'s boolean color swap) only when a target exists, and shows an always-functional "End anyway" text action beneath the secondary-actions row only while a target is set and unmet. Verified by new `sesh.test.ts` cases covering both derivations' boundaries (timed plans, untargeted open-ended, and a targeted plan at 0/9/10/11 against a target of 10), plus in-browser spot-check via the Expo dev server confirming the disabled → enabled transition and "End anyway" visibility.

### [T006] Manual trick-unlock override

- **Area:** Tricks / persistence
- **Priority:** High
- **Status:** Done
- **Description:** Allow the user to manually mark a trick as unlocked independent of lace history, as a togglable flag layered on top of (not replacing) T004's lace-derived status.
- **Exit criteria:** Setting the manual flag on a trick with no lace history shows it unlocked; clearing the flag returns it to lace-derived status; a trick with real lace history stays unlocked regardless of the flag — verified by test.
- **Notes:** Decision resolved during scoping — toggle, not a one-way override. Implementation: `UserProfile` (`src/features/profile/model/user-profile.ts`) gains an optional `manuallyUnlockedTrickIds` field plus `manualUnlockToggled`/`manualUnlockRemoved` reducer actions, mirroring the existing `selectedTrickToggled`/`selectedTrickRemoved` pattern; `removeManualUnlock` is wired into custom-trick deletion (`src/app/tricks.tsx`) alongside `removeSelectedTrick` so deleting a custom trick doesn't leave an orphaned flag. Persistence (`src/features/profile/persistence/user-profile-persistence.ts`) validates/round-trips the new field with the existing `isStringArray` helper, following the `lastSesh`/`streakThresholdMs` optional-field convention. `selectUnlockedTrickIds` (T004's lace-derived selector) is left untouched; a new `selectEffectiveUnlockedTrickIds` in `src/features/tricks/model/trick-directory.ts` unions the laced set with the manual list — plain set union, so it's a toggle, not a one-way override. `TrickDirectory` (`src/features/tricks/components/trick-directory.tsx`) gained an optional `manualUnlock` prop rendering a small "Manual" toggle next to the existing Unlocked/Locked badge, reflecting the raw manual flag rather than the effective unlocked status. Verified by unit tests for all three exit-criteria scenarios and in-browser spot-check on `/tricks`: toggling manual-unlock on an unlaced trick flipped its badge to Unlocked and back to Locked on clear, while a trick with real lace history stayed Unlocked through both toggle states.

### [T007] Auto-promote Kentei rank on completing current rank

- **Area:** Profile / Tricks
- **Priority:** Medium
- **Status:** Done
- **Description:** When the user has laced every trick in their currently assessed Kentei rank, update the profile's assessed rank to the next one automatically.
- **Exit criteria:** Lacing the last remaining trick in the current rank updates `profile.kenteiRank` to the next rank with no confirmation step — verified by test.
- **Notes:** Decision resolved during scoping — automatic and silent, not confirmation-gated. Implementation: `isKenteiRankComplete`/`selectPromotedKenteiRank` in `src/features/tricks/model/trick-directory.ts` are pure selectors — the latter cascades through multiple already-complete ranks in one call and never advances past the highest rank present in `KENDAMA_KENTEI_TRICKS`, checking only standard tricks (same precedent as `getTricksForRank`). `UserProfile` (`src/features/profile/model/user-profile.ts`) gains a `kenteiRankAdvanced` reducer action, exposed as `advanceKenteiRank` from `UserProfileProvider` following the existing action-creator pattern. Since `UserProfileProvider` sits above `PracticeHistoryProvider` in `src/app/_layout.tsx` and can't read practice history itself, the cross-domain reaction lives in a new non-rendering component, `KenteiRankAutoPromotion` (`src/features/profile/state/kentei-rank-auto-promotion.tsx`), rendered as a sibling of `AppTabs` inside `PracticeHistoryProvider` — it reads both providers via hooks and dispatches `advanceKenteiRank` in a `useEffect` only when the promoted rank differs from the current one. Verified by unit tests covering rank-1-minus-one-trick (no promotion), last-trick-laced (promotes), max-rank ceiling, and multi-rank cascade, plus the `kenteiRankAdvanced` reducer case; manually verified in-browser by seeding practice-history localStorage with laces for all five rank-1 tricks and confirming `profile.kenteiRank` flipped from 1 to 2 with the Profile screen's rank tile and the Tricks screen's rank grouping both reflecting rank 2 on reload, with no confirmation dialog.

### [T008] First-lace celebration

- **Area:** Sesh / Tricks
- **Priority:** Medium
- **Status:** Done
- **Description:** When a trick is laced for the first time ever (no prior practice-history record for that trick ID), show a distinct celebratory UI moment.
- **Exit criteria:** Completing a sesh that lands a trick with zero prior laces triggers the celebration UI; a trick with prior laces does not — verified by test.
- **Notes:** "Extra flashy" tiering by time/attempts spent before landing is a separate, unscoped idea — not in scope for this task. "First lace" is defined as no prior recorded session for the trick with `laceCount > 0` — a prior zero-lace record (e.g. an ended-early sesh with no laces) doesn't disqualify it. Implementation: `isFirstLaceForTrick(priorSessions, summary)` in `src/features/stats/model/practice-history.ts` is a pure predicate, doc-commented that `priorSessions` must be history as it stood before the current summary was recorded. `src/features/sesh/components/sesh.tsx` computes it once, in the existing sesh-completion `useEffect` (guarded by `recordedSummaryId` so it can't re-run once `sessions` includes the just-recorded session), storing the result in a `firstLaceCelebration` state flag — following the same "compute once at the transition, don't re-derive reactively" pattern already used for `personalBest`. The flag is cleared on both `onReset` and `onRepeat` so it doesn't leak into a subsequent sesh. `CompletedSesh` takes a new `isFirstLace` prop and renders a `FirstLaceBanner` (yellow card, red eyebrow, spring+opacity entrance reusing the `Countdown` component's animation pattern, own accessibility label `"First lace ever on {trick name}"`) above the existing headline when true; kept visually and conceptually distinct from `ResultBanner` (personal-best comparison, a different concept). Verified by new unit tests in `practice-history.test.ts` covering: no prior record, prior zero-lace record, prior record with laces, and a zero-landing summary — plus `yarn test --runInBand`, `yarn lint`, `yarn tsc --noEmit`, and `yarn expo export --platform web` all passing.

### [T010.2] Auto-prompt for a note on a no-lace timed sesh

- **Area:** Tricks / persistence (new domain)
- **Priority:** Medium (inherited from parent T010)
- **Status:** Done
- **Description:** When a timed sesh completes without landing its trick, prompt the user to add a note, pre-linked to that sesh via its practice-history record ID. Depends on T010.1.
- **Exit criteria:** A timed sesh ending without a lace triggers the prompt, and a note created from it carries the correct sesh reference; a timed sesh that ends with a lace, and any open-ended sesh, never trigger the prompt — verified by test.
- **Notes:** The practice-history record ID was previously computed by an identical string template (`${startedAt}:${endedAt}:${trickId}`) independently in two places — `createPracticeSessionRecord` and an inline literal in `sesh.tsx`'s dedup-ref effect. Extracted into a single exported pure function, `createPracticeSessionRecordId(summary)` in `src/features/stats/model/practice-history.ts`, used by both `createPracticeSessionRecord` and the sesh note prompt below, with a unit test asserting the two stay in sync. Added `shouldPromptSeshNote(summary)` to `src/features/sesh/model/sesh.ts` — a pure predicate, true only when `plan.kind === 'timed'` and `landings.length === 0`; false for every open-ended case (targeted, untargeted, with or without landings) and any timed sesh with at least one landing, covered by new unit tests in `sesh.test.ts`. Wired into `CompletedSesh` in `src/features/sesh/components/sesh.tsx`: when `shouldPromptSeshNote(summary)` is true, a new colocated `SeshNotePrompt` subcomponent renders below the landing history, following the file's existing pattern of colocating sesh-specific banners (`FirstLaceBanner`, `ResultBanner`) rather than a new file. `SeshNotePrompt` has local `idle → writing → saved` (or `dismissed`) state; on save it calls `useNoteActions().addNote` with `practiceSessionId: createPracticeSessionRecordId(summary)`, guaranteeing the note's sesh reference matches the practice-history record actually persisted for that sesh. No manual reset logic was needed — `CompletedSesh` unmounts whenever `state.status` leaves `'completed'`, so a fresh completion always starts the prompt from scratch. Both parent [T010] and this child are now `Done`. Verified by new unit tests in `practice-history.test.ts` and `sesh.test.ts`, `yarn test --runInBand`, `yarn lint`, `yarn tsc --noEmit`, and `yarn expo export --platform web` all passing.

### [T010] Sesh/trick notes

- **Area:** Tricks / persistence (new domain)
- **Priority:** Medium
- **Status:** Done
- **Description:** Let the user attach a note to a trick, optionally tied to the specific sesh that prompted it, without touching the immutability of practice-history records.
- **Notes:** Decisions resolved during scoping:
  - New standalone "Notes" domain (own reducer/validation/persistence adapter, per the existing per-concern pattern) — not merged into practice history or custom tricks.
  - A note requires a trick ID **and** a trick-name snapshot captured at write time (same convention practice-history already uses), so it survives a later rename or deletion of a custom trick. Standard Kentei tricks can't be deleted, so this only bites for custom tricks, but the record shape doesn't need to special-case that.
  - A note optionally carries a practice-history record ID, for notes born from a specific sesh (see T010.2). General trick notes omit it.
  - The Notes domain itself is **not** immutable — the immutability invariant protects Stats derivation specifically; notes don't feed any derived calculation, so editing/deleting a note later is fine.
  - Both children ([T010.1], [T010.2]) are now `Done`.

### [T009] Home-screen time logged (day/week/month/year)

- **Area:** Home / Stats
- **Priority:** Medium
- **Status:** Done
- **Description:** Home screen shows total practice time logged for day, week, month, and year. A longer window only renders once enough real time has passed since the user's first recorded practice for that window to be meaningful.
- **Exit criteria:** With practice history spanning less than a window's natural period since the first record, that window is hidden; once enough real time has elapsed, it renders with the correct total — verified by test.
- **Notes:** Gated on elapsed real time since first use, not merely a record existing in the window. Thresholds measured from the first practice-history record: hide "week" before 7 days of history, "month" before ~30 days, "year" before ~365 days. Windows are rolling (last 24h/7d/30d/365d from `now`), not calendar-aligned — matches the existing 7-day "momentum" rolling window already in `home-summary.ts`. Implementation: `calculateTimeLogged(sessions, now)` in `src/features/stats/model/time-logged.ts` is a pure derivation returning only the windows that are unlocked — "day" always, "week"/"month"/"year" gated on `now - firstRecordAt >= windowMs` where `firstRecordAt` is the earliest session ever recorded (not merely the earliest inside that window — a session more than a year old still unlocks the year gate even though it no longer contributes to the year total). `createHomeSummary` exposes the result as `HomeSummary.timeLoggedWindows`; `home-summary.ts`'s existing `SEVEN_DAYS_MS` momentum constant was replaced with the shared `WEEK_MS` export to remove the duplicate. `DailyHome` (`src/features/home/components/daily-home.tsx`) renders a new "Time on the string" section between the practice queue and the Momentum section, mapping each window in the array to a labeled tile (Today/This week/This month/This year) via `formatDuration` — no gating logic in the UI layer, since the model only ever returns unlocked windows. Verified by new unit tests in `time-logged.test.ts` (including an exact-boundary case per window and the "unlocks from the true first record even when that record has aged out of the window" case) plus end-to-end cases through `createHomeSummary` in `home-summary.test.ts`; `yarn test --runInBand`, `yarn lint`, `yarn tsc --noEmit`, and `yarn expo export --platform web` all pass.

### [T010.1] Notes domain and basic note CRUD on a trick

- **Area:** Tricks / persistence (new domain)
- **Priority:** Medium (inherited from parent T010)
- **Status:** Done
- **Description:** Add the Notes persistence domain and a minimal UI to create, view, edit, and delete a note attached to a trick, with an optional sesh reference.
- **Exit criteria:** Test confirms: creating a trick-only note stores the trick ID and name snapshot; creating one with a sesh reference also stores the practice-history record ID; editing and deleting both work; renaming or deleting the source custom trick afterward leaves the note displaying its snapshotted name rather than breaking.
- **Notes:** New standalone Notes domain, own reducer/validation/persistence adapter, mirroring `src/features/custom-tricks/`: `src/features/notes/model/note.ts` (`Note`, `NoteCollection`, `validateNoteCreation`/`validateNoteEdit`, `createNote`/`createNoteId`, `noteReducer`, `selectNotesForTrick`), `src/features/notes/persistence/note-persistence.ts` (versioned `daily-dama:notes` storage key, duplicate-id rejection, malformed-document recovery), and `src/features/notes/state/note-provider.tsx` (`NoteProvider`/`useNotes`/`useNoteActions`, same hydration-fallback and write-queue pattern as `CustomTrickProvider`), wired into `src/app/_layout.tsx` inside `PracticeHistoryProvider`. `NoteCreationInput` requires a non-empty `trickId` and `trickName` snapshot and treats `practiceSessionId` as optional — general trick notes (this task) omit it; sesh-linked notes are T010.2's job and out of scope here. UI: `src/features/notes/components/trick-notes-screen.tsx` (`TrickNotesScreen`) lists a trick's notes newest-first with inline add/edit forms and an inline (non-`Alert`) delete confirmation on the row, matching the app's existing no-`Alert.*` convention. `src/features/tricks/components/trick-directory.tsx` gained an optional `notesAction` prop rendering a "Notes" row action for every trick — standard and custom alike, deliberately independent of the custom-trick-only `customActions` gate. `src/app/tricks.tsx` wires a `notesTrick` screen-swap state alongside the existing `editingTrick`/`deletingTrick` pattern. Because a deleted custom trick has no more directory row to open, the "note survives trick deletion" claim is verified at the model layer only (`note.test.ts`'s byte-for-byte-unchanged case after `customTrickReducer` rename + delete on the separate custom-tricks state) rather than via a live post-deletion UI path — deliberately out of scope per the plan. Verified by new unit tests in `note.test.ts` and `note-persistence.test.ts`, `yarn test --runInBand`, `yarn lint`, `yarn tsc --noEmit`, `yarn expo export --platform web`, and an in-browser walkthrough on `/tricks` confirming add/edit/delete all work through the "Notes" row action.
