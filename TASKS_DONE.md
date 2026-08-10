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
