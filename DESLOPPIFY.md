# Daily Dama desloppify backlog

Reviewed 2026-09-04 against local `development` at `7bdeb7f`.

**Scoped iOS UX audit: 2026-10-29**, local `feat/kendama-anatomy-model` at
`6335ec7`, with uncommitted simulator-enablement changes in configuration,
dependencies, route metadata, and architecture documentation. Those changes
were preserved. This pass covers the iPhone 18 Pro simulator on iOS 27.0,
Xcode 27.1, Expo 57.0.31, and the owner's selected pale-blue/blue-accent theme.
It does not revalidate every historical cleanup item below.

**Hands-on coverage is incomplete:** native computer-use failed with
`Sky Computer Use native pipe closed before response` after custom-trick editing.
Rebinding and resetting the runtime did not restore it. Remaining flows were
inspected in source and are explicitly marked as unverified below. This is not
an exhaustive native acceptance sign-off. See the iOS workflow matrix at the end.


Critical-ticket reconciliation was repeated 2026-09-04 on clean, up-to-date `development` at `8979dca`. D001/D002 and the existing ownership of T226–T229 were rechecked for this ticketing pass; medium and nice-to-have findings retain the original scan's evidence and caveats until a full refresh.

Bundle/dependency evidence was refreshed 2026-09-11 against clean local `development` at `059a13b` (one commit ahead of `origin/development`). This was a deliberately narrow refresh of D014/D015 plus new D019/D020, not a revalidation of every older finding.

This is an audit and cleanup queue, not evidence that every existing product ticket has been completed. The original scan checkout was four commits behind `origin/development` and already contained user-owned changes in `.vscode/settings.json`, `src/app/app/tricks/index.tsx`, and `src/features/notes/components/all-notes-screen.tsx`; those changes were preserved and were not treated as cleanup work. Before implementing any item, refresh/reconcile the branch and re-check the cited code.

## How to use this backlog

- Pick one item at a time. Reproduce or characterize the behavior before editing it.
- Existing `T###` items stay owned by `TASKS.md` or `TASKS_COLLABORATIVE.md`; use their existing workflow rather than creating a parallel implementation here.
- For new `D###` items, add focused tests and use the risk-based verification rules in `AGENTS.md`.
- At the end of each cleanup task, update this file's status/evidence and display the remaining list again for the next selection.

Status values: `Ready`, `Wait`, `Existing ticket`, `Done`.

## 1. Critical issues

### [S040] Finish or explicitly withhold native account workflows

- **Status:** Existing ticket (planning story S040 in `BACKLOG_STORIES.md`, still Proposed; guest-only presentation tracked by T288 in `TASKS.md`)
- **Where:** `src/shared/supabase/supabase-client.ts:getSupabaseClient`; `src/features/auth/state/auth-provider.ts`; `GuestAccountSection`; Sesh guest signup invitations; `/auth/*`; Profile account/security/delete.
- **Why it matters:** **Source-confirmed native gap, with an invitation observed in the simulator.** The shared client returns `null` on every non-web platform. Auth initializes as guest/unconfigured and account actions return configuration errors. Yet the first completed Sesh invites the user to sign up to preserve history. Native signup, signin, verification/reset/change-email callbacks, sync, conflicts, logout and deletion cannot be accepted as working. This is an account-enabled iOS release gate, not a blocker for local guest practice.
- **Recommended change:** Keep S040 as the owner of native account hardening. For the guest-only iteration, withhold unavailable account promises/CTAs or explain availability accurately; enabling native accounts requires the planned storage, callback and lifecycle work and real boundary tests. Do not remove the native guard as a shortcut.
- **Timing:** Decide the guest-only presentation now; schedule native Auth as a separate approved iteration. Apply the same guest-only treatment on Android.


### [D001] Make “Discard and log out” fail closed when outbox persistence fails

- **Status:** Done (T247)
- **Where:** `src/shared/persistence/use-identity-scoped-domain.ts`; `src/shared/persistence/storage.ts` (`ScopedSaveOutcome`, `createWriteQueue`); each domain's `discardPending` implementation; `src/shared/sync/discard-outcome.ts` (new); `src/shared/sync/sync-coordinator-provider.tsx`; `src/features/auth/state/logout-guard.ts` and `use-logout-guard.ts`; `src/features/auth/model/discard-failure-copy.ts` (new); `src/features/auth/components/logout-prompt.tsx`.
- **Evidence:** `saveNow()` now resolves a typed `ScopedSaveOutcome` (`saved`/`failed`/`superseded`) instead of always resolving; each domain's `discardPending` persists before dispatching `outboxDiscarded` and only clears the in-memory outbox on a durable save; `discardAllPending` aggregates per-domain outcomes via `Promise.allSettled` + `aggregateDiscardOutcomes` (superseded > failed > discarded precedence); the logout guard returns to `prompt` with the failed domains named in the UI on failure, and to `idle` on supersession, never reaching `signingOut` from a non-discarded outcome. Fault-injection tests cover the write queue, the identity-scoped hook, all five domain hooks, the aggregation precedence matrix, the coordinator's partial-failure case, a fully-wired failed-discard-across-remount proof, the guard reducer/driver, and the real `AccountSection`/`LogoutPrompt` UI. Full local suite (`node .claude/scripts/verify.mjs`) passed before merge.

### [D002] Surface local persistence failures instead of acknowledging volatile state

- **Status:** Done (T248.1–T248.2)
- **Where:** `src/shared/persistence/use-identity-scoped-domain.ts:131-149`; the five providers' `onSaveFailed` callbacks, e.g. `src/features/profile/state/user-profile-provider.tsx:76-81`, `src/features/stats/state/practice-history-provider.tsx:57-62`, and their custom-trick/note/goal equivalents.
- **Why it matters:** All five domains update the UI immediately, but a failed AsyncStorage write produces only `console.warn`. A guest can complete a Sesh, add a trick, note, or goal, see it in the UI, and lose it on reload with no warning or retry affordance. For a local-first product, silent local durability failure is a core data-integrity issue.
- **Recommended change:** Add shared local-persistence status with retry semantics, retain the latest unsaved snapshot, and show a non-blocking but unmistakable app-level warning until the write succeeds. Keep local-persistence state distinct from cloud-sync state.
- **Timing:** Execute the T248 umbrella after T247. T248.1 establishes the shared status model before T248.2 adds the app-level recovery surface.

- **2026-10-29 reconciliation:** Completion is recorded in `TASKS_DONE.md`; the original description above is historical evidence, not a current open finding. D010's recovery surface was also seen during the initial simulator launch. No new hosted verification was performed in this audit.

### [T226] Close the signed-in feedback permission gap

- **Status:** Done (T226)
- **Where:** `src/features/feedback/persistence/submit-feedback.ts:39-53`; `supabase/migrations/20260902000000_add_feedback_table_with_anon_insert.sql:49-61`.
- **Why it matters:** The persistent Supabase client carries an authenticated session for signed-in users, while the table grants/policy allow `anon` inserts only. The checked-in schema therefore rejects the Profile-linked feedback flow for authenticated users even though the client comment claims both identities use it.
- **Recommended change:** Execute T226: grant `authenticated` the same narrow INSERT-only capability and validation, retain no client read/update/delete access, and verify guest and signed-in submission plus acknowledgment against the real stack.
- **Timing:** Safe to fix now through the guided-ticket workflow; do not duplicate it as a D-ticket or treat a mocked component test as proof.

- **2026-10-29 reconciliation:** Completion is recorded in `TASKS_DONE.md`; the original description above is historical evidence, not a current open finding. D010's recovery surface was also seen during the initial simulator launch. No new hosted verification was performed in this audit.

### [T227] Make every dynamic web route refresh-safe

- **Status:** Done (T227)
- **Where:** `vercel.json:4-9`; exported routes under `dist/app/tricks/[trickId]/...` and `dist/app/tricks/custom/[trickId]/...`.
- **Why it matters:** Only `/app/stats/:trickId` has a host rewrite. Direct navigation or refresh on trick notes, goals, custom edit, and custom delete can 404 even though in-app navigation works. This is a release-breaking routing assumption hidden by client-side navigation.
- **Recommended change:** Execute T227: define and test rewrites for every dynamic route shape on the actual host, including intentional missing-record behavior. Keep a route/rewrite contract test so new dynamic routes cannot silently omit hosting support.
- **Timing:** Safe to fix now through the guided-ticket workflow; hosted verification is required.

- **2026-10-29 reconciliation:** Completion is recorded in `TASKS_DONE.md`; the original description above is historical evidence, not a current open finding. D010's recovery surface was also seen during the initial simulator launch. No new hosted verification was performed in this audit.

### [T228] Stop the dependency-audit gate from reporting false success

- **Status:** Done (T228)
- **Where:** `security/scripts/check-dependency-audit.mjs:22-57`.
- **Why it matters:** The wrapper ignores the child exit status/signal and treats malformed or incomplete NDJSON as “no high/critical advisories.” A network or registry failure can therefore make a security gate green without completing an audit.
- **Recommended change:** Execute T228: require a valid completion summary, distinguish Yarn Classic's advisory bitmask from process/network/parser failures, and add spawn/error/signal/incomplete-output regression cases.
- **Timing:** Safe to fix now after T225; do not add advisory exceptions merely to make the gate pass.

- **2026-10-29 reconciliation:** Completion is recorded in `TASKS_DONE.md`; the original description above is historical evidence, not a current open finding. D010's recovery surface was also seen during the initial simulator launch. No new hosted verification was performed in this audit.

### [T229] Finish Sentry as a privacy-safe, CSP-compatible integration—or leave it disabled

- **Status:** Done (T229)
- **Where:** `src/shared/observability/sentry-client.ts:25-35`; `vercel.json:15-16`; `security/scripts/check-csp-headers.mjs:41`.
- **Why it matters:** Sentry is initialized with a direct DSN, but production `connect-src` permits only self and Supabase. If enabled, normal delivery is blocked. Conversely, merely opening the CSP without sanitizing event URLs/breadcrumbs could expose Auth callback query or fragment secrets; Vercel Analytics has a URL sanitizer, Sentry currently does not.
- **Recommended change:** Execute T229 with a narrowly allowed ingest origin and a `beforeSend`/breadcrumb policy that removes callback query/hash data and sensitive extras. Verify a safe synthetic event arrives and contains no credentials, email, session material, or callback tokens.
- **Timing:** Wait for the guided hosted check. Keep the DSN unset until the full path is verified.

## 2. Medium cleanup items

### [D021] Make native feedback usable and provide a safe exit

- **Status:** Existing ticket (`TASKS.md`; T287)
- **Where:** `/feedback`; `src/features/feedback/components/feedback-screen.tsx`; `src/features/feedback/persistence/submit-feedback.ts`; native guard in `getSupabaseClient`.
- **Why it matters:** **Source-confirmed, not exercised in the simulator.** Profile links to the form, but every native submission returns failed because its client is `null`. The screen replaces that reason with generic retry guidance, so retry cannot succeed. The unsubmitted form also has no visible Back/Cancel action; it sits outside the tab tree and the root uses `Slot`, so a normal native stack header/back gesture is not established here. Do not assume the submitted-only Back to Profile button solves the failed path.
- **Recommended change:** For this guest-only milestone, provide a visible return to Profile and accurately explain/withhold unavailable submission, or implement a deliberately scoped native feedback transport. Verify the real iOS submission/error/exit paths; do not add a second unreviewed backend client merely to bypass the native guard.
- **Timing:** Safe to repair the availability/exit presentation now. A new native transport needs its own boundary decision.

- **2026-10-29 scoping:** T287 is the authoritative implementation ticket; this audit entry retains the evidence.

### [D022] Derive readable foreground colors for themed controls

- **Status:** Existing ticket (`TASKS.md`; T283)
- **Where:** `src/components/ui/button.tsx:ButtonLabel`; `src/features/profile/state/use-resolved-theme.ts:deriveAutomaticButtonBackgrounds`; Sesh `PlanChoiceTitle`, `LacedButtonText`/`LacedCount`; Stats summary values; custom rank/focus controls.
- **Why it matters:** **Observed on iOS with the owner's current theme.** Blue accent labels/numbers sit on dark green primary surfaces in Timed selection, Laced, Stats totals, Define new trick, and custom-trick Save. These are markedly harder to read than the surrounding body copy. The theme resolver chooses button backgrounds against the page background but ignores the accent that Button uses as its label color. Existing text/background contrast readouts therefore do not guarantee readable controls. This likely also affects web; it is not attributed to an iOS rendering bug.
- **Recommended change:** Add foreground roles derived against their actual control/card surfaces, preserve user-selected decorative colors, and characterize the observed blue theme plus all presets. Verify selected, disabled and pressed states in the simulator and web. Do not simply forbid the owner's chosen theme.
- **Timing:** High-priority readability correction before visual polish; keep theme preference persistence unchanged.

- **2026-10-29 scoping:** T283 is the authoritative implementation ticket; this audit entry retains the evidence.

### [D023] Keep scroll content and primary actions clear of the native tab bar

- **Status:** Existing ticket (`TASKS.md`; T284)
- **Where:** `src/features/home/components/daily-home.tsx`; Sesh `SCROLL_CONTENT_PADDING`; `src/features/tricks/components/trick-directory.tsx`; `CustomTrickForm` in `src/app/app/tricks/index.tsx`; notes/goals scroll screens; native tabs.
- **Why it matters:** **Overlap observed; complete reachability not proven.** Screenshots show the floating tab bar covering Sesh trick choices, completion/signup actions, the custom-trick Save action, Home's footer links and the Stats trick card. Multiple scroll containers reserve only 24 points beneath content while their Screens omit the bottom edge. Profile separately reserves a large fixed inset, so policy is inconsistent. Automation's wheel/drag attempts did not move several views; that may be a simulator-control limitation and is not proof that a user cannot scroll them.
- **Recommended change:** Establish native tab/safe-area-aware bottom clearance in the owning layout/scroll conventions. Validate the final actionable row at maximum scroll, with and without the software keyboard, rather than adding an unexplained fixed spacer to every feature. Check Home, Sesh, Stats, directory, forms, notes and goals together.
- **Timing:** Do before fine spacing polish. Coordinate keyboard cases with T044; preserve hydration/provider boundaries.

- **2026-10-29 scoping:** T284 is the authoritative implementation ticket; this audit entry retains the evidence.

### [D024] Recompose trick rows for phone widths

- **Status:** Existing ticket (`TASKS.md`; T285)
- **Where:** `src/features/tricks/components/trick-directory.tsx`: `identityLayout`, `TrickNameRow`, `RowActions`, and custom actions.
- **Why it matters:** **Observed.** In the focused list, “Moshikame x10 or more, Spike” wraps into roughly six short lines beside NOTES / GOALS / PRACTICE and a checkbox. The row becomes difficult to scan; Edit/Delete add still more horizontal pressure for custom tricks. The identity has a minimum width and actions remain in the same row. Action labels are visually tiny, although source gives RowAction a 48-by-44 minimum target, so this audit does not claim those hit areas are undersized.
- **Recommended change:** Give the name a full-width identity line on phones and put secondary actions into a separate row or intentional detail/action surface. Retain fast selection and direct practice, clear selected state, and accessible action labels. Verify long names, custom sequences, custom Edit/Delete and large text.
- **Timing:** Safe after the shared tab/inset baseline. Reuse the correction in multi-trick/goal pickers that consume the directory.

- **2026-10-29 scoping:** T285 is the authoritative implementation ticket; this audit entry retains the evidence.

### [D025] Bound celebration banners to the available screen width

- **Status:** Existing ticket (`TASKS.md`; T286)
- **Where:** `src/features/sesh/components/sesh.tsx:CelebrationBanner`, `CelebrationBannerCard`, `CelebrationBannerTitle`, `FirstLaceBanner`.
- **Why it matters:** **Observed during the first-lace event and again on completion.** The banner for “Moshikame x10 or more, Spike” extends beyond both sides of the phone and clips its sentence. Its card has width/max-width rules but the enclosing Animated.View does not establish a bounded width; animation overshoot may amplify the result. The exact layout cause is not yet isolated.
- **Recommended change:** Constrain the wrapper to the parent's content width, allow the full message to wrap, and contain any scale overshoot. Check first-lace, personal-best and goal variants with long trick/sequence names, during animation and at rest.
- **Timing:** Safe bounded visual correction after checking the wrapper's measured layout.

- **2026-10-29 scoping:** T286 is the authoritative implementation ticket; this audit entry retains the evidence.

### [T042] Complete native tab iconography and check theme coherence

- **Status:** Existing ticket (`TASKS.md`)
- **Where:** `src/components/app-tabs.tsx`.
- **Why it matters:** **Observed and source-confirmed.** Only Home has an icon; Sesh, Tricks, Stats and Profile have blank icon slots above their labels. Native tab colors come from `Colors`/system scheme rather than the saved app theme used in screens. Tab labels were visible, but individual items were not exposed in the captured AX tree; VoiceOver behavior needs a separate check before calling it broken.
- **Recommended change:** Execute T042 for subject-appropriate icons and selected/unselected treatment. Check tint/theme coherence and VoiceOver names/states. Verify on iOS now; verify Android once its development build exists rather than claiming those criteria passed.
- **Timing:** Safe focused work; no navigation architecture replacement is required just to add icons.

### [T044] Validate keyboard-aware layouts on actual software keyboards

- **Status:** Existing ticket (`TASKS.md`; T044.1–T044.2)
- **Where:** custom tricks/sequences, notes, goals, streak settings and Sesh numeric fields; also include feedback/Auth availability paths in the matrix.
- **Why it matters:** **Partial observation.** Showing the number pad on the Sesh duration field hides the lower trick choices/tab bar; tapping body copy dismissed it successfully. There is no numeric keyboard Done accessory, but the successful outside tap means this was not a proven keyboard trap. Custom-trick Save was already behind the tab bar without a keyboard. Remaining form/keyboard combinations were not reached before the control connection failed.
- **Recommended change:** Run T044's actual software-keyboard cases on small and large iPhones, checking focused-input visibility, final actions, scrolling, dismissal and multiline input. Distinguish simulator hardware-keyboard mode from a passing mobile-keyboard test.
- **Timing:** Execute with D023 on iOS; repeat the Android keyboard cases once the Android development build exists.

### [T043] Verify app lifecycle, timer and wake-lock behavior

- **Status:** Existing ticket (`TASKS.md`; T043.1–T043.2)
- **Where:** Sesh `useNow`, countdown/timer effects, keep-awake lifecycle, multi-trick and assessment runs.
- **Why it matters:** **Unverified native boundary.** Foreground open-ended timing and pause/resume worked. Paused state survived switching Home then back to Sesh. These observations do not establish correctness through device lock/background/foreground or an overdue timed deadline. Sesh relies on interval/effect timing and no Sesh-owned AppState reconciliation was found in the source scan. Process-death recovery is separately absent by design.
- **Recommended change:** Retain T043's timestamp-based cases and deliberate simulator/device lifecycle checks; test no-lace completion, paused sessions, multi-trick advancement and wake-lock release. Add a separate product decision for force-quit recovery if required.
- **Timing:** Required before relying on the app for unattended timed practice. Do not infer correctness from foreground tests.


- **2026-10-29 reconciliation:** Completion is recorded in `TASKS_DONE.md`; the original description above is historical evidence, not a current open finding. D010's recovery surface was also seen during the initial simulator launch. No new hosted verification was performed in this audit.

### [D015] Exclude dev-only sandbox routes from the release bundle

- **Status:** Wait for the trick-visualization decision
- **Where:** `src/app/app/stats/sesh-sequence-sandbox.tsx`, `src/app/app/stats/trick-viz-sandbox.tsx`, the `__DEV__` links in `src/app/app/home.tsx:107-115`, and the otherwise-unreachable `src/features/trick-viz/` graph.
- **Why it matters:** Both routes are exported even though production renders a redirect. More importantly, Expo Router's web export includes the trick-viz route module and all of its static imports in the one production entry bundle. On 2026-09-11, the real export was 8,927,589 bytes minified / 2,405,214 bytes gzip. In an isolated copy where only `trick-viz-sandbox.tsx` was replaced by a redirect-only route, it fell to 3,893,799 bytes / 971,096 bytes gzip: 5,033,790 bytes minified and 1,434,118 bytes gzip removed (56.4% and 59.6%). The source map attributes most of the difference to `three-stdlib`, `three`, `@react-three/drei`, `@react-three/fiber`, and their helpers. `LandingHero` is not a production consumer: its JSX has been commented out since commit `c953c2c`, so the sandbox route is currently the only application import that makes trick-viz reachable.
- **Recommended change:** For the release, remove the trick-viz sandbox from the Expo Router route graph and its Home dev link, or move the harness to a separate developer entry point that is not statically imported by a production route. The Sesh-sequence sandbox is much smaller but should be removed from the production route graph for the same ownership reason. Preserve `src/features/trick-viz/` and its tests if the subsystem is still planned; deleting that source and the four direct 3D dependencies (`@react-three/drei`, `@react-three/fiber`, `three`, `expo-gl`) is a separate product decision governed by `TRICK_VIZ_HANDOFF.md`.
- **Timing:** Resolve before shipping because the measured transfer/parse saving is material. The safe default is to preserve the subsystem source but exclude the two developer routes from the release graph.

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

- **Status:** Done (T259)
- **Where:** the route tree under `src/app/`; no route-level error boundary or equivalent recovery surface is present.
- **Why it matters:** Runtime validation handles many external values, but an unexpected render/effect error can still leave a blank route with no recovery action. Sentry, even when working, observes a crash; it does not provide UX recovery.
- **Recommended change:** Using the installed Expo Router version as the source of truth, add the narrowest supported root/app error boundary with safe copy, retry/home actions, and sanitized reporting. Add a component-level proof for fallback and reset behavior.
- **Timing:** Safe to fix now. Keep it a recovery shell, not a generic catch-and-ignore mechanism.

- **2026-10-29 reconciliation:** Completion is recorded in `TASKS_DONE.md`; the original description above is historical evidence, not a current open finding. D010's recovery surface was also seen during the initial simulator launch. No new hosted verification was performed in this audit.

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
- **Timing:** Safe now, but implementation details should follow the installed React Native Web/Expo behavior. Verify the same contract on iOS and Android.

### [D014] Remove confirmed Expo-starter remnants

- **Status:** Ready after one reference audit
- **Where:** `src/components/themed-text.tsx`, `src/components/themed-view.tsx`, and `src/hooks/use-theme.ts` reference only one another and have no application consumers; `assets/images/tabIcons/explore.png`, `explore@2x.png`, and `explore@3x.png` are unreferenced. The named `AnimatedIcon` export in both `src/components/animated-icon.tsx` and `.web.tsx` also has no consumer, but shares its module with the active `AnimatedSplashOverlay`.
- **Why it matters:** The unused theme files expose a second abstraction beside styled-components, and the Explore icons add a misleading inventory. Unlike the other unreachable files, `AnimatedIcon` currently has a measurable export cost: Metro preserves its module-level asset requires and emits `logo-glow.png` (331,624 bytes) and `expo-logo.png` (3,317 bytes) into the web output even though the current web splash renders only a text wordmark and never renders either image.
- **Recommended change:** Remove the unused `AnimatedIcon` exports and their private animation/style code from both platform modules, then remove `logo-glow.png`. Keep `expo-logo.png` while the native `AnimatedSplashOverlay` still requires it; platform resolution should stop emitting it in the web export once the unused `.web.tsx` consumer is gone. Remove the other confirmed unused files and run typecheck plus web export, asserting that both image artifacts disappear from web output. Keep `use-color-scheme` and the Home tab icon family: `home.png` is explicitly required and React Native resolves the `@2x`/`@3x` variants implicitly.
- **Timing:** Safe now. Do not fold the intentionally retained brand-source images under `assets/images/brand/` into this deletion.

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

### [D019] Remove unused direct dependency declarations

- **Status:** Ready
- **Where:** `package.json` dependencies `expo-status-bar`, `expo-system-ui`, and `react-native-gesture-handler`.
- **Why it matters:** A repository-wide import/config scan found no consumer for any of the three. `yarn why` reports each exists only because it is declared directly (gesture-handler is an optional Expo Router peer). None appears in the 2026-09-11 web bundle source map, so removal will reduce install surface and lockfile/native dependency inventory rather than the current web transfer size. `expo-font` and `react-native-screens` also have no direct app import but are transitive dependencies of `expo`/`expo-router`; deleting only their top-level declarations is manifest hygiene, not a real package or bundle saving. `expo-constants` and `expo-linking` satisfy Expo Router peers, while `expo-asset` is configured and also required transitively; keep those.
- **Recommended change:** Remove only the three confirmed standalone declarations with Yarn, then run the configuration/dependency verification tier. Re-run `yarn why` and inspect the lockfile diff so a transitive consumer or native autolinking requirement is not silently lost. Treat `expo-font`/`react-native-screens` declaration cleanup separately and only if aligning the manifest with Expo's recommended dependency contract is worthwhile.
- **Timing:** Safe for the active web target, but because dependency changes affect eventual native projects, include iOS and Android builds in its verification.

### [D020] Archive unused source artwork without claiming bundle savings

- **Status:** Wait for owner archive/delete decision
- **Where:** Nine unused brand exploration/source PNGs under `assets/images/brand/` (18.42 MiB total), plus `assets/images/landing/kendama-photo.jpg`, `assets/images/landing/landing-hero-fallback.png`, `assets/images/favicon.png`, and `assets/images/share-card.png` (0.30 MiB with the three `explore*` icons already owned by D014).
- **Why it matters:** Static reference checks and a fresh export show these files are not emitted into the web build, so deleting them would shrink the checkout/repository, not the shipped JavaScript or initial network payload. The 460,643-byte `assets/images/brand/branding-assets/daily-dama-og-share-card.png` is a source duplicate of the active `public/images/daily-dama-og-share-card.png`; only the public copy is deployed. `landing-hero-fallback.png` becomes relevant again only if the currently disabled `LandingHero` returns. The brand files were intentionally retained as concept/source material, so absence from runtime is not by itself permission to delete them.
- **Recommended change:** Keep them if Git is the intentional design-source archive. Otherwise move the accepted source originals to an explicit design archive outside the application repository and remove the duplicate/unselected exports here. Do not remove `home@2x`/`home@3x` merely because they have no textual reference; React Native selects them implicitly from `home.png`. Keep configured icon/splash/favicon assets.
- **Timing:** No release urgency because there is no measured web-bundle saving. Decide after D015 so the trick-viz fallback's future is clear.

## iOS workflow coverage — 2026-10-29

Continuation is tracked by T289 in `TASKS.md`; the rows below remain audit evidence, not completion claims.

This is a resumption checklist, not a claim to have exercised every permutation.
“Source only” means the path was traced but its mobile appearance/behavior was
not accepted. No app code/configuration was changed during this audit.

| Workflow | Evidence and result | Remaining check |
| --- | --- | --- |
| Onboarding | Owner completed it; agent previously saw entry and skill selection | Full retake, validation, trick selection and final-save loop on small iPhone |
| Home | Viewed current frontier, rotation, practice links and zero-history summaries | Entire scroll range, returning after new history, shortcut destinations |
| Five tabs | Switched Home/Sesh/Tricks/Stats; missing icons observed | Profile and repeated nested-tab behavior; VoiceOver; dark appearance |
| Timed Sesh setup | Viewed Timed state, duration field, software number pad and successful outside-tap dismissal | Invalid/empty duration, minimum 1-minute deadline, audio, no-lace result and note prompt |
| Open-ended Sesh | Countdown, first lace, pause, leave to Home/return paused, resume, early end and summary worked | Target-lace auto-completion, multiple laces, repeat/start-another actions |
| Stats | Completed 12-second/one-lace session appeared in totals and per-trick detail | Several records, zero-lace records, sequence/history snapshots, empty-state checks after normal setup |
| Practice list | Viewed selected standard tricks and the additional focused custom trick | Explicit deselect/reselect, no-selected-trick state, long directory scroll and laced-only screen |
| Custom standalone | 2026-11-04, iPhone 17e iOS 27.0: Tricks > Define new trick > Standalone, typed `T289.2 trick`, picked rank 3 with the radio picker, saved; the trick appeared in the Focused list and later showed rank 5 in the edit form after an edit. 18 Pro Max: new-sequence and edit-standalone forms laid out without clipping (layout spot-check only). Partial pass | Not run: creating an unranked standalone, confirming ranked-after-standard placement inside the rank sections, and re-checking the earlier `IOS audit trick` rank (it was not on the device list this run) |
| Custom editing/deletion | 2026-11-04, iPhone 17e: Edit form changed name and rank 3 to 5 and Save changes persisted (reopened edit showed rank 5). Delete route showed the reference-aware copy ("It is also used as a step in 1 sequence. That sequence will keep its saved step name."); Keep this trick returned to the directory unchanged; Delete custom trick removed it (focused count 5 to 4). 18 Pro Max: delete confirmation and edit form laid out cleanly (no deletion). Passed | Not run: outcome of an unsaved draft after header back was not captured |
| Custom sequence | 2026-11-04, iPhone 17e: new sequence `T289.2 seq` with custom text steps, Move step down reordered, existing-trick search and Add of the custom trick added a step, Save created it (06 Custom sequence). Edit reopened with the persisted order; reorder plus rename (`T289.2 v2`) saved. A second sequence (`T289.2 seq B`, two custom steps) created and deleted. 18 Pro Max: new-sequence form layout spot-checked. Create, reorder and edit passed | Not run: empty-name and fewer-than-two-step validation feedback, removing a step, Sesh practice-list rendering of sequence step names |
| Notes | 2026-11-04, iPhone 17e: Big cup trick notes: Add note saved `T289.2 note A`; Edit saved a multiline body (` edited` plus a line break and `second line`); Edit then Cancel left the note unchanged; Delete then Cancel kept it; Delete then Confirm removed it. 18 Pro Max: all-notes layout spot-checked (cards, header back, tab bar clear). Passed | Not run: Sesh note prompt, active-Sesh notes, relaunch persistence, focus landing after actions |
| Goals | 2026-11-04, iPhone 17e: Pull up spike goals: lace count goal `3` saved; practice time goal `2` minutes saved. Big cup: lace count goal `1` created, then a real open-ended Sesh (one lace, ended) completed it and the goal showed Achieved. Delete then Cancel kept the achieved goal; Delete then Confirm removed it. 18 Pro Max: all-goals layout spot-checked. Passed | Not run: empty-input validation feedback (a `0` entry was replaced before saving, its message was not recorded), progress display of the time goal, relaunch persistence |
| Multi-trick | Source only: temporary selection, configure run, timed/open-ended, first-lace advance, shared sequencing core | Full run, manual next, pause, end, completion/back-to-Sesh, tab reselection mid-run |
| Kentei assessment | Source only: full, from-rank, current-rank; skip/end/promotion through shared Sesh core | Actual native screens, rank picker on small viewport, interruption, completion and promotion dialog |
| Profile/theme | Source only: presets, HSV gestures/hex inputs, contrast display, resets, streak setting | Native gesture behavior inside scroll, software keyboard, save/reset feedback, leave/return, dark mode and Dynamic Type |
| Account/callbacks/sync | Source-confirmed unavailable on native (S040); signup invite seen after first completed Sesh | Resolve guest-only affordances; later real native signin/signup/reset/change-email/deletion/isolation/conflict checks |
| Feedback | Source-confirmed unavailable native transport and no form-stage visible exit (D021) | Native presentation, safe exit and real result when transport is enabled; no feedback submitted |
| Sandbox routes | Source and visible links; intentionally retained development tools (D015) | Inspect only under their handoffs; no claim that browser-oriented 3D views work on native |
| Relaunch/offline/lifecycle | Source inspected; existing persistence tests are not a new simulator result | Cold launch retains onboarding/history/custom data; foreground/background/lock; offline mutation; durable-write failure UX |
| Accessibility/device matrix | Screens expose many action names/states in AX; tab-item AX needs checking | VoiceOver, text scaling, Reduce Motion, smaller phone, landscape policy, iPad; Android and physical iPhone not tested |

### Simulator data created by the audit

- One completed open-ended Sesh for **Moshikame x10 or more, Spike**:
  approximately **12 seconds, one lace**. It contributes to the simulator's Stats
  and first-lace state; it is not evidence of the owner's real practice.
- One focused standalone custom trick named **IOS audit trick**. A rank-4 edit
  was attempted; confirm whether it saved after reconnecting.
- No existing user record was deleted, no account was created/changed, no
  feedback was sent, and no cloud mutation was intentionally performed.

### T289.2 additions (2026-11-04, iPhone 17e iOS 27.0)

- Remaining on the simulator: two goals on Pull up spike (lace count `3`, practice time `2` minutes) and one completed open-ended Big cup Sesh (a few seconds, one lace) that completed a `1` lace goal. Created and then deleted in-run: note `T289.2 note A`, tricks `T289.2 trick`/`T289.2 trick edited`, sequences `T289.2 seq`/`T289.2 v2` and `T289.2 seq B`, and the achieved Big cup goal. Pre-existing Big cup notes/goals and `Extremely long custom...` were not touched.
- iPhone 18 Pro Max (iOS 27.0) was only layout spot-checked on its existing data (all notes, all goals, new sequence, edit standalone, delete confirmation); no fixtures were created there.
- No reproduced finding, so no Needs scoping section was added. Android and physical iPhone: not run.

### iOS recommendation and audit limits

1. Restore native computer-use connectivity and finish the matrix, beginning
   with Profile, notes/goals, sequence forms and multi-trick/assessment runs.
2. Make guest-only service availability truthful (S040 affordances and D021).
3. Fix D022 readability, D023 insets with T044, and D024 directory composition.
4. Complete T042 icons/theme treatment; fix D025 clipped celebrations.
5. Run T043 lifecycle cases before treating timed sessions as dependable.
6. Leave sandbox release exposure with D015 and native accounts with S040;
   do not expand this UI pass into those implementations automatically.

Evidence: live simulator AX/screenshot inspections and UI interactions; current
route/component/provider source; `TASKS.md`, `TASKS_BACKLOG.md`,
`TASKS_COLLABORATIVE.md`, relevant completed entries in `TASKS_DONE.md`, and S040.
No app tests/builds were rerun for this documentation-only audit. The earlier
simulator-enablement checks remain separate evidence. No timing, VoiceOver,
physical-device, Android or hosted-backend sign-off is implied. Native capture
failed repeatedly after edit-save; that is an automation failure, not evidence
that Daily Dama crashed. Scrolling attempts that produced no movement are also
not accepted as proof of a product defect.

## Recommended execution order (historical broad cleanup queue)

1. T247 (D001) — prevent discarded outboxes from surviving a failed durable write.
2. T248.1–T248.2 (D002) — make all local persistence failures visible and retryable.
3. T225, then T226/T227/T228/T229 through their existing queues.
4. D003 — harden Auth submit failure handling.
5. D011 and D012 — restore trustworthy documentation and static-analysis signals.
6. D009/D010 — tighten data boundaries and runtime recovery.
7. D005, then D004 — type the cross-domain merge before consolidating sync machinery.
8. D006/D007/D008 after overlapping feature work is clear.
9. D013-D018 as focused polish.
10. For release-size work: decide D015 first, then D019 and D014; handle D020 only as repository hygiene.

## Scan evidence and limits

- `yarn tsc --noEmit`: passed.
- `yarn lint`: passed with 315 warnings; a non-test-only pass reported 34 warnings.
- Inspected route/provider composition, all five persistence and sync paths, Auth/feedback, guest import, SQL constraints/RLS, CSP/Sentry, hosting rewrites, largest source files, unused starter references, tracked outputs/assets, and current task queues.
- Did not run the full Jest suite, web export, local Supabase, or browser acceptance: this was a documentation-only audit on a dirty, behind checkout, and those runs would not resolve the hosted findings already assigned to T225-T229.
- Existing T236-T246 UI tickets were not copied into this backlog. They remain the authoritative queue for already-reported product polish.
- 2026-09-11 bundle refresh: searched package imports/configuration and every tracked `assets/`/`public/` filename; inspected Expo Router/React Three peer/transitive ownership with `yarn why` and installed manifests; generated a fresh production web export with external source maps; attributed generated bytes by source-map segment; and built an isolated `/tmp` scenario replacing only the trick-viz sandbox route with a redirect to measure D015. No repository source/config/package/assets were changed and no browser, hosted, iOS, or Android verification was performed.
