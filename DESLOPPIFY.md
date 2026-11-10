# Daily Dama desloppify backlog

**Scoped Android audit — 2026-11-09:** local `development` at `8f8a153`, with
owner-owned Android build changes in `app.json` and `package.json` preserved.
The running development build is `com.dailydama.app` 1.0.0 (installed today,
target SDK 36), on `emulator-5554` / Pixel_10, Android 17 / API 37,
1080×2424 at density 420, font scale 1.0. Both Daily Dama Metro processes
(8081 and 8082) have this checkout as their cwd; the emulator already forwards
8081. This is a scoped guest/UI pass, not full Android acceptance or a refresh
of every older finding. Older iOS/guest-only statements below are historical;
current native account enablement is tracked by T313 and its remaining children.

Android audit findings were scoped into the active `TASKS.md` queue on
2026-11-09 at the owner's request: D026 → T315, D027 → T316, D028 → T317,
D029 → T318, D030 → T319, D031 → T320, D032 → T321, and D034 → T322–T324.
D033 stays Superseded after the owner confirmed normal manual scrolling on
Profile and the standalone-trick form; it has no implementation ticket.
The D-items retain evidence and history; the T-items own execution and closure.
See the Android workflow matrix at the end for observed versus unverified checks.

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

### [D026] Restore Android onboarding trick-selection scrolling

- **Status:** Existing ticket (`TASKS.md`; T315; scoped 2026-11-09)
- **Where:** `src/features/onboarding/components/onboarding-selection-step.tsx`; `src/features/tricks/components/trick-directory.tsx`; containing Home/Screen layout.
- **Why it matters:** **Owner-reproduced on Android:** after the Kentei reveal, “Choose what to work on first” cannot scroll, restricting which rank-1 tricks can be selected. The audit started after onboarding was completed and did not clear the owner's emulator to replay it; independent fresh-onboarding reproduction remains required. Do not conflate this with completed iOS T302, which concerned a finish-button report and was closed as not reproducible.
- **Recommended change:** Reproduce with a separate fresh test installation/user, identify the measured viewport/content/gesture cause, and make the full list and Start practicing control reachable by touch. Check the entire flow through duration, theme and Sesh, then relaunch and confirm onboarding stays complete. Exercise rank 1 and a longer-name higher rank on Android, plus an iOS and web regression check. Add a focused regression test for the actual cause rather than merely asserting a SectionList exists.
- **Timing:** First Android usability fix. Preserve existing data and the profile hydration/persistence boundary. The owner confirmed normal manual scrolling on Profile and the standalone-trick form, so keep this investigation scoped to onboarding rather than assuming a shared scrolling defect.

### [D027] Restore Android Tricks create and overflow actions

- **Status:** Existing ticket (`TASKS.md`; T316; scoped 2026-11-09)
- **Where:** `TricksNativeHeader` and `usesNativeHeader` in `src/app/app/tricks/index.tsx`; `src/components/nested-stack-options.tsx`.
- **Why it matters:** **Emulator-observed and source-confirmed:** Tricks shows a title and search icon, but no create button or overflow menu. The component hides its in-list actions on every non-web platform, then supplies `unstable_headerRightItems`, whose installed Expo Router native-stack types explicitly mark it iOS-only. Users lose the normal entry points for creating standalone tricks/sequences and for aggregate goals, notes and laced views. Opening the custom-new route directly does render its choice and standalone form; this does not repair discoverability.
- **Recommended change:** Keep the existing iOS presentation, supply supported Android header buttons/menu (or a deliberate in-list Android fallback), and retain accessible names. On Android, prove all four destinations are reachable from Tricks without a deep link; create one standalone and one sequence, exercise search and Android Back, and return from each aggregate screen. Cover Android options/rendering in focused route tests and run the full typecheck. Verify the existing iOS and web entry points remain available.
- **Timing:** Fix immediately after or alongside D026; this unblocks ordinary custom-trick and aggregate-screen acceptance. Coordinate with T312.3–T312.5 in the same route/list area; their acceptance currently targets iOS.

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

### [D028] Supply Android symbols for every bottom tab

- **Status:** Existing ticket (`TASKS.md`; T317; scoped 2026-11-09)
- **Where:** `src/components/app-tabs.tsx:TAB_ICON_SYMBOLS` and `SymbolView` props; `src/components/app-tabs.test.tsx`.
- **Why it matters:** **Owner- and emulator-confirmed:** all five tab labels render with empty icon space. Each SymbolView receives an SF Symbol string. The installed `expo-symbols/src/SymbolView.tsx` returns only the fallback for a string on Android; no fallback is supplied. SDK-57 documentation likewise requires per-platform names. T042/T290 are completed iOS work, explicitly without Android acceptance, so this is a bounded Android follow-up.
- **Recommended change:** Add typed per-platform Material Symbol names or an intentional portable icon fallback. Reuse the existing selected/unselected tint semantics. Verify every tab in both states on Android, including a cold launch (font loading), the current Red theme and another preset; preserve iOS symbols and web navigation. Test Android mappings, not just five SF Symbol strings.
- **Timing:** Safe after the functional blockers; no navigation architecture change is needed. Reference: https://docs.expo.dev/versions/v57.0.0/sdk/symbols/.

### [D029] Retune the native Kentei reveal and badge presentation

- **Status:** Existing ticket (`TASKS.md`; T318; scoped 2026-11-09)
- **Where:** `src/features/onboarding/components/onboarding-rank-reveal-step.tsx`; reused by `src/features/profile/components/rank-up-celebration-modal.tsx`.
- **Why it matters:** **Owner-confirmed on Android; iOS recalled but not reverified:** the rank reveal is too abrupt and the circle looks poor compared with web. Source uses a fixed 220px circle, 100px numeral and `ZoomIn.duration(650).springify().damping(11)`. In the installed Reanimated `ComplexAnimationBuilder`, `springify(duration)` assigns `durationV = duration`, so calling it without an argument clears the preceding duration setting. This is a concrete timing lead, not proof that timing alone explains the visual complaint. No fresh reveal animation was replayed during this audit.
- **Recommended change:** Review a recording on Android, choose explicit spring or timed motion, and give the rank a readable hold and an intentional responsive badge/numeral composition. Verify both onboarding and later promotion, ranks 1 and 12, Reduce Motion, and small-screen button reachability. Compare iOS deliberately and preserve the accepted web presentation. Test motion configuration where meaningful; native visual acceptance is required.
- **Timing:** After D026; do not redesign assessment rules or rank persistence to solve a presentation defect.

### [D030] Derive readable text for accent-filled surfaces

- **Status:** Existing ticket (`TASKS.md`; T319; scoped 2026-11-09)
- **Where:** `daily-home.tsx:Hero/HeroTitle/HeroMarker/HeroCopy`; `sesh.tsx` first-lace/celebration and accent-filled controls; `use-resolved-theme.ts` surface foreground roles.
- **Why it matters:** **Emulator-observed with the existing Red preset:** the Home hero's dark headline and muted copy, and the first-lace banner's dark text, sit on saturated red and are hard to read. Red preset accent `#c0392b` against fixed ink `#18382e` is about 2.35:1. Page-derived text/muted colors do not establish contrast on the accent surface. T283 added onButton/onInk roles but does not cover this remaining surface. This is shared theme debt exposed on Android, not evidence of an Android rendering-only bug.
- **Recommended change:** Derive a foreground for the actual accent surface and use it consistently for accent-filled hero, celebration, and action text; inspect secondary copy independently. Preserve saved color preferences. Add contrast tests across all supplied presets and verify Red/Indigo/Default on Android plus representative iOS/web checks. Avoid a repository-wide recoloring pass.
- **Timing:** Safe bounded follow-up to T283; coordinate shared theme-token changes with D029.

### [D031] Make Android status-bar foreground follow the visible surface

- **Status:** Existing ticket (`TASKS.md`; T320; scoped 2026-11-09)
- **Where:** root/native appearance configuration; nested stack status-bar options; light app and auth surfaces.
- **Why it matters:** **Emulator-observed:** white clock/signal/battery icons remain over the pale Red page background, making OS status information faint. No application-owned StatusBar configuration was found in `src`. White on Red preset background `#fbdcd6` is about 1.29:1. The Expo dev-client floating gear is separate development UI, not a product finding.
- **Recommended change:** Set an intentional Android status-bar icon style based on the actual visible background, including root tab scenes, nested routes and auth. Verify the current light theme and a dark custom background, navigation transitions and foregrounding; preserve Android edge-to-edge/safe-area behavior. Confirm with the installed Expo/native-stack APIs before implementation and rebuild if native configuration requires it.
- **Timing:** Safe after the functional fixes. Do not disable edge-to-ed``ge or add arbitrary top padding as a workaround.

### [D033] Verify scroll reachability across Android forms and Profile

- **Status:** Superseded (2026-11-09 owner corroboration)
- **Where:** `KeyboardAwareScroll`; custom-trick form; Profile scroll container; keyboard layouts, with D026 as the owner-confirmed onboarding case.
- **Why it matters:** **Audit lead:** repeated injected drags left the standalone form at its upper content with Save below the viewport, and Profile did not move in the attempted drag. One form drag instead changed the draft rank. Keyboard text entry and note/goal saving did work. The emulator subsequently exited; its startup diagnostics reported hanging QEMU threads and forced software graphics on this API-37 image. These observations could reflect the emulator/automation path; they do not independently prove that every Android ScrollView is broken. An Android accessibility dump also failed with `null root node`, which is a tooling limit. No custom trick was saved.
- **Recommended change:** No application scrolling fix is justified by these injected-drag failures. Preserve this evidence as an emulator/automation limitation. Remaining long-form and keyboard acceptance stays in D034.
- **Timing:** Closed as an app-defect lead. D026 remains independently confirmed for onboarding.
- **Resolution (2026-11-09):** In response to the audit's specific question about manually dragging Profile and the new standalone-trick form to the bottom, the owner answered “Those screens scroll normally.” This is owner-observed evidence, not a successful automated retest; it resolves this broader-scrolling lead without asserting that every keyboard/form scenario has passed.

### [D034] Complete Android guest acceptance after the reachability fixes

- **Status:** Existing ticket (`TASKS.md`; T322–T324; scoped 2026-11-09)
- **Where:** Android workflow matrix below; guest onboarding, Sesh, custom tricks/sequences, notes, goals, Stats and Profile.
- **Why it matters:** **Verification work, not an additional confirmed defect.** The first development build has narrow Android evidence; older completed native tickets generally accepted iOS only. Missing entry points and uncertain automated scrolling leave meaningful workflows unaccepted, so this audit must not become an Android-readiness sign-off.
- **Recommended change:** Use a separate fresh guest environment for full onboarding and a persistent populated test environment for standalone/sequence create/edit (including snapshot behavior), notes/goals, single/multi-trick and assessment flows, timer/background/paused cases, Stats consistency, keyboard actions, cold relaunch, Android Back, TalkBack/large text and a second viewport. Record each result and any synthetic records. Preserve owner data; do not execute deletion scenarios without separate explicit authorization. Scope new defects from reproduced evidence. Keep account/sync acceptance owned by T313.6 rather than duplicating it here.
- **Timing:** Finish after the confirmed navigation/scroll fixes. Testing known working web/iOS paths does not close this Android gate.

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
- **T043.2 verification (2026-11-05, iPhone 17e iOS 27.0, port 8087):** Timed overdue, not-yet-due, open-ended, paused (timed/open-ended), multi-trick (timed, open-ended, paused), between-tricks and first countdown, lock/unlock and rapid cycles passed; overdue timers resolved at their logical deadline and the wake lock released on completion and End (paused keeps it, by design). Not run: Android, physical device, VoiceOver, actual screen dimming (T043).


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

### [D032] Use device wording in native Sesh backup invitations

- **Status:** Existing ticket (`TASKS.md`; T321; scoped 2026-11-09)
- **Where:** `src/features/sesh/components/sesh.tsx` inline and periodic guest sign-up invitations.
- **Why it matters:** **Emulator-observed after the first Sesh:** “Save this sesh for good” says progress can be lost if the user clears their browser. On Android this is a device/app-data boundary. Existing T314 owns the similar wording in three Auth screens, not these Sesh invitations.
- **Recommended change:** Use platform-appropriate device/app-data wording in both Sesh invitations while keeping web wording accurate. Add native/web copy assertions and inspect the first-session and periodic invitations on Android. Coordinate copy with T314 rather than duplicating its Auth implementation.
- **Timing:** After functional work; no persistence/auth behavior change.

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
| Onboarding | 2026-11-04, T289.4, fresh iPhone 17e `617CA090` (iOS 27.2 runtime, not 27.0; dev-client .app copied via `simctl install`, no prior data). Bundle pinned to this worktree's Metro on port 8083 (lsof cwd matched the worktree, `iOS Bundled` logged), branch HEAD `61c3da3`. Cold launch showed the native Start screen (Daily Dama / Get started), then intro, skill level (Basic), assessment (Landed it once, Not yet once, rank 1 shown), rank reveal, trick selection. Selection showed `Select at least one trick to continue.` with a disabled Start practicing button, then `2 tricks selected.` after picking Big cup and Small cup (a later run: 1 selected). Start practicing did NOT advance in either of two independent runs (5 taps in run 1 across positions, a long press and touch_path; 1 tap in run 2 after relaunch); checkbox taps on the same screen worked. Reproduced finding filed as T302. Duration and theme steps and the final save to Home were therefore not reachable. Partial; large-device onboarding blocked (fresh 18 Pro Max `4582AC65` was never granted Claude input access, so only a pending Open dialog was seen) | Blocked by T302: duration step, theme step, final save. Not run: large device |
| Home | 2026-11-04, T289.4, iPhone 17e `31BF7946` iOS 27.0, rank 3 with history. Bundle pinned to this worktree's Metro on port 8083 (lsof cwd matched the worktree, `iOS Bundled` logged), branch HEAD `61c3da3`. Full scroll captured: Pick up where you left off hero (T289.3 trick B, 0 laces), Next up (Frying pan, Spike), In rotation list of 6 rows including the long custom name wrapping on three lines, Time on the grind (02:56), Last seven days (13 seshes, 03:18, 14 laces), See all stats. Leaving to Home from Profile kept the earlier scroll position. iPhone 18 Pro Max `3326DA2D` iOS 27.0 (Indigo theme at start, rank 1): hero, Next up, In rotation laid out without clipping. Partial (populated only) | Not run: empty (zero-history) Home (blocked by T302 on the fresh simulator), tapping every shortcut destination, returning after a new T289.4 Sesh |
| Five tabs | 2026-11-04, T289.5, iPhone 17e `31BF7946` iOS 27.0, rank 3. Bundle pinned to this worktree's Metro on port 8085 (lsof cwd matched the worktree, `iOS Bundled` logged after each open), branch HEAD `1809425`. Tapped Home, Sesh, Tricks, Stats, Profile: each shows its icon and label, the selected tab is bold/dark, labels are not truncated, and the bar clears content. iPhone 18 Pro Max `3326DA2D` iOS 27.0: the same five icons and labels, bottom bar intact, tab taps (Sesh, Home, Stats) worked. Re-tapping Stats from inside the Trick viz and Kendama model sandboxes popped to the Stats root, so a nested tab re-tap returns to the root. System dark appearance (`simctl ui appearance dark`) did not change the app: the user theme wins, nothing broke (restored to light). T299 (Profile wrap-up persisting after Go to Home) was not re-run. Passed | Not run: re-tap inside the Tricks edit form and the Profile wrap-up (T299), VoiceOver tab names (see Accessibility row) |
| Timed Sesh setup | 2026-11-04, T289.4, iPhone 17e `31BF7946` iOS 27.0: Sesh > Timed showed Minutes = 5; entering `0` and `61` showed `Enter a whole number from 1 to 60.` and the Practice several tricks button and trick rows went disabled; `1` was accepted and re-enabled them. Hardware keyboard was connected, so the software number pad did not appear. 18 Pro Max: Timed state, Minutes 5, tricks list laid out without clipping. Partial. Pinned as above | Not run: empty (blank) value, starting and ending a timed run, no-lace result and note prompt, audio |
| Open-ended Sesh | Countdown, first lace, pause, leave to Home/return paused, resume, early end and summary worked | Target-lace auto-completion, multiple laces, repeat/start-another actions |
| Stats | 2026-11-04, T289.4, iPhone 17e `31BF7946` iOS 27.0, populated: 14 laces, 03:18, 13 seshes; Needs attention (Around Europe Never practiced, Pull up spike, long custom name); By trick cards include a zero-lace record (T289.3 trick 0 laces 00:18 2 seshes), a sequence snapshot (T289.2 seq B 2 laces) and the long custom name wrapping. 18 Pro Max `3326DA2D` iOS 27.0 (zero total laces, 6 seshes): the `You're putting in the work.` headline still appears with 0 laces (observation only, not filed). Populated Stats passed | Empty-Stats state not run: blocked by T302 (the empty state is only reachable on a fresh install that finishes onboarding; the `dailydama:///app/stats` deep link did not leave the onboarding screen), and no genuinely empty large device was available |
| Practice list | 2026-11-04, T289.4, iPhone 17e iOS 27.0: Sesh tab showed the format picker, Practice several tricks and Focused tricks (Big cup first). 18 Pro Max: Focused tricks listed Big cup and Clearance test without clipping. The onboarding selection list (fresh 17e) showed empty, 1, 2 and 3 selected states with the selection count and a disabled primary button. Partial | Not run: explicit deselect/reselect on the audited device, no-selected-trick Sesh state, long directory scroll, laced-only screen |
| Custom standalone | 2026-11-04, iPhone 17e iOS 27.0: Tricks > Define new trick > Standalone, typed `T289.2 trick`, picked rank 3 with the radio picker, saved; the trick appeared in the Focused list and later showed rank 5 in the edit form after an edit. 18 Pro Max: new-sequence and edit-standalone forms laid out without clipping (layout spot-check only). Partial pass | Not run: creating an unranked standalone, confirming ranked-after-standard placement inside the rank sections, and re-checking the earlier `IOS audit trick` rank (it was not on the device list this run) |
| Custom editing/deletion | 2026-11-04, iPhone 17e: Edit form changed name and rank 3 to 5 and Save changes persisted (reopened edit showed rank 5). Delete route showed the reference-aware copy ("It is also used as a step in 1 sequence. That sequence will keep its saved step name."); Keep this trick returned to the directory unchanged; Delete custom trick removed it (focused count 5 to 4). 18 Pro Max: delete confirmation and edit form laid out cleanly (no deletion). Passed | Not run: outcome of an unsaved draft after header back was not captured |
| Custom sequence | 2026-11-04, iPhone 17e: new sequence `T289.2 seq` with custom text steps, Move step down reordered, existing-trick search and Add of the custom trick added a step, Save created it (06 Custom sequence). Edit reopened with the persisted order; reorder plus rename (`T289.2 v2`) saved. A second sequence (`T289.2 seq B`, two custom steps) created and deleted. 18 Pro Max: new-sequence form layout spot-checked. Create, reorder and edit passed | Not run: empty-name and fewer-than-two-step validation feedback, removing a step, Sesh practice-list rendering of sequence step names |
| Notes | 2026-11-04, iPhone 17e: Big cup trick notes: Add note saved `T289.2 note A`; Edit saved a multiline body (` edited` plus a line break and `second line`); Edit then Cancel left the note unchanged; Delete then Cancel kept it; Delete then Confirm removed it. 18 Pro Max: all-notes layout spot-checked (cards, header back, tab bar clear). Passed | Not run: Sesh note prompt, active-Sesh notes, relaunch persistence, focus landing after actions |
| Goals | 2026-11-04, iPhone 17e: Pull up spike goals: lace count goal `3` saved; practice time goal `2` minutes saved. Big cup: lace count goal `1` created, then a real open-ended Sesh (one lace, ended) completed it and the goal showed Achieved. Delete then Cancel kept the achieved goal; Delete then Confirm removed it. 18 Pro Max: all-goals layout spot-checked. Passed | Not run: empty-input validation feedback (a `0` entry was replaced before saving, its message was not recorded), progress display of the time goal, relaunch persistence |
| Multi-trick | 2026-11-04, T289.6 rerun, iPhone 17e iOS 27.0. Bundle pinned to this worktree's Metro on port 8083 (cwd confirmed in the worktree, `iOS Bundled` logged after the open), branch HEAD `78b15a4`. The earlier 2026-11-04 T289.3 17e evidence was INVALID: it ran against a stale Metro on port 8081 serving the main checkout at `85d94c1`, before T290-T298 merged. Sesh > Practice several tricks, selected `T289.2 seq B` (custom sequence), `T289.3 trick` and `T289.3 trick B` (the first Continue frame showed 2 selected because a rapid third tap was lost; reselected), Continue to timing setup (time blank, Advance after one lace checked), Start sesh. First-lace advance: one lace on the sequence went to a countdown for `T289.3 trick`. Manual Next trick went to `T289.3 trick B` (last trick, so no Next trick button). Pause held 00:05 across a clock-minute change (4:06 to 4:07) and Resume continued (00:07). End Sesh went to wrap-up (seq B 1 lace 00:05, trick 0 laces 00:04, trick B 0 laces 00:09); Finish sesh returned to Sesh and Stats By trick showed trick B at 2 seshes 00:26 (earlier 00:17 plus 00:09). Sequence active screen: Pause/End sit close to the tab bar but are visible. iPhone 18 Pro Max iOS 27.0, same pin re-confirmed (bottom tab bar present, so not the old header-bar bundle): selection list with Continue clear of the tab bar, timing setup, active run with a notes card (Pause/End clear), countdown, wrap-up and Finish sesh all laid out without clipping. Passed | Not run: timed per-trick expiry, empty/invalid minutes validation, tab reselection mid-run, wrap-up for a fully completed run (last-trick lace), background/foreground (T043) |
| Kentei assessment | 2026-11-04, T289.6 rerun, iPhone 17e iOS 27.0, stored rank 2 (left by T289.3). Bundle pinned to this worktree's Metro on port 8083 (cwd confirmed in the worktree, `iOS Bundled` logged after the open), branch HEAD `78b15a4`. The earlier T289.3 17e evidence was INVALID (stale 8081 Metro serving main at `85d94c1`). Profile > Start Kentei assessment > Start from a rank > 2: Skip this rank showed the 5-trick preview (Baseball, Easy big cup Spike, Small cup Big cup, Moshikame x10, Airplane) and Skip rank moved to Rank 3 Frying pan, Spike; End assessment showed the skipped entry, `You held Rank 2.` copy and Go to Home, rank stayed 2. Current rank only at rank 2: a lace on each of the five rank-2 tricks advanced automatically, then the full-screen `You leveled up to Rank 3.` dialog, Nice! returned to a wrap-up (five 1-lace rows, `Rank up! You're now Rank 3.`), and Profile showed 03 (permanent, no UI lowers it). iPhone 18 Pro Max iOS 27.0, same pin, rank 1: chooser, rank picker (6x2 grid), active Big cup with notes and end wrap-up laid out without clipping; no laces landed. Skip, end and promotion passed. T299 reproduced on both devices (see below); T300 did not reproduce on either | Not run: full assessment, interruption/background (T043), restoring rank (no UI path lowers it) |
| Profile/theme | 2026-11-04, T289.4, iPhone 17e `31BF7946` iOS 27.0, rank 3, started on Default theme and streak 5. Bundle pinned to this worktree's Metro on port 8083 (lsof cwd matched the worktree, `iOS Bundled` logged), branch HEAD `61c3da3`. Rank display `03`; Indigo preset applied (underlined in the grid, page background tinted); contrast line updated while dragging (1.7:1, 2.3:1, 3.0:1); invalid hex `#zz12` showed `Enter a 6-digit hex color, e.g. #4477aa.` with Save disabled; valid `#f2e6c9` updated the spectrum, contrast 10.3:1 and Save applied the cream background; Reset background & accent returned to Default (button disabled afterwards, no text confirmation). Streak minutes: `0` showed `Enter a whole number from 1 to 60.` with Save disabled; 7 saved and persisted across Home and back; restored to 5. Colour gestures: dragging on the spectrum inside the scrolling page moves the colour and also scrolls the page (three occurrences) - filed as T303. 18 Pro Max `3326DA2D` iOS 27.0 (started on Indigo, rank 1): Raw applied and the picker followed it, Indigo restored. Passed with T303 | Not run: every preset beyond Indigo/Raw, accent and text colour gestures, dark mode, larger text (T289.5), streak setting on the large device, software keyboard (hardware keyboard connected)
| Account/callbacks/sync | 2026-11-04, T289.5, iPhone 17e `31BF7946` iOS 27.0. Bundle pinned to this worktree's Metro on port 8085 (lsof cwd matched the worktree, `iOS Bundled` logged after each open), branch HEAD `1809425`. Profile Account section reads `Your practice is saved on this device only. Sign-up, sign-in, and backup are not available here yet.` and offers no sign-up, sign-in, reset or delete control. Deep link `dailydama:///auth/callback` with the app running showed `Accounts are not available in the mobile app yet` with the same truthful copy and a Back to app button that returned to Home. The app was then terminated and `dailydama:///auth/sign-in` was opened cold: the dev-client launcher appeared first (so it may mask the pure cold path); choosing the pinned 8085 server reached the same unavailable screen, and Back to app returned to Home. The post-first-Sesh signup invite was not seen after the T289.5 Sesh (wrap-up showed a first-lace banner and a note prompt only). Guest-only scope reflected; passed | Not run: real native signin/signup/reset/change-email/deletion/isolation/conflict checks (S040, no account created); the other auth routes (check-email, forgot-password, reset-password) |
| Feedback | 2026-11-04, T289.5, iPhone 17e `31BF7946` iOS 27.0, same pin as Account. Profile > Send feedback opened `Feedback is not available in the app yet. Sending feedback currently works only in the web version of Daily Dama. This app does not send feedback.` with a visible Back to Profile button, which returned to the top of Profile. Copy is truthful and a safe exit exists. No feedback was submitted. Passed | Not run: the form stage with a real transport (unavailable on native), 18 Pro Max |
| Sandbox routes | 2026-11-04, T289.5, iPhone 17e `31BF7946` iOS 27.0, same pin. Dev-only links on Home opened: Trick viz sandbox (dark viewport with no visible 3D model, replay/scrub controls present, header back), Kendama model sandbox (blank viewport with pose chips), Sesh sequence sandbox (a Big cup sequence with notes card, timer and Laced control). No red box or crash; header back and re-tapping the Stats tab both left. The first tap on the Sesh sequence link did not navigate; a second did (not re-tested). Native rendering of the 3D views is NOT claimed: both viewports were blank on the simulator. Opens/exits passed; intentionally retained dev tools (D015) | Not run: whether the 3D views draw on a device, the onboarding-screen links, 18 Pro Max |
| Relaunch/offline/lifecycle | 2026-11-04, T289.5, audited iPhone 17e `31BF7946` iOS 27.0. Bundle pinned to this worktree's Metro on port 8085 (lsof cwd matched the worktree, `iOS Bundled` logged after each open), branch HEAD `1809425`. Before: rank 03, Stats 14 laces/03:18/13 seshes, Big cup NOTES 3 and GOALS 4, Pull up spike GOALS 2, custom long-name trick, theme Default. After `simctl terminate` + `simctl launch`: the dev client showed its own splash then reconnected to the pinned server (a new `iOS Bundled` line), so the T293 wordmark splash was NOT observed and the dev-client path may mask the pure cold path; the first real screen was Home with the T289.3 trick B hero, rank 3, no blank or Loading frame. Stats identical (14/03:18/13); All notes showed the 3 Big cup notes; Trick goals showed the Big cup goals; the Custom section listed T289.2 v2, T289.2 seq B, T289.3 trick and T289.3 trick B; Default theme kept. Onboarding stayed complete (Home, not Start). Fresh 17e `617CA090` iOS 27.2: it was on the trick-selection step with 1 trick selected, the app was found closed after the pin open, and a relaunch showed the Start screen (Get started), i.e. mid-onboarding step and selection were not restored (observation; T302 stays open). iPhone 18 Pro Max `3326DA2D`: cold relaunch kept rank 1 and Indigo. Lifecycle on the 18 Pro Max: HOME then LOCK then unlock then launch returned the same process (PID unchanged) to the same Home. Persistence (onboarding, history, custom tricks, notes, goals) passed on the 17e | Not run: offline mutation (guest local-first, no native cloud path), durable-write failure UX (cannot be injected), active-Sesh background/lock (T043), data created by T289.1, the pure no-dev-client cold launch |
| Accessibility/device matrix | 2026-11-04, T289.5, iPhone 17e `31BF7946` and iPhone 18 Pro Max `3326DA2D`, iOS 27.0. Bundle pinned to this worktree's Metro on port 8085 (lsof cwd matched the worktree, `iOS Bundled` logged after each open), branch HEAD `1809425`. VoiceOver: BLOCKED. Settings > Accessibility > VoiceOver could be switched on (the VoiceOver Gestures dialog and a focus cursor appeared once), but with the app foregrounded no cursor, no spoken text and no Caption Panel output appeared and single taps still activated controls, so no tab or control labels could be read from the simulator; `defaults write VoiceOverTouchEnabled` changes the flag but does not engage the screen reader. Not marked passed. Dynamic Type: extra-extra-extra-large (non-accessibility) Home laid out correctly; at accessibility-extra-extra-extra-large Home, Sesh, Tricks, Stats and Profile loaded and scrolled with controls reachable, but headlines break mid-word (`Wha/t are/we`, `You'/re`) or one character per line on Profile `03`, the tab labels stay small, and the active Sesh clips `Laced.` and the count `0` and splits `Pause Sesh`/`End Sesh` mid-word (filed as T305). Changing the text size while the app is running leaves a stale layout (clipped `RA`, `Clearar`, `Run it bac` on the 18 Pro Max at accessibility-large; huge vertical gaps at accessibility-medium and on the 17e after AX5 to large) until a cold relaunch (filed as T304). The earlier blank Home was NOT reproduced as a blank screen at accessibility-extra-extra-extra-large by (a) live change on Home, (b) cold relaunch, (c) Sesh/Stats-to-Home navigation, on both devices; the T304 stale-layout state is the closest reproduction (content present but stretched). Reduce Motion: enabled and confirmed in Settings > Accessibility > Motion; a fresh Sesh countdown, first-lace banner and wrap-up all worked, and Reduce Motion was restored to off; still frames cannot show whether the app suppresses motion, so no pass is claimed (source has no reduce-motion handling; not evidence) | Not run: landscape, iPad, Android, physical iPhone; hands-on VoiceOver; Reduce Motion with the lace tick animation compared frame by frame |

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

### T289.3 additions (2026-11-04, iPhone 17e iOS 27.0)

- **Assessed rank changed:** the 17e's stored Kentei rank went from 1 to 2 when the promotion run completed. The app has no way to lower it (rank is advance-only), so it was not restored. The simulator holds audit data, not owner practice.
- **Remaining on the 17e:** custom tricks `T289.3 trick` and `T289.3 trick B` (focused, unranked); completed-Sesh records from the multi-trick run (sequence 1 lace, two 0-lace tricks), a 0-lace Baseball assessment record, and the promotion run (Big cup 0 laces; Small cup, Base cup, Moshikame x5, Pull up spike one lace each). Laces on those four standard tricks are now permanent first-lace state. Nothing pre-existing was deleted.
- **Tooling, not findings:** a third custom trick `T289.3 trick C` was not created (a save tap was lost) and the first trick saved as `T289.3 trick` without its `A`, so a `T289.2 seq B` custom sequence stood in as the third run entry. The app first showed the dev-server error because it was pointed at port 8082 while Metro ran on 8081; reconnecting through the `exp+daily-dama` URL fixed it. `T289.2 v2` and `T289.2 seq B` still appeared in the 17e Custom list although T289.2 recorded deleting them; that was not investigated here.
- **18 Pro Max:** stored rank stays 1; one 0-lace `Clearance test` multi-trick record and one 0-lace Big cup assessment record may have been added. The Indigo preset renders dark text on indigo for the Practice several tricks button, section bands and Next trick; this is theme-dependent and not filed. The large device appears to run an earlier JS bundle than the 17e, so the layout comparison is against that bundle.
- Android and physical iPhone: not run.
- **Invalidated by T289.6:** the 17e screens above came from a stale Metro on port 8081 serving the main checkout at `85d94c1`, before T290-T298 merged, so the Multi-trick and Kentei rows were re-run on a pinned bundle (see T289.6 additions). The data and rank facts above remain true; the UI observations and the T299/T300 findings were re-tested there.

### T289.6 additions (2026-11-04, iPhone 17e and iPhone 18 Pro Max, iOS 27.0)

- **Pin evidence:** Metro started from this worktree on port 8083 (`lsof` cwd matched the worktree), branch HEAD `78b15a4`; each device was pointed at it with `xcrun simctl openurl <udid> "exp+daily-dama://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8083"` and Metro logged `iOS Bundled` after each open (17e: 3052 modules; 18 Pro Max: 1 module, cached). No native rebuild was needed (no package/app.json/plugin/asset change since the installed dev clients). Metro stopped afterwards.
- **T299 re-test: reproduced** on current code. On the 17e after the skip/end run and after the promotion run, Go to Home then tapping Profile showed the old `Sesh complete` wrap-up; a second Profile tap showed the Profile root (`02` after the skip/end run, `03` after promotion). Also reproduced on the 18 Pro Max after an end run at rank 1. Kept in Needs scoping with updated details.
- **T300 re-test: not reproduced** on current code. On the 17e (Big cup with a 3-note card, started from rank 1) the assessment screen scrolls and `Skip this rank` is fully visible above the tab bar after scrolling; on the 18 Pro Max the same screen fits without scrolling, `Skip this rank` clear of the tab bar. Removed from Needs scoping. Note: on the 17e the Pause/End row is partly under the tab bar before scrolling; this is the scroll-to-reach behaviour, not a hidden control.
- **T289.2 records:** `T289.2 v2` and `T289.2 seq B` still appear in the 17e Custom selection list although T289.2 recorded deleting them. Persists; not investigated.
- **Assessed rank changed:** the 17e's stored Kentei rank went from 2 to 3 (promotion run, permanent). The 18 Pro Max rank stays 1.
- **Remaining on the sims:** 17e: one multi-trick record (seq B 1 lace; trick 0 laces; trick B 0 laces), a 0-lace Frying pan assessment record, a promotion run (Baseball, Easy big cup Spike, Small cup Big cup, Moshikame x10, Airplane one lace each, now permanent first-lace state), and a 0-lace Big cup assessment record. 18 Pro Max: a 0-lace Big cup plus 0-lace Clearance test multi-trick record and a 0-lace Big cup assessment record. Nothing was deleted.
- **Tooling, not findings:** one rapid third checkbox tap and one countdown-timing Skip tap were lost and repeated; the screenshot `scale` parameter did not shrink frames.
- Android and physical iPhone: not run.

### T289.4 additions (2026-11-04, iPhone 17e and iPhone 18 Pro Max)

- **Pin evidence:** Metro started from this worktree on port 8083 (`lsof` cwd matched the worktree), branch HEAD `61c3da3`; every device was pointed at it with `xcrun simctl openurl <udid> "exp+daily-dama://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8083"`; Metro logged four `iOS Bundled` lines in total (17e 3052 modules, then cached 1-module bundles). The bottom tab bar, the native Start screen and the absence of the old header bar confirmed current code on every device that was used. Metro stopped afterwards.
- **Which device held which evidence:** fresh iPhone 17e `617CA090-A7B0-4683-B40F-236277B88E11` on the iOS 27.2 runtime (not 27.0): onboarding only. Audited iPhone 17e `31BF7946-E642-4522-A55F-7CB89E11CBD5` (iOS 27.0, rank 3): Home, Stats, Practice list, Timed setup, Profile/theme. Audited iPhone 18 Pro Max `3326DA2D-8664-458E-8B01-5F6A5D19710D` (iOS 27.0, rank 1, Indigo): large-device spot checks. Fresh iPhone 18 Pro Max `4582AC65-79F7-474F-8101-6C72FD5227E9` (27.2): booted and the dev client installed, but Claude input access was never granted, so no input or screenshot-driven evidence was gathered there.
- **Finding T302:** the fresh onboarding Start practicing button did nothing in two independent runs. Filed in Needs scoping.
- **Finding T303:** dragging a colour spectrum inside the Profile scroll view also scrolls the page. Filed in Needs scoping.
- **Observations not filed:** the dev-only sandbox links overlap the bottom of the onboarding selection list (`__DEV__` only); the Stats headline `You're putting in the work.` shows with 0 laces on the 18 Pro Max; the Indigo preset renders dark text on indigo (already noted under T289.3); Reset background & accent gave no text confirmation.
- **Test data and restores:** fresh 17e now holds only onboarding progress (not completed). On the audited 17e the theme went Default to Indigo to cream `#f2e6c9` and was restored to Default via Reset (verified); streak minutes went 5 to 7 and were restored to 5 (verified). On the 18 Pro Max the theme went Indigo to Raw and back to Indigo (verified). The 17e Timed Minutes field was left at 1 (transient UI state). Nothing was deleted.
- **Tooling:** the first Open dialog on the fresh 17e ate a tap; the software keyboard never showed (hardware keyboard connected), so keyboard-dismissal behaviour is not covered; frames were taken with `simctl io` and resized. `dailydama:///app/stats` on the onboarding sim did not navigate.
- Android and physical iPhone: not run.

### T289.5 additions (2026-11-04, iPhone 17e and iPhone 18 Pro Max)

- **Pin evidence:** Metro started from this worktree on port 8085 (`lsof` cwd matched `/.claude/worktrees/agent-a9f3032ff02d50ce8`), branch HEAD `1809425`; each device was pointed at it with `xcrun simctl openurl <udid> "exp+daily-dama://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8085"` and Metro logged `iOS Bundled` on every device and relaunch (five lines by the end of the large-device run). The bottom tab bar, native Start screen and no header bar confirmed current code. After each relaunch the dev client reconnected to the pinned server on its own; the launcher also lists 8081, which was never selected. Metro stopped afterwards.
- **Devices:** audited iPhone 17e `31BF7946-E642-4522-A55F-7CB89E11CBD5` (iOS 27.0, rank 3, history) was primary; iPhone 18 Pro Max `3326DA2D-8664-458E-8B01-5F6A5D19710D` (iOS 27.0, rank 1, Indigo, points 440x956) for large-device checks; fresh 17e `617CA090-A7B0-4683-B40F-236277B88E11` (iOS 27.2) for the mid-onboarding relaunch only. The fresh 18 Pro Max `4582AC65` was not used. Scope caveat: T289.1 is still open, so relaunch persistence covers data created by T289.2, T289.3, T289.4 and T289.6 only, not anything T289.1 would create.
- **Finding T304:** changing Dynamic Type while the app is running leaves a stale layout until a cold relaunch. Filed in Needs scoping.
- **Finding T305:** at accessibility-extra-extra-extra-large text, headlines break mid-word and the active Sesh controls clip. Filed in Needs scoping.
- **Observations not filed:** the dev-only sandbox links overlap Home content at large text sizes (`__DEV__` only); at AX5 the Sesh trick-card arrow overlaps the trick name and the header back button label `Stats` is huge in the sandbox header; the dev client shows its own splash on cold launch, so the T293 wordmark splash could not be evaluated; both sandbox 3D viewports were blank; mid-onboarding progress is not restored after the app is closed.
- **Test data and restores:** one completed open-ended Sesh was recorded on the 17e for `T289.3 trick B` (1 lace, 00:33, first lace for that trick): Stats went 14 laces/03:18/13 seshes to 15/03:52/14. Nothing was deleted and no account or feedback was created. Restores verified: content size large on both devices (`simctl ui content_size`), appearance light on both, Reduce Motion 0 on all three simulators (confirmed in Settings > Motion), VoiceOver Off (Settings shows Off, `VoiceOverTouchEnabled = 0`) and the VoiceOver Caption Panel switched off through Reset VoiceOver Settings (all VoiceOver settings were default beforehand).
- **Tooling:** `simctl io screenshot` plus `sips` resizing for frames; a mistaken 402x874 point assumption for the 18 Pro Max (it is 440x956) caused two taps to land on the Trick viz link before correction; VoiceOver could not be driven (see Accessibility row). Android and physical iPhone: not run.

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

## Android workflow coverage — 2026-11-09

This is the current scoped Android result. Older iOS rows above are not Android
evidence. No application code, dependencies, task-queue statuses, or owner build
configuration were changed. The source findings D026–D034 are retained here; T315–T324 in `TASKS.md`
own execution after the owner-requested scoping pass. No work was claimed or
published. Source references were checked against this checkout and
the installed packages, including the SDK-57 Expo Symbols documentation.

| Workflow | Evidence and result | Remaining acceptance |
| --- | --- | --- |
| Initial onboarding and reveal | Owner reports unscrollable trick selection and an abrupt/unattractive circular reveal on Android. Shared reveal/selection code inspected; the installed Reanimated spring builder clears the earlier duration setting when `springify()` has no duration argument. | Fresh replay was not run because the emulator had completed onboarding and its data was preserved. D026/D029 require a separate fresh test environment and iOS comparison. |
| Home and tabs | Empty and populated Home observed in existing Red theme. All five tabs opened; labels work but every tab icon is absent. Home's normal Moshikame x5 Practice link ultimately showed the requested practice setup. A tentative stale-link concern was not filed as a defect. | Full lower-page shortcuts, another viewport and large font size not verified. D028/D030/D031 own observed icon/contrast issues. |
| Tricks | Focused/rank rows and per-trick Notes opened. Android native search affordance is present. Create/overflow buttons are absent; installed native-stack types mark `unstable_headerRightItems` iOS-only. | Search query/filtering, deep library scrolling and full focus/laced editing not accepted. D027 owns missing entry points. Existing T312.3–T312.5 are iOS-scoped list work, not Android sign-off. |
| Notes | Created and saved `Android audit note only` on Big cup using the Android software keyboard. List shows one note, and active practice displayed that note. | Editing, long/multiple notes, aggregate entry and relaunch persistence not yet verified. No note deleted. |
| Goals | Opened Big cup goals, entered `3` with numeric keyboard, saved, and observed the `0 / 3 laces` card. Goal progress correctly starts after creation rather than counting the earlier audit Sesh. | Practice-time goals, completion celebrations, aggregate picker and relaunch persistence not yet verified. No goal deleted. |
| Custom tricks/sequences | A direct app link opened the missing create destination. Choice screen and standalone form render; name input and visual rank selection respond. Draft `AndroidAudit` was not saved. Repeated injected drags did not expose lower Save controls, but the owner subsequently confirmed that the standalone form scrolls normally by hand; D033 superseded. | Standalone/sequence save/edit, keyboard reachability and snapshot behavior remain unverified. No existing trick deleted or edited. |
| Open-ended Sesh | Format selection, automatic countdown, active note display, lace tap, pause, Home/foreground and End exercised. Foreground screenshot shows paused `00:31` with one lace; completion records `00:31`, one lace, first lace at `00:26`. A tap while paused did not add a lace. | Resume was invoked immediately before End without an intervening settled screenshot, so resumed elapsed-time progression is not accepted. Lock/unlock, wake-lock release, process death and full lifecycle permutations not verified. |
| Timed Sesh | Home's Moshikame x5 Practice control reached the correct setup. Switched to Timed, entered `1`, observed `01:00` countdown copy and an active `00:46` remaining screen with zero laces. | The emulator exited during the subsequent background check. Timed completion/deadline, history recording and background recovery are **not accepted**. A completion record may have been written before the emulator exited; verify before counting or repeating this test. |
| Stats | After the open-ended run, Stats shows exactly 1 Sesh, 1 lace and `00:31`; populated Home shows the same latest session. | Per-trick history details, date filters and restart persistence not yet accepted. |
| Profile | Current theme preset chooser and assessment button render. Automated drag did not establish full-page reachability; the owner subsequently confirmed normal manual scrolling to the bottom. Existing Red preference preserved. | Theme changes, spectrum dragging, streak editing, keyboard reachability and assessment execution not accepted. No general Profile scrolling defect is filed. |
| Account entry | Direct-linked sign-in renders email/password fields, visibility control, Sign in, Forgot password, Back to app and sign-up navigation. No credentials entered or requests submitted. | Real Auth callbacks, import/sync, offline/reconnection, account isolation, logout and deletion remain T313.6 acceptance, not passed by this UI audit. T313.4/T314 also remain authoritative open work. |

### Android evidence, data and continuation

- Screenshots were captured under `/tmp/dd-android-*.png` (temporary evidence,
  not durable repository assets); the initial screen is
  `/tmp/daily-dama-android-current.png`. Android UI hierarchy capture succeeded
  once, then returned `null root node` on another attempt. The native emulator
  window could not be bound through computer-use, so the platform's ADB tools
  were used for screen capture and input. Delayed inputs/captures were checked
  against settled screens; no responsiveness defect is inferred from that delay.
- An inspected filtered Android log tail showed no error lines, but this is
  not a complete crash/log audit. No app suite, web export, hosted service tests,
  or native rebuild was rerun for these documentation-only findings.
- The emulator process itself exited during the timed/background test; ADB
  reported `error: closed`, followed by no devices and no QEMU process. Reopening
  the existing Pixel_10 reported hung QEMU main/CPU threads and
  `API level 37 requires GLES 3.1, forcing software rendering for GLES`.
  The first reopen waited on a crash-report dialog and was interrupted. A
  non-wiping cold boot (`-no-snapshot-load -crash-report-mode never`) restored
  ADB and `sys.boot_completed=1`; Daily Dama's activity was launched and the
  existing 8081 Metro reverse restored. Screen capture still stalled and was
  interrupted, so app recovery/persistence was not visually accepted. No wipe,
  uninstall, app-data clear, project cleanup, credential operation or existing
  record deletion was performed. The emulator itself automatically discarded
  its generated crash report when reporting mode was set to never; that was
  not an app/user-data deletion. Compare API 36 before attributing gesture or
  capture failures to application code. This is a concrete tooling limit, not
  evidence of a Daily Dama crash.
- Audit-created saved data: the Big cup note above, a three-lace Big cup goal,
  and the open-ended Big cup Sesh above. The Sesh permanently establishes its
  first real lace in this emulator's history. The goal was created afterward.
  These are synthetic audit records, not owner practice. No data was deleted.
- Remaining broad guest acceptance: full multi-trick/assessment run, sequence
  creation/editing, keyboard reachability on all long forms, cold-launch
  persistence, TalkBack/large text and a second Android viewport. Reachability
  failures should be corroborated and fixed before signing these off. Auth and
  destructive account operations require their existing dedicated acceptance;
  this audit did not create an account, send feedback, or alter credentials.
- Recommended order: T315; T316; T317; T319/T320; T318; T321; then
  T322–T324 once their stated dependencies pass. T313.6 retains Android Auth/sync
  acceptance. Do not reopen completed iOS tickets merely to imply Android coverage.
