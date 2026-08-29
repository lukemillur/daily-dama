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

_Phase 6 activation: T162 comes from S041 and `BACKEND_ROADMAP.md` Phase 6. Its eight S-sized children turn “ready for first external account” into an inspectable hard gate: report-only then enforced CSP, CI scanning, hosted authorization/abuse review, production-environment reproduction, synthetic capacity evidence, a tested recovery decision, and explicit launch approval. It depends on completed Phase 1–4 evidence and does not claim that usage metrics exist before signup._

### [T162] Enforce the first-external-user launch gate

- **Area:** Security / operations
- **Priority:** High
- **Status:** Not started
- **Description:** Keep external signup disabled until web security, abuse controls, production isolation, deliverability, capacity, recovery, and the complete acceptance suite have recorded evidence.
- **Notes:** Umbrella from S041. Complete T162.1–T162.8 after the applicable T153–T161 work. This is a hard gate, not a speculative scale-up project.

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


_T163–T181 come from stories S042–S062 in [BACKLOG_STORIES.md](BACKLOG_STORIES.md) (the user's 2026-08-25 QA pass on the Full-Batch of PR #158–223 — four follow-up gaps on already-`Done` T144/T146/T153.12, plus general feedback mostly on onboarding and Auth/Account UI), refined by `product-manager` and scoped in this pass. Two stories were not scoped: **S051** (email-format validation at signup) traces to `validateSignUpFields`/`getEmailValidationError`, already wired into `sign-up-screen.tsx` and shown as field-level error text — the story's premise already holds, flagged back the same way S006 was. **S057** (enforce email uniqueness with a distinguishing message) was sent back, not scoped: `sign-up-screen.tsx` deliberately routes a duplicate-account signup through the *identical* success path as a real signup, by design, specifically to avoid becoming an email-enumeration oracle — the story's acceptance criteria asks for exactly the distinguishable response that design avoids. See both stories' Notes in `BACKLOG_STORIES.md`.  No umbrella tasks were needed — every scoped story reduced to one independent S-sized ticket. T164 (S043, onboarding background), T166 (S045, recurring guest invite), T169 (S048, checkmark alignment), T172 (S052, Account Security theming), T173 (S053, tab titles), T174 (S054, forgot-password layout), T175 (S055, logout destination), T177 (S058, sign-in/sign-up cross-links), T178 (S059, Enter-to-submit), T180 (S061, conditional forgot-password), and T181 (S062, Account Security back control) are `Implementer` — genuinely local, one- or two-file changes with a known pattern already used elsewhere in the app. T163 (S042), T165 (S044), T167 (S046), T171 (S050), and T176 (S056) are also `Implementer`-sized in isolation but are noted individually below where a nuance is worth flagging. T168 (S047), T170 (S049), and T179 (S060) are `Required`: T168 because `trick-directory.tsx`'s row is a shared, multi-consumer component with several mutually exclusive nested interactive children across its call sites, not a narrow single-purpose card like `GoalRow`; T170 because it's an architectural fix to which theme provider the `/auth/*` route group mounts under, not a local screen change; T179 because it changes `AuthProvider`'s `changeEmail` action signature, a shared Auth-actions surface. T167 (S046) is additionally `Required` because — like T146 before it — it changes onboarding's own step sequence, which this project's Planning rules call out for a separate pass regardless of size. T176 (S056) is `Required` because tracing the code surfaced no obvious defect (no stale closure, no missing dependency) — it needs a runtime timing investigation, not a known fix applied locally. T170 (S049) is the shared root cause behind the sign-up/sign-in/forgot-password/reset-password background problem QA reported only on sign-up; its Notes explain why all four are fixed together. T174 (S054, forgot-password layout) depends on T170 for its background half; T174 itself only covers spacing/alignment. T164 and T165 both touch `onboarding-theme-step.tsx`/`kentei-onboarding.tsx` and are independent but worth doing together to avoid re-testing the same screen twice, mirroring the T147/T148 precedent. T166 (S045) extends T153.12's existing `isFirstEverRegularSession`/`selectRegularSessions` model rather than adding new counting infrastructure._

### [T173] Show the current section in the web tab title

- **Area:** Navigation / web
- **Priority:** Low
- **Status:** Not started
- **Planning:** Implementer
- **Description:** No per-route title mechanism exists today (only the static "Daily Dama" from `app.json`). Add `expo-router/head`'s `<Head><title>...</title></Head>` to each of the five primary section routes (Home, Sesh, Tricks, Stats, Profile), rendering "Daily Dama: <Section>".
- **Exit criteria:** `yarn expo export --platform web --output-dir /tmp/daily-dama-web-export` succeeds and the exported HTML for each of the five section routes contains its expected `<title>` text; confirmed in-browser that navigating between sections updates the browser tab title.
- **Notes:** From S053. Web-only by nature — no native/mobile conflict. Five small, identical additions rather than one shared mechanism, since each route already renders independently.

### [T175] Send the user to the landing page after logout

- **Area:** Authentication
- **Priority:** Medium
- **Status:** In progress
- **Planning:** Implementer
- **Description:** `account-section.tsx`'s `handleLogOut` calls `signOut()` but performs no navigation today — the user stays wherever they were (typically Profile) once `AuthProvider`'s listener flips them to `guest`. Add an explicit `router.replace('/')` on successful sign-out.
- **Exit criteria:** `account-section.test.tsx` passes, including a test asserting a successful sign-out navigates to `/`.
- **Notes:** From S055. Check this doesn't conflict with T158 (guarded logout prompt) once that lands — this ticket only concerns where a *completed* sign-out navigates.

### [T177] Let users move between sign-in and sign-up

- **Area:** Authentication UI
- **Priority:** Medium
- **Status:** Not started
- **Planning:** Implementer
- **Description:** `sign-in-screen.tsx` links to forgot-password and guest continuation but not to sign-up; `sign-up-screen.tsx` has no link back to sign-in at all. Add a visible link each way.
- **Exit criteria:** Component tests for both screens pass, including one asserting each screen's cross-link navigates to the other's route.
- **Notes:** From S058. Small, low-risk addition — no existing behavior changes.

### [T178] Let Enter submit the sign-up and sign-in forms on web

- **Area:** Authentication UI
- **Priority:** Low
- **Status:** Not started
- **Planning:** Implementer
- **Description:** Neither `sign-up-screen.tsx` nor `sign-in-screen.tsx` has any `onSubmitEditing`/web-Enter handling today. Add both: RN `onSubmitEditing` on each field advancing to the next field or submitting on the last, and a web keydown handler so pressing Enter anywhere in the form submits it the same way clicking the primary button would (only when validation would allow an attempt).
- **Exit criteria:** Component tests for both screens pass, including one asserting an Enter keypress triggers the same submit handler as clicking the primary button.
- **Notes:** From S059. Resolved during refinement: scoped to sign-up/sign-in only, not change-password/change-email/forgot-password — those are deliberately deferred, partly to avoid rework ahead of T179/T180 restructuring Account Security's forms.

### [T180] Gate forgot-password inside the change-password flow behind a wrong current password

- **Area:** Authentication UI
- **Priority:** Medium
- **Status:** Not started
- **Planning:** Implementer
- **Description:** Account Security's change-password form has no forgot-password link today. Add one, but only shown after the user submits an incorrect current password (the `invalidCredentials` category is already captured at that call site) — with a visible warning that using it signs them out — and have it navigate directly to `/auth/forgot-password` (not sign-in first) while calling `signOut()`.
- **Exit criteria:** `account-security-screen.test.tsx` passes, including tests asserting no forgot-password link renders by default, one appears with the sign-out warning after a wrong-password submission, and selecting it signs the user out and navigates to `/auth/forgot-password`.
- **Notes:** From S061. Extends T154.1's change-password flow. Distinct from T174 (forgot-password's own visual layout).

### [T181] Let users exit Account Security with an in-app back control

- **Area:** Authentication UI
- **Priority:** Low
- **Status:** Not started
- **Planning:** Implementer
- **Description:** `account-security-screen.tsx` has no back/header affordance today, relying entirely on browser back. Add a secondary `Button` calling an `onBack` handler that returns to Profile, matching the existing pattern already used by `trick-goals-screen.tsx`, `all-trick-goals-screen.tsx`, `trick-notes-screen.tsx`, `all-notes-screen.tsx`, and `laced-tricks-screen.tsx` ("Back to Tricks"-style secondary button).
- **Exit criteria:** `account-security-screen.test.tsx` passes, including a test asserting the back control navigates to Profile.
- **Notes:** From S062. Small, low-risk navigation addition reusing an existing pattern.

---
