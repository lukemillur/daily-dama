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

### [T309] Give the native tab bar a theme-derived background distinct from the screen

- **Area:** Navigation / theme
- **Priority:** Medium
- **Status:** Not started
- **Planning:** Implementer
- **Description:** `deriveTabBarColors` in `src/components/app-tabs.tsx` sets the tab bar background to `theme.background`, so the bar blends into most screens. Give the bar its own background derived from the resolved theme, so it stays distinct for light, dark and custom themes. Either blend the theme's text colour into its background by a fixed amount, or use the theme accent. Pick one and record why. Active and inactive icon and label colours must stay readable on the new background.
- **Exit criteria:** `app-tabs.test.tsx` asserts that the bar background differs from `theme.background` for the default light theme, the dark theme and at least one custom theme, and that active and inactive tint colours reach at least 4.5:1 and 3:1 contrast against it. On iPhone 17e (iOS 27.0) with the bundle pinned, Home, Sesh, Tricks, Stats and Profile show a bar visibly distinct from the screen above it, in the light and dark themes. Full `yarn tsc --noEmit` passes.
- **Dependencies:** None.
- **Notes:** Owner request 2026-11-09. Keep the top border unless the new background makes it redundant. Keep `sceneStyle.backgroundColor` tied to the screen background, not the new bar colour. Owner decided tab-button hit slop needs no change.
- **Platform scope:** Acceptance runs on the iOS Simulator. Android and physical-device checks are not part of these exit criteria; record them as not run rather than passed.

### [T310] Tighten the Tricks list rows and section headers

- **Area:** Tricks / layout
- **Priority:** Medium
- **Status:** Not started
- **Planning:** Implementer
- **Description:** The Tricks list in `src/features/tricks/components/trick-directory.tsx` looks loose on iOS (compact rows). Fix five things: (1) the rank position number (`01`) and (2) the selection checkbox are pinned to the name line, not vertically centred on the whole row; centre both on the row. (3) The trick name renders at regular weight on iOS because `font-weight: 750` is not a weight iOS's system font supports; make it clearly bold (e.g. `700` or `800`), and check other non-standard weights in this file the same way. (4) Rows are much taller than they need to be; cut the vertical padding and gaps so each row is noticeably shorter, while the Notes/Goals/Practice actions keep a 44 pt touch target. (5) `ItemSeparator` starts 66 px in (`margin-left: 66px`); make it span the full row width. Also remove the blank band above and below each rank section header (for example `Rank 1 · Basic · 3rd class`), which comes from `SectionSeparatorComponent`, so headers sit directly against the rows.
- **Exit criteria:** On iPhone 17e (iOS 27.0) with the bundle pinned, on the Tricks tab: the position number and checkbox are vertically centred on each row (centre within 2 pt of the row centre, measured from a screenshot); the trick name renders visibly bold; a standard trick row with one action line is at least 25% shorter than at HEAD `ff6d971`; separators run from the row's left edge to its right edge; and no blank band shows between a section's last row and the next section header, or between a header and its first row. Notes, Goals and Practice still open their screens, and each action keeps a hit area of at least 44 pt. The sticky section header still pins correctly while scrolling. The same checks pass in a 390 px-wide web browser, and the wide web layout has no regressions. `trick-directory.test.tsx` passes, updated if needed. Full `yarn tsc --noEmit` passes.
- **Dependencies:** None.
- **Notes:** Owner request 2026-11-09. T294 (in `TASKS_COLLABORATIVE.md`) may later redesign this screen; keep this change to spacing, alignment, weight and separators so it is cheap either way. Laced rows have a 4 px left border; keep the number column aligned with and without it. `trick-directory.tsx` also renders the goal-picker list (`onActivate`), so check that list too.
- **Platform scope:** Acceptance runs on the iOS Simulator and web. Android and physical-device checks are not part of these exit criteria; record them as not run rather than passed.

### [T311] Turn off autocorrection in every text field

- **Area:** Forms / text input
- **Priority:** Medium
- **Status:** Not started
- **Planning:** Implementer
- **Description:** Text fields autocorrect on iOS. Owner decision: no field in the app should autocorrect. Default `autoCorrect={false}` and `spellCheck={false}` in the shared `TextField` (`src/components/ui/text-field.tsx`) so callers can't forget it, and set the same on the raw `TextInput`s that don't use `TextField` (currently `src/app/app/tricks/index.tsx`, `src/features/sesh/components/sesh.tsx` and `src/features/profile/components/color-spectrum-picker.tsx`; the auth screens already set it). Keep autocapitalisation behaviour as it is.
- **Exit criteria:** A `TextField` test asserts the `autoCorrect={false}` and `spellCheck={false}` defaults. A repository test or lint check fails if any `TextInput` or `TextField` usage under `src/` enables autocorrect, so new fields can't regress. On iPhone 17e (iOS 27.0) with the bundle pinned, typing `teh` and a space into the trick search, the custom-trick name field and a note field leaves `teh` unchanged. Full `yarn tsc --noEmit` passes.
- **Dependencies:** None.
- **Notes:** Owner request 2026-11-09. On web, `autoCorrect` maps to the `autocorrect` attribute (Safari only) and `spellCheck` to `spellcheck`. Keep the existing numeric-field `autoComplete` default from T251 in `TextField`.
- **Platform scope:** Acceptance runs on the iOS Simulator. Android and physical-device checks are not part of these exit criteria; record them as not run rather than passed.

_Scoped 2026-11-09 from T294 (owner chose Direction A, a quiet native list, plus Direction C's laced progress in rank headers). Mockups and reasoning: [outputs/guided-tickets/T294.md](outputs/guided-tickets/T294.md). Web keeps its current Tricks layout unless an entry says otherwise._

### [T312] Make the Tricks tab a native-feeling list on iOS

- **Area:** Tricks
- **Priority:** Medium
- **Status:** Not started
- **Description:** Umbrella for T294 Direction A plus rank-header progress. Children run in order. The umbrella has no exit criteria of its own and is `Done` when every child is `Done`.
- **Dependencies:** None.
- **Notes:** Keep the custom-trick and rank invariants in AGENTS.md unchanged. `TrickDirectory` is also the goal picker (`onActivate`) and the Sesh multi-trick picker; every child must leave those lists working. Prefer one route-level prop that chooses the native presentation over `Platform.OS` checks scattered through `trick-directory.tsx`.

### [T312.1] Give the Tricks index a native large-title header with search and menus on iOS

- **Area:** Tricks / navigation
- **Priority:** Medium
- **Status:** Not started
- **Planning:** Required
- **Description:** The Tricks index sets `headerShown: false`, so its eyebrow, title, introduction and four buttons scroll as list content under the status bar. On native, show the stack header instead: large title `Tricks`, a native header search bar that filters the list through `TrickDirectory`'s existing `search` filtering (without also rendering the in-list `TextField`), a `＋` button that opens Define new trick, and a `⋯` menu with Trick goals, Trick notes and Laced tricks. Remove the in-list header block and buttons on native only. Use Expo Router's own header APIs in the installed version (`Stack.SearchBar` / `Stack.Toolbar` menus, or `headerSearchBarOptions`); confirm them against the versioned docs.
- **Exit criteria:** On iPhone 17e (iOS 27.0) with the bundle pinned, the Tricks tab shows a large `Tricks` title that collapses on scroll, and no list row draws under the status bar. Typing `cup` in the header search shows only tricks whose names contain `cup`, and clearing it restores the Focused and rank sections. `＋` opens New trick; the `⋯` menu items open Goals, Notes and Laced tricks. Tapping the Tricks tab from a pushed screen still returns to the index. VoiceOver reads the `＋` and `⋯` buttons with labels. At 390 px and wide widths on web, the Tricks screen is unchanged from HEAD at claim time (same header block and four buttons). Route tests cover the native header options and the web fallback. Full `yarn tsc --noEmit` passes.
- **Dependencies:** None.
- **Notes:** Header colours come from `deriveNestedHeaderColors` like the other nested screens. The selected-count introduction (`N tricks ready…`) is dropped on native; the Focused section header already shows the count.
- **Platform scope:** Acceptance runs on the iOS Simulator and web. Android has no verified development build; record Android as not run.

### [T312.2] Show laced progress in each rank section header

- **Area:** Tricks
- **Priority:** Medium
- **Status:** Not started
- **Planning:** Implementer
- **Description:** Add a laced count to each rank section header and the Custom section header, for example `4 / 5`: tricks in that section that are laced (the effective laced set, including manually unlocked tricks) over the section's trick count. Compute it in `src/features/tricks/model/trick-directory.ts`, not in the component. The Focused section keeps its current `N in rotation` label and gets no progress.
- **Exit criteria:** Model tests cover a section with no laced tricks, a partly laced section, a fully laced section, a ranked custom trick counted in its rank's section, and a manually unlocked trick counted as laced. `trick-directory.test.tsx` asserts the header text and an accessibility label such as `4 of 5 laced`. On iPhone 17e (iOS 27.0) with the bundle pinned, and at 390 px on web, each rank header shows the count without truncating the rank or class label. Full `yarn tsc --noEmit` passes.
- **Dependencies:** None.
- **Notes:** Shown on web too: it is a shared header label, and a web-only exception would add a platform branch for no product reason. The goal picker and Sesh picker may hide it if it adds noise there; record the choice.
- **Platform scope:** Acceptance runs on the iOS Simulator and web. Record Android as not run.

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
