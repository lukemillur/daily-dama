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

_T153–T162 come from S032–S039 and S041, refined from [BACKEND_ROADMAP.md](BACKEND_ROADMAP.md) and first scoped into this formal backlog on 2026-08-21. Phase 1 umbrella T153, Phase 2 umbrella T155, and Phase 3 workstreams T156–T160 have moved to the automated queue in [TASKS.md](TASKS.md); T154 and T161–T162 remain here for Phase 4 and Phase 6. Supabase, guest access, PKCE, local-first synchronization, immediate account deletion, and the roadmap's security requirements are settled product decisions. S040 (native account hardening) remains unscoped in [BACKLOG_STORIES.md](BACKLOG_STORIES.md) because mobile hardening is explicitly deferred. Every remaining numbered child is one focused implementation checkpoint, with dependencies explicit rather than implied solely by list order._

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
