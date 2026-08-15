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

### [T083] Custom app theming — match a user's kendama color scheme

- **Area:** Theming / Profile
- **Priority:** Medium
- **Status:** Not started
- **Description:** Let a user pick a free-form background color and accent color, independently, so the app's post-onboarding look can match their physical kendama. Umbrella only — complete T083.1–T083.3.
- **Notes:** Full free-form picker, not curated presets (explicit decision). Applies to post-onboarding screens only; pre-onboarding yellow state and functional colors (errors/success) stay fixed.

### [T083.1] Add theme color fields to the Profile persistence domain

- **Area:** Profile persistence
- **Priority:** Medium (inherited from parent T083)
- **Status:** Not started
- **Planning:** Required
- **Description:** Extend the user-profile schema with optional `themeBackgroundColor`/`themeAccentColor` fields, following the existing v1-is-provisional pattern for this domain (per AGENTS.md — no migration infra needed).
- **Exit criteria:** Reducer/persistence tests confirm the new fields round-trip through hydration, default to `undefined` (fixed app colors) when unset, and don't affect existing profile fields.
- **Notes:** First child of T083; no dependency on other children.

### [T083.2] Build the free-form color picker with a contrast guardrail

- **Area:** Profile / Theming
- **Priority:** Medium (inherited from parent T083)
- **Status:** Not started
- **Planning:** Required
- **Description:** Add a color-picker UI (background + accent, picked independently) to Profile, backed by T083.1. Validate the chosen pair against a minimum contrast ratio (WCAG AA, 4.5:1) versus the app's fixed text color and block/warn on combinations that would be illegible.
- **Exit criteria:** Component tests confirm picking valid colors saves them via the profile provider, an insufficient-contrast pair is rejected with a visible message, and the picker is reachable from Profile.
- **Notes:** Depends on T083.1.

### [T083.3] Apply theme colors to post-onboarding screens

- **Area:** Theming (cross-cutting)
- **Priority:** Medium (inherited from parent T083)
- **Status:** Not started
- **Planning:** Required
- **Description:** Replace the fixed decorative background (`AppColors.sage`, etc.) and primary accent color across Home/Sesh/Tricks/Stats/Profile with the user's stored theme when set, falling back to current fixed colors when unset. Functional colors (errors, success states, text) are out of scope.
- **Exit criteria:** In-browser check confirms every post-onboarding screen reflects a saved custom background/accent, an unset theme renders identically to today's fixed colors, and pre-onboarding yellow state is unaffected.
- **Notes:** Depends on T083.2. The planner should enumerate every current fixed-color usage this touches before implementation — that enumeration itself is the risk in this ticket.

### [T084] Suggest the next trick for the user's Kentei rank on Home

- **Area:** Home
- **Priority:** Medium
- **Status:** Not started
- **Planning:** Implementer
- **Description:** Add a Home card suggesting the next standard Kentei trick to learn: the first trick in rank order, at the user's current rank, not yet in `manuallyUnlockedTrickIds`; once the rank is fully laced, suggest the next rank's first trick. Standard tricks only — custom tricks are excluded since rank data doesn't apply to them. Separate, additive card alongside the existing neglected-tricks surface (Stats), not a merge.
- **Exit criteria:** A test on `createHomeSummary` (or a new sibling model function) confirms the correct next trick is chosen across: mid-rank with some tricks laced, a fully-laced rank rolling to the next rank's first trick, and the top rank fully laced (no suggestion). A `DailyHome` component test confirms the card renders the suggested trick and a practice entry point.
- **Notes:** Mirrors the existing `neglected-tricks-section.tsx` pattern for structure. Reuses `KENDAMA_KENTEI_TRICKS`'s existing rank/order and `profile.manuallyUnlockedTrickIds`; no persistence or schema change.

## Done

Completed entries live in [TASKS_DONE.md](TASKS_DONE.md) — not part of the top-to-bottom read above; see step 5 under _Completing a task_.
