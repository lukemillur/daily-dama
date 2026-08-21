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

_T121–T131 come from stories S001–S011 in [BACKLOG_STORIES.md](BACKLOG_STORIES.md) (the user's 2026-08-20 QA pass on T115–T120 plus general landing-page feedback), refined by `product-manager` and scoped in this pass. T123 is a two-child umbrella: T123.1 builds and validates the looping, text-bearing Big Cup scene in the trick-viz sandbox in isolation, and T123.2 wires it into the production landing page with a WebGL fallback — split because validating a wholly new capability (3D text, autoplay looping) in isolation is a different risk profile from integrating it into a page every visitor loads, mirroring how T117 split screenshot capture from display-logic wiring. Three product questions surfaced during S003's refinement were resolved before scoping rather than left `Blocked`: the hero is decorative-only (no drag/orbit/tap interaction), needs a static-image fallback for visitors whose browser can't run WebGL, and does not need to respect `prefers-reduced-motion` this iteration. All other entries are independent S-sized tickets — no required ordering between them beyond what each entry's own Notes call out (T124 and T128 both touch landing-page desktop sizing but are independent of each other; T131 references T130's corrected animation duration but has no hard git-level dependency on it)._

_T132–T152 come from stories S001–S022 in [BACKLOG_STORIES.md](BACKLOG_STORIES.md) (the user's 2026-08-21 QA pass on T122–T131 plus general feedback across landing, goals, onboarding, theming, tricks, and Sesh), refined by `product-manager` and scoped in this pass. S006 (footer background responding to the rainbow theme preset) was not scoped: tracing `AppFooterBar` → `useResolvedTheme()` → `resolveTheme()` shows the footer's background already derives from the user's saved `themeBackgroundColor`/`themeAccentColor`, which preset selection already sets — the story's premise appears to already hold in the current code, so it's flagged back rather than scoped as a duplicate fix; see its Notes in `BACKLOG_STORIES.md` for the traced call chain. No umbrella tasks were needed — every story reduced to one independent S-sized ticket. T145 (S015, the landing-page load flicker) and T150 (S020, auto-focusing a trick on goal creation) were scoped `Planning: Required` from the start — both cross the persistence/provider boundaries AGENTS.md calls out. T146 (S016, onboarding theme preview) was also `Required` from the start, despite being a small, local change, because it modifies the onboarding flow's own state machine. Three more — T140 (S010, scroll-triggered showcase animation), T144 (S014, trick name/goals heading), and T149 (S019, hiding focused tricks while searching) — were raised from `Implementer` to `Required` during the scoping review pass (see each entry's Notes for why); their exit criteria are unchanged. T133 (S002) and T142 (S012) both touch hero sizing and are worth verifying together — a larger hero (T142) can reintroduce the mobile overlap T133 is fixing. T134 (S003) depends on T138's (S008) final content-column width to size against, so implementing T138 first avoids sizing against a stale value. T152 (S022, the sesh-timer audio cue) uses `expo-audio`, this SDK's supported audio API — `expo-av` is deprecated at the installed Expo SDK version (~57) and isn't present in the project's dependencies._

### [T145] Eliminate the visible flash of unstyled content when the landing page loads

- **Area:** Web launch surface (cross-cutting)
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** The landing route (`src/app/index.tsx`) renders under the same provider tree as the rest of the app (`src/app/_layout.tsx`: custom-tricks, practice-history, goals, theme, and profile providers all mount above it), and its CTA/redirect logic reads `hasCompletedOnboarding` from `useUserProfile()`, which returns placeholder state until `AsyncStorage` hydration finishes. QA reports a jarring sequence of sub-second paints as a result. Scope rehydration-driven UI to the `/app` routes only, and make the landing page's first paint depend on as little async state as possible — ideally just the one flag it needs to pick a CTA variant.
- **Exit criteria:** Loading `/` shows its final visual state on first paint, with no visible sequence of intermediate/partial states before it settles — confirmed via a frame-by-frame browser recording at both mobile and desktop widths — and the landing route's render path no longer blocks its first paint on any persistence provider's async hydration.
- **Notes:** From story S015. `UserProfileProvider` already exposes a `hasHydrated` flag (`src/features/profile/state/user-profile-provider.tsx:57`) that isn't currently used to gate anything on the landing route. A precedent for synchronously reading a single persisted value before async hydration completes already exists (`src/features/profile/persistence/read-cached-theme-background.ts`) — worth consulting during planning, though the exact mechanism (sync pre-read vs. restructuring the provider tree vs. something else) is this task's `Required` planning pass to decide, per this project's persistence-boundary rule in `AGENTS.md`.

### [T146] Let users preview a theme during onboarding before committing to it

- **Area:** Onboarding
- **Priority:** Medium
- **Status:** Not started
- **Planning:** Required
- **Description:** In `kentei-onboarding.tsx`'s `themeSelect` step, `OnboardingThemeStep`'s `onSelectPreset` handler currently both applies the preset and calls `finishOnboarding()` immediately, so tapping any preset instantly exits onboarding. Split preview from commit: selecting a preset should only apply it live; a separate "Finish onboarding" action should be what advances into the app.
- **Exit criteria:** On the onboarding theme step, tapping a preset previews it (background/accent visibly change) without leaving the step or navigating; a distinct "Finish onboarding" control is what calls `completeOnboarding` and navigates to `/app/sesh`. `yarn test --runInBand` passes, including a test asserting preset selection alone does not trigger `completeOnboarding`.
- **Notes:** From story S016. Marked `Required` because it changes `kentei-onboarding.tsx`'s own step/reducer flow (adding a distinct confirm action to the `themeSelect` step), which this project's Planning rules call out for a separate planning pass regardless of size. "Skip for now" (`onSkip`) already bypasses theme selection entirely and calls `finishOnboarding` directly — leave that behavior as-is; only the preset-select path changes.

### [T147] Add a pink theme preset

- **Area:** Profile / theming
- **Priority:** Low
- **Status:** Not started
- **Planning:** Implementer
- **Description:** Add a pink entry to `RAINBOW_THEME_PRESETS` (`src/features/profile/model/theme-presets.ts`), following the existing `{id, label, backgroundColor, accentColor}` shape used by the current seven presets.
- **Exit criteria:** A pink preset appears in the theme picker alongside the existing presets and can be selected and applied like any other preset. `yarn test --runInBand` passes, including any preset-count or preset-list assertions updated for the new entry.
- **Notes:** From story S017. Exact hex values are an implementer call — pick colors with the same automatic-contrast behavior (`deriveAutomaticTextColor`/`deriveAutomaticButtonBackgrounds`) already verified for the other presets in `use-resolved-theme.test.ts`.

### [T148] Add a wood-grain "Raw" theme preset

- **Area:** Profile / theming
- **Priority:** Low
- **Status:** Not started
- **Planning:** Implementer
- **Description:** Add a "Raw" entry to `RAINBOW_THEME_PRESETS` using a flat wood-toned `{backgroundColor, accentColor}` pair (e.g. a warm tan background, deep brown accent) — the existing preset model has no texture/gradient/image support, and the product decision (confirmed during refinement) is to stay within that flat-color model rather than add one.
- **Exit criteria:** A "Raw" preset appears in the theme picker alongside the existing presets and can be selected and applied like any other preset. `yarn test --runInBand` passes, including any preset-count or preset-list assertions updated for the new entry.
- **Notes:** From story S018. Same shape and mechanism as T147 (S017) — both touch the same file and could reasonably be done in either order or combined into one commit if picked up together, but are scoped as separate tickets since they're separate stories.

### [T149] Hide focused tricks while searching in trick goals

- **Area:** Tricks
- **Priority:** Medium
- **Status:** Not started
- **Planning:** Required
- **Description:** `TrickDirectory` (`src/features/tricks/components/trick-directory.tsx`) keeps its focused-tricks section visible regardless of `search.query`, obscuring search results in the trick-goals picker. Hide that section while a search query is present.
- **Exit criteria:** In the trick goals picker (`GoalTrickPicker`, which renders `TrickDirectory` with `showFocusedSection`), typing any text into the search input hides the focused-tricks section; clearing the search restores it. `yarn test --runInBand` passes, including a test covering both states.
- **Notes:** From story S019. Confirmed in code that `sectioningTrickIds`/`createTrickSections` apply regardless of `search.query` today. Scope this to wherever `showFocusedSection` is used (currently only `GoalTrickPicker`) rather than every `TrickDirectory` consumer, unless another consumer is found to have the same section during implementation. Raised from `Implementer` to `Required` during scoping review — `TrickDirectory` is a shared component with several consumers across the app (onboarding, the main Tricks route, this picker), so confirming the change stays scoped to `showFocusedSection` callers and doesn't affect other consumers is worth a planning pass first.

### [T150] Automatically focus a trick when a goal is set for it

- **Area:** Goals / Tricks UI
- **Priority:** Medium
- **Status:** Not started
- **Planning:** Required
- **Description:** Creating a goal (`useGoalActions().addGoal`) for a trick that isn't currently in the user's focused tricks (`selectedTrickIds`, via `UserProfileProvider`) should add it to that list as part of saving the goal.
- **Exit criteria:** Creating a goal for a trick not currently in `selectedTrickIds` adds that trick to `selectedTrickIds` as part of the same save action; creating a goal for an already-focused trick is a no-op on the focused list. Confirmed via a unit test asserting the profile's focused-trick list before/after `addGoal` is called in both cases.
- **Notes:** From story S020. Marked `Required` because it has the Goals feature's `GoalProvider` triggering a write into the User Profile persistence domain's `selectedTrickIds` (via the existing `toggleSelectedTrick` action or an equivalent add-only variant) — a cross-domain interaction `AGENTS.md`'s persistence-boundary section calls out for a plan before implementation, including how the two providers' writes should be sequenced/queued relative to each other.

### [T151] Label the focused tricks list on the Sesh practice screen

- **Area:** Sesh
- **Priority:** Low
- **Status:** Not started
- **Planning:** Implementer
- **Description:** The focused-tricks list on the Sesh practice screen (`sesh.tsx`, directly after "Practice several tricks") renders with no section heading of its own, leaving it ambiguous what the list represents.
- **Exit criteria:** The Sesh practice screen shows a "Focused tricks" heading directly above the focused-tricks list (`TrickChoices`), positioned below the existing "Practice several tricks" text. `yarn test --runInBand` passes.
- **Notes:** From story S021. Confirmed in code (`sesh.tsx:446-453`) this list currently has no heading between it and "Practice several tricks".

### [T152] Play an audio cue when a timed sesh's timer reaches zero

- **Area:** Sesh
- **Priority:** Medium
- **Status:** Not started
- **Planning:** Required
- **Description:** No audio playback exists anywhere in the app today. Add one: when a timed sesh's countdown reaches zero via natural expiration (the `timerElapsed` action), play an audible cue as a component-level side effect of that transition — not an early manual end (`seshEnded`).
- **Exit criteria:** When a timed sesh's countdown reaches zero naturally, an audible cue plays once; ending a timed sesh early (before the deadline) does not play it. Confirmed via a test asserting the audio-trigger side effect fires on the `active`→`completed` transition driven by `timerElapsed` and not on one driven by `seshEnded`, plus a manual browser check that sound is audible at zero for a real timed sesh.
- **Notes:** From story S022. Use `expo-audio` (this SDK's supported audio API for Expo ~57) rather than the deprecated `expo-av`, which isn't in this project's dependencies — consult the matching versioned Expo docs per `AGENTS.md`'s Expo-documentation rule, since this is a new, unfamiliar API in this codebase. Marked `Required` both for that reason and because the side effect must respect this project's existing rule of keeping timer effects and `Date.now()` calls outside the Sesh reducer (`AGENTS.md`'s Sesh section) — the trigger belongs in a component-level effect watching the transition, not inside `sesh.ts`'s reducer itself.

---

_T153 comes from S032, refined from [BACKEND_ROADMAP.md](BACKEND_ROADMAP.md) and originally scoped with T154–T162 into [TASKS_BACKLOG.md](TASKS_BACKLOG.md) on 2026-08-21. Its technical-scoping review split Phase 1 Auth into thirteen focused checkpoints and moved the Auth error/redaction boundary from former T154.3 ahead of every route that consumes it. T153 was activated in this automated queue at the user's explicit request on 2026-08-21; T154–T162 remain in the formal backlog. Supabase, unrestricted guest access, web PKCE, exact callbacks, and the roadmap's security requirements are settled decisions. Native callbacks and SecureStore remain deferred._

### [T153] Establish optional web account access and recovery

- **Area:** Authentication
- **Priority:** High
- **Status:** Not started
- **Description:** Add the complete Phase 1 web Auth foundation while preserving unrestricted guest access to `/app`.
- **Notes:** Umbrella from S032. Complete T153.1–T153.13. Native callbacks, SecureStore, and synchronization are excluded.

### [T153.1] Establish reproducible local Supabase Auth development

- **Area:** Backend development environment
- **Priority:** High (inherited from parent T153)
- **Status:** Not started
- **Planning:** Required
- **Description:** Add repository-owned Supabase CLI configuration, local Auth policy and email templates, ignored local environment files, and the smallest documented workflow needed to rebuild and test Auth locally without committing credentials. Configure verified email, a ten-character password minimum, one-hour JWTs, and `http://localhost:8081/auth/callback` as the fixed local callback.
- **Exit criteria:** From a fresh checkout with the documented CLI and Docker-compatible prerequisites, `supabase start` and a clean local database reset succeed; a nine-character signup is rejected, an unverified user cannot sign in, Mailpit receives the repository-owned confirmation email targeting the exact local callback, and `git check-ignore` confirms every documented local credential file is ignored while the tracked configuration contains only placeholders or environment references.
- **Notes:** From S032 and `BACKEND_ROADMAP.md` Phase 1 backend items 1, 3, and 6. This establishes the local backend contract only; application consumption begins in T153.4. When Auth flows are being tested, use the fixed port rather than selecting an arbitrary fallback port because the PKCE verifier and redirect origin must match.

### [T153.2] Configure the hosted development project and Auth policy

- **Area:** Hosted Supabase Auth configuration
- **Priority:** High (inherited from parent T153)
- **Status:** Not started
- **Planning:** Required
- **Description:** Create the single hosted free development project and mirror T153.1's verified-email password policy, exact web callback allowlist, ten-character password minimum, and one-hour access-token lifetime without creating the reserved production project.
- **Exit criteria:** A dated, secret-free configuration record shows the hosted development project has verified-email password Auth, exactly the approved `http://localhost:8081/auth/callback` and `https://dailydama.com/auth/callback` redirects, a ten-character minimum, and a 3,600-second JWT lifetime; live probes reject a nine-character signup and deny sign-in before email verification.
- **Notes:** From S032 and roadmap Phase 1 backend items 2–3. Depends on T153.1. Secure email change belongs to T154.1; Resend and DNS belong to T153.3.

### [T153.3] Configure Resend Auth email delivery and DNS authentication

- **Area:** Auth email delivery
- **Priority:** High (inherited from parent T153)
- **Status:** Not started
- **Planning:** Required
- **Description:** Configure Supabase custom SMTP through Resend using the dedicated `auth.dailydama.com` sending subdomain, mirror the repository-owned confirmation and recovery templates into the hosted project, and disable link tracking so single-use Auth URLs are not rewritten.
- **Exit criteria:** A dated, secret-free delivery record proves hosted confirmation and recovery messages arrive through Resend from the Auth subdomain with their callback URLs intact, Resend link tracking is disabled, SPF and DKIM pass, and the subdomain publishes a visible DMARC `p=none` policy; no SMTP credential appears in tracked files or client-exposed environment values.
- **Notes:** From S032 and roadmap Phase 1 backend item 4 plus the email/redirect security requirements. Depends on T153.1–T153.2. T162 later repeats deliverability checks before external signup and may tighten the DMARC policy using observed delivery evidence.

### [T153.4] Add a static-render-safe web Supabase client and Auth state

- **Area:** Authentication state
- **Priority:** High (inherited from parent T153)
- **Status:** Not started
- **Planning:** Required
- **Description:** Add `@supabase/supabase-js`, a browser-persistent client configured only from `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and one authoritative Auth provider modeled as `initializing`, `guest`, or `authenticated`. Configure `flowType: 'pkce'`, leave URL detection disabled so T153.7 owns the single code exchange, and ensure client construction and storage access are safe during Expo Router's Node static-render pass.
- **Exit criteria:** Provider tests drive missing/malformed configuration, initial session resolution, sign-in, sign-out, token refresh, Auth events, and offline initialization; children and every existing `/app` guest route remain renderable while Auth is `initializing` or unavailable; server rendering touches no browser globals; and `yarn expo export --platform web --output-dir /tmp/daily-dama-web-export` succeeds with only publishable Supabase configuration reachable from application code.
- **Notes:** From S032. Depends on T145 and T153.1. T145 first moves rehydration-dependent domain providers under `/app`; mount Auth above the root `<Slot>` without adding an Auth hydration gate. The Auth state is the application's session/UI authority, not a substitute for later database RLS authorization. Keep a platform seam for Phase 5, but implement and verify web only.

### [T153.5] Centralize Auth errors and sensitive-data redaction

- **Area:** Authentication observability
- **Priority:** High (inherited from parent T153)
- **Status:** Not started
- **Planning:** Required
- **Description:** Define structured, actionable Auth error categories and one redacted application logging/analytics boundary before any Auth route is added. Normalize enumeration-sensitive failures and prevent raw Supabase errors, callback URLs, or entered credentials from reaching UI, application-owned console calls, or Vercel Analytics.
- **Exit criteria:** Unit tests feed representative Supabase errors and URLs containing emails, passwords, JWT-like values, refresh tokens, PKCE codes, and nested identifiers through the boundary and prove UI categories remain actionable while application logs and Analytics events contain none of those values; the root Analytics `beforeSend` handling drops or sanitizes callback query and fragment data.
- **Notes:** From S032/S033 and roadmap Auth/client security requirements. Depends on T153.4. This relocates former T154.3 so signup, sign-in, recovery, callbacks, credential maintenance, and logout share the boundary from their first implementation.

### [T153.6] Build the recovery-session password reset route

- **Area:** Password reset UI
- **Priority:** High (inherited from parent T153)
- **Status:** Not started
- **Planning:** Required
- **Description:** Add the public static route `/auth/reset-password`, but permit password submission only while the Auth provider holds a valid password-recovery session. Provide confirmation, mismatch, weak-password, expired-session, offline, loading, and completion states through the structured Auth boundary.
- **Exit criteria:** Route/provider tests prove a valid injected recovery session can set a compliant new password exactly once, while a direct visit without recovery state, an expired session, mismatched or weak input, offline submission, and repeat submission are handled deterministically without exposing a password, session, or email in the URL, logs, or analytics; the web export emits the reset route.
- **Notes:** From S032. Depends on T153.4–T153.5. This route precedes T153.7 so Expo Router typed routes can validate the callback's fixed recovery destination in every intermediate commit.

### [T153.7] Build the fixed-destination PKCE callback foundation

- **Area:** Authentication callbacks
- **Priority:** High (inherited from parent T153)
- **Status:** Not started
- **Planning:** Required
- **Description:** Add `/auth/callback` as the sole owner of manual PKCE code exchange. Exchange each code once, derive the completed Auth flow without accepting an arbitrary destination, route successful signup confirmation only to `/app/home` and password recovery only to `/auth/reset-password`, and clear sensitive callback parameters before subsequent navigation or analytics.
- **Exit criteria:** Automated route/provider tests prove exactly one exchange for a valid confirmation and recovery code, the two fixed success destinations, safe handling of missing, malformed, expired, reused, offline, and verifier-mismatched codes, and rejection of an attempted `next`/open redirect; a static web export emits the callback route without accessing browser globals, and the final browser URL plus application logs and Analytics contain no code or token.
- **Notes:** From S032 and roadmap email/redirect security. Depends on T153.4–T153.6. The successful email-change destination is deliberately added later by T154.1. Production and local callback URLs must match T153.1–T153.2 exactly.

### [T153.8] Build signup, check-email, verification, and resend

- **Area:** Account creation UI
- **Priority:** High (inherited from parent T153)
- **Status:** Not started
- **Planning:** Required
- **Description:** Add `/auth/sign-up` and `/auth/check-email` using the Auth provider and structured error boundary, with ten-character password validation, generic duplicate-account handling, verification guidance, and explicit resend, offline, throttled, expired, and verifier-missing behavior. Do not place the submitted email in route parameters or analytics.
- **Exit criteria:** Route tests and a local browser walkthrough prove a guest can submit signup, receives the same public result for a new or existing address, reaches check-email guidance, resends within the configured limits, opens the Mailpit confirmation in the same browser profile, completes T153.7's callback, and reaches authenticated `/app/home`; invalid, offline, throttled, expired, and missing-verifier cases remain actionable without exposing whether an account exists.
- **Notes:** From S032. Depends on T153.1, T153.4–T153.5, and T153.7. Preserve Daily Dama's existing visual system without depending on profile-backed theme hydration or introducing a generic Auth dashboard shell.

### [T153.9] Build sign-in and failure states

- **Area:** Sign-in UI
- **Priority:** High (inherited from parent T153)
- **Status:** Not started
- **Planning:** Required
- **Description:** Add `/auth/sign-in` using the Auth provider and structured error boundary, with generic credential failure plus explicit loading, validation, unverified-email, offline, throttled, expired-session, and success behavior while leaving all guest routes accessible.
- **Exit criteria:** Route/provider tests and a browser walkthrough prove a verified user can sign in and reach `/app/home`, unknown-email and wrong-password attempts receive the same public credential response, and unverified, invalid, offline, throttled, and repeat-submit cases remain deterministic without placing credentials or account facts in URLs, logs, or analytics; a guest can always leave the route and continue into `/app`.
- **Notes:** From S032. Depends on T153.4–T153.5. Sign-in is separate from T153.8 because it is an independently testable route and security surface.

### [T153.10] Build the forgot-password request flow

- **Area:** Password recovery request UI
- **Priority:** High (inherited from parent T153)
- **Status:** Not started
- **Planning:** Required
- **Description:** Add `/auth/forgot-password` with a generic recovery-request response, exact callback initiation, and explicit loading, validation, offline, throttled, and resend guidance. Complete recovery through the existing T153.7 callback and T153.6 reset route without putting an email or destination URL into route parameters.
- **Exit criteria:** Route tests prove known and unknown addresses receive the same public response and offline, invalid, throttled, and repeat submissions are deterministic; a local same-browser Mailpit walkthrough requests recovery, exchanges the PKCE code once through `/auth/callback`, reaches `/auth/reset-password`, changes the password, signs in with the new password, and leaves no email, code, password, or token in URLs, application logs, or Analytics.
- **Notes:** From S032. Depends on T153.4–T153.7. Supabase's same-browser/device PKCE verifier limitation must be explained in the recovery guidance and missing-verifier error.

### [T153.11] Add guest account entry points to Profile

- **Area:** Profile Auth entry
- **Priority:** High (inherited from parent T153)
- **Status:** Not started
- **Planning:** Implementer
- **Description:** Add optional sign-up and sign-in entry points to Profile for unauthenticated users, using the existing Profile composition and Auth state without gating, clearing, importing, or otherwise changing guest data.
- **Exit criteria:** Profile component/browser tests prove an unauthenticated, onboarded guest can open `/auth/sign-up` and `/auth/sign-in`, an authenticated user sees neither guest entry, and navigating to or returning from either route leaves the existing profile, trick, Sesh, Stats, goal, and note state unchanged.
- **Notes:** From S032 and roadmap Phase 1 frontend item 4. Depends on T153.8–T153.9. This is a local Profile navigation change; authenticated account-management surfaces remain in T154 and guest-data import remains T159.

### [T153.12] Invite a guest after their first completed Sesh

- **Area:** Post-Sesh Auth invitation
- **Priority:** High (inherited from parent T153)
- **Status:** Not started
- **Planning:** Required
- **Description:** Show a dismissible, optional signup invitation on the completion UI for the first completed Sesh in the current guest practice-history namespace. Derive eligibility from authoritative practice history and keep dismissal local to that completion UI rather than adding a profile field, storage key, or persistence domain.
- **Exit criteria:** Component/provider tests prove the invitation appears for an unauthenticated guest's first successfully recorded Sesh, can be dismissed or can open signup without changing the completed record, does not appear on later completions or after reloading the persisted first record, never appears for an authenticated user, and does not alter completion deduplication or any existing guest flow.
- **Notes:** From S032 and roadmap Phase 1 frontend item 6. Depends on T153.4 and T153.8. Do not start guest-data import here. Planning is required because this reads across Auth and practice-history providers beside the existing two-layer completed-Sesh deduplication boundary.

### [T153.13] Verify Phase 1 web Auth security end to end

- **Area:** Authentication security testing
- **Priority:** High (inherited from parent T153)
- **Status:** Not started
- **Planning:** Required
- **Description:** Add a black-box Phase 1 acceptance suite spanning a clean local Supabase reset and the completed web routes. Verify already-implemented behavior only: this checkpoint must not become a second implementation ticket for missing Auth branches or redaction logic.
- **Exit criteria:** One documented command resets local Supabase and passes an acceptance matrix covering new/existing signup equivalence, unknown/wrong-password sign-in equivalence, known/unknown recovery equivalence, verification and reset, resend limits, expired sessions, missing/reused/malformed/verifier-mismatched callbacks, open-redirect rejection, application-log/Analytics redaction, and guest access to every existing `/app` top-level route while Auth is initializing, offline, or unavailable; the standard Jest, lint, TypeScript, and static web-export sequence also passes with all `/auth/*` routes present.
- **Notes:** From S032 and roadmap Phase 1 security/verification requirements. Depends on T153.1 and T153.4–T153.12. The redaction boundary covers application-owned console calls and Vercel Analytics events; Supabase service logs and browser network tooling are outside this frontend acceptance boundary. Defects found here return to their owning ticket or a new focused follow-up rather than being silently implemented in this suite.
