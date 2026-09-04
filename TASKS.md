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

_All currently actionable backend-roadmap work is phase-gated and active in dependency order: Phase 1/Auth T153–T154, Phase 2 T155, Phase 3 T156–T160, Phase 4 T161, and the Phase 6 launch gate T162. T154 is the shared credential-maintenance prerequisite named by both Phase 1 and Phase 4, and is ordered before T158's guarded-logout integration. Phase 5 has no active ticket while native hardening is deferred. Supabase, unrestricted guest access, web PKCE, exact callbacks, local-first synchronization, immediate deletion, and the roadmap's security requirements are settled decisions._

_Phase 1/4 shared account-maintenance activation: T154 comes from S033 and the credential-maintenance/logout items repeated across `BACKEND_ROADMAP.md` Phases 1 and 4. It follows the core Auth routes and precedes Phase 3's T158 guarded logout, while account deletion stays separate in T161._

_Phase 2 activation: T155 comes from S034 and `BACKEND_ROADMAP.md` Phase 2. Its thirteen S-sized children establish the database security boundary, model all six resources, prove grants/RLS and constraints, generate typed repository contracts, and add pure runtime mappings before any provider synchronizes. The sequence is dependency-driven: schema and tests precede generated types and mappings; existing reducer authority, hydration fallback, and skipped-initial-write behavior remain unchanged._

---

_Phase 3 activation: T156–T160 come from S035–S038 and `BACKEND_ROADMAP.md` Phase 3. The dependency chain deliberately separates identity-partitioned persistence (T156), durable synchronization mechanics and ordered domain rollout (T157), outbox-aware logout (T158), resumable guest conversion (T159), and visible conflict recovery (T160). Each child owns one persistence, orchestration, domain, or UX boundary; Realtime remains deferred and synchronization may never alter the active Sesh state machine._

---

_Phase 4 activation: T161 comes from S039 and `BACKEND_ROADMAP.md` Phase 4. Its five S-sized children separate the privileged Edge Function boundary, abuse/leakage hardening, destructive-operation security acceptance tests, the confirmation UI, and identity-safe local cleanup/recovery. User-facing export and delayed deletion remain excluded._

---

_Phase 5 consideration: no cross-platform account-hardening ticket is activated. S040 remains `Proposed` in [BACKLOG_STORIES.md](BACKLOG_STORIES.md) because [AGENTS.md](AGENTS.md) makes web the only active platform until mobile hardening is explicitly resumed. Native PKCE callbacks, SecureStore Auth storage, and iOS/Android verification therefore remain deliberately deferred rather than being disguised as actionable web work._


---

_T182–T193 come from stories S063–S074 in [BACKLOG_STORIES.md](BACKLOG_STORIES.md) (the user's 2026-08-31 QA pass on PRs #224–256 — every T163–T181 item came back with a follow-up gap on the same already-`Done` ticket, plus six items of general feedback). T182 (S063, goal-card trick title), T183 (S064, signup-invite modal), T185 (S066, synced password-visibility icon), T190 (S071, hide sync status for guests), T191 (S072, auth-screen back buttons), T192 (S073, verification-email branding), and T193 (S074, forgot-password left-align) are `Implementer` — local, known-pattern changes, several reusing an existing precedent in this same codebase (T158's `logout-prompt.tsx` absolute-fill modal for T183; T181's "Back to Profile" button for T191). T184 (S065) is `Required`: tracing all four `/auth/*` screens confirmed each renders its primary form via `FormScroll` directly, never wrapped in `<Screen>` (T170's own Notes already flagged this gap) — `PageTitle`/`Introduction`/`Eyebrow` already resolve from `theme.text`/`theme.textMuted` via `typography.tsx`, but with no themed `Screen` background underneath them the only visible surface is `+html.tsx`'s static CSS, and `FieldInput`/`PasswordInput`'s field chrome use hardcoded `AppColors` instead of theme tokens. Wrapping the primary form in `<Screen>` on four screens without reintroducing T145's hydration-flicker fix is exactly the kind of provider/boundary risk this project's Planning rules reserve for `Required`. T189 (S070) is `Required` for the same class of reason: tracing `router.replace('/')`'s target confirmed `/`'s own `useRedirectOnboardedVisitorHome` reads `use-cached-onboarding-status.ts`, which — like `read-cached-theme-background.ts` — still reads only the legacy bare `USER_PROFILE_STORAGE_KEY` rather than the identity-scoped guest key T156.2 introduced; T170's Notes already flagged this exact gap as an "undiscovered gap flagged as a follow-up candidate," and both post-logout symptoms (wrong destination, un-reset theme) trace to it. T188 (S069) is `Required` because the `delete-account` Edge Function's 503 could not be attributed to an app-code defect from static tracing alone — `supabase/README.md` documents that the function needs a running local Supabase stack (`supabase start` + `db reset`), so this needs a runtime diagnosis pass, not a known fix applied locally. T186 (S067) and T187 (S068) are both `Required` M-chains: tracing `goal.ts`, `custom-trick.ts`, and `user-profile-persistence.ts` found no per-record `updatedAt` field in the profile, custom-trick, or goal domains (only `note.ts` already has one), so S068's "resolve by timestamp" premise needs that field added first — T187.1 adds it, T187.2 wires the automatic most-recent-wins resolution and removes `/app/profile/sync-conflicts` and `sync-conflict-list.tsx`. T186.1 covers the common empty-account signup path (`GuestImportPreview`'s own state-machine trace confirmed a brand-new account has no cloud data yet, so `uploading -> completed` never touches `awaitingProfileChoice`/`conflicts`), auto-triggering `confirmImport()`, deleting the preview UI, and gating onboarding on existing local data. T186.2 (existing-account guest imports that do reach a profile-choice or conflict state) depends on T187.2's automatic-resolution primitive and is ordered after it.

---

_T194–T206 come from stories S075–S088 in [BACKLOG_STORIES.md](BACKLOG_STORIES.md) (the user's 2026-09-01 QA pass on T182–T193). T194 (S075), T196 (S077), T198 (S079 partial + S088), T202 (S083), T203 (S084), T204 (S085), and T205 (S086) are `Implementer` — local, known-pattern changes. T201 combines S081 and S082 into one ticket because both edit the same `PostSeshSignupInvite`/`InviteOverlay` block in `sesh.tsx`; splitting them would mean two PRs colliding on the same lines for no benefit. T195 (S076) and T197 (S078) are `Required`: tracing `supabase/README.md:281` ("This config is local-only. It does not touch the hosted Supabase project") shows T192's and T188's local-stack verification never actually reached whatever environment the user's real signups and deletions hit, so both need a fresh diagnosis pass against that real environment rather than a known local fix reapplied. T199 (S079 remainder) and T206 (S087) are `Required` for the same class of reason as T188/T189 before them: both are post-auth-identity-change render/redirect races (guest→user after import for T199, sign-in to an existing populated account for T206) that need runtime tracing through `UserProfileProvider`'s hydration and the sync coordinator before a fix can be written, not a known pattern applied locally. T200 (S080) is `Required` because it adds a new pre-onboarding entry point into routing (`landing-cta.tsx`/`use-cached-onboarding-status.ts`) that several prior tickets (T112.5, T145, T170, T189) have already shown is easy to get wrong around hydration and redirect ordering. T204 depends on T203 landing first (both touch `AccountSection`'s contents, T203 removing its "Delete account" button and T204 relocating what remains).

---

_T208–T215 come from stories S090–S097 in [BACKLOG_STORIES.md](BACKLOG_STORIES.md) (the user's 2026-09-02 QA pass on T195/T201/T205/T207, plus three items of general feedback). T209 (S091), T210 (S092), T211 (S093), T213 (S095), and T214 (S096) are `Implementer` — local, known-pattern changes, several reusing an existing precedent in this codebase (T205's `DisplayTitle` title style for T209; `RankUpCelebrationModal`'s `theme.accent` precedent for T211; `trick-goals-screen.tsx`'s `GoalHeaderRow`/`GoalTrickName` pattern for T214). T208 (S090) is `Required`: it mounts a new full-screen overlay above `<Slot />` in `_layout.tsx` and introduces `useGlobalSearchParams`, which has no precedent anywhere in this codebase today — both are boundary-level changes per this project's Planning rules, even though the celebration visual mechanism itself already exists via `RankUpCelebrationModal`. T212 (S094) is `Required` because T195's confirmed-working hosted-project fix (`supabase/RESEND_DNS_AUTH.md`'s 2026-09-01 entry) has now regressed — this needs a fresh runtime diagnosis of why the fix didn't hold, not a repeat of the same PATCH. T215 (S097) is `Required` for the same class of reason as T199/T206 before it: `StatsScreen` renders synchronously off `usePracticeHistory().sessions` with no guest-import-pending gate, unlike `home.tsx`'s existing `isGuestImportPendingResolution` check — this needs runtime tracing to confirm whether the same gate suffices for Stats before a fix can be written.

### [T208] Replace Home's new-account banner with a global, celebration-style acknowledgment

- **Area:** Home / Authentication
- **Priority:** Medium
- **Status:** Not started
- **Planning:** Required
- **Description:** Replace `home.tsx`'s locally-scoped `NewAccountBanner` (added by T207) with a full-screen, auto-dismissing acknowledgment mounted at the root layout (`src/app/_layout.tsx`), reusing `RankUpCelebrationModal`'s visual pattern (theme-derived full-bleed overlay, `OnboardingRankRevealStep`-style layout) with its own "welcome/verified" copy — not the trick-lace celebration copy or component instance. `auth-callback-screen.tsx`'s existing `newAccount=1` redirect param stays the trigger; since no route-scoped `useLocalSearchParams` read is available above `<Slot />`, the root layout reads it via `useGlobalSearchParams` and strips it the same way `home.tsx` does today.
- **Exit criteria:** A new test at the root-layout level (or an equivalent integration test) asserts the acknowledgment overlay renders once when `newAccount=1` is present anywhere in the URL and never on a routine sign-in redirect; `home.test.tsx`'s now-removed `NewAccountBanner` cases are deleted rather than left dangling. Confirmed in-browser: completing signup + email verification through the real callback link shows the full-screen overlay regardless of what's rendered under it (Home content or onboarding), it auto-dismisses without requiring a tap, appears exactly once, and a regular sign-in shows nothing. Additionally: the overlay's text remains legible (fixed, theme-independent text color) against at least two different accent-color theme presets, it animates in on appearance and fades out on its own within a few seconds with no tap required, and dismissal never requires a manual page refresh.
- **Notes:** From S090. Direction confirmed with the user 2026-09-02: reuse the presentation *mechanism* (full-screen overlay, theme-derived styling per `RankUpCelebrationModal`'s precedent) and *visual identity*, not the trick-lace copy or component instance. Pick an auto-dismiss duration that doesn't reintroduce T145-class flicker risk. Folded in from S101 (2026-09-03 QA on this exact banner, filed before T208 replaces it): ensure the overlay's text stays legible regardless of the active theme — `OnboardingRankRevealStep`'s existing `RevealTitle`/`AppColors.ink` precedent (fixed dark text over a theme-derived background) already does this and should carry over — and reuse `sesh.tsx`'s existing `CelebrationBanner` fade/scale timer pattern (`CELEBRATION_VISIBLE_MS`/`CELEBRATION_FADE_MS`, its `fadeTimer`/`removeTimer` `setTimeout` pair) for the enter/exit animation rather than inventing a new approach. Addressed here instead of a separate ticket because T208 deletes `NewAccountBanner` outright — a standalone fix targeting that soon-to-be-deleted code would be wasted work.

### [T216] Add a branded template for the email-change confirmation

- **Area:** Authentication / Supabase
- **Priority:** Medium
- **Status:** Not started
- **Planning:** Implementer
- **Description:** `AccountSecurityScreen`'s `changeEmail` flow (`auth-provider.tsx:233`) calls `client.auth.updateUser({ email: newEmail })`, which sends GoTrue's confirm-new-email message — the only other Auth email actually reachable through the app today besides signup confirmation and password recovery. Unlike those two, it still uses Supabase's generic default copy: the hosted project's `mailer_templates_custom_contents.MAILER_TEMPLATES_EMAIL_CHANGE_CONTENT` is `false`. Add `supabase/templates/email_change.html` following `confirmation.html`/`recovery.html`'s existing pattern (same branding elements, fully inline-styled, no `<style>` block or external resources) and wire it in `config.toml` via `[auth.email.template.email_change]`, then apply it to the hosted project the same way T153.3/T195 did.
- **Exit criteria:** Local: Mailpit receives the new template for a local email-change request, matching `confirmation.html`/`recovery.html`'s branding (cream/paper background, ink border, hard drop shadow, red uppercase eyebrow, ink-background/yellow-text button). Hosted: per `supabase/README.md`'s "Troubleshooting: Mailpit isn't proof of hosted email delivery" note, verify the *hosted* project separately — either a real `changeEmail` request's delivered message or, more directly, Resend's own delivery log for that send — not Mailpit alone.

---

_T219–T224 come from stories S098–S104 in [BACKLOG_STORIES.md](BACKLOG_STORIES.md) (the user's 2026-09-03 QA pass on T210/T213/T217.2, plus general feedback not tied to a specific ticket). T219 (S098), T220 (S099), and T222 (S102) are `Implementer` — local, known-pattern changes reusing existing precedent in this codebase (T210's own `InlineSignupInvite` placement for T219; T213/T214's typographic-parity bumps for T220). T221 (S100) is `Required`: both `feedback-screen.tsx`'s success-state branch and `submit-feedback.ts`'s insert call look correct on inspection, so the QA-reported failure needs a fresh runtime diagnosis against the real environment the user tested in, matching the class of bug already established for T188/T195/T199/T206/T212 rather than a known local fix reapplied. T223 (S103) is an M-chain: no shared themed text-input component exists anywhere in the codebase today (`src/components/ui/` holds only `button.tsx`/`screen.tsx`/`typography.tsx`; every screen currently defines its own local styled `TextInput`), so T223.1 is `Required` to introduce that new shared UI primitive (mirroring `button.tsx`'s own precedent) and apply it to the Authentication area the original QA note explicitly named; T223.2–T223.8 mechanically apply the resulting component to the remaining areas (Feedback, Sesh, Trick notes, Tricks, Trick goals, Onboarding, Profile) once it exists and are `Implementer`. T224 (S104) is `Implementer`: it adds a minimum-visible-duration delay to `auth-callback-screen.tsx`'s existing default-branch redirect only, deliberately not touching its error/recovery/email-change branches. S101 (the new-account banner's readability/persistence/animation problems) was not scoped as its own ticket — it targets `home.tsx`'s `NewAccountBanner`, which T208 (already `Not started` above) replaces outright with a new full-screen overlay; S101's requirements were folded into T208's own Description/Exit criteria/Notes instead, to avoid writing a ticket against code T208 is about to delete.

### [T221] Diagnose and fix the feedback form's missing success state

- **Area:** Feedback
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** `feedback-screen.tsx`'s success-state branch (rendered once `submitFeedback` resolves `status: 'succeeded'`) and `submit-feedback.ts`'s insert call both look correct on inspection — the QA-reported failure (no success state after submitting a real Message) needs a fresh runtime diagnosis against the actual environment the user tested in, not a known local fix reapplied. Determine whether the anon insert itself is failing (RLS/config drift since T217.1, a missing or misconfigured Supabase env var in that environment) or whether a successful insert isn't triggering the UI's `submitted` state, then fix the actual defect found.
- **Exit criteria:** Reproduce the failure against the same environment/build the user tested (not just the local Supabase CLI stack T217.2 already verified against) — confirm whether `submitFeedback` resolves `failed` (capture the real Postgrest/network error if so) or `succeeded` with the UI not updating. Fix whichever is broken. Confirm afterward, on that same environment, that submitting a Message-only feedback form shows the success state and that a real row is visible via Supabase Studio or a direct DB read.
- **Notes:** From S100. Bug fix on already-`Done` T217.2, not new scope. `Required` for the same class of reason as T188/T195/T199/T206/T212: the defect wasn't visible from static tracing of the shipped code, so it needs runtime diagnosis before a fix can be written.

### [T223] Restyle text inputs app-wide with a shared component

- **Area:** Shared UI
- **Priority:** Medium
- **Status:** Not started
- **Description:** Umbrella for T223.1–T223.8. No shared themed text-input component exists anywhere in the codebase (`src/components/ui/` holds `button.tsx`/`screen.tsx`/`typography.tsx` but no input equivalent) — every screen currently defines its own local styled `TextInput` (the auth screens' `FieldInput`/`PasswordInput`, `feedback-screen.tsx`'s `FieldInput`/`MessageInput`, `sesh.tsx`'s `NotePromptInput`, and others across Notes, Tricks, Goals, Onboarding, and Profile). Introduce one shared, polished, theme-consistent text-input component and apply it everywhere a `TextInput` currently renders, per the user's explicit request to cover every text input in the app.
- **Notes:** From S103. Split by feature area per this file's single-area scoping rule; no exit criteria of its own — done when every child is `Done`.

### [T223.7] Apply the shared text-input component to Onboarding

- **Area:** Onboarding
- **Priority:** Medium
- **Status:** Not started
- **Planning:** Implementer
- **Description:** Apply T223.1's shared text-input component to `onboarding-duration-step.tsx`.
- **Exit criteria:** Its existing tests still pass. Confirmed in-browser that the onboarding duration input matches the new shared style.
- **Notes:** From S103, child 7 of 8. Depends on T223.1.

### [T223.8] Apply the shared text-input component to Profile

- **Area:** Profile
- **Priority:** Medium
- **Status:** Not started
- **Planning:** Implementer
- **Description:** Apply T223.1's shared text-input component to `app/app/profile/index.tsx` and `theme-color-picker.tsx`.
- **Exit criteria:** Their existing tests still pass. Confirmed in-browser that Profile's text inputs match the new shared style.
- **Notes:** From S103, child 8 of 8 — last child, so completing it also flips the T223 umbrella to `Done`. Depends on T223.1.

### [T224] Hold the post-verification callback screen visible briefly before entering Home

- **Area:** Authentication
- **Priority:** Low
- **Status:** Not started
- **Planning:** Implementer
- **Description:** `auth-callback-screen.tsx`'s default-branch success path (signup email verification) calls `router.replace({ pathname: '/app/home', params: { newAccount: '1' } })` immediately once `exchangeCodeForSession` resolves, which can happen fast enough that the transitional screen flashes. Add a minimum-visible-duration floor (a fixed constant, in the style of `sesh.tsx`'s existing `CELEBRATION_VISIBLE_MS`) before that specific `router.replace` call only, measured from when the effect starts — never adding extra delay on top of an already-slow exchange.
- **Exit criteria:** `auth-callback-screen.test.tsx` passes with a case (fake timers) asserting the default-branch redirect does not fire before the minimum duration elapses even when `exchangeCodeForSession` resolves instantly, and does fire once it does. The error, `recovery`, and `email_change` branches' existing redirect-timing tests still pass unmodified. Confirmed in-browser that a fast signup-verification round trip still shows the callback screen briefly before landing on Home.
- **Notes:** From S104. Deliberately scoped to the default branch only — the routine sign-in redirect (`sign-in-screen.tsx`) and the callback screen's other branches (error, recovery, email-change) are unaffected and shouldn't gain an artificial delay without reason.
