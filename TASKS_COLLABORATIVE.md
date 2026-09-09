# Tasks — Collaborative execution

Tickets requiring owner decisions, dashboard actions, or external verification. Work through one named ticket with `$guided-ticket T230` (or resume with `$guided-ticket resume T230`). The skill is in [`.agents/skills/guided-ticket/SKILL.md`](.agents/skills/guided-ticket/SKILL.md).

`new-ticket` reads `TASKS.md` only. Never copy a ticket into that queue to make its claim script work. `TASKS_BACKLOG.md` remains the separate deferred queue. IDs are unique across all three queues and `TASKS_DONE.md`.

## Working agreement

- **Execution: External gate** means the agent completes authorized preparation and implementation, then guides the owner through remaining access, deployment, or verification steps.
- **Execution: Owner-in-loop** means the agent also presents recommendations at the ticket's named decision points before performing work that depends on those choices. Routine preparation proceeds without repeated approval.
- **Owner gates** names the required decisions/actions. **Automation boundary** says what the agent can complete independently. Neither field grants new production or Git authority.
- Keep `Status` compatible with `TASKS.md`: `Not started`, `In progress`, `Blocked` (reason required), `Done`. Use a separate **Checkpoint**: `Preparing`, `Implementing`, `Awaiting owner action`, `Awaiting external verification`, `Verifying`, `Ready to complete`, or `Complete`. Expected owner waits remain `In progress`; access failures or unsatisfied dependencies can be `Blocked` with the exact reason.
- Before starting, inspect task status, relevant local worktrees, and remote claims/PRs. This queue has no distributed claim mechanism; the owner coordinates concurrent sessions. Never take over an existing claim or infer abandonment from age.
- Keep a resumable execution guide at `outputs/guided-tickets/<ID>.md`. Record the checkout/branch/commit, target environment, decisions, completed steps, next owner action, and evidence. Keep secrets, full callback URLs, raw user data, and credentials out of the guide.
- Every collaborative ticket must begin on a focused checked-out branch named `task/<ID>-<short-ticket-slug>` (or an equivalent focused worktree with that branch). Create and check out the branch before changing the tracker, execution guide, source, tests, or configuration. If the current checkout is dirty with unrelated work, preserve it and use a separate worktree. Recheck local/remote branch collisions immediately before creation; an existing branch or ambiguous ownership is a coordination gate. Work in focused local checkpoints. Collaborative deployment tickets can require preparation commits before hosted verification and a final evidence/closure commit afterward. Follow `AGENTS.md` for Git authority; this queue does not inherit the automatic claim/push/merge exception for `TASKS.md`.
- **Preparation PR exception (owner approved 2026-09-04):** A preparation PR may open once all applicable local checks pass, with hosted criteria explicitly listed as pending and the ticket still open. Its merge requires the normal CI checks and existing owner authorization. This permits getting the implementation deployed for verification; it does not permit claiming hosted success early or grant automatic push, merge or production-deployment authority.
- Completion requires the ticket's actual exit criteria. Mark each criterion passed, failed, blocked, or not run with its source and environment. A guide written, local tests passed, or owner saying "saved" is not proof that a deployed flow works. Accept specific owner-observed evidence when the agent cannot observe it, labeling its source accurately.
- Once all criteria pass, move the entry to `TASKS_DONE.md` as `Done`, retaining the guide/evidence link. Do not close other tickets or proceed to another ticket automatically. If delivery or deployment is part of the criteria, it must finish before closure; otherwise report local completion and any pending Git delivery distinctly.

## Ship-readiness batch

Approved 2026-09-04 from [SHIP_READINESS_AUDIT.md](SHIP_READINESS_AUDIT.md). A1 → T225, A4 → T228 and A9 → T233 are in `TASKS.md`; the eight remaining proposals are below. The audit's findings require reconciliation against current code. Do not recreate Phase 6, legacy migrations, native hardening, mandatory CAPTCHA/distributed throttling, backup automation, a second hosted project, performance targets, or a waiting-period gate.

T221 already has remote claim `task/T221-diagnose-and-fix-the-feedback-form-s` (observed 2026-09-04; no PR returned at that check). Its entry remains in `TASKS.md` to preserve that workflow. T226 owns only the remaining signed-in permission/hosted evidence gap after T221, and must reuse any completed work.

Backend selection and release selection are explicit owner gates. T230/T231 preparation may occur before individual fix tickets close: a fix can supply a verified preparation commit for the owner to deploy, then record hosted evidence afterward. Do not invent a circular dependency requiring every hosted-verification ticket to be complete before deploying the code needed to verify it.

### [T226] Close the signed-in feedback permission and hosted acknowledgment gap

- **Area:** Feedback authorization
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Execution:** External gate
- **Owner gates:** Identify the affected hosted build/backend; authorize any remaining migration deployment; provide privileged readback access or redacted evidence.
- **Automation boundary:** Inspect T221's result, reproduce locally, implement only residual permission defects with focused database tests, and prepare deployment/verification steps.
- **Description:** Reconcile T221's outcome with the audit's signed-in `403 / 42501` reproduction. If still needed, add the authenticated role's narrow insert grant and validated policy while preserving guest inserts and denying ordinary-client reads/updates/deletes; verify both submission paths on the selected hosted environment.
- **Exit criteria:** Guest and signed-in message-only feedback both persist and show acknowledgment on the identified hosted build; privileged readback confirms the test submissions, and dedicated permission/validation checks confirm both ordinary roles cannot read, edit or delete submissions and invalid payloads are rejected. Evidence names the deployed migration/build and distinguishes local negative tests from hosted checks.
- **Notes:** From A2; audit section 1. Depends on T225 and T221. Preserve T221's existing claim; no parallel reimplementation. If its merged work already satisfies this criterion, verify and record reuse without another code fix. See `src/features/feedback/persistence/submit-feedback.ts`, `supabase/migrations/20260902000000_add_feedback_table_with_anon_insert.sql` and `supabase/README.md`.

### [T227] Make all dynamic web routes refresh-safe on the deployed app

- **Area:** Web hosting routes
- **Priority:** High
- **Status:** In progress
- **Checkpoint:** Awaiting owner action
- **Planning:** Required
- **Execution:** External gate
- **Owner gates:** Approve deployment of the prepared routing change to an identified target; enable deployed-route verification.
- **Automation boundary:** Inventory exported routes, update `vercel.json` using actual export paths, and add focused hosting regression coverage.
- **Description:** Extend the existing Stats rewrite to cover notes, goals, custom-trick edit and custom-trick delete URL shapes. Verify deployed direct loads and refreshes, including intentional app handling for missing record IDs.
- **Exit criteria:** Each of the five current dynamic route shapes loads and refreshes on the selected deployment without a hosting 404; seeded valid IDs reach the intended screen and nonexistent IDs reach the app's intentional missing-record behavior. Record the deployed commit and results alongside local export/rewrite evidence.
- **Notes:** From A3; audit section 1. Depends on T225. Inspect `src/app/app/` and actual export filenames rather than guessing rewrite destinations. Use the dedicated hosting harness for rewrite checks and Expo for normal app/browser checks. Coordinate release preparation with T231; deployment authorization is not implied by this entry.

### [T229] Verify safe Sentry delivery through the deployed CSP

- **Area:** Web observability boundary
- **Priority:** Medium
- **Status:** Not started
- **Planning:** Required
- **Execution:** External gate
- **Owner gates:** Supply the intended Sentry project/DSN through appropriate configuration and dashboard access; authorize deployment and a safe test event.
- **Automation boundary:** Inspect DSN resolution/transport and CSP, prepare the narrow ingest-origin allowance and focused header/privacy checks.
- **Description:** Complete T218's outstanding hosted-delivery evidence and correct CSP for the configured ingest origin. Keep Sentry enabled as intended and check the actual event for credentials and sensitive callback parameters.
- **Exit criteria:** A deliberate nonsensitive error from the identified deployment reaches the intended Sentry project under actual response headers; the recorded sanitized event inspection shows no credentials or sensitive callback parameters, and unrelated external connection origins remain denied.
- **Notes:** From A5; audit section 1. Depends on T225. See `src/shared/observability/sentry-client.ts`, `vercel.json`, `security/README.md` and T218 in `TASKS_DONE.md`. If no release DSN exists, pause at configuration rather than claiming success or removing Sentry. Source-map upload, tracing and replay remain outside scope.

### [T232] Verify the hosted account lifecycle and account isolation

- **Area:** Hosted account acceptance
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Execution:** Owner-in-loop
- **Owner gates:** Confirm the target deployment and disposable accounts/inboxes; assist with real delivered links where access is unavailable; confirm the precise disposable account to delete.
- **Automation boundary:** Prepare fixtures and steps, run authorized browser/API checks, compare against existing backend security tests, and collect sanitized results.
- **Description:** On the prepared release, verify signup/verification, newly created guest-data import, sign-out/in with saved data restored, password recovery, email change and account deletion. Use two disposable accounts to confirm that neither can read/change the other's records and deletion affects only its owner.
- **Exit criteria:** A recorded hosted acceptance pass covers the complete lifecycle using actual delivered emails and two identified disposable fixtures, demonstrates guest import and saved-data return, proves cross-account read/write denial, and confirms deletion removes the selected owner's data while the other account remains intact. Missing access or delivery keeps the affected criterion open.
- **Notes:** From A8; audit sections 3–4. Depends on T225. Environment prerequisites are a prepared T230 backend and deployed T231 build, not closure of those tickets. Reuse existing data/API and deletion checks where applicable; never run the local reset-based database test harness against a hosted project. No legacy-data migration or branded-email requirement.

### [T234] Verify hosted synchronization and release-browser usability

- **Area:** Hosted web acceptance
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Execution:** External gate
- **Owner gates:** Confirm release URL/commit and disposable account access; provide any inaccessible hosted feedback/diagnostic evidence and disposition of discovered blockers.
- **Automation boundary:** Prepare and execute browser scenarios in isolated contexts, compare reusable evidence by commit/environment, and produce a focused acceptance report.
- **Description:** Verify a small realistic set of offline edits synchronizes after reconnection across two browser contexts without duplicate sessions or identity leakage. Complete the release-browser pass at 320px and desktop, checking keyboard navigation, form errors and first-visit usability, with deployed routing/feedback/Sentry evidence reused from their owning tickets.
- **Exit criteria:** The selected-release report records passing synchronization/browser scenarios, applicable T233 guest evidence or affected reruns, direct-load/refresh coverage, and guest/signed-in feedback and Sentry delivery under actual headers. Each reused result names its source commit/environment; all required gaps are resolved, and only nonblocking limitations remain explicitly documented.
- **Notes:** From A10; audit section 4. Depends on T225. Requires an identified deployed build and disposable fixtures from T230/T231 preparation. T226/T227/T229/T232 own detailed hosted evidence; reuse their results only when applicable, without requiring duplicate checks. Inspect actual first-load usability; do not introduce speculative budgets, multi-year datasets, native checks, or full active-Sesh restoration. Report new defects rather than broadening this acceptance task into unrelated implementation.

### [T235] Publish accurate deployment, support and data expectations

- **Area:** Release documentation
- **Priority:** Medium
- **Status:** Not started
- **Planning:** Implementer
- **Execution:** External gate
- **Owner gates:** Confirm support/feedback and error-review destinations, chosen service-plan recovery guarantees and acceptable durability expectations; confirm the user-facing privacy/data explanation.
- **Automation boundary:** Trace actual storage, deletion and service use, draft the operational and user-facing copy, and verify referenced commands/paths against current implementation.
- **Description:** Correct the deployment instructions that still describe an app without a backend and add a short accessible privacy/data explanation covering guest versus account storage, receiving services and deletion limits. Record how the owner reads feedback/errors and the chosen backend/release settings, reusing the other guides.
- **Exit criteria:** Deployment documentation matches the selected configuration and provides reproducible steps with working references; the deployed user-facing explanation accurately describes current storage/services and account deletion without claiming previously submitted feedback is deleted. The owner confirms feedback/error access and records actual plan recovery guarantees with accepted limitations, without unsupported recovery promises.
- **Notes:** From A11; audit sections 2 and 5. Depends on T225. Use the chosen configuration and verified evidence from T230/T231 when available; do not invent those decisions or require their closure before drafting. Confirm current plan facts at execution time. No backup automation, paid-plan purchase, legal certification, new support platform, or broad documentation overhaul is included.
