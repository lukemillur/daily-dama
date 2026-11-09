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
- **T304 Changing Dynamic Type while the app runs leaves a stale layout on iOS** (Medium, from T289.5 audit; reproduced on both simulators, HEAD `1809425`) — on iPhone 18 Pro Max (iOS 27.0), changing the text size with `xcrun simctl ui <udid> content_size` while the app is foregrounded, then moving Sesh to Home, left Home with clipped text at accessibility-large (`CURRENT FRONTIER · RA`, `Clearar`, `Run it bac`) and huge vertical gaps inside the hero at accessibility-medium (`Last sesh` far below the title); on iPhone 17e (iOS 27.0) the same happened to an active Sesh after accessibility-extra-extra-extra-large to large. A cold relaunch at the same size laid out correctly, and a relaunched session did not reproduce it. This is the closest reproduction of the earlier blank-Home sighting; no blank Home appeared. Open question: should layouts re-measure on font-scale change, or is this a Simulator-only artifact? Scoping note (2026-11-05): re-check after T305 lands, because capped display type may remove most of the visible clipping; scope a fix only if it still reproduces on a pinned bundle.
- **T306 Onboarding completion navigates before the profile write succeeds** (Medium, from T302, 2026-11-05) — `completeOnboarding` is a fire-and-forget dispatch, and `finishOnboarding` calls `router.replace('/app/sesh')` without waiting for the persisted profile write. A failed write would therefore report success, which breaks AGENTS.md's durability rules. Open question: give the profile provider a typed write outcome for onboarding completion (a provider API change), or accept the current behavior for a local-only write?
- **T307 iOS App Store screenshots** (Medium, owner request 2026-11-09) — make the in-app screenshot set for the App Store listing, captured on iOS and sized to Apple's required device classes. Open questions: which screens and order tell the story, whether to add caption/framing text or use raw captures, which theme and seed data to show, and whether to automate capture (e.g. a seeded Simulator script) or do it by hand. Likely an owner-in-loop ticket for `TASKS_COLLABORATIVE.md`, because the choices are product and marketing calls.
- **T308 Google Play screenshots** (Medium, owner request 2026-11-09) — the Android equivalent of T307: a separate set captured on Android at Play Store sizes, not reused iOS captures. Blocked: Android has no verified development build yet. Reuse T307's screen list and capture approach once it's decided.

## Backlog

_iOS Simulator audit activation — 2026-10-29, explicitly requested by the owner. Source: [DESLOPPIFY.md](DESLOPPIFY.md), scoped iOS audit and workflow matrix. D022 → T283; D023 → T284; D024 → T285; D025 → T286; D021 → T287; unsupported S040 guest affordances → T288; unfinished audit coverage → T289. Existing T042, T043/T043.1–T043.2 and T044/T044.1–T044.2 move here from TASKS_BACKLOG.md with their IDs preserved and iOS-only acceptance clarified. Full S040 authentication/sync remains Proposed in BACKLOG_STORIES.md; it is not activated by these presentation tickets. These entries document work; this change does not claim, implement, publish or close them._

_Native execution prerequisite: the simulator-enablement changes described in [outputs/ios-personal-build-setup.md](outputs/ios-personal-build-setup.md) are on `development`. The generated `/ios` project and local CocoaPods workaround are not committed, so a fresh checkout may need `yarn ios` (prebuild and pod install) first. Report a tooling failure as a prerequisite rather than a passed check._


_Scoped 2026-11-05 from the T289.4/T289.5 iOS audit findings in Needs scoping (no BACKLOG_STORIES.md story). IDs keep their audit numbers._

_Scoped 2026-11-09 from the owner's iOS Simulator walkthrough (no BACKLOG_STORIES.md story)._


_Scoped 2026-11-09 from T294 (owner chose Direction A, a quiet native list, plus Direction C's laced progress in rank headers). Mockups and reasoning: [outputs/guided-tickets/T294.md](outputs/guided-tickets/T294.md). Web keeps its current Tricks layout unless an entry says otherwise._

### [T312] Make the Tricks tab a native-feeling list on iOS

- **Area:** Tricks
- **Priority:** Medium
- **Status:** Not started
- **Description:** Umbrella for T294 Direction A plus rank-header progress. Children run in order. The umbrella has no exit criteria of its own and is `Done` when every child is `Done`.
- **Dependencies:** None.
- **Notes:** Keep the custom-trick and rank invariants in AGENTS.md unchanged. `TrickDirectory` is also the goal picker (`onActivate`) and the Sesh multi-trick picker; every child must leave those lists working. Prefer one route-level prop that chooses the native presentation over `Platform.OS` checks scattered through `trick-directory.tsx`.

### [T312.3] Move Tricks row actions into swipe actions on iOS

- **Area:** Tricks
- **Priority:** Medium
- **Status:** Not started
- **Planning:** Required
- **Description:** On native, replace each row's inline Notes, Goals and Practice links (and Edit/Delete on custom tricks) with swipe actions: swipe right reveals Practice; swipe left reveals Notes and Goals, plus Edit and Delete for custom tricks. Define the row's actions once as a typed list (label, accessibility label, handler, destructive flag) that drives the swipe actions and the VoiceOver custom actions (`accessibilityActions`), so T312.5's menu can reuse it. Web keeps the inline actions. Use `react-native-gesture-handler`'s `ReanimatedSwipeable`, already installed.
- **Exit criteria:** On iPhone 17e (iOS 27.0) with the bundle pinned, on the Tricks tab: no row shows inline Notes/Goals/Practice text; swiping right on a standard trick and tapping Practice starts a practice Sesh for that trick; swiping left and tapping Notes or Goals opens that trick's screen; a custom trick's left swipe also offers Edit and Delete, and Delete opens the existing confirmation. Opening one row's swipe closes any other open row. Vertical scrolling still works and does not open swipes. With VoiceOver on, the actions rotor on a row lists the same actions and each one works. Tapping a row still toggles focus. Tests cover the action list for standard and custom tricks. Web at 390 px and wide widths still shows the inline actions. The goal-picker list still selects a trick on tap. Full `yarn tsc --noEmit` passes.
- **Dependencies:** T310 (same file; land the row tightening first).
- **Notes:** Notes and Goals counts move to the row's meta line in T312.4 so they stay visible once the links are gone. Destructive actions use the existing red token and must not rely on colour alone (label text stays `Delete`).
- **Platform scope:** Acceptance runs on the iOS Simulator, plus the web regression check. Record Android as not run.

### [T312.4] Restyle Tricks rows as one-line native list rows on iOS

- **Area:** Tricks / layout
- **Priority:** Medium
- **Status:** Not started
- **Planning:** Implementer
- **Description:** With inline actions gone on native, make each row one line plus an optional meta line: position number (or laced ✓), bold name, a quiet meta line (`3 laces · 2 notes · 1 goal`, omitting zero parts, plus `Custom trick` / `Custom sequence`), and a trailing round focus indicator in place of the square checkbox. Replace the full-row sage fill with the indicator alone. Group rows as inset sections under short uppercase rank headers instead of full-width orange bands. Web keeps its current rows.
- **Exit criteria:** On iPhone 17e (iOS 27.0) with the bundle pinned, on the Tricks tab: a standard trick row with no meta line is 44–52 pt tall, and at least 9 rows fit on screen at the default text size; the focus indicator is round, shows a checkmark when focused, and keeps its `checkbox` role and checked state for VoiceOver; the meta line shows only non-zero counts; rank headers are short uppercase labels that still pin while scrolling; laced rows still show ✓ and the number column stays aligned with and without it. At the largest accessibility text size the name and meta line wrap rather than truncate. Web at 390 px and wide widths is unchanged. `trick-directory.test.tsx` passes, updated for the meta line and indicator. Full `yarn tsc --noEmit` passes.
- **Dependencies:** T312.3.
- **Notes:** Selection meaning must stay available through the indicator and its label, not colour alone (AGENTS.md). Keep the accent colour in the rank label so the brand stays visible.
- **Platform scope:** Acceptance runs on the iOS Simulator, plus the web regression check. Record Android as not run.

### [T312.5] Add a long-press context menu to Tricks rows on iOS

- **Area:** Tricks
- **Priority:** Low
- **Status:** Not started
- **Planning:** Required
- **Description:** Long-pressing a row on iOS opens a native context menu with Practice, Add to focus / Remove from focus, Notes, Goals, and Trick history (the existing Stats trick screen), plus Edit and a destructive Delete for custom tricks, built from T312.3's typed action list. Expo Router's `Link.Menu` needs a navigating link as its trigger and rows toggle focus on tap, so this needs a non-link context menu; the expected choice is `@expo/ui`'s iOS `ContextMenu`, which adds a dependency — record the choice and why.
- **Exit criteria:** On iPhone 17e (iOS 27.0) with the bundle pinned, long-pressing a standard trick opens a native menu with the listed items, and each item performs its action (Practice starts a practice Sesh; focus toggles and the row indicator updates; Notes, Goals and Trick history open the right screen). A custom trick's menu also has Edit and a red Delete that opens the existing confirmation. A short tap still toggles focus and swipes still work. Tests cover the menu's item list for standard and custom tricks. The complete app sequence (`node .claude/scripts/verify.mjs`) passes because a dependency changes. Web is unchanged.
- **Dependencies:** T312.4.
- **Notes:** Low priority: swipe and VoiceOver actions already cover every action; the menu adds labelled discoverability. Drop this ticket rather than build a custom JS menu if no Expo-compatible native menu works in the installed SDK.
- **Platform scope:** Acceptance runs on the iOS Simulator, plus the web regression check. Record Android as not run.

_Scoped 2026-11-09 from T295 (owner approved decisions D1–D10 the same day). Source story: S040. Plan, inspected seams and decision reasoning: [outputs/guided-tickets/T295.md](outputs/guided-tickets/T295.md). Email and password only; no Apple or Google sign-in. Order: T313.1 first; then T313.2, T313.3 and T313.5 in any order; then T313.4; T313.6 last._

### [T313] Email/password accounts on iOS and Android

- **Area:** Auth / native
- **Priority:** High
- **Status:** Not started
- **Description:** Umbrella for replacing the native "accounts are not available" state with working email/password accounts, backup and sync. Close it when T313.1–T313.6 are all `Done`.
- **Notes:** No feature flag (D9): the native app ships only as a personal development build, so each child can enable its part directly.

### [T313.4] Let existing accounts sign in from the Start screen without redoing onboarding

- **Area:** Auth / native-start / onboarding
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Add a Sign in action next to Get started on `NativeStartScreen` (T292 left room for it). Two gaps must close with it. `useNativeOnboardingStatus` reads only the guest profile, so a signed-in relaunch shows the Start screen; make the root route use the active identity. Home guards onboarding only while a guest import is pending, so a signed-in identity with no import can show onboarding before its first profile pull; hold the onboarding decision until that pull settles, and show a retry state if it fails (fail closed).
- **Exit criteria:** Tests prove: (a) the Start screen shows a Sign in action beside Get started, and it opens `/auth/sign-in`; (b) a signed-in identity whose profile has completed onboarding goes to Home on launch and the Start screen never renders; (c) after sign-in, onboarding does not render while the first profile pull is in flight; (d) a failed first pull shows a retry state, not onboarding, and retrying re-runs the pull; (e) a new account with no completed cloud profile reaches onboarding after the pull; (f) a guest with local data who signs in still enters the existing guest-import flow. On iPhone 17e (iOS 27.0) with local Supabase, an account that completed onboarding on web signs in from the Start screen and lands on Home showing its rank, with no onboarding frame seen. Full `yarn tsc --noEmit` and the native-start, onboarding and guest-import suites pass.
- **Dependencies:** T313.1, T313.3.
- **Notes:** D6. Owner decision 2026-11-04: an existing account signing in on mobile must not redo onboarding. Keep `resolveNativeStartDecision` pure; pass identity and pull state in.
- **Platform scope:** Acceptance runs on the iOS Simulator. Record Android checks as not run.

### [T313.6] Verify backup, sync and account lifecycle on iOS and Android

- **Area:** Sync / auth / native
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Native sync treats the device as always online, because online state comes from `window` events. Add native online state with `expo-network`'s network-state listener so `SyncStatus` can show offline and reconnection starts a sync. Then run S040's cross-platform acceptance pass on both platforms, including logout, account deletion and email change, which appear on native once accounts are enabled.
- **Exit criteria:** Tests prove native network-state changes update `SyncStatus.online` and that going back online starts a sync; web keeps its `window` listeners. On the iOS Simulator and the Android Emulator, the execution notes record, per platform: a mutation made offline syncs after reconnection and appears on web for the same account; a second account signed in on the same device sees none of the first account's data; an active Sesh survives sign-in and a token refresh; logout with pending changes is blocked by the logout guard; account deletion purges the local namespace and returns to guest; an email change completes through the native callback. Any check not performed is recorded as not run, never passed.
- **Dependencies:** T313.2, T313.3, T313.4, T313.5, and an Android development build.
- **Notes:** D5, D8, D10. Apple requires in-app account deletion for apps that allow account creation (App Review Guideline 5.1.1(v)); do not hide deletion on native. If the Android build is still missing, this ticket is Blocked on it; do not substitute iOS evidence.
- **Platform scope:** iOS Simulator and Android Emulator are both required.

_Scoped 2026-11-09 from the T313.3 follow-up simulator check (no BACKLOG_STORIES.md story)._

### [T314] Replace "same browser" email-link guidance with device wording on native

- **Area:** Auth / native / copy
- **Priority:** Medium
- **Status:** Not started
- **Planning:** Implementer
- **Description:** Three auth screens tell native users to open the email link "on this same browser": the guidance text on check-email and forgot-password (`SAME_BROWSER_GUIDANCE` in `check-email-screen.tsx` and `forgot-password-screen.tsx`) and the `missingVerifier` error on the callback screen (`auth-callback-screen.tsx`). On iOS and Android the link opens the app through `dailydama://auth/callback`, so "browser" is wrong; the real constraint is the same device. Show device wording on native and keep the current web wording unchanged.
- **Exit criteria:** Component tests render check-email, forgot-password and the callback screen's `missingVerifier` state with `Platform.OS = 'ios'` and assert the guidance names this device and does not contain the word "browser"; the same tests with `Platform.OS = 'web'` assert the current web text is unchanged. On iPhone 17e (iOS 27.0), the forgot-password and check-email screens show the native wording. `yarn jest src/features/auth` and full `yarn tsc --noEmit` pass.
- **Notes:** Choose the wording per platform in one place (for example, a small helper in `src/features/auth/model/`), not with an inline `Platform.OS` check repeated in each screen. `e2e/auth/04-real-email-flows.spec.ts` asserts the web text; it must keep passing without changes. Seen during the T313.3 check, not in scope here: the floating gear button at the top right of every native screen is the Expo dev-client menu button, which appears only in development builds; it is not app UI and needs no ticket.
- **Platform scope:** Acceptance runs on the iOS Simulator. Record Android checks as not run.
