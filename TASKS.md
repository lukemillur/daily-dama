# Tasks

Working backlog for Daily Dama **core-functionality** work. This file is the checkpoint mechanism: a session — including a fresh one after context compaction — reads it top to bottom to know what's done, what's next, and how to verify it, instead of relying on conversation memory or a todo list that only exists in-context.

**Scope note:** Trick visualization (`src/features/trick-viz/`) is intentionally excluded from this file right now. Its own backlog lives in [TRICK_VIZ_HANDOFF.md](TRICK_VIZ_HANDOFF.md) §15. Do not pull items from there into this file unless explicitly told to resume that thread.

**Automation note:** [TASKS_BACKLOG.md](TASKS_BACKLOG.md) holds scoped, ready-to-work tasks that are deliberately kept out of this file so the `newTicket` workflow (`.claude/skills/newTicket/SKILL.md`) never claims, plans, or implements them automatically. Moving an entry between the two files is a deliberate human decision, not something to do as a side effect of other work.

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

_The following batch (T070–T079) comes from the QA checklist completed against PR 83, worked top to bottom. New entries are intentionally placed before the older queue so the next actionable QA finding is selected first. Existing task history is not rewritten._

_The following batch (T080–T082) comes from the QA checklist completed against PR 99, worked top to bottom. New entries are intentionally placed before the older queue so the next actionable QA finding is selected first. Existing task history is not rewritten._

_The following batch (T083–T084) comes from a product-manager audit scoping two new product surfaces: custom app theming and rank-progression suggestions. Promoted from `Needs scoping` after resolving their open product/technical questions with the user._

_The following batch (T085–T088) comes from user stories S001–S004 in [BACKLOG_STORIES.md](BACKLOG_STORIES.md), scoped via the `scope-tickets` skill after `product-manager` refined a round of theming UX feedback into stories. New entries are intentionally placed before the older queue (there is none currently) so they're picked up first._

_T089 comes from story S014 in [BACKLOG_STORIES.md](BACKLOG_STORIES.md), scoped via `scope-tickets` after a QA pass on T085–T088 surfaced a pattern of theming being bolted onto surfaces one hardcoded literal at a time. It is deliberately scoped as schema-only groundwork, sequenced ahead of the not-yet-scoped S009/S012/S013 so those consume this token set instead of inventing their own._


_T090–T097 come from stories S005–S009 and S011–S013 in [BACKLOG_STORIES.md](BACKLOG_STORIES.md), scoped in the same `scope-tickets` pass. S010 (preset text colors) was not scoped this round — see the note on its `BACKLOG_STORIES.md` entry; investigation found its premise doesn't hold up and it needs re-refinement by `product-manager` before it's scopable. New entries are placed after T089, since T096/T097 depend on it landing first._

_T098 comes from story S010 in [BACKLOG_STORIES.md](BACKLOG_STORIES.md), rewritten by `product-manager` after the original preset-scoped framing turned out to rest on a false premise, then scoped in this pass._

_The following batch (T099–T105) comes from stories S015–S021 in [BACKLOG_STORIES.md](BACKLOG_STORIES.md), a QA pass over the T089–T098 theming batch refined into stories by `product-manager` and scoped in this pass. New entries are placed before the older queue (there is none currently) so they're picked up first._

### [T099] Match the Trick Goals picker's container width to the Tricks tab

- **Area:** Tricks
- **Priority:** Medium
- **Status:** Not started
- **Planning:** Implementer
- **Description:** The Tricks tab (`src/app/tricks/index.tsx:66-114`) wraps `TrickDirectory` in a `DirectoryContent` styled wrapper (`width:100%; max-width:760px;`, line 515) inside a centered `Screen`. The Trick Goals route (`src/app/tricks/goals.tsx:19`) and `GoalTrickPicker` (`src/features/goals/components/all-trick-goals-screen.tsx:120-146`) render `TrickDirectory` with no equivalent width-constraining wrapper, so the picker stretches to the full screen width instead of matching the Tricks tab's column. Add an equivalent max-width wrapper around the Goals route's `TrickDirectory` usage without touching `src/app/tricks/index.tsx` or `DirectoryContent` itself.
- **Exit criteria:** In-browser check at 375px, 760px+, and 1200px+ web viewports: the Trick Goals picker's content column renders at the same width (760px cap, centered) as the Tricks tab's `DirectoryContent`. `git diff` confirms `src/app/tricks/index.tsx` is unchanged.
- **Notes:** Story S015. Consider factoring the 760px-cap wrapper into a small shared component reused by both routes, rather than duplicating the literal, if that doesn't require touching the Tricks tab's existing JSX structure.

### [T100] Fix the web splash overlay not showing a saved custom background color

- **Area:** App shell / Theming
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** QA re-check on T094 found the splash overlay still doesn't show a saved custom background color on reload. `read-cached-theme-background.ts` and the profile persistence key/document shape (`user-profile-persistence.ts`) are unchanged since T094 shipped and look intact. The likely culprit is `animated-icon.web.tsx:19-24`'s reliance on a `useSyncExternalStore`-based hydration-mismatch trick to force a second render after mount — this depends on the web build actually performing a real `hydrateRoot` over pre-rendered HTML, which is unverified against the app's current build/serving setup (e.g. `yarn expo export --platform web` output as actually deployed). Confirm the real client bootstrap mechanism and replace the hydration-mismatch reliance with something that reliably re-renders with the cached color if needed.
- **Exit criteria:** In-browser verification (following T094's original method): save a custom background color, reload, and confirm the overlay's computed `background-color` matches the saved color before the main UI mounts. This must be reproduced as currently broken, then confirmed fixed — not just re-run against existing passing tests. New or updated test coverage locks in whatever mechanism replaces or repairs the hydration path.
- **Notes:** Story S016. Marked `Required` because the root cause sits in web bootstrap/hydration behavior that the initial investigation could not fully confirm from source alone — treat this as read-then-decide, not a known one-line fix.

### [T101] Seed the color picker's puck from the same color as the swatch/hex text

- **Area:** Profile / Theming
- **Priority:** High
- **Status:** Not started
- **Planning:** Implementer
- **Description:** `ColorSpectrumPicker` seeds its puck from `persistedHex` (`theme-color-picker.tsx:117`), which is `undefined` when no custom color is saved, falling back to a hardcoded `#4477aa` (`color-spectrum-picker.tsx:44-48`) instead of the resolved theme color T095 already threads into `ColorField` as `fallbackColor`. Pass the same `persistedValue ?? fallbackColor` value `ColorField` uses for its swatch/hex text into `ColorSpectrumPicker`'s puck-seed color.
- **Exit criteria:** Component test mounts `ThemeColorPicker` with no saved theme preference and asserts the puck's initial derived HSV/position corresponds to the resolved default theme color (matching the swatch/hex), not the hardcoded `#4477aa` seed. Existing drag-then-save and manual-hex-then-save tests in `theme-color-picker.test.tsx` continue to pass unmodified.
- **Notes:** Story S017. Touches the same two files as T102 (`theme-color-picker.tsx`, `color-spectrum-picker.tsx`) but a distinct code path (initial puck seed vs. swatch/hex resync) — kept as separate tickets per one-exit-criterion scoping, but reasonable to pick up back-to-back.

### [T102] Resync the color picker's swatch/hex text when a preset changes the saved color

- **Area:** Profile / Theming
- **Priority:** Medium
- **Status:** Not started
- **Planning:** Implementer
- **Description:** `ColorField`'s `hexText` (`theme-color-picker.tsx:93`) is seeded via `useState` on mount only and never resyncs when `persistedValue`/`fallbackColor` change later — e.g. after selecting a preset via `setThemeColors`, which updates profile state but leaves the picker's swatch/hex text showing the stale prior color. Add a resync effect, mirroring the pattern `ColorSpectrumPicker` already uses for its own resync (`color-spectrum-picker.tsx:58-67`), so `hexText` updates when `persistedValue` changes to a new defined value, without clobbering an in-progress manual edit.
- **Exit criteria:** Component test: mount `ThemeColorPicker`, simulate applying a preset (parent re-renders with new `persistedValue` props matching what `setThemeColors` produces), and assert each `ColorField`'s swatch/hex text update to the preset's values without remounting. Existing hex-input-then-save and drag-then-save tests continue to pass unmodified.
- **Notes:** Story S018. See T101's note on file overlap.

### [T103] Left-align the Sesh home screen's intro text block

- **Area:** Sesh
- **Priority:** Medium
- **Status:** Not started
- **Planning:** Implementer
- **Description:** On the Sesh home (idle) screen, `Eyebrow` ("Start a sesh") renders left-aligned by default while the local `DisplayTitle` ("What are we working on?") and `BodyCopy` ("Choose how long you want...") overrides explicitly set `text-align: center` (`sesh.tsx:1149-1151`), producing a visually inconsistent intro block. Remove the centered `text-align` overrides so all three render left-aligned and share a common left edge.
- **Exit criteria:** In-browser check on the Sesh home screen: the three intro lines share the same left edge; computed-style check confirms none of them resolve `text-align: center`. Existing `sesh.test.tsx` tests continue to pass unmodified.
- **Notes:** Story S019. Purely a styled-components change inside `sesh.tsx`; no state or behavior change.

### [T104] Clear a custom text color when a preset theme is selected

- **Area:** Profile / Theming
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** The `themeColorsUpdated` reducer case (`user-profile.ts:142-147`), fired by preset selection (`rainbow-theme-presets.tsx:30`), fully replaces `themeBackgroundColor`/`themeAccentColor` but never touches `themeTextColor` — so a previously saved custom text color survives a later preset selection instead of being replaced by the preset's look. Have preset selection also clear the custom text color, either by extending `setThemeColors`/`themeColorsUpdated` to reset `themeTextColor` to `undefined`, or by having the preset-tap handler additionally call the existing `setThemeTextColor(undefined)` action.
- **Exit criteria:** Reducer test: dispatch a custom `themeTextColor` being set, then apply `themeColorsUpdated` (a preset), and assert `themeTextColor` is `undefined` afterward. Component test: select a preset in `RainbowThemePresets` after a custom text color was saved, and assert the persisted profile no longer carries a custom text color. Existing tests for a direct, manual `ThemeColorPicker` text-color save (an unaffected path) continue to pass unmodified.
- **Notes:** Story S020. Marked `Required` because it changes reducer behavior for a persisted field, per this project's escalation rule for state-machine/reducer changes.

### [T105] Move "Practice several tricks" below the format/time controls

- **Area:** Sesh
- **Priority:** Medium
- **Status:** Not started
- **Planning:** Implementer
- **Description:** In the Sesh home screen's non-direct-practice branch, the `MultiTrickAction` ("Practice several tricks") block currently renders immediately after the intro text and before the practice-format/duration controls (`sesh.tsx:362-369`, ahead of `PlanChoices`/`DurationField`/`ChallengeField` at `sesh.tsx:372-450`). Move it to render after those controls and before the focused-tricks list (`TrickChoices`, `sesh.tsx:451+`), so the format/time controls read as the screen's primary action and "Practice several tricks" reads as a secondary option.
- **Exit criteria:** In-browser/component check: on the Sesh home screen, render order is intro text → format/duration controls → "Practice several tricks" → focused-tricks list. Existing `sesh.test.tsx` interaction tests for both single-trick and multi-trick flows continue to pass unmodified (tapping "Practice several tricks" still opens the same picker).
- **Notes:** Story S021. Pure JSX-ordering change; no state or logic change.

## Done

Completed entries live in [TASKS_DONE.md](TASKS_DONE.md) — not part of the top-to-bottom read above; see step 5 under _Completing a task_.
