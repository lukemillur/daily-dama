# Daily Dama desloppify backlog

Reviewed 2026-09-04 against local `development` at `7bdeb7f`.

This is an audit and cleanup queue, not evidence that every existing product ticket has been completed. The checkout was four commits behind `origin/development` and already contained user-owned changes in `.vscode/settings.json`, `src/app/app/tricks/index.tsx`, and `src/features/notes/components/all-notes-screen.tsx`; those changes were preserved and were not treated as cleanup work. Before implementing any item, refresh/reconcile the branch and re-check the cited code.

## How to use this backlog

- Pick one item at a time. Reproduce or characterize the behavior before editing it.
- Existing `T###` items stay owned by `TASKS.md` or `TASKS_COLLABORATIVE.md`; use their existing workflow rather than creating a parallel implementation here.
- For new `D###` items, add focused tests and use the risk-based verification rules in `AGENTS.md`.
- At the end of each cleanup task, update this file's status/evidence and display the remaining list again for the next selection.

Status values: `Ready`, `Wait`, `Existing ticket`, `Done`.

## 1. Critical issues

### [D001] Make “Discard and log out” fail closed when outbox persistence fails

- **Status:** Ready
- **Where:** `src/shared/persistence/use-identity-scoped-domain.ts:131-155`; each domain's `discardPending` implementation (for example `src/features/custom-tricks/state/use-custom-trick-domain-sync.ts:365-374`); `src/shared/sync/sync-coordinator-provider.tsx:72`; `src/features/auth/state/use-logout-guard.ts:131-145`.
- **Why it matters:** `saveNow()` resolves even when a domain save returns `{ status: 'failed' }`. The discard path then clears the in-memory outbox and advances to sign-out. The old persisted outbox can survive and be reloaded later, resurrecting changes the user explicitly chose to discard. The current tests cover successful persistence, not this failure path.
- **Recommended change:** Make imperative persistence report failure (a result union or rejection), dispatch `outboxDiscarded` only after durable success, make `discardAllPending` return per-domain outcomes, and keep the logout prompt open with actionable error copy if any domain fails. Add a fault-injection integration test proving failed storage cannot advance to sign-out or later replay a supposedly discarded operation.
- **Timing:** Safe and important to fix now, but plan it as a persistence/concurrency change before implementation.

### [D002] Surface local persistence failures instead of acknowledging volatile state

- **Status:** Ready; follow D001
- **Where:** `src/shared/persistence/use-identity-scoped-domain.ts:131-149`; the five providers' `onSaveFailed` callbacks, e.g. `src/features/profile/state/user-profile-provider.tsx:76-81`, `src/features/stats/state/practice-history-provider.tsx:57-62`, and their custom-trick/note/goal equivalents.
- **Why it matters:** All five domains update the UI immediately, but a failed AsyncStorage write produces only `console.warn`. A guest can complete a Sesh, add a trick, note, or goal, see it in the UI, and lose it on reload with no warning or retry affordance. For a local-first product, silent local durability failure is a core data-integrity issue.
- **Recommended change:** Add shared local-persistence status with retry semantics, retain the latest unsaved snapshot, and show a non-blocking but unmistakable app-level warning until the write succeeds. Keep local-persistence state distinct from cloud-sync state.
- **Timing:** Safe to address now after D001. It changes a shared state boundary, so propose the status model first rather than adding five local booleans.

### [T226] Close the signed-in feedback permission gap

- **Status:** Existing ticket (`TASKS_COLLABORATIVE.md`; T225 reconciliation first)
- **Where:** `src/features/feedback/persistence/submit-feedback.ts:39-53`; `supabase/migrations/20260902000000_add_feedback_table_with_anon_insert.sql:49-61`.
- **Why it matters:** The persistent Supabase client carries an authenticated session for signed-in users, while the table grants/policy allow `anon` inserts only. The checked-in schema therefore rejects the Profile-linked feedback flow for authenticated users even though the client comment claims both identities use it.
- **Recommended change:** Execute T226: grant `authenticated` the same narrow INSERT-only capability and validation, retain no client read/update/delete access, and verify guest and signed-in submission plus acknowledgment against the real stack.
- **Timing:** Safe to fix now through the guided-ticket workflow; do not duplicate it as a D-ticket or treat a mocked component test as proof.

### [T227] Make every dynamic web route refresh-safe

- **Status:** Existing ticket (`TASKS_COLLABORATIVE.md`; T225 reconciliation first)
- **Where:** `vercel.json:4-9`; exported routes under `dist/app/tricks/[trickId]/...` and `dist/app/tricks/custom/[trickId]/...`.
- **Why it matters:** Only `/app/stats/:trickId` has a host rewrite. Direct navigation or refresh on trick notes, goals, custom edit, and custom delete can 404 even though in-app navigation works. This is a release-breaking routing assumption hidden by client-side navigation.
- **Recommended change:** Execute T227: define and test rewrites for every dynamic route shape on the actual host, including intentional missing-record behavior. Keep a route/rewrite contract test so new dynamic routes cannot silently omit hosting support.
- **Timing:** Safe to fix now through the guided-ticket workflow; hosted verification is required.

### [T228] Stop the dependency-audit gate from reporting false success

- **Status:** Existing ticket (`TASKS.md`; depends on T225)
- **Where:** `security/scripts/check-dependency-audit.mjs:22-57`.
- **Why it matters:** The wrapper ignores the child exit status/signal and treats malformed or incomplete NDJSON as “no high/critical advisories.” A network or registry failure can therefore make a security gate green without completing an audit.
- **Recommended change:** Execute T228: require a valid completion summary, distinguish Yarn Classic's advisory bitmask from process/network/parser failures, and add spawn/error/signal/incomplete-output regression cases.
- **Timing:** Safe to fix now after T225; do not add advisory exceptions merely to make the gate pass.

### [T229] Finish Sentry as a privacy-safe, CSP-compatible integration—or leave it disabled

- **Status:** Existing ticket (`TASKS_COLLABORATIVE.md`)
- **Where:** `src/shared/observability/sentry-client.ts:25-35`; `vercel.json:15-16`; `security/scripts/check-csp-headers.mjs:41`.
- **Why it matters:** Sentry is initialized with a direct DSN, but production `connect-src` permits only self and Supabase. If enabled, normal delivery is blocked. Conversely, merely opening the CSP without sanitizing event URLs/breadcrumbs could expose Auth callback query or fragment secrets; Vercel Analytics has a URL sanitizer, Sentry currently does not.
- **Recommended change:** Execute T229 with a narrowly allowed ingest origin and a `beforeSend`/breadcrumb policy that removes callback query/hash data and sensitive extras. Verify a safe synthetic event arrives and contains no credentials, email, session material, or callback tokens.
- **Timing:** Wait for the guided hosted check. Keep the DSN unset until the full path is verified.

## 2. Medium cleanup items

### [D003] Make Auth actions total and submission state exception-safe

- **Status:** Ready
- **Where:** `src/features/auth/state/auth-provider.tsx:86-320`; submit handlers in `sign-in-screen.tsx:59-84`, `sign-up-screen.tsx:65-97`, `forgot-password-screen.tsx:70-96`, `reset-password-screen.tsx:43-69`, `account-security-screen.tsx:82-151`, and `account-deletion-screen.tsx:47-77`.
- **Why it matters:** UI handlers assume every Auth action resolves to `{ error }`. If the SDK, fetch implementation, Edge Function invocation, or a future adapter throws, submitting refs and loading state are never reset and the promise rejection is unhandled. The form can remain permanently disabled until reload.
- **Recommended change:** Choose one boundary: either make every provider action catch unknown failures and always return a typed result, or use a shared submit helper with `try/catch/finally`. Preserve exact provider errors for categorization/logging while rendering only fixed safe copy. Add one thrown-error case per distinct action class, not repetitive tests for every screen.
- **Timing:** Safe to fix now; keep it focused and do not redesign Auth state.

### [D004] Consolidate the five near-duplicate domain sync drivers

- **Status:** Wait until D001/D002 and current release defects settle
- **Where:** `src/features/profile/state/use-profile-domain-sync.ts` (432 lines), `custom-tricks/state/use-custom-trick-domain-sync.ts` (389), `stats/state/use-practice-history-domain-sync.ts` (334), `goals/state/use-goal-domain-sync.ts` (397), and `notes/state/use-note-domain-sync.ts` (404).
- **Why it matters:** Roughly two thousand lines repeat single-flight, pull, revision-cache, outbox push, conflict resolution, diff suppression, local-mutation tracking, and discard behavior. Domain differences are real, but mechanical copies have already left stale comments claiming T157.9 is future work. A correctness fix now requires coordinated edits across five large hooks.
- **Recommended change:** First add cross-domain contract tests for the shared lifecycle. Then extract a generic sync-driver kernel with typed domain strategies for mapping, diffing, conflict application, and revision lookup. Keep domain-specific conflict rules explicit; do not erase them behind `unknown` callbacks.
- **Timing:** Do not start as opportunistic cleanup during a bug fix. It is safe as a planned post-release refactor with characterization tests and staged domain-by-domain adoption.

### [D005] Replace the guest-import merge's `unknown` strategy table with typed domain strategies

- **Status:** Ready, planning required
- **Where:** `src/features/guest-import/persistence/guest-import-existing-account.ts:127-299`, especially the tuple table and casts at lines 221-293.
- **Why it matters:** One cross-domain loop erases domain types to `unknown`, relies on many casts, treats goal/note tombstones as special branches inside the generic loop, and compares canonical values with `JSON.stringify`. A new field, different property order, or another tombstoned domain can silently produce false conflicts or the wrong payload. The file's dense one-line branches make review harder in an already high-risk data merge.
- **Recommended change:** Define a discriminated, generic strategy per domain with typed `guestItem`, `cloudItem`, ID, canonicalization, timestamp, revision, and payload functions. Use explicit structural equality for canonical payloads. Preserve deterministic ordering and existing conflict policy with characterization tests.
- **Timing:** Safe to fix in isolation, but plan first because it spans every persistent domain and guest-to-account data ownership.

### [D006] Move reusable Tricks UI out of an Expo Router route module

- **Status:** Wait for the current dirty Tricks work and T245 to finish
- **Where:** `src/app/app/tricks/index.tsx:119-510`; nested routes import `ChoiceScreen`, `CustomTrickForm`, and `DeleteConfirmation` from `@/app/app/tricks`.
- **Why it matters:** The 571-line index route owns the directory screen plus three reusable feature components and their styles. Child routes depend upward on a route entry module, making route boundaries surprising and increasing the chance that editing the primary screen affects create/edit/delete bundles and tests.
- **Recommended change:** Move those components into `src/features/custom-tricks/components/` (or focused component files), leave the route as composition only, and move route-agnostic tests beside the feature. Preserve behavior exactly.
- **Timing:** The extraction is mechanically safe, but wait until the existing uncommitted edit and overlapping Tricks tickets are resolved to avoid needless conflicts.

### [D007] Split the Sesh component along orchestration and presentation boundaries

- **Status:** Wait for T239/T240/T244
- **Where:** `src/features/sesh/components/sesh.tsx` (1,394 lines), including setup, audio/keep-awake effects, timer transitions, completion recording, notes, goals, celebrations, and more than 100 lines of dense style declarations.
- **Why it matters:** Core Sesh behavior is well tested and the reducer remains authoritative, but the component has accumulated too many reasons to change. Small product edits require navigating unrelated timer, persistence, goal, note, celebration, and layout concerns, increasing regression and merge-conflict risk.
- **Recommended change:** Keep `seshReducer` and one orchestration hook authoritative. Extract stable phase views (`TrickPicker`, `ActiveSesh`, `CompletedSesh`) and post-Sesh panels into focused files, then extract effect coordination only where tests can characterize ownership. Also move goal formatters out of a goal screen module before Sesh consumes them.
- **Timing:** Do not rewrite during active Sesh tickets. A sequence of behavior-preserving extractions is safe afterward; avoid a new state-management layer.

### [D008] Deduplicate note row, edit form, and style implementations

- **Status:** Wait for the current dirty Notes work
- **Where:** `src/features/notes/components/trick-notes-screen.tsx:83-214` and `all-notes-screen.tsx:59-173`.
- **Why it matters:** Both screens independently implement delete confirmation, edit state, note body rendering, action controls, the multiline edit form, and near-identical styles. UX or validation changes must be made twice and have already produced slightly different metadata/layout behavior.
- **Recommended change:** Extract a shared `NoteCard` and `NoteEditor` with explicit variants for per-trick versus archive metadata. Keep list ownership and screen copy local.
- **Timing:** Safe after the current uncommitted Notes copy change is resolved.

### [D009] Align text limits across UI, domain validation, cloud mapping, and SQL

- **Status:** Ready, schema plan required
- **Where:** custom-trick UI caps names/steps at 80 characters in `src/app/app/tricks/index.tsx:263-280`, but `custom-trick.ts`, cloud mapping, and `20260822200050_add_custom_tricks_and_practice_sessions.sql` only require non-empty text. Notes have no body limit in `note.ts`, either note screen, or `20260822201500_add_goals_and_notes.sql:123-129`.
- **Why it matters:** UI-only limits are not an integrity boundary. Direct API writes or older clients can store arbitrarily large trick names, sequence text, and notes; pulled data can then bloat localStorage, sync envelopes, render paths, and layouts. The same logical field currently has different contracts depending on entry path.
- **Recommended change:** Choose product-level constants, validate them in model creation/edit and cloud parsing, set `maxLength` plus remaining/error copy in UI where useful, and mirror the limits with SQL CHECK constraints. Add boundary tests on all four layers.
- **Timing:** Safe to do before external users, but it changes the persisted/cloud contract and needs a migration plan. Avoid retroactive truncation; reject invalid data visibly.

### [D010] Add a user-facing unexpected-error recovery boundary

- **Status:** Ready
- **Where:** the route tree under `src/app/`; no route-level error boundary or equivalent recovery surface is present.
- **Why it matters:** Runtime validation handles many external values, but an unexpected render/effect error can still leave a blank route with no recovery action. Sentry, even when working, observes a crash; it does not provide UX recovery.
- **Recommended change:** Using the installed Expo Router version as the source of truth, add the narrowest supported root/app error boundary with safe copy, retry/home actions, and sanitized reporting. Add a component-level proof for fallback and reset behavior.
- **Timing:** Safe to fix now. Keep it a recovery shell, not a generic catch-and-ignore mechanism.

### [D011] Repair architecture and deployment documentation drift

- **Status:** Ready after refreshing `development`
- **Where:** `README.md:3,57`, `AGENTS.md:41`, `ARCHITECTURE.md:17,54-64,122-151,628`, and `DEPLOYMENT_HANDOFF.md:15-17`.
- **Why it matters:** Multiple authoritative-looking documents still say there is no backend/Auth/sync and only three persistent domains, while the repository now has Auth, Supabase migrations, five synchronized domains, guest import, account deletion, and a coordinator. `ARCHITECTURE.md` contradicts itself by later acknowledging five concerns. New work can be planned against an obsolete system model.
- **Recommended change:** Update the as-built architecture and concise README first, then make AGENTS/Deployment link to that inventory instead of repeating it. Clearly label historical roadmaps and old deployment snapshots. Document the current provider tree and the distinction between local persistence, cloud sync envelopes, and guest import.
- **Timing:** Safe as documentation-only work once the branch is current; no application suite is required, but inspect every referenced path/command.

### [D012] Turn the 315-warning lint baseline into an actionable signal

- **Status:** Ready
- **Where:** repository-wide tests plus 34 non-test warnings; production examples include missing `dispatch` dependencies in custom-trick/note/goal/practice-history providers, duplicate imports in `guest-import-existing-account.ts`, and import-order warnings in `profile-cloud-mapping.ts`.
- **Why it matters:** `yarn lint` exits successfully with 315 warnings, so a new real warning disappears into noise. Many test warnings are caused by deliberate Jest mock/import structure, while production warnings represent actual cleanup or missing documented rationale; treating both alike weakens the gate.
- **Recommended change:** Fix or explicitly justify production warnings, configure narrow test overrides for intentional mock patterns, clean unused suppressions, and add a warning budget/ratchet that prevents growth. Do not run a repository-wide `--fix` blindly because import motion around Jest mocks can change behavior.
- **Timing:** Safe now as a dedicated tooling cleanup. Keep the first pass behavior-preserving.

## 3. Nice-to-have polish

### [D013] Add accessible announcement and focus behavior to form feedback

- **Status:** Ready
- **Where:** `src/components/ui/text-field.tsx:32-48`; Auth and feedback screens render async errors/success text without live-region semantics; destructive confirmations and screen swaps do not consistently move focus.
- **Why it matters:** Labels and many Pressable roles are already present, but validation/async results can be invisible to screen-reader users unless focus happens to move. The shared `TextField` also does not expose invalid/described-by semantics as one coherent contract.
- **Recommended change:** Extend shared form primitives with accessible error IDs/invalid state where React Native Web supports them, announce async status changes, and define focus targets for success/error/confirmation transitions. Verify on web keyboard plus one screen reader before claiming completion.
- **Timing:** Safe now, but implementation details should follow the installed React Native Web/Expo behavior. Native validation remains deferred.

### [D014] Remove confirmed Expo-starter remnants

- **Status:** Ready after one reference audit
- **Where:** `src/components/themed-text.tsx`, `src/components/themed-view.tsx`, and `src/hooks/use-theme.ts` reference only one another and have no application consumers; `assets/images/tabIcons/explore*.png` are unreferenced.
- **Why it matters:** They expose a second, unused theme abstraction beside styled-components and make the repository look like it supports UI paths it does not. The unused icon files add small but misleading asset inventory.
- **Recommended change:** Re-run reference checks, remove only confirmed unused files, and run typecheck plus web export. Keep `use-color-scheme` and the Home tab icon because they are active.
- **Timing:** Safe now. Do not fold the intentionally retained brand-source images under `assets/images/brand/` into this deletion.

### [D015] Decide whether old dev-only sandbox routes remain supported tools

- **Status:** Wait for the trick-visualization decision
- **Where:** `src/app/app/stats/sesh-sequence-sandbox.tsx`, `trick-viz-sandbox.tsx`, and the `__DEV__` links in `src/app/app/home.tsx:106-115`.
- **Why it matters:** Both routes are exported into `dist` even though production renders a redirect, and the Sesh sandbox still carries T012-era placement rationale. They are not dead—the dev Home links reach them—but their maintenance ownership and intended lifetime are unclear.
- **Recommended change:** If they remain useful, document them as supported developer harnesses and keep focused smoke coverage. If not, remove the route, link, and route-specific assets/tests together. Do not remove trick-viz work while `TRICK_VIZ_HANDOFF.md` remains an active separate subsystem.
- **Timing:** Wait for an explicit keep/remove decision; this is not urgent.

### [D016] Centralize repeated hydration fallback presentation

- **Status:** Ready, low priority
- **Where:** the five domain providers repeat the same `StyleSheet` and near-identical “Loading your ...” screen; provider nesting in `src/app/app/_layout.tsx:45-62` hydrates them serially because each provider withholds children.
- **Why it matters:** Repeated loading chrome drifts easily, and serial hydration adds one storage round trip per nested provider to startup. The current documents are small, so the performance concern is architectural trajectory rather than a demonstrated user problem.
- **Recommended change:** Extract a shared fallback immediately if touching these providers. Separately measure startup before changing provider gating; if it becomes material, design a composition gate that preserves the no-partially-hydrated-UI and no-initial-overwrite invariants while allowing independent loads to start together.
- **Timing:** Shared presentation is safe now. Parallel hydration should wait for measurements and a dedicated provider-boundary plan.

### [D017] Establish formatting conventions without creating a giant reformat commit

- **Status:** Ready, low priority
- **Where:** `package.json` has no Prettier dependency/script despite the project default; recent files mix quote styles and several sync/guest-import modules compress multiple statements and JSX onto single lines (notably `sync-coordinator-provider.tsx` and `sync-status-section.tsx`).
- **Why it matters:** Dense formatting makes already-complex concurrency code harder to review, while style-only churn across the whole repository would obscure real history and conflict with active ticket branches.
- **Recommended change:** Add a minimal formatter configuration and changed-files check, format only files touched by each future task, and reserve any broad baseline reformat for a coordinated quiet period.
- **Timing:** Safe now if it does not rewrite unrelated files.

### [D018] Replace stale ticket archaeology in production comments with present-tense invariants

- **Status:** Ready, low priority
- **Where:** production `src` contains more than one hundred `T###` references; several comments still describe T157.9 or manual sync UI as future work even though the coordinator and Profile retry surface exist.
- **Why it matters:** Ticket links are useful provenance, but stale “future task” narratives obscure the current contract and force maintainers to reconstruct history from old plans. Comments should explain why the code must remain a certain way today.
- **Recommended change:** While touching a file, rewrite stale comments around current invariants and link to durable architecture docs for long explanations. Keep ticket references only where they add traceability that the current code cannot explain itself.
- **Timing:** Safe as touch-local cleanup; do not launch a standalone mass comment rewrite.

## Recommended execution order

1. D001 — prevent discarded outboxes from surviving a failed durable write.
2. D002 — make all local persistence failures visible and retryable.
3. T225, then T226/T227/T228/T229 through their existing queues.
4. D003 — harden Auth submit failure handling.
5. D011 and D012 — restore trustworthy documentation and static-analysis signals.
6. D009/D010 — tighten data boundaries and runtime recovery.
7. D005, then D004 — type the cross-domain merge before consolidating sync machinery.
8. D006/D007/D008 after overlapping feature work is clear.
9. D013-D018 as focused polish.

## Scan evidence and limits

- `yarn tsc --noEmit`: passed.
- `yarn lint`: passed with 315 warnings; a non-test-only pass reported 34 warnings.
- Inspected route/provider composition, all five persistence and sync paths, Auth/feedback, guest import, SQL constraints/RLS, CSP/Sentry, hosting rewrites, largest source files, unused starter references, tracked outputs/assets, and current task queues.
- Did not run the full Jest suite, web export, local Supabase, or browser acceptance: this was a documentation-only audit on a dirty, behind checkout, and those runs would not resolve the hosted findings already assigned to T225-T229.
- Existing T236-T246 UI tickets were not copied into this backlog. They remain the authoritative queue for already-reported product polish.
