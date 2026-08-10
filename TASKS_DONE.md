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
