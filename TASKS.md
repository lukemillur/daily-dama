# Tasks

Working backlog for Daily Dama **core-functionality** work. This file is the checkpoint mechanism: a session — including a fresh one after context compaction — reads it top to bottom to know what's done, what's next, and how to verify it, instead of relying on conversation memory or a todo list that only exists in-context.

**Scope note:** Trick visualization (`src/features/trick-viz/`) is intentionally excluded from this file right now. Its own backlog lives in [TRICK_VIZ_HANDOFF.md](TRICK_VIZ_HANDOFF.md) §15. Do not pull items from there into this file unless explicitly told to resume that thread.

**Automation note:** [TASKS_BACKLOG.md](TASKS_BACKLOG.md) holds scoped, ready-to-work tasks that are deliberately kept out of this file so the `newTicket` workflow (`.claude/skills/newTicket/SKILL.md`) never claims, plans, or implements them automatically. Moving an entry between the two files is a deliberate human decision, not something to do as a side effect of other work.

**Collaborative queue:** [TASKS_COLLABORATIVE.md](TASKS_COLLABORATIVE.md) holds tickets requiring owner decisions or external verification, executed one at a time with `$guided-ticket`. It is excluded from automatic claiming. Allocate new IDs across all three queues and `TASKS_DONE.md`. Existing claimed tickets remain with their current workflow; the new queue records any residual follow-up explicitly.

## How to use this file

**Picking up work:**

1. Scan this file top to bottom by entry title and status only — not full bodies — to find the first `Backlog` entry with status `Not started` or `In progress`.
2. Before claiming it, follow the branch-check protocol in _Working across multiple agents_ below — this file's status field is a human-readable picture, not the authoritative claim signal.
3. Once claimed, read that entry's full description and exit criteria before writing anything — that's the definition of done, not a vibe check.
4. If the exit criteria depend on something no longer true (file moved, API changed, decision superseded), stop and flag it rather than guessing.

**Completing a task:**

1. Do the work.
2. Run the task's own exit criteria yourself — don't mark it done on assumption.
3. Run the risk-based local checks for the changed area in [AGENTS.md](AGENTS.md), including full typechecking for TypeScript changes. Reserve the complete app sequence for the escalation conditions documented there; narrow tasks rely on the required CI app gate for the broad baseline.
4. Commit the change on its own, referencing the task ID in the message. Focused commits, never pushed automatically (see AGENTS.md § Git state expectations).
5. In that same commit, move the entry from `Backlog` in this file to [TASKS_DONE.md](TASKS_DONE.md), flipping its status to `Done`. If this task was the last remaining child of a parent umbrella entry (every sibling child is now `Done`), move the parent entry to `TASKS_DONE.md` as well, in the same commit, flipping its status to `Done` too — an umbrella with no exit criteria of its own is done exactly when its children are.
6. Open a PR into `development`, wait for required CI checks to pass, then squash-merge it — no human review gate is required, and the automated merge remains pre-authorized (see [AGENTS.md](AGENTS.md) § Git state expectations). `development`, not `main`, is where task branches land; promoting `development` into `main` is a separate, manual step outside this protocol.

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
4. Open a PR into `development` when ready, wait for required CI checks to pass, and then squash-merge it — this is pre-authorized and needs no human review gate (see AGENTS.md § Git state expectations). A failed or unavailable required check blocks the merge; do not bypass it.
5. Pushing further commits to your own branch, opening the PR, and squash-merging it into `development` are all covered by working normally on a task. Promoting `development` into `main` is a separate, manual step and still needs the usual confirmation.

**Stale claims:** a pushed branch with no activity and no PR is an abandoned claim, not a real one. Deleting it releases the task — ordinary git housekeeping, no special protocol required. Deleting it is a deliberate human decision: no agent or script may take over a claim branch on its own, and branch age is never treated as proof that a claim was abandoned.

**Resuming your own interrupted task:** if a run stopped partway — a usage limit, a crashed session — the claim branch and any committed `.claude/plans/<ID>.md` are still there, and that's exactly what recovery uses. Resume it explicitly with `/newTicket resume T0NN`. Resuming reads the branch, never rewrites it: it stops with a blocker if no branch matches the ID, if more than one does, or if the branch doesn't actually contain that task. If a durable plan is on the branch, implementation continues from it instead of planning again.

**Claiming is scripted, not improvised.** `node .claude/scripts/ticket-claim.mjs` performs selection, the dependency check, the collision check, the branch, the status flip, the claim commit and the claim push, inside a temporary worktree it removes itself. It never force-pushes, never deletes a branch it doesn't own, and never touches the checkout it's invoked from. Run it with `--dry-run` to see which task would be picked without changing anything.

## Needs scoping

_Raw ideas land here — a name and a one-line description, nothing more. Discuss and apply the promotion checklist above before moving an entry down to Backlog._

- **First-lace "extra flashy" tiering** (Medium, follow-on to T008) — escalate the celebration based on time/attempts/sessions spent before landing; thresholds undefined.
- **Competition mode** (Low) — trick lists by competition skill level, portable into sesh mode.
- **Longest-grind-per-trick metric** (Low) — time-to-first-lace per trick; display surface (Stats?) undecided.
- **Double-digit lace animation** (Low) — animation design undefined.
- **Buzzer-beater lace animation** (Low) — landing with under 10s remaining; threshold is clear, animation design is not.
- **Time-of-day success correlation** (Low) — surface whether the user lands more in morning vs. night seshes; what counts as a meaningful difference is undefined.
- **Line generator** (Low) — random line of tricks; trick pool source (all / unlocked / selected) undecided.
- **Collection management** (Low) — photos + metadata for physical kendama collection, with kendama-specific lace lists. Likely a new persistence domain; substantial scope on its own.

## Backlog

_iOS Simulator audit activation — 2026-10-29, explicitly requested by the owner. Source: [DESLOPPIFY.md](DESLOPPIFY.md), scoped iOS audit and workflow matrix. D022 → T283; D023 → T284; D024 → T285; D025 → T286; D021 → T287; unsupported S040 guest affordances → T288; unfinished audit coverage → T289. Existing T042, T043/T043.1–T043.2 and T044/T044.1–T044.2 move here from TASKS_BACKLOG.md with their IDs preserved and iOS-only acceptance clarified. Full S040 authentication/sync remains Proposed in BACKLOG_STORIES.md; it is not activated by these presentation tickets. These entries document work; this change does not claim, implement, publish or close them._

_Native execution prerequisite: the simulator-enablement changes described in [outputs/ios-personal-build-setup.md](outputs/ios-personal-build-setup.md) are on `development`. The generated `/ios` project and local CocoaPods workaround are not committed, so a fresh checkout may need `yarn ios` (prebuild and pod install) first. Report a tooling failure as a prerequisite rather than a passed check._

### [T284] Reserve native tab clearance for scroll content

- **Area:** Shared UI / screen layout
- **Priority:** High
- **Status:** Blocked — split into T284.1–T284.3 on 2026-11-02 because simulator verification of every screen did not fit one agent run.
- **Description:** Establish a shared iOS tab/safe-area clearance convention and apply it to tab-hosted scroll content. The (since replaced by T290) floating tab bar visibly overlapped Sesh choices/completion actions, custom-trick Save, Home footer content and Stats rows; several screens reserve only 24 points below content.
- **Notes:** Umbrella only — complete T284.1, T284.2 and T284.3. Source: DESLOPPIFY.md D023. Keyboard-visible behavior belongs to T044. Native lifecycle/providers/persistence remain unchanged.
- **Platform scope:** Acceptance for this ticket runs on the iOS Simulator. Android and physical-device checks are not part of these exit criteria; record them as not run rather than passed.

### [T284.1] Establish the shared native tab-clearance convention

- **Area:** Shared UI / screen layout
- **Priority:** High (inherited from parent T284)
- **Status:** In progress
- **Planning:** Implementer
- **Description:** Land the shared clearance convention in `Screen` and verify it on Tricks and the custom-trick and custom-sequence forms. Start from the unverified work in commit `f5e9a95` on `task/T284-reserve-native-tab-clearance-for-scroll` (`withNativeTabClearance`, `screen.test.tsx`, Profile padding, removed `BottomTabInset`).
- **Exit criteria:** On small and large simulators at maximum scroll, the last Tricks row and the Save and Cancel actions of the new-custom-trick, edit-custom-trick and custom-sequence forms are fully above the tab bar and tappable; focused tests protect the convention; web layout is unchanged at 320 px; full typechecking passes.
- **Dependencies:** T290.
- **Notes:** T290 landed a fixed in-flow JS tab bar, so the floating-bar overlap this ticket assumed no longer exists; re-scope to confirming no clearance is needed and removing unused clearance work. Small = iPhone 17e, large = iPhone 18 Pro Max (iOS 27.0). The earlier run observed that Home and Sesh setup already cleared the bar before the change, and that Tricks showed the overlap. Avoid scattered fixed spacers or duplicated automatic safe-area padding.
- **Platform scope:** Acceptance for this ticket runs on the iOS Simulator. Android and physical-device checks are not part of these exit criteria; record them as not run rather than passed.

### [T284.2] Verify tab clearance on Home, Sesh and Stats

- **Area:** Shared UI / screen layout
- **Priority:** High (inherited from parent T284)
- **Status:** Not started
- **Planning:** Implementer
- **Description:** Apply or confirm the T284.1 convention on Home, Sesh setup, Sesh completion summary, multi-trick wrap-up and Stats (list and detail).
- **Exit criteria:** On small and large simulators at maximum scroll, the final row and primary action of each screen named above is fully above the tab bar and tappable, with at least three completed practice records present so Stats and the completion summary have rows to scroll; web layout is unchanged.
- **Dependencies:** T284.1.
- **Notes:** Small = iPhone 17e, large = iPhone 18 Pro Max (iOS 27.0). Create the practice records on the simulator through ordinary Seshes; do not delete owner data. `CenteredPanel`'s 140 px bottom padding is shared with web.
- **Platform scope:** Acceptance for this ticket runs on the iOS Simulator. Android and physical-device checks are not part of these exit criteria; record them as not run rather than passed.

### [T284.3] Verify tab clearance on notes and goals

- **Area:** Shared UI / screen layout
- **Priority:** Medium (inherited from parent T284)
- **Status:** Not started
- **Planning:** Implementer
- **Description:** Apply or confirm the T284.1 convention on populated all-notes, trick-notes, all-goals and trick-goals screens, including the goal actions footer.
- **Exit criteria:** On small and large simulators, with enough notes and goals to scroll, the final item and primary action of each screen named above is fully above the tab bar and tappable at maximum scroll; web layout is unchanged.
- **Dependencies:** T284.1.
- **Notes:** Small = iPhone 17e, large = iPhone 18 Pro Max (iOS 27.0). Test notes and goals created during verification may stay on the simulator.
- **Platform scope:** Acceptance for this ticket runs on the iOS Simulator. Android and physical-device checks are not part of these exit criteria; record them as not run rather than passed.

### [T289] Complete the interrupted iOS workflow audit

- **Area:** iOS verification
- **Priority:** Medium
- **Status:** Blocked — split into T289.1–T289.5 on 2026-11-02 because the full matrix did not fit one agent run.
- **Description:** Resume the hands-on workflow matrix in DESLOPPIFY.md and cover the flows left as source-only or unverified.
- **Notes:** Umbrella only — complete T289.1–T289.5. A partial run record (commit `a975eb7` on `task/T289-complete-the-interrupted-ios-workflow`) covers part of T283, T285, T286, Open-ended Sesh, Profile account copy and Five tabs on iPhone 17e; children may carry its evidence into DESLOPPIFY.md rather than repeat it. Timed lifecycle stays with T043, keyboard with T044, native accounts with S040. Exclude Android, physical devices, visualization sandboxes and destructive changes to owner data.
- **Platform scope:** Acceptance for this ticket runs on the iOS Simulator. Android and physical-device checks are not part of these exit criteria; record them as not run rather than passed.

### [T289.1] Re-check merged T283, T285 and T286 on iOS

- **Area:** iOS verification
- **Priority:** Medium (inherited from parent T289)
- **Status:** Not started
- **Planning:** Implementer
- **Description:** Give T283 (themed control foregrounds), T285 (trick directory rows) and T286 (Sesh celebration banners) their own matrix rows and check them against their archived exit criteria in TASKS_DONE.md.
- **Exit criteria:** Each of the three rows is checked on both small and large simulators, including T283 on at least one non-default theme preset, T285 with a long custom trick name, and T286 with a personal-best or achieved-goal banner. Each named matrix row in DESLOPPIFY.md gets a dated pass, a reproduced finding written to Needs scoping, or a concrete blocked reason from simulator evidence, with device, runtime and test data recorded; nothing is marked passed from source inspection.
- **Dependencies:** None.
- **Notes:** Small = iPhone 17e, large = iPhone 18 Pro Max (iOS 27.0). Documentation/verification only — do not fix findings here. 
- **Platform scope:** Acceptance for this ticket runs on the iOS Simulator. Android and physical-device checks are not part of these exit criteria; record them as not run rather than passed.

### [T289.2] Audit notes, goals and custom tricks on iOS

- **Area:** iOS verification
- **Priority:** Medium (inherited from parent T289)
- **Status:** Not started
- **Planning:** Implementer
- **Description:** Cover the Notes, Goals, Custom standalone, Custom editing/deletion and Custom sequence matrix rows.
- **Exit criteria:** Notes add/edit/delete, goal count and time creation and completion, custom trick edit and delete confirmation, and custom sequence create, reorder and edit are each exercised on the small simulator, with layout spot-checked on the large one. Each named matrix row in DESLOPPIFY.md gets a dated pass, a reproduced finding written to Needs scoping, or a concrete blocked reason from simulator evidence, with device, runtime and test data recorded; nothing is marked passed from source inspection.
- **Dependencies:** None.
- **Notes:** Small = iPhone 17e, large = iPhone 18 Pro Max (iOS 27.0). Documentation/verification only — do not fix findings here. Keyboard-visible acceptance is T044's.
- **Platform scope:** Acceptance for this ticket runs on the iOS Simulator. Android and physical-device checks are not part of these exit criteria; record them as not run rather than passed.

### [T289.3] Audit multi-trick runs and Kentei assessment on iOS

- **Area:** iOS verification
- **Priority:** Medium (inherited from parent T289)
- **Status:** Not started
- **Planning:** Implementer
- **Description:** Cover the Multi-trick and Kentei assessment matrix rows.
- **Exit criteria:** A full multi-trick run (first-lace advance, manual next, pause, early end, wrap-up) and a Kentei assessment from rank (skip, end, promotion) are each exercised on the small simulator, with layout spot-checked on the large one. Each named matrix row in DESLOPPIFY.md gets a dated pass, a reproduced finding written to Needs scoping, or a concrete blocked reason from simulator evidence, with device, runtime and test data recorded; nothing is marked passed from source inspection.
- **Dependencies:** None.
- **Notes:** Small = iPhone 17e, large = iPhone 18 Pro Max (iOS 27.0). Documentation/verification only — do not fix findings here. Background/foreground behavior is T043's.
- **Platform scope:** Acceptance for this ticket runs on the iOS Simulator. Android and physical-device checks are not part of these exit criteria; record them as not run rather than passed.

### [T289.4] Audit onboarding, Home, Stats and Profile on iOS

- **Area:** iOS verification
- **Priority:** Medium (inherited from parent T289)
- **Status:** Not started
- **Planning:** Implementer
- **Description:** Cover the Onboarding, Home, Stats, Practice list, Timed Sesh setup and Profile/theme matrix rows, including laced and empty states.
- **Exit criteria:** Each named row is exercised on the small simulator and spot-checked on the large one, covering empty and populated Stats, Profile theme presets, colour gestures, reset and the streak setting. Each named matrix row in DESLOPPIFY.md gets a dated pass, a reproduced finding written to Needs scoping, or a concrete blocked reason from simulator evidence, with device, runtime and test data recorded; nothing is marked passed from source inspection.
- **Dependencies:** None.
- **Notes:** Small = iPhone 17e, large = iPhone 18 Pro Max (iOS 27.0). Documentation/verification only — do not fix findings here. 
- **Platform scope:** Acceptance for this ticket runs on the iOS Simulator. Android and physical-device checks are not part of these exit criteria; record them as not run rather than passed.

### [T289.5] Audit relaunch, accessibility and remaining rows on iOS

- **Area:** iOS verification
- **Priority:** Medium (inherited from parent T289)
- **Status:** Not started
- **Planning:** Implementer
- **Description:** Cover the Relaunch/offline/lifecycle, Accessibility/device matrix, Five tabs, Account/callbacks/sync, Feedback and Sandbox routes matrix rows.
- **Exit criteria:** Cold relaunch keeps onboarding, history, custom tricks, notes and goals; VoiceOver labels on tabs and key controls, a large Dynamic Type size and Reduce Motion are each checked on at least one simulator; account and feedback rows reflect the guest-only scope. Each named matrix row in DESLOPPIFY.md gets a dated pass, a reproduced finding written to Needs scoping, or a concrete blocked reason from simulator evidence, with device, runtime and test data recorded; nothing is marked passed from source inspection.
- **Dependencies:** None.
- **Notes:** Small = iPhone 17e, large = iPhone 18 Pro Max (iOS 27.0). Documentation/verification only — do not fix findings here. Run after T289.1–T289.4 so relaunch checks persisted data they created.
- **Platform scope:** Acceptance for this ticket runs on the iOS Simulator. Android and physical-device checks are not part of these exit criteria; record them as not run rather than passed.

### [T043] Harden active Sesh behavior across app backgrounding

- **Area:** Sesh
- **Priority:** High
- **Status:** Not started
- **Description:** Make timed, open-ended, paused, and multi-trick Sesh behavior reliable when the app moves between foreground and background.
- **Notes:** Umbrella only — complete T043.1 and T043.2. Route-navigation and process-death recovery are intentionally out of scope for this task — they are a separate concern from foreground/background reconciliation and are not tracked anywhere in this file.
- **Platform scope:** Acceptance for this ticket runs on the iOS Simulator. Android and physical-device checks are not part of these exit criteria; record them as not run rather than passed.

### [T043.1] Reconcile active Sesh state after foregrounding

- **Area:** Sesh
- **Priority:** High (inherited from parent T043)
- **Status:** Not started
- **Planning:** Required
- **Description:** Add explicit app-lifecycle coordination that reconciles timed, open-ended, paused, and multi-trick Sesh state against timestamps when the app returns to the foreground.
- **Exit criteria:** Automated state-transition tests confirm an overdue timed Sesh completes at its logical deadline, an open-ended Sesh reports correct elapsed active time, a paused Sesh remains paused without accruing active duration, and a multi-trick run retains coherent current-trick state after a background/foreground cycle.
- **Dependencies:** None.
- **Notes:** Keep timestamp acquisition and app-state effects outside the reducer, passing explicit timestamps through actions. Do not add persisted in-progress Sesh state.
- **Platform scope:** Acceptance for this ticket runs on the iOS Simulator. Android and physical-device checks are not part of these exit criteria; record them as not run rather than passed.

### [T043.2] Verify backgrounded Sesh behavior in iOS Simulator

- **Area:** Sesh
- **Priority:** High (inherited from parent T043)
- **Status:** Not started
- **Planning:** Required
- **Description:** Exercise T043.1's lifecycle behavior on iOS Simulator and fix any platform-specific integration defects without changing the Sesh domain model. Depends on T043.1.
- **Exit criteria:** Deliberate iOS Simulator checks cover timed, open-ended, paused, and multi-trick Sesh background/foreground cycles, confirm any overdue timer resolves at its logical deadline, and confirm the wake lock releases after completion or cancellation; any platform-specific regressions found are covered by an automated test where practical.
- **Dependencies:** T043.1.
- **Notes:** Source: iOS audit T043 in DESLOPPIFY.md; background correctness was not observed during the audit. This is native hardening of the lifecycle model established in T043.1, not process-death recovery or route-leave protection.
- **Platform scope:** Acceptance for this ticket runs on the iOS Simulator. Android and physical-device checks are not part of these exit criteria; record them as not run rather than passed.

### [T044] Prevent mobile keyboards from obscuring form actions

- **Area:** Forms / mobile layout
- **Priority:** Medium
- **Status:** Not started
- **Description:** Establish a reusable keyboard-aware form layout and apply it to custom-trick editing, notes, goals, Profile streak editing, and the access gate where reachable in the native build.
- **Notes:** Umbrella only — complete T044.1 and T044.2. Use safe-area and keyboard behavior rather than fixed device-specific offsets; preserve existing web layouts.
- **Platform scope:** Acceptance for this ticket runs on the iOS Simulator. Android and physical-device checks are not part of these exit criteria; record them as not run rather than passed.

### [T044.1] Establish a shared keyboard-aware form layout

- **Area:** Forms / mobile layout
- **Priority:** Medium (inherited from parent T044)
- **Status:** Not started
- **Planning:** Required
- **Description:** Create the smallest reusable layout primitive or convention needed to keep long mobile forms scrollable and their primary actions reachable while the keyboard is open, proving it through the custom-trick form.
- **Exit criteria:** On representative small and large iPhone simulator viewports, the custom-trick form's final input and primary action remain reachable with the keyboard open, scrolling and keyboard dismissal behave predictably, safe-area and tab-bar insets do not overlap content, and the web layout remains unchanged.
- **Dependencies:** Depends on T284.
- **Notes:** Avoid fixed device-specific offsets. Keep the abstraction narrow enough to accommodate screen-specific headers and action layouts rather than forcing every form into an identical visual shell.
- **Platform scope:** Acceptance for this ticket runs on the iOS Simulator. Android and physical-device checks are not part of these exit criteria; record them as not run rather than passed.

### [T044.2] Apply the keyboard-aware layout to remaining forms

- **Area:** Forms / mobile layout
- **Priority:** Medium (inherited from parent T044)
- **Status:** Not started
- **Planning:** Required
- **Description:** Apply T044.1's proven layout pattern to notes, goals, Profile streak editing, and the access gate where reachable in the native build. Depends on T044.1.
- **Exit criteria:** Focused checks on representative small and large iPhone simulator viewports confirm the final input and primary action remain reachable with the keyboard open on notes, goals, Profile streak, and any reachable access-gate form; scrolling, dismissal, safe-area, and tab-bar behavior are consistent and web rendering is unchanged. Explicitly record an unavailable access gate as not applicable rather than claiming it was tested.
- **Dependencies:** T044.1.
- **Notes:** Adapt the shared convention where a screen's structure requires it; do not introduce fixed offsets or unrelated form redesigns.
- **Platform scope:** Acceptance for this ticket runs on the iOS Simulator. Android and physical-device checks are not part of these exit criteria; record them as not run rather than passed.
