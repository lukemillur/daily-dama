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


### [T147] Add a pink theme preset

- **Area:** Profile / theming
- **Priority:** Low
- **Status:** In progress
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

_All currently actionable backend-roadmap work is phase-gated and active in dependency order: Phase 1/Auth T153–T154, Phase 2 T155, Phase 3 T156–T160, Phase 4 T161, and the Phase 6 launch gate T162. T154 is the shared credential-maintenance prerequisite named by both Phase 1 and Phase 4, and is ordered before T158's guarded-logout integration. Phase 5 has no active ticket while native hardening is deferred. Supabase, unrestricted guest access, web PKCE, exact callbacks, local-first synchronization, immediate deletion, and the roadmap's security requirements are settled decisions._

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

_Phase 1/4 shared account-maintenance activation: T154 comes from S033 and the credential-maintenance/logout items repeated across `BACKEND_ROADMAP.md` Phases 1 and 4. It follows the core Auth routes and precedes Phase 3's T158 guarded logout, while account deletion stays separate in T161._

### [T154] Add secure signed-in credential maintenance

- **Area:** Account security
- **Priority:** Medium
- **Status:** Not started
- **Description:** Let authenticated web users maintain credentials and end only the current device session.
- **Notes:** Umbrella from S033. Complete T154.1–T154.2. Pending-sync logout protection is T158. The shared Auth error/redaction boundary moved to active task T153.5 so it exists before any Auth route.

### [T154.1] Add signed-in password and email change flows

- **Area:** Account security UI
- **Priority:** Medium
- **Status:** Not started
- **Planning:** Required
- **Description:** Configure Supabase secure email change and add `/app/profile/account/security` with current-password verification for password changes, including reauthentication, expiry, generic errors, and confirmation guidance through T153.5's shared boundary.
- **Exit criteria:** Route/provider tests and a browser walkthrough confirm a signed-in user can change a password only after supplying the current password, can initiate and complete secure email change, and receives actionable expired/offline states without exposing sensitive values in URLs, logs, or analytics.
- **Notes:** From S033 and roadmap Phase 1 backend item 5/frontend item 5. Depends on T153.2, T153.3, T153.4, T153.5, and T153.7. T153.7 establishes the callback allowlist; this task adds only the fixed secure-email-change result needed by this route. Do not add MFA or account deletion.

### [T154.2] Add current-device logout and fresh guest return

- **Area:** Authentication session lifecycle
- **Priority:** Medium
- **Status:** Not started
- **Planning:** Required
- **Description:** Add a Profile logout action using `signOut({ scope: 'local' })`, transition authoritative Auth state back to guest, and leave other device sessions untouched.
- **Exit criteria:** Provider and browser tests confirm logout invalidates the current browser session, returns to a usable guest workspace, does not request global sign-out, and handles offline or expired-session responses deterministically.
- **Notes:** From S033. Depends on T153.4 and T154.1. Before outboxes exist, this is the basic logout path; T158 later adds the unsynced-change guard and account-cache handling.

---

_Phase 2 activation: T155 comes from S034 and `BACKEND_ROADMAP.md` Phase 2. Its thirteen S-sized children establish the database security boundary, model all six resources, prove grants/RLS and constraints, generate typed repository contracts, and add pure runtime mappings before any provider synchronizes. The sequence is dependency-driven: schema and tests precede generated types and mappings; existing reducer authority, hydration fallback, and skipped-initial-write behavior remain unchanged._

### [T155] Establish the secure cloud data foundation

- **Area:** Supabase database
- **Priority:** High
- **Status:** Not started
- **Description:** Represent all persisted Daily Dama domains in a constrained, typed Postgres/Data API boundary before any provider begins synchronization.
- **Notes:** Umbrella from S034. Complete T155.1–T155.13. No production migrations or live user data exist yet.

### [T155.1] Create private and exposed schemas with deny-by-default privileges

- **Area:** Database security boundary
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Add migrations for the exposed `api` schema and non-exposed `private` schema, revoke default and automatic privileges, configure the Data API exposure deliberately, and grant no application-table access to `anon`.
- **Exit criteria:** A clean local reset succeeds; catalog assertions prove only `api` is exposed, `private` helpers are unreachable through the Data API, default privileges are revoked, and raw anonymous requests cannot access application resources.
- **Notes:** From S034 and roadmap Phase 2 item 1. Depends on T153.1.

### [T155.2] Model profiles and per-trick user state

- **Area:** Profile cloud schema
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Add `api.profiles` and `api.user_trick_states` with `auth.users(id) ON DELETE CASCADE`, profile/trick-state invariants, appropriate indexes, revisions/tombstones where mutable, and no client-controlled ownership.
- **Exit criteria:** Migration tests accept every valid current `UserProfile` shape, reject invalid Kentei ranks, theme/streak/last-Sesh variants and duplicate trick states, prove cascade deletion, and show mutation payloads cannot assign another `user_id`.
- **Notes:** From S034. Depends on T155.1. Current local profile combines these resources; mapping remains a later task.

### [T155.3] Model custom tricks and immutable practice sessions

- **Area:** Custom tricks / practice-history cloud schema
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Add `api.custom_tricks` and `api.practice_sessions`, preserving stable trick IDs, authoritative name snapshots, non-nested sequence steps, insert-only historical sessions, client-fact timing, and user-scoped pagination indexes.
- **Exit criteria:** Database tests accept valid standalone tricks, sequences, and session snapshots; reject nested sequences, malformed discriminated steps, invalid timing/counts, and duplicate IDs; and prove an authenticated client cannot update or delete a practice session after insertion.
- **Notes:** From S034 and documented custom-trick/Sesh invariants. Depends on T155.1.

### [T155.4] Model mutable goals and notes with tombstones

- **Area:** Goals / notes cloud schema
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Add `api.goals` and `api.notes` with their discriminated variants, trick/session name snapshots, revisions, edit timestamps, soft-deletion tombstones, ownership constraints, and user-scoped ordering indexes.
- **Exit criteria:** Migration tests accept every current goal/note variant, reject malformed variants and invalid session references, increment revisions through valid edits, and prove a tombstoned record cannot be silently recreated by a stale mutation using the same identity/revision.
- **Notes:** From S034. Depends on T155.1. Historical name snapshots remain authoritative.

### [T155.5] Protect server-owned timestamps, revisions, and ownership

- **Area:** Database mutation controls
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Add private trigger functions with explicit safe `search_path` values to own `created_at`, `updated_at`, revisions, receipt timestamps, and immutable ownership fields; restrict update grants so RLS is not the only protection.
- **Exit criteria:** Raw authenticated requests prove inserts and updates cannot choose or preserve forged server-owned values, valid mutations receive authoritative timestamps/revisions, every `SECURITY DEFINER` function has an audited fixed `search_path`, and the complete migration rebuild remains clean.
- **Notes:** From S034 and roadmap Phase 2 item 3. Depends on T155.2–T155.4.

### [T155.6] Enforce domain JSON invariants inside Postgres

- **Area:** Database validation
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Add database-level validation for profile variants, goals, custom tricks, and sequence-step JSON so callers bypassing frontend runtime validation cannot store impossible domain states.
- **Exit criteria:** Parameterized raw Data API tests submit valid and malformed examples for every discriminated shape and confirm only valid records persist, including explicit rejection of nested sequences, unknown fields/variants, invalid ranks, and ambiguous goal payloads.
- **Notes:** From S034 and roadmap database-security requirements. Depends on T155.2–T155.4.

### [T155.7] Add explicit authenticated grants and row-level security

- **Area:** Database authorization
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Enable RLS in table-creation migrations and add least-privilege operation grants plus user-scoped `USING` and `WITH CHECK` policies for every exposed resource, with select/insert-only permissions for practice sessions.
- **Exit criteria:** Raw HTTP tests prove anonymous denial, user A isolation from user B across select/insert/update/delete, rejection of ownership changes, correct allowed operations for each table, and denial of practice-session updates/deletes even by the owner.
- **Notes:** From S034. Depends on T155.2–T155.6. Test grants and RLS independently so one cannot mask a failure in the other.

### [T155.8] Build a repeatable database security and migration test harness

- **Area:** Backend testing
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Consolidate clean-reset, catalog, constraint, grant, RLS, pagination, and raw Data API negative tests into a dependency-free or repository-standard command suitable for local work and CI.
- **Exit criteria:** One documented command resets the local database and runs all migration/security tests, including anonymous access, cross-user access, protected columns, malformed JSON, practice-session immutability, and a paginated fixture exceeding 1,000 sessions; it exits non-zero when a representative policy is deliberately weakened.
- **Notes:** From S034 and roadmap Verification. Depends on T155.1–T155.7.

### [T155.9] Generate database types and define cloud repository contracts

- **Area:** Frontend cloud data boundary
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Add deterministic Supabase TypeScript type generation and define one cloud repository contract per existing persistent domain, keeping generated row types, network errors, and Supabase clients outside reducers and domain models.
- **Exit criteria:** A documented generation command produces a stable checked-in type file from a clean local reset; type tests or compilation prove each domain repository exposes typed paginated reads and mutation results without leaking Supabase query builders into providers or reducers.
- **Notes:** From S034 and roadmap Phase 2 frontend items 1 and 3. Depends on T155.8.

### [T155.10] Map profile and trick-state rows at the runtime boundary

- **Area:** Profile cloud mapping
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Implement pure mappings and runtime response validation between `UserProfile` plus focused/manually-laced state and the `profiles`/`user_trick_states` rows, with explicit absence and structured validation errors.
- **Exit criteria:** Unit tests round-trip every valid profile variant, reject malformed/partial/foreign-user rows, preserve stable trick-state identity, and demonstrate no input object is mutated; TypeScript compilation prevents ambiguous empty-object fallbacks.
- **Notes:** From S034. Depends on T155.9. Do not integrate the provider or synchronization yet.

### [T155.11] Map custom-trick and sequence rows at the runtime boundary

- **Area:** Custom tricks cloud mapping
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Implement pure mappings and runtime validation for standalone custom tricks and sequences while preserving stored step-name snapshots and rejecting nested sequences or source-name re-resolution.
- **Exit criteria:** Unit tests round-trip every valid custom-trick variant, reject malformed rows and nested sequences, retain stored step names after source trick rename/deletion fixtures, and prove mapping does not mutate domain or row inputs.
- **Notes:** From S034. Depends on T155.9. The provisional local v1 schema may change in place before external users exist.

### [T155.12] Map immutable practice-session rows at the runtime boundary

- **Area:** Practice-history cloud mapping
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Implement pure mappings and runtime validation for immutable completed-Sesh records, preserving historical trick snapshots, client-fact start/end timing, active duration, origin, and deterministic pagination identity.
- **Exit criteria:** Unit tests round-trip timed/open-ended/assessment records, reject malformed timing and duplicate/foreign-user rows, preserve historical names, and confirm server receipt timestamps never replace client domain timestamps.
- **Notes:** From S034. Depends on T155.9. Stats must continue deriving totals from immutable domain records.

### [T155.13] Map goal and note rows at the runtime boundary

- **Area:** Goals / notes cloud mapping
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Implement pure mappings and runtime validation for count/time goals and notes, including tombstones, revisions, optional practice-session association, and authoritative name snapshots.
- **Exit criteria:** Unit tests round-trip all goal/note variants and tombstones, reject ambiguous variants, stale or malformed revisions, invalid session associations, and foreign-user rows, and prove neither domain state nor mutation payload preparation is mutated.
- **Notes:** From S034. Depends on T155.9. Provider integration belongs to T157.

---

_Phase 3 activation: T156–T160 come from S035–S038 and `BACKEND_ROADMAP.md` Phase 3. The dependency chain deliberately separates identity-partitioned persistence (T156), durable synchronization mechanics and ordered domain rollout (T157), outbox-aware logout (T158), resumable guest conversion (T159), and visible conflict recovery (T160). Each child owns one persistence, orchestration, domain, or UX boundary; Realtime remains deferred and synchronization may never alter the active Sesh state machine._

### [T156] Partition local persistence by verified identity

- **Area:** Local persistence security
- **Priority:** High
- **Status:** Not started
- **Description:** Prevent guest and authenticated caches from sharing keys or allowing late work from one identity to update another.
- **Notes:** Umbrella from S038. Complete T156.1–T156.3 before domain synchronization. The existing hydration fallback and skipped-initial-write behavior must survive unchanged.

### [T156.1] Define identity-scoped storage and generation ownership

- **Area:** Shared persistence
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Introduce an explicit `guest` / `user:<verified-user-id>` identity model, a scoped `KeyValueStorage` adapter, and generation tokens that let async persistence/sync results prove they still belong to the current identity.
- **Exit criteria:** Unit tests prove identical logical keys resolve to isolated physical namespaces, unverified or malformed identities are rejected, generation changes invalidate late results, and the adapter never accepts identity from mutation payload data.
- **Notes:** From S038 and roadmap synchronization security. Depends on T153.4. Do not move native credentials or add outboxes yet.

### [T156.2] Rehydrate every provider from its current identity namespace

- **Area:** Persistent provider composition
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Inject identity-scoped storage into the profile, custom-trick, practice-history, goal, and note providers; on identity change, cancel stale hydration, restore the new namespace, and preserve each provider's safe fallback, write queue, and skipped initial write.
- **Exit criteria:** Provider integration tests switch guest → user A → user B → guest and prove each domain rehydrates only its own data, no empty initial state overwrites restored data, writes remain ordered, and a deliberately delayed user-A load cannot commit after user B becomes current.
- **Notes:** From S038. Depends on T156.1. This changes provider orchestration but not reducer state shapes.

### [T156.3] Prove cross-account local-data isolation

- **Area:** Persistence security testing
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Add an end-to-end provider test matrix that seeds distinct profile, custom-trick, practice-history, goal, note, and pending-metadata fixtures for guest, user A, and user B and exercises repeated identity switches.
- **Exit criteria:** One automated matrix proves no identity can render, overwrite, or submit another identity's fixtures; a late queued write and a late hydration result are both discarded after switching; and returning to each identity restores exactly its own state.
- **Notes:** From S038. Depends on T156.2. Outbox-specific assertions are extended when T157.1 lands.

### [T157] Add local-first synchronization across every domain

- **Area:** Synchronization
- **Priority:** High
- **Status:** Not started
- **Description:** Add durable, ordered, identity-owned synchronization while keeping every current workflow usable offline and every reducer independent of Supabase.
- **Notes:** Umbrella from S035. Complete T157.1–T157.9 in order. Depends on T155 and T156. Realtime subscriptions remain deferred.

### [T157.1] Define durable outbox and mutation-identity contracts

- **Area:** Synchronization persistence
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Define serializable mutation operations, stable operation IDs, per-domain cursors, acknowledgements, retry metadata, and atomic versioned envelopes that own local domain state and its outbox together.
- **Exit criteria:** Unit tests prove a local state change and its operation persist atomically, survive reload, retain stable IDs across retries, preserve FIFO order, reject malformed envelopes, and cannot be loaded or acknowledged under another identity.
- **Notes:** From S035. Depends on T155.9 and T156.3. Keep runtime handles, promises, Sets, Maps, timers, and Supabase clients out of persisted state.

### [T157.2] Build a single-flight identity-aware sync coordinator

- **Area:** Synchronization orchestration
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Implement an explicit coordinator state machine that permits one sync per identity, models cancellation/retry, tags runs with identity generations, and continues safely after contained operation failures.
- **Exit criteria:** State-machine tests cover overlapping triggers, cancellation, identity change, network failure, retry, partial-domain failure, and stale completion; at most one run owns an identity at a time and no late result can mutate current state after logout or account switching.
- **Notes:** From S035. Depends on T157.1. Keep scheduling effects and clocks outside the reducer/state machine.

### [T157.3] Implement paginated pulls and idempotent ordered pushes

- **Area:** Synchronization transport
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Add repository-agnostic transport orchestration for stable ordered pagination, mutation-ID-based idempotent retries, optimistic revision checks, tombstones, and application of server-returned revisions/timestamps.
- **Exit criteria:** Transport tests pull more than 1,000 ordered fixtures without gaps/duplicates, retry a successful write after a simulated lost acknowledgement without duplication, reject stale revisions into a typed conflict, apply authoritative server metadata, and continue unrelated operations after one conflict.
- **Notes:** From S035. Depends on T155.9, T157.1, and T157.2. Use injected clocks/network repositories for deterministic tests.

### [T157.4] Synchronize profile and trick state first

- **Area:** Profile synchronization
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Integrate the profile/trick repositories, runtime mappings, scoped persistence envelope, and coordinator with `UserProfileProvider`, preserving current reducer authority, hydration behavior, and local offline writes.
- **Exit criteria:** Integration tests create and edit all profile/trick-state variants offline, reload with pending work, reconnect and synchronize, rehydrate the result in a second browser identity fixture, resolve accepted server revisions, and prove no sync effect changes active Sesh state.
- **Notes:** From S035 domain rollout 1. Depends on T155.10 and T157.3.

### [T157.5] Synchronize custom tricks and sequences

- **Area:** Custom-trick synchronization
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Integrate custom tricks with the scoped outbox/coordinator while preserving stable IDs, stored step-name snapshots, deletion tombstones, and the no-nested-sequences rule offline and across browsers.
- **Exit criteria:** Integration tests create, edit, and delete standalone tricks and sequences offline; retry/reconnect without duplicates; rehydrate on a second browser; preserve historical step names after source rename/deletion; and surface same-record stale revisions without blocking unrelated tricks.
- **Notes:** From S035 domain rollout 2. Depends on T157.4 and T155.11.

### [T157.6] Synchronize immutable practice history

- **Area:** Practice-history synchronization
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Integrate completed-Sesh insertion and paginated pulls with the synchronization layer, retaining provider/reducer deduplication, immutable snapshots, client-fact timestamps, and Stats derivation.
- **Exit criteria:** Integration tests record sessions offline, reload and retry after a lost acknowledgement, synchronize more than 1,000 records, deduplicate by stable record identity, reject attempted remote mutation, and derive identical Stats locally and after second-browser rehydration.
- **Notes:** From S035 domain rollout 3. Depends on T157.5 and T155.12. Synchronization must never alter an in-progress Sesh reducer.

### [T157.7] Synchronize goals with optimistic revisions and tombstones

- **Area:** Goal synchronization
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Integrate goal creation, editing, deletion, tombstones, and stale-revision detection with the scoped outbox and coordinator without coupling GoalProvider to Supabase.
- **Exit criteria:** Integration tests exercise count/time goals offline through reconnect, lost acknowledgements, edits, deletion, stale-device resurrection attempts, and second-browser hydration; conflicts pause only the affected goal and accepted results update local revision metadata.
- **Notes:** From S035 domain rollout 4. Depends on T157.6 and the goal portion of T155.13.

### [T157.8] Synchronize notes with optimistic revisions and tombstones

- **Area:** Note synchronization
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Integrate notes, optional completed-Sesh references, edits, deletion tombstones, and stale-revision detection with the scoped outbox and coordinator while preserving trick/session snapshots.
- **Exit criteria:** Integration tests create/edit/delete notes offline, retain optional practice-session associations, retry idempotently, defeat stale-device resurrection, rehydrate on a second browser, and continue unrelated note/goal operations when one note conflicts.
- **Notes:** From S035 domain rollout 5. Depends on T157.7 and the note portion of T155.13.

### [T157.9] Trigger synchronization without disrupting active practice

- **Area:** Synchronization lifecycle
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Wire login, foreground, local mutation, reconnection, and manual-retry triggers into the coordinator with debouncing/coalescing appropriate to each event and an explicit guard against synchronization effects changing Sesh state.
- **Exit criteria:** Integration tests fire overlapping login/foreground/reconnect/local-mutation/manual events and prove they coalesce into single-flight runs, offline events remain pending, foreground during every active Sesh status leaves the Sesh state machine unchanged, and unmount/logout cancels subscriptions and stale work.
- **Notes:** From S035. Depends on T157.4–T157.8. Do not add Realtime subscriptions.

### [T158] Protect logout when account changes are unsynchronized

- **Area:** Authentication / synchronization boundary
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Upgrade current-device logout to inspect the current identity's durable outboxes and offer Retry, Cancel, or Discard and log out, then clear in-memory account state without exposing or submitting it under the guest namespace.
- **Exit criteria:** Provider/browser tests cover no-pending logout, successful Retry then logout, failed Retry with the prompt retained, Cancel, explicit Discard, offline behavior, and identity changes during the prompt; other-device sessions remain signed in and subsequent guest/user identities cannot access discarded account cache or operations.
- **Notes:** From S038. Depends on T154.2, T156.3, and T157.9. Account-deletion cleanup is separate in T161.5.

### [T159] Merge guest data into new or existing accounts

- **Area:** Guest conversion
- **Priority:** High
- **Status:** Not started
- **Description:** Import guest data through explicit, resumable merge rules without clearing any local source record before server acknowledgement.
- **Notes:** Umbrella from S036. Complete T159.1–T159.5. Depends on T157 and the identity isolation established by T156.

### [T159.1] Model resumable guest import and preview its scope

- **Area:** Guest import orchestration
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Add an explicit import state machine and durable progress record that inventories guest/cloud counts by domain before mutation, owns an import identity, and can resume after reload or network loss.
- **Exit criteria:** State-machine tests cover inventory, awaiting confirmation, uploading, awaiting profile choice, conflicts, interruption, resume, completion, cancellation, and identity change; the UI shows accurate per-domain local/cloud counts before any guest record is uploaded.
- **Notes:** From S036. Depends on T157.9. Keep effects/clocks/network calls outside the reducer.

### [T159.2] Import all guest data into a new empty account

- **Area:** Guest-to-new-account import
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Implement the empty-account path using the standard outboxes/repositories, preserving operation IDs and source guest data until each domain's records are acknowledged.
- **Exit criteria:** Integration tests import fixtures spanning all five local domains into an empty account, simulate interruption and lost acknowledgements at each domain boundary, resume without duplicates, rehydrate the complete result in another browser, and retain every unacknowledged guest record locally.
- **Notes:** From S036. Depends on T159.1.

### [T159.3] Merge immutable records and trick state into an existing account

- **Area:** Guest-to-existing-account merge
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Implement deterministic union rules for immutable practice records, focused/manually-laced trick state, identical IDs/payloads, and non-conflicting custom tricks, goals, and notes when the target account already contains data.
- **Exit criteria:** Table-driven tests cover disjoint, identical, and overlapping fixtures for every domain; distinct immutable records and trick states union, identical IDs/payloads deduplicate, no target data is silently overwritten, and same-ID/different-payload records are emitted as conflicts.
- **Notes:** From S036. Depends on T159.2.

### [T159.4] Let users choose profile preferences and resolve import conflicts

- **Area:** Guest merge decisions
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Add the explicit choice between guest and cloud profile/preferences plus per-record handling for same-ID/different-payload import conflicts, with no implicit last-write-wins fallback.
- **Exit criteria:** Browser/state tests present complete profile/preference comparisons, persist the chosen source, resolve each conflicting record independently, allow unrelated records to continue, and prevent completion while an acknowledged required choice remains unresolved.
- **Notes:** From S036. Depends on T159.3. Reuse the conflict primitives planned for T160 where practical without coupling the two flows prematurely.

### [T159.5] Finalize guest import only after acknowledgements

- **Area:** Guest import recovery
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Complete resumability and cleanup so acknowledged source records are tracked durably, retries cannot duplicate server data, and the guest namespace is cleared only after all accepted records and choices are confirmed.
- **Exit criteria:** Fault-injection tests interrupt every import phase, restart with the same import identity, and prove accepted records are not duplicated, rejected/unresolved records remain available, guest data is never cleared early, and successful completion switches to the account namespace with a matching second-browser dataset.
- **Notes:** From S036. Depends on T159.2–T159.4.

### [T160] Expose synchronization health and record-level conflict recovery

- **Area:** Synchronization UX
- **Priority:** High
- **Status:** Not started
- **Description:** Make pending work, failures, offline state, freshness, retry, and conflicts understandable without allowing one bad record to stop unrelated synchronization.
- **Notes:** Umbrella from S037. Complete T160.1–T160.3. Depends on T157.

### [T160.1] Add a trustworthy synchronization status model and Profile surface

- **Area:** Profile / sync status
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Derive a serializable user-facing status from coordinator/outbox facts—last successful sync, pending count, syncing, offline, retryable failure, and conflicts—and render it in Profile with a manual retry action.
- **Exit criteria:** Selector and component tests cover every mutually exclusive/combined state, pluralization and timestamps, retry dispatch, reload persistence, and identity changes; the UI never reports "synced" while pending or conflicting operations exist.
- **Notes:** From S037. Depends on T157.9. Keep transient runtime handles outside provider/domain state.

### [T160.2] Add per-record conflict resolution

- **Area:** Synchronization conflicts
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Add `/app/profile/sync-conflicts` with typed comparisons and explicit local/server resolution for profile, custom-trick, goal, and note conflicts, while immutable-session duplicates follow their deterministic identity rule.
- **Exit criteria:** Route/state tests render representative conflicts for every mutable resource, apply either resolution as a new revision-aware operation, persist unresolved conflicts across reload, remove only resolved items, and leave unrelated outbox operations running.
- **Notes:** From S037. Depends on T160.1 and T157.4–T157.8. No automatic last-write-wins option.

### [T160.3] Prove stale revisions and tombstones cannot block or resurrect unrelated data

- **Area:** Synchronization conflict testing
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Add a cross-domain fault-injection suite for concurrent edits, stale revisions, delete-vs-edit tombstones, lost acknowledgements, and conflicts interleaved with valid operations.
- **Exit criteria:** The suite proves only the conflicting record pauses, accepted operations advance and apply server metadata, stale clients cannot resurrect tombstoned goals/notes/custom tricks, retries remain idempotent, and conflict resolution converges two browser fixtures on identical domain state.
- **Notes:** From S037. Depends on T160.2 and T155.8.

---

_Phase 4 activation: T161 comes from S039 and `BACKEND_ROADMAP.md` Phase 4. Its five S-sized children separate the privileged Edge Function boundary, abuse/leakage hardening, destructive-operation security acceptance tests, the confirmation UI, and identity-safe local cleanup/recovery. User-facing export and delayed deletion remain excluded._

### [T161] Add immediate, recoverable account deletion

- **Area:** Account deletion
- **Priority:** High
- **Status:** Not started
- **Description:** Let an authenticated user permanently remove the Auth identity and every application row, then return to a clean guest workspace even when the success response is lost.
- **Notes:** Umbrella from S039. Complete T161.1–T161.5. User-facing data export is excluded.

### [T161.1] Implement the authenticated delete-account Edge Function

- **Area:** Supabase Edge Function
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Add `POST /functions/v1/delete-account` in plain JavaScript with JSDoc and runtime request validation; require a valid JWT, fetch trusted identity server-side, validate `currentPassword` plus exact `DELETE`, and use the service-role client only inside Supabase secrets to remove the Auth user.
- **Exit criteria:** Local function tests prove valid input returns `204` and cascades all application rows, while missing/invalid JWTs, malformed bodies, wrong confirmation, wrong passwords, and attempts to supply another identity are rejected; the service-role key is absent from app environment values and web bundles.
- **Notes:** From S039 and the roadmap Edge Function contract. Depends on T155.7 and T153.5.

### [T161.2] Harden deletion against abuse, leakage, and lost responses

- **Area:** Account deletion security
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Add per-user/IP rate limiting, current-password verification without retaining the resulting session, `Cache-Control: no-store`, structured redaction, and idempotent handling for a retry whose Auth user is already absent after a lost success response.
- **Exit criteria:** Function tests enforce the configured attempt limit for user and IP dimensions, expose no password/JWT/email/body in logs, include `no-store` on every response, never return the verification session, and treat a verified retry for an already-deleted identity as completed rather than recreating or leaking state.
- **Notes:** From S039. Depends on T161.1. Use a trusted server-side identity; never rate-limit or delete based on caller-supplied `user_id`.

### [T161.3] Prove cascade deletion and old-session denial

- **Area:** Account deletion testing
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Add backend acceptance tests for complete cascade cleanup and calls from anonymous, expired, wrong-user, stale, and pre-deletion sessions, including attempts to recreate rows with an old JWT.
- **Exit criteria:** Against a clean local reset, fixtures populate all six resources for two users; deleting user A removes only A, user B remains intact, every old user-A token is denied, foreign keys/policies prevent row recreation, and simulated response loss followed by retry converges on the same empty result.
- **Notes:** From S039. Depends on T161.2 and T155.8.

### [T161.4] Add the permanent account-deletion route

- **Area:** Account deletion UI
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Add `/app/profile/account/delete` with an explicit immediate/permanent warning, current-password field, exact typed `DELETE` confirmation, safe disabled/loading/error states, and invocation of the hardened Edge Function.
- **Exit criteria:** Route tests and a browser walkthrough confirm the action cannot submit without both confirmations, wrong/offline/rate-limited/expired states are actionable without leaking account facts, success cannot be double-submitted, and no password or token reaches logs, analytics, or the URL.
- **Notes:** From S039. Depends on T161.2 and T154.1. Do not add export or delayed-deletion semantics.

### [T161.5] Purge account state and reconcile deletion response loss

- **Area:** Account lifecycle / local persistence
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** On deletion success—or after a lost response when Auth verification proves the user no longer exists—remove credentials, account cache, outboxes, conflicts, import progress, and sync metadata, invalidate the identity generation, and enter a fresh guest namespace.
- **Exit criteria:** Integration tests cover normal success, response loss with missing user, response loss with user still present, offline retry, and a late in-flight sync result; completed deletion exposes no former account data to the new guest, does not erase unrelated guest/other-user namespaces, and cannot be reversed by stale work.
- **Notes:** From S039. Depends on T156.3, T158, T159.5, T160.2, and T161.4. AsyncStorage purge is accepted prototype cleanup, not claimed forensic erasure.

---

_Phase 5 consideration: no cross-platform account-hardening ticket is activated. S040 remains `Proposed` in [BACKLOG_STORIES.md](BACKLOG_STORIES.md) because [AGENTS.md](AGENTS.md) makes web the only active platform until mobile hardening is explicitly resumed. Native PKCE callbacks, SecureStore Auth storage, and iOS/Android verification therefore remain deliberately deferred rather than being disguised as actionable web work._

---

_Phase 6 activation: T162 comes from S041 and `BACKEND_ROADMAP.md` Phase 6. Its eight S-sized children turn “ready for first external account” into an inspectable hard gate: report-only then enforced CSP, CI scanning, hosted authorization/abuse review, production-environment reproduction, synthetic capacity evidence, a tested recovery decision, and explicit launch approval. It depends on completed Phase 1–4 evidence and does not claim that usage metrics exist before signup._

### [T162] Enforce the first-external-user launch gate

- **Area:** Security / operations
- **Priority:** High
- **Status:** Not started
- **Description:** Keep external signup disabled until web security, abuse controls, production isolation, deliverability, capacity, recovery, and the complete acceptance suite have recorded evidence.
- **Notes:** Umbrella from S041. Complete T162.1–T162.8 after the applicable T153–T161 work. This is a hard gate, not a speculative scale-up project.

### [T162.1] Deploy and evaluate a report-only Content Security Policy

- **Area:** Web security headers
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Add a minimally permissive report-only CSP for the static Expo/Vercel app, covering only required Daily Dama, Supabase, Vercel Analytics, font/asset, and development origins; audit raw-HTML sinks and sanitize or remove any path that could inject note/custom-trick content.
- **Exit criteria:** The production-like web export serves the report-only policy, automated header checks reject unlisted script/connect/frame origins, browser walkthroughs cover Auth and core app routes with no unexplained violations, and tests prove untrusted note/custom-trick text cannot become executable HTML.
- **Notes:** From S041 and roadmap client/web security. Depends on the final web Auth/sync origin set. Start report-only; enforcement is T162.2.

### [T162.2] Enforce CSP and the remaining defensive web headers

- **Area:** Web deployment security
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Promote the validated CSP to enforcement and add HSTS, `frame-ancestors`, `X-Content-Type-Options`, `Referrer-Policy`, and a restrictive `Permissions-Policy` through the deployed Vercel/static-host configuration.
- **Exit criteria:** Automated checks against a production preview confirm every HTML route returns the exact enforced headers, an inline/unlisted script and framing attempt are blocked, Auth callbacks and Supabase requests still work, and browser console/network inspection shows no new policy failures across the core web flow.
- **Notes:** From S041. Depends on T162.1. Preserve the static Expo Router rewrites documented in `DEPLOYMENT_HANDOFF.md` and `vercel.json`.

### [T162.3] Add dependency, secret, and built-bundle scanning to CI

- **Area:** CI security
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Extend `.github/workflows/ci.yml` with pinned, least-privilege dependency and secret scanning plus a built-web-bundle check for service-role keys, SMTP secrets, Auth sessions, and other forbidden server values.
- **Exit criteria:** CI passes on the clean repository, fails on representative committed-secret and generated-bundle fixtures in an isolated test, reports actionable locations without echoing secret values, and runs for pull requests to `development`/`main` without gaining write permissions.
- **Notes:** From S041 and roadmap client security. Select free tooling compatible with the existing GitHub workflow; do not add paid observability.

### [T162.4] Audit deployed Supabase authorization and Auth abuse controls

- **Area:** Supabase launch security
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Run Security Advisor, manually review exposed schemas/functions/grants/RLS, enable CAPTCHA, and verify Auth plus Edge Function rate limits before any external account is allowed.
- **Exit criteria:** A dated, secret-free launch record contains Security Advisor results, an operation-by-operation grants/RLS/function review, successful CAPTCHA challenge tests, measured Auth/delete-account rate-limit behavior, and zero unresolved High/Critical findings; raw cross-user negative tests pass against the hosted environment.
- **Notes:** From S041. Depends on T155.8, T153.13, and T161.3. Paid leaked-password protection remains unavailable under the free constraint.

### [T162.5] Reproduce the tested backend in the reserved production environment

- **Area:** Production backend / email
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Create the reserved production Supabase project from the tested migrations, configure only exact production redirects and secrets, reproduce Resend SMTP/DNS settings without seeding user data, and verify environment separation from development.
- **Exit criteria:** Production migration hashes/types match the tested source, only structural/static reference data exists, development credentials cannot access production and vice versa, SPF/DKIM/DMARC and no-link-tracking checks pass, and a controlled production signup/recovery/delete smoke test completes without exposing secrets.
- **Notes:** From S041. Depends on T153–T161 and T162.4. Creating this project is deliberately deferred until the schema and security suite are stable.

### [T162.6] Exercise representative multi-year capacity and pagination

- **Area:** Backend capacity validation
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Generate a representative synthetic account containing multi-year practice history plus realistic custom tricks, goals, notes, tombstones, and outbox churn; measure storage, query pagination, sync convergence, and Edge usage without real user data.
- **Exit criteria:** A reproducible script/report records fixture size, database bytes, request/egress counts, page counts, full and incremental sync duration, and deletion duration; all queries return deterministically beyond 1,000 rows and results identify any free-tier limit that would block the first 25 accounts.
- **Notes:** From S041 and roadmap Phase 6. Depends on T157–T161. This is a synthetic check, not speculative production optimization.

### [T162.7] Make and test the free-tier recovery decision

- **Area:** Data recovery operations
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Choose and document the acceptable pre-launch recovery procedure for Supabase Free, including off-site logical dumps, frequency, storage location, restoration ownership, and the explicit data-loss window; do not silently assume inaccessible automatic backups are sufficient.
- **Exit criteria:** A sanitized production-like logical dump is created off-site, restored into a fresh temporary project from documented commands, schema and row-count/checksum checks pass, measured recovery time and recovery-point objective are recorded, and the product owner explicitly accepts or rejects the resulting risk before signup is enabled.
- **Notes:** From S041. Depends on T162.5–T162.6. Backup automation remains optional until this decision shows it is necessary.

### [T162.8] Record launch approval and the first infrastructure-review trigger

- **Area:** Launch operations
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Assemble evidence from the complete backend/frontend/security verification matrix, keep external signup disabled until every hard gate is signed off, and define how the first review is triggered at 25 authenticated accounts or 30 days after first signup.
- **Exit criteria:** A dated launch checklist links passing evidence for Auth states, generic responses, offline/outbox recovery, sync races, cross-account isolation, merges, conflicts, deletion, grants/RLS, headers, deliverability, capacity, secret scans, and recovery; signup enablement is recorded only after all gates pass, and the earlier-of-25-accounts/30-days review has an owner and measurable inputs.
- **Notes:** From S041. Depends on T162.1–T162.7 and all applicable T153–T161 children. Metrics are operational counts only; no unsupported claim of existing-user behavior is permitted.
