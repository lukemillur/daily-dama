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

_T112–T112.6 come from stories S027–S031 in [BACKLOG_STORIES.md](BACKLOG_STORIES.md) (a dedicated pre-app landing page), refined by `product-manager` from a direct user request and scoped in this pass. T111 (drop the access-gate password screen) isn't from a story — it's a decision made during this scoping conversation, in answer to a question the landing-page work raised directly: the app is currently gated behind a password on every route, which defeats the purpose of a publicly shareable landing page, and the user chose to remove the gate outright rather than scope it to just `/app`. T111 is listed first because T112.1 assumes it's already gone, though nothing technically blocks doing them in the other order. T112.1 is the foundation the rest of T112's children build on — it does the actual `/app` route nesting — so it's sequenced first within the umbrella._

_T113–T120 come from stories S001–S008 in [BACKLOG_STORIES.md](BACKLOG_STORIES.md) (the user's 2026-08-19 QA pass on T112.4/T112.6 plus general landing-page feedback), refined by `product-manager` and scoped in this pass. T117 is a two-child umbrella: T117.1 captures new web-layout screenshots (mirroring T112.3's dedicated capture task) and T117.2 wires the platform-based swap, split because the capture step is genuinely separable in risk and effort from the display-logic change. Two open product questions surfaced during scoping and were resolved here rather than left `Blocked`: T114 moves the CTA to the top rather than duplicating it, and T120 clears background/accent only (not text color), matching the existing "Reset background & accent" button's scope. All other entries are independent S-sized tickets — no required ordering between them beyond what each entry's own Notes call out.

### [T117] Show platform-appropriate screenshots on the landing page

- **Area:** Landing
- **Priority:** Medium
- **Status:** Not started
- **Planning:** Required
- **Description:** Umbrella only — complete T117.1 and T117.2. The landing page currently shows the same four mobile-portrait screenshots (`assets/images/landing/*.png`, captured for T112.3) to every visitor regardless of viewport; this pair of tasks captures a matching web-layout set and wires the page to show mobile screenshots to mobile-width visitors and web screenshots to web/desktop-width visitors.
- **Exit criteria:** N/A — umbrella; done when T117.1 and T117.2 are both `Done`.
- **Notes:** Split into two children because the capture step is genuinely separable in risk and effort from the display-logic change, mirroring how T112.3 (screenshot capture) was scoped as its own dedicated `Planning: Required` task separate from the rest of T112.

### [T117.1] Capture web-layout screenshots for the landing page

- **Area:** Landing
- **Priority:** Medium
- **Status:** Not started
- **Planning:** Required
- **Description:** Capture four new web-layout screenshots — the same four moments as the existing mobile set (home screen practice loop, Sesh first-lace celebration, custom trick form, trick goals) — from the web layout of the running app, under realistic populated data (multiple laced tricks, a multi-entry goal list, real session history), matching T112.3's standard. Add them alongside the existing mobile assets in `assets/images/landing/` (e.g. a `-web` suffix or parallel subfolder — implementer's call).
- **Exit criteria:** Four new image files exist under `assets/images/landing/` showing the web layout of the four target screens under populated (non-empty, multi-item) fixture data. `node .claude/scripts/verify.mjs --skip-export` passes (asset addition alone doesn't require re-verifying the full suite, but run the full sequence once T117.2 wires them in).
- **Notes:** Reuse T112.3's capture approach and fixture-seeding notes (`TASKS_DONE.md` T112.3) rather than re-deriving it — in particular, triggering and freezing the Sesh first-lace celebration state will need the same kind of seeded-fixture approach T112.3 used. Do not delete or modify the existing mobile assets.

### [T117.2] Render the visitor's platform-matched screenshot set

- **Area:** Landing
- **Priority:** Medium
- **Status:** Not started
- **Planning:** Implementer
- **Description:** In `src/features/landing/components/landing-page.tsx`, swap between the mobile screenshot set and the web screenshot set (added in T117.1) based on the visitor's viewport width, using this repo's existing responsive patterns (e.g. `styled-components/native`'s `@media` usage in sibling components such as `app-tabs.web.tsx`'s `ResponsiveBrandText`).
- **Exit criteria:** A browser check at a mobile-width viewport shows the mobile screenshot set; the same check at a desktop-width viewport shows the web screenshot set. An automated test confirms both the mobile and web `SCREENSHOTS` arrays are defined and wired to a width-based condition. Full verification sequence passes.
- **Notes:** Depends on T117.1 (needs the web assets to exist first). Keep the existing four captions/T116 titles paired with whichever image set is showing — don't fork captions per platform unless the screens' content actually differs.

### [T118] Add a kendama-themed hero banner to the top of the landing page

- **Area:** Landing
- **Priority:** Medium
- **Status:** Not started
- **Planning:** Required
- **Description:** Add a hero banner containing kendama-specific visual elements (e.g. the toy itself, string/tama motifs, or similar) to the top of `src/features/landing/components/landing-page.tsx`, above the existing `Eyebrow`/`Headline`/`Lede` text stack, visible on both mobile and web viewport widths.
- **Exit criteria:** A browser check at both a mobile and a desktop viewport width shows a hero banner with kendama-specific visual content rendered above the existing headline text, before any scrolling on a typical viewport. An automated test asserts the hero banner element is present in `LandingPage`'s rendered output. Full verification sequence passes.
- **Notes:** Promoted to `Planning: Required` matching the pattern for other first-impression landing-page design work (T112.2, T112.3, T113) — a high-visibility design element, not a mechanical change. If sourcing imagery externally rather than building an illustration/graphic in-house, apply the same licensing caution as T119 (clear, checkable usage license only). Interacts with T114 (CTA moved to top) for page ordering — T114's own exit criteria only requires the CTA to precede the pitch content, so implement this task's final hero/CTA order as a deliberate choice.

### [T119] Add additional kendama imagery to the landing page

- **Area:** Landing
- **Priority:** Low
- **Status:** Not started
- **Planning:** Required
- **Description:** Add at least one kendama-themed image to `src/features/landing/components/landing-page.tsx`, distinct from the app screenshots (T116/T117) and the hero banner (T118), in a placement that reads as intentional rather than decorative filler.
- **Exit criteria:** A browser check confirms at least one additional kendama-themed image renders on the landing page outside the screenshot showcase and hero banner sections. Full verification sequence passes.
- **Notes:** Decision made during scoping to resolve the originating story's open licensing question: source imagery from a permissive, no-attribution-required commercial-use license (e.g. Unsplash's license) rather than an arbitrary web scrape — verify the specific image's license terms before committing it, and record the source URL/license in the commit message. No functional dependency on T118 — both add imagery to the same file, but are safe to build independently. Promoted to `Planning: Required` at the user's explicit request via the scoping-review artifact (was `Implementer`).

### [T120] Add a "Default" preset that resets the app theme

- **Area:** Profile / Theming
- **Priority:** Low
- **Status:** Not started
- **Planning:** Implementer
- **Description:** Add a "Default" swatch to the quick-preset grid in `src/features/profile/components/rainbow-theme-presets.tsx`, styled with the app's default background/accent colors (`AppColors.sage`/`AppColors.yellow`, matching `resolveTheme`'s fallback in `use-resolved-theme.ts`). Selecting it clears the user's custom background/accent colors the same way the existing "Reset background & accent" button in `theme-color-picker.tsx` already does (`setThemeColors(undefined, undefined)`).
- **Exit criteria:** An automated test asserts a "Default" preset renders in the quick-preset grid, that selecting it calls `setThemeColors(undefined, undefined)`, and that it shows as selected whenever `themeBackgroundColor`/`themeAccentColor` are both unset — including on first load, before any preset has ever been chosen. Full verification sequence passes.
- **Notes:** Decision made during scoping to resolve the originating story's open text-color question: this task clears background/accent only, matching the existing "Reset background & accent" button's scope — it deliberately does not touch `themeTextColor`, which already has its own separate reset control. `ThemePresetGrid`'s `onSelectPreset`/`isPresetSelected` callbacks assume every preset has real `backgroundColor`/`accentColor` hex values; the Default preset's selection handler needs special-casing to call `setThemeColors(undefined, undefined)` rather than reusing the generic preset-select path verbatim, since clearing the stored preference is not the same as setting it to today's default hex literally (which would stop tracking the app default if `AppColors.sage`/`AppColors.yellow` ever change).

## Done

Completed entries live in [TASKS_DONE.md](TASKS_DONE.md) — not part of the top-to-bottom read above; see step 5 under _Completing a task_.
