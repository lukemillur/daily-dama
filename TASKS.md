# Tasks

Working backlog for Daily Dama **core-functionality** work. This file is the checkpoint mechanism: a session — including a fresh one after context compaction — reads it top to bottom to know what's done, what's next, and how to verify it, instead of relying on conversation memory or a todo list that only exists in-context.

**Scope note:** Trick visualization (`src/features/trick-viz/`) is intentionally excluded from this file right now. Its own backlog lives in [TRICK_VIZ_HANDOFF.md](TRICK_VIZ_HANDOFF.md) §15. Do not pull items from there into this file unless explicitly told to resume that thread.

**Automation note:** [TASKS_BACKLOG.md](TASKS_BACKLOG.md) holds scoped, ready-to-work tasks that are deliberately kept out of this file so the `newTicket` workflow (`.claude/skills/newTicket/SKILL.md`) never claims, plans, or implements them automatically. Moving an entry between the two files is a deliberate human decision, not something to do as a side effect of other work.

**Collaborative queue:** [TASKS_COLLABORATIVE.md](TASKS_COLLABORATIVE.md) holds tickets requiring owner decisions or external verification, executed one at a time with `$guided-ticket`. It is excluded from automatic claiming. Allocate new IDs across all three queues and `TASKS_DONE.md`. Existing claimed tickets remain with their current workflow; the new queue records any residual follow-up explicitly.

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

---

_T249–T252 come from stories S119–S122 in [BACKLOG_STORIES.md](BACKLOG_STORIES.md) (the user's 2026-09-08 QA pass on T208/T241, plus two general-feedback items describing one consistent rule, combined into S122/T252). T249 (S119) is `Required`: T208's overlay wiring (`useGlobalSearchParams` read in `_layout.tsx`, `auth-callback-screen.tsx`'s `newAccount=1` redirect param) looks correct on inspection but doesn't render in the flow the user tested — the same class of gap as T212/T221/T237, needing runtime diagnosis before a fix. T250 (S120) is `Implementer`: a color-only swap between `text-field.tsx`'s existing border and shadow expressions, the same narrow scope T241 itself shipped. T251 (S121) is `Implementer`: a mechanical rule change to the existing `password-policy.ts`/`validateNewPassword` shape, applied to both signup and reset-password since they already share that module (flagged in the story as an assumption, not explicitly requested). T252 (S122) is `Required`, matching this project's established precedent for reading onboarding/auth state into routing or copy decisions (T200, T242, T243) — it reuses `useCachedOnboardingStatus()` exactly as T242/T243 already do, but on two new call sites (Sign up, Sign in) that don't read that state today._

### [T249] Diagnose and fix the new-account welcome overlay not appearing

- **Area:** Authentication / Home
- **Priority:** High
- **Status:** In progress
- **Planning:** Required
- **Description:** T208's `NewAccountWelcomeOverlay` (mounted in `src/app/_layout.tsx`, triggered by `auth-callback-screen.tsx`'s `router.replace({ pathname: '/app/home', params: { newAccount: '1' } })` on the default post-verification branch) does not render at all in the flow the user tested, even though T208's own browser verification passed when it shipped and the wiring looks correct on inspection today. Needs a fresh runtime diagnosis against the actual environment/flow the user tested, then a fix for whatever's actually broken.
- **Exit criteria:** Reproduce the failure via a real signup + email-confirmation-link round trip (in the environment the user tested in, if that differs from the local Supabase CLI stack T208 verified against). Identify the actual cause — e.g. the `newAccount` param never reaching `_layout.tsx` (stripped upstream, or interference from a hosting/rewrite layer on the dynamic `/app/home?newAccount=1` URL — see T227), a timing/state regression from a later change touching the callback screen (T224/T236), or something else — and fix it. Confirm afterward that the overlay renders exactly once on a real verification round trip and not on a routine sign-in, matching T208's original exit criteria.
- **Notes:** From S119. Follow-up regression/gap on `Done` ticket T208. `Required` for the same class of reason as T212/T221/T237: the code looks correct from static inspection, so this needs runtime diagnosis before a fix can be written, not a blind reapplication of T208's original approach.

### [T250] Swap the shared text input's border and shadow colors

- **Area:** UI components
- **Priority:** Low
- **Status:** Not started
- **Planning:** Implementer
- **Description:** `text-field.tsx`'s `InputRow` currently renders its border in an opaque theme color (`theme.text` unfocused, `theme.accent` focused) and its drop shadow in a separate, focus-independent translucent color (`inputShadow(theme.text)`, `SHADOW_ALPHA = 0.35`). Swap which color expression drives which visual: the border should render using the color/alpha currently applied to the shadow, and the shadow should render using the color currently applied to the border — preserving the existing accent-on-focus distinction on whichever role now carries it.
- **Exit criteria:** Confirmed in-browser (Sign up and at least one other `TextField`-using screen) that the border now renders in the color/translucency previously used for the shadow, the drop shadow now renders in the color previously used for the border, and focus still produces a visibly distinct state. No other functional change to any input. `text-field.test.tsx` and dependent screen tests still pass.
- **Notes:** From S120. Follow-up color-only gap on `Done` ticket T241 — same "one shared-component change, no per-screen verification needed beyond a couple of spot checks" scope T241 itself established.

### [T251] Require password complexity at signup and reset

- **Area:** Authentication
- **Priority:** Medium
- **Status:** Not started
- **Planning:** Implementer
- **Description:** Replace `password-policy.ts`'s current rule (`MIN_PASSWORD_LENGTH = 10`, length-only) with: at least 8 characters, at least one uppercase letter, at least one number, and at least one symbol. Update `sign-up-screen.tsx`'s password hint text and any related validation error copy to state these actual rules instead of just a character count.
- **Exit criteria:** `validateNewPassword` rejects a password missing any one of the four rules and accepts one satisfying all four, with test coverage for each rule individually and combined. Submitting a password failing any rule on the Sign up screen shows an error identifying what's missing, before a network round trip. The Sign up screen's password hint states all four rules. `yarn tsc --noEmit` passes; existing signup/reset-password screen tests pass with copy assertions updated to the new hint/error text.
- **Notes:** From S121. `password-policy.ts` is shared by `sign-up-screen.tsx` and `reset-password-screen.tsx` via `validateNewPassword` — this ticket applies the new rule to both flows for consistency, since they already share the module. The user's request named only the signup screen's copy; this shared-scope choice was flagged in the story as an assumption pending confirmation. If reset-password should keep the old length-only rule instead, resolve that before implementing rather than deciding it silently here.

### [T252] Add onboarding-aware guest/back-to-app button parity to Sign up and Sign in

- **Area:** Authentication
- **Priority:** Medium
- **Status:** Not started
- **Planning:** Required
- **Description:** Add a guest/back-to-app button to `sign-up-screen.tsx` (which has none today) and make `sign-in-screen.tsx`'s existing "Continue as guest" button onboarding-status-aware. On both screens, read `useCachedOnboardingStatus()` (the same hook `landing-cta.tsx`/`landing-auth-cta.tsx` already use per T242/T243) and render "Continue as guest" when `hasCompletedOnboarding` is false, or "Back to app" when true; both labels perform the same action the current guest button performs (`router.replace('/app/home')`).
- **Exit criteria:** A test on each screen asserts the button reads "Continue as guest" when the cached onboarding status is incomplete and "Back to app" when complete, navigating to `/app/home` on press in both cases. Confirmed in-browser on both Sign up and Sign in with a guest-onboarded browser profile (button reads "Back to app") and a non-onboarded one (button reads "Continue as guest").
- **Notes:** From S122, combining two general-feedback items that described one consistent rule across both screens (the second item's wording repeated "sign up screen" where context implies "sign in screen" — treated as the same rule applied to both, not a third distinct behavior; confirm with the user if a screen-specific difference was actually intended). `Required`, matching this project's established precedent for reading onboarding/auth state into routing or copy decisions (T200, T242, T243). `useCachedOnboardingStatus` only reads the guest-scoped profile key (per T243's own note on this exact gap) — confirm during planning whether that's sufficient for a signed-in user reaching these screens, or whether it needs the same handling T243 worked out for the landing page. The Sign up screen has no guest button today, so this is a net-new addition there, not just a label change.

---

_T247–T248.2 come from critical findings D001–D002 in [DESLOPPIFY.md](DESLOPPIFY.md). The other critical findings remain owned by T226–T229 and were not duplicated. T247 closes the fail-open discard path first; T248 then builds general local-durability reporting and recovery on its typed persistence outcome. These tickets extend T158/T160 without reopening their completed scope._

_T208–T215 come from stories S090–S097 in [BACKLOG_STORIES.md](BACKLOG_STORIES.md) (the user's 2026-09-02 QA pass on T195/T201/T205/T207, plus three items of general feedback). T209 (S091), T210 (S092), T211 (S093), T213 (S095), and T214 (S096) are `Implementer` — local, known-pattern changes, several reusing an existing precedent in this codebase (T205's `DisplayTitle` title style for T209; `RankUpCelebrationModal`'s `theme.accent` precedent for T211; `trick-goals-screen.tsx`'s `GoalHeaderRow`/`GoalTrickName` pattern for T214). T208 (S090) is `Required`: it mounts a new full-screen overlay above `<Slot />` in `_layout.tsx` and introduces `useGlobalSearchParams`, which has no precedent anywhere in this codebase today — both are boundary-level changes per this project's Planning rules, even though the celebration visual mechanism itself already exists via `RankUpCelebrationModal`. T212 (S094) is `Required` because T195's confirmed-working hosted-project fix (`supabase/RESEND_DNS_AUTH.md`'s 2026-09-01 entry) has now regressed — this needs a fresh runtime diagnosis of why the fix didn't hold, not a repeat of the same PATCH. T215 (S097) is `Required` for the same class of reason as T199/T206 before it: `StatsScreen` renders synchronously off `usePracticeHistory().sessions` with no guest-import-pending gate, unlike `home.tsx`'s existing `isGuestImportPendingResolution` check — this needs runtime tracing to confirm whether the same gate suffices for Stats before a fix can be written._

_T219–T224 come from stories S098–S104 in [BACKLOG_STORIES.md](BACKLOG_STORIES.md) (the user's 2026-09-03 QA pass on T210/T213/T217.2, plus general feedback not tied to a specific ticket). T219 (S098), T220 (S099), and T222 (S102) are `Implementer` — local, known-pattern changes reusing existing precedent in this codebase (T210's own `InlineSignupInvite` placement for T219; T213/T214's typographic-parity bumps for T220). T221 (S100) is `Required`: both `feedback-screen.tsx`'s success-state branch and `submit-feedback.ts`'s insert call look correct on inspection, so the QA-reported failure needs a fresh runtime diagnosis against the real environment the user tested in, matching the class of bug already established for T188/T195/T199/T206/T212 rather than a known local fix reapplied. T223 (S103) is an M-chain: no shared themed text-input component exists anywhere in the codebase today (`src/components/ui/` holds only `button.tsx`/`screen.tsx`/`typography.tsx`; every screen currently defines its own local styled `TextInput`), so T223.1 is `Required` to introduce that new shared UI primitive (mirroring `button.tsx`'s own precedent) and apply it to the Authentication area the original QA note explicitly named; T223.2–T223.8 mechanically apply the resulting component to the remaining areas (Feedback, Sesh, Trick notes, Tricks, Trick goals, Onboarding, Profile) once it exists and are `Implementer`. T224 (S104) is `Implementer`: it adds a minimum-visible-duration delay to `auth-callback-screen.tsx`'s existing default-branch redirect only, deliberately not touching its error/recovery/email-change branches. S101 (the new-account banner's readability/persistence/animation problems) was not scoped as its own ticket — it targets `home.tsx`'s `NewAccountBanner`, which T208 (already `Not started` above) replaces outright with a new full-screen overlay; S101's requirements were folded into T208's own Description/Exit criteria/Notes instead, to avoid writing a ticket against code T208 is about to delete.

### [T221] Diagnose and fix the feedback form's missing success state

- **Area:** Feedback
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** `feedback-screen.tsx`'s success-state branch (rendered once `submitFeedback` resolves `status: 'succeeded'`) and `submit-feedback.ts`'s insert call both look correct on inspection — the QA-reported failure (no success state after submitting a real Message) needs a fresh runtime diagnosis against the actual environment the user tested in, not a known local fix reapplied. Determine whether the anon insert itself is failing (RLS/config drift since T217.1, a missing or misconfigured Supabase env var in that environment) or whether a successful insert isn't triggering the UI's `submitted` state, then fix the actual defect found.
- **Exit criteria:** Reproduce the failure against the same environment/build the user tested (not just the local Supabase CLI stack T217.2 already verified against) — confirm whether `submitFeedback` resolves `failed` (capture the real Postgrest/network error if so) or `succeeded` with the UI not updating. Fix whichever is broken. Confirm afterward, on that same environment, that submitting a Message-only feedback form shows the success state and that a real row is visible via Supabase Studio or a direct DB read.
- **Notes:** From S100. Bug fix on already-`Done` T217.2, not new scope. `Required` for the same class of reason as T188/T195/T199/T206/T212: the defect wasn't visible from static tracing of the shipped code, so it needs runtime diagnosis before a fix can be written.


_T236–T246 come from stories S106–S118 in [BACKLOG_STORIES.md](BACKLOG_STORIES.md) (the user's 2026-09-04 QA pass on T224/T223.8, plus eleven items of general feedback). T236 (S106), T240 (S112), T241 (S113), T244 (S116), T245 (S117), and T246 (S118) are `Implementer` — local, known-pattern changes: T236 mirrors T224's own precedent exactly (`CALLBACK_MIN_VISIBLE_MS`); T241 mirrors `landing-cta.tsx`'s existing explicit-`style`-prop `boxShadow` pattern (documented inline there, since styled-components/native's CSS shorthand lowers to deprecated RN shadow props); T240 has an existing `fill`/`$fill` width-100% prop on `button.tsx` to reuse. T237 (S107) is `Implementer` despite needing a diagnosis first: tracing `theme-color-picker.tsx` and `text-field.tsx` shows the swatch is already wired through as `TextField`'s `rightAccessory` exactly as T223.8's own notes describe, so the defect is a rendering/layout issue only visible in-browser, not a missing wiring change — genuinely local once found, no architectural risk. T238 (S108+S109+S110) merges three landing-page screenshot stories into one ticket because they'd otherwise recapture the same screenshots twice in two separate passes — `product-manager`'s own notes on S108/S109/S110 flagged this overlap. T239 (S111) is `Required`: `sesh.tsx`'s target-laces field (`targetLandingCount`, line 434-444) has no persistence today, and per `AGENTS.md`'s three-domain state boundary, deciding which existing domain (or a new field on one) owns this value is a persistence-shape decision, not a local styling fix. T242 (S114) and T243 (S115) are both `Required`: T242 reverses a documented deliberate design decision in `landing-auth-cta.tsx` (its own doc comment: "renders nothing once a visitor is authenticated") and adds a new authenticated-only UI surface plus a logout action on a route several prior tickets (T145, T170, T189, T200) have already shown is easy to get wrong around hydration/redirect ordering; T243 changes `landing-cta.tsx`'s copy-selection logic to read `useAuthState()` alongside or instead of `useCachedOnboardingStatus()`, the same class of routing/auth-state boundary risk T200 was scoped `Required` for.

---

_Ship-readiness batch approved 2026-09-04, from `SHIP_READINESS_AUDIT.md`: A1 → T225, A4 → T228, A9 → T233 are autonomous work. A2/A3/A5/A6/A7/A8/A10/A11 → T226/T227/T229/T230/T231/T232/T234/T235 live in `TASKS_COLLABORATIVE.md`. The audit describes a historical snapshot, not this checkout or a selected release. These entries do not restore the removed T162 Phase 6 launch gate; older phase-gating prose above is historical and superseded by the revised audit scope._


---
