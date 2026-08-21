# Tasks — Formal Backlog (excluded from automation)

Scoped, well-defined tasks that live outside the active work queue in [TASKS.md](TASKS.md). Entries here follow the same template and status legend as `TASKS.md`, and are just as ready to pick up — the only difference is intent: this file is **not** read by the `newTicket` workflow (see `.claude/skills/newTicket/SKILL.md`), so nothing here is claimed, planned, or implemented automatically.

To bring a task back into automated flow, move its entry from this file into `TASKS.md`'s `Backlog` section (reversing the process that put it here). Do not have an agent do this as a side effect of an unrelated task — moving something into the automated queue is a deliberate human decision.

Completed entries still move to [TASKS_DONE.md](TASKS_DONE.md), same as `TASKS.md`, if a task here is ever completed manually.

---

### [T042] Complete native tab iconography

- **Area:** Navigation
- **Priority:** Medium
- **Status:** Not started
- **Planning:** Required
- **Description:** Give Sesh, Tricks, Stats, and Profile distinct, subject-appropriate native tab icons rather than relying on incomplete or repeated icon treatment.
- **Exit criteria:** Deliberate iOS and Android checks confirm all five native tabs have distinct, route-appropriate icons that remain legible and unclipped in selected and unselected states, while the existing web navigation and its verified 320 px fit remain unchanged.
- **Notes:** This is native navigation polish, not a web-navigation redesign. Update navigation tests or snapshots where they provide useful regression protection.

### [T043] Harden active Sesh behavior across app backgrounding

- **Area:** Sesh
- **Priority:** High
- **Status:** Not started
- **Description:** Make timed, open-ended, paused, and multi-trick Sesh behavior reliable when the app moves between foreground and background.
- **Notes:** Umbrella only — complete T043.1 and T043.2. Route-navigation and process-death recovery are intentionally out of scope for this task — they are a separate concern from foreground/background reconciliation and are not tracked anywhere in this file.

### [T043.1] Reconcile active Sesh state after foregrounding

- **Area:** Sesh
- **Priority:** High (inherited from parent T043)
- **Status:** Not started
- **Planning:** Required
- **Description:** Add explicit app-lifecycle coordination that reconciles timed, open-ended, paused, and multi-trick Sesh state against timestamps when the app returns to the foreground.
- **Exit criteria:** Automated state-transition tests confirm an overdue timed Sesh completes at its logical deadline, an open-ended Sesh reports correct elapsed active time, a paused Sesh remains paused without accruing active duration, and a multi-trick run retains coherent current-trick state after a background/foreground cycle.
- **Notes:** Keep timestamp acquisition and app-state effects outside the reducer, passing explicit timestamps through actions. Do not add persisted in-progress Sesh state.

### [T043.2] Verify backgrounded Sesh behavior on iOS and Android

- **Area:** Sesh
- **Priority:** High (inherited from parent T043)
- **Status:** Not started
- **Planning:** Required
- **Description:** Exercise T043.1's lifecycle behavior on both native platforms and fix any platform-specific integration defects without changing the Sesh domain model. Depends on T043.1.
- **Exit criteria:** Deliberate iOS and Android checks cover timed, open-ended, paused, and multi-trick Sesh background/foreground cycles, confirm any overdue timer resolves at its logical deadline, and confirm the wake lock releases after completion or cancellation; any platform-specific regressions found are covered by an automated test where practical.
- **Notes:** This is native hardening of the lifecycle model established in T043.1, not process-death recovery or route-leave protection.

### [T044] Prevent mobile keyboards from obscuring form actions

- **Area:** Forms / mobile layout
- **Priority:** Medium
- **Status:** Not started
- **Description:** Establish a reusable keyboard-aware form layout and apply it to custom-trick editing, notes, goals, Profile streak editing, and the access gate.
- **Notes:** Umbrella only — complete T044.1 and T044.2. Use safe-area and keyboard behavior rather than fixed device-specific offsets; preserve existing web layouts.

### [T044.1] Establish a shared keyboard-aware form layout

- **Area:** Forms / mobile layout
- **Priority:** Medium (inherited from parent T044)
- **Status:** Not started
- **Planning:** Required
- **Description:** Create the smallest reusable layout primitive or convention needed to keep long mobile forms scrollable and their primary actions reachable while the keyboard is open, proving it through the custom-trick form.
- **Exit criteria:** On representative small iOS and Android viewports, the custom-trick form's final input and primary action remain reachable with the keyboard open, scrolling and keyboard dismissal behave predictably, safe-area and tab-bar insets do not overlap content, and the web layout remains unchanged.
- **Notes:** Avoid fixed device-specific offsets. Keep the abstraction narrow enough to accommodate screen-specific headers and action layouts rather than forcing every form into an identical visual shell.

### [T044.2] Apply the keyboard-aware layout to remaining forms

- **Area:** Forms / mobile layout
- **Priority:** Medium (inherited from parent T044)
- **Status:** Not started
- **Planning:** Required
- **Description:** Apply T044.1's proven layout pattern to notes, goals, Profile streak editing, and the access gate. Depends on T044.1.
- **Exit criteria:** Focused checks on representative small iOS and Android viewports confirm the final input and primary action remain reachable with the keyboard open on every notes, goals, Profile streak, and access-gate form; scrolling, dismissal, safe-area, and tab-bar behavior are consistent and web rendering is unchanged.
- **Notes:** Adapt the shared convention where a screen's structure requires it; do not introduce fixed offsets or unrelated form redesigns.

---

_T153–T162 come from S032–S039 and S041, refined from [BACKEND_ROADMAP.md](BACKEND_ROADMAP.md) and first scoped into this formal backlog on 2026-08-21. Phase 1 umbrella T153 and Phase 2 umbrella T155 have moved to the automated queue in [TASKS.md](TASKS.md); T154 and T156–T162 remain here for later roadmap phases. Supabase, guest access, PKCE, local-first synchronization, immediate account deletion, and the roadmap's security requirements are settled product decisions. S040 (native account hardening) remains unscoped in [BACKLOG_STORIES.md](BACKLOG_STORIES.md) because mobile hardening is explicitly deferred. Every remaining numbered child plus standalone T158 is one focused implementation checkpoint, with dependencies explicit rather than implied solely by list order._

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
