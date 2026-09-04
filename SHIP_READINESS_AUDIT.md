# Daily Dama: a practical plan to ship

Revised 2026-09-04 following the owner's clarification. This replaces the original twelve-item launch gate. It reinterprets the existing audit evidence; it is not a fresh audit of the latest code or hosted settings.

## Launch scope

The owner has confirmed:

- There are no existing users.
- No existing data will be migrated or preserved for this production launch.
- The expected audience is a small group within a niche hobby.
- Removing Phase 6 backend tasks was deliberate. They were not accidentally lost or implicitly still required.
- Web is the launch target; native hardening remains deferred.

Treat this as a fresh launch of a small application. The finish line is a functioning deployed product with private accounts, reliable core flows and manageable support. Completing the old backend roadmap, preparing for hypothetical scale, and adding operational infrastructure are not prerequisites.

This scope does not authorize deleting local work or resetting a hosted database. Any cleanup needed during deployment should target explicitly identified disposable test data. Once real users join, their newly created data is no longer disposable.

## Where things stand

**The audited version needed a few concrete fixes and a focused deployment check before shipping.** The underlying product already has substantial working functionality and a strong automated baseline. There is no need for another broad feature-building phase.

The audit reproduced signed-in feedback failing with HTTP 403 and newer dynamic routes returning 404 under the committed static-host configuration. It also found a dependency-audit wrapper that can falsely report success after a network failure, and a CSP incompatible with normal external Sentry delivery.

Legacy custom tricks and goals loading as empty was a real compatibility finding, but **it is not a launch blocker now that no old data needs preserving**. No migration implementation or old-client upgrade test is required for this release. Testing guest-to-account import remains relevant: new users can practice as guests and then sign up after launch.

Hosted settings were not accessible during the audit, so several deployment questions remain unverified rather than proven broken. Check whether the concrete findings have already been fixed in subsequent development work before implementing them again.

## The work worth doing before launch

### 1. Fix the demonstrated defects

| Item | Audit evidence | Done when |
| --- | --- | --- |
| Signed-in feedback | The persistent Supabase client sends an authenticated session, but `api.feedback` grants/policy allow inserts only for anon. A disposable local account received **403 / 42501 / permission denied for table feedback**. See `src/features/feedback/persistence/submit-feedback.ts:39–50` and `supabase/migrations/20260902000000_add_feedback_table_with_anon_insert.sql:47–61`. | Both guest and signed-in submissions succeed and show acknowledgment; submissions remain unreadable/uneditable by ordinary clients. Recommend giving authenticated users the same narrow insert permission and validation as guests. This is a T217/T221 follow-up, not just a success-message styling issue. |
| Dynamic route refreshes | `vercel.json` rewrites Stats, but exported notes/goals/custom edit/delete routes also have literal `[trickId]` filenames. The local hosting harness returned 404 for notes, goals and custom edit, while Stats returned 200. | Direct navigation and refresh work for every dynamic route shape, including custom delete, on the actual deployment. Missing records receive intentional app handling. |
| Dependency audit reporting | `security/scripts/check-dependency-audit.mjs:22–56` ignores Yarn failure/error output and does not require a completed audit summary. It reported success after DNS failure. | A failed/incomplete audit fails visibly; a completed audit applies the existing advisory policy. Refresh stale accepted-advisory explanations, without turning this into a dependency overhaul. |
| Sentry, if enabled | `src/shared/observability/sentry-client.ts:34` initializes direct DSN transport, but the CSP permits connections only to self and Supabase. | The actual ingest origin is permitted narrowly, a safe test error arrives, and the event contains no credentials or sensitive callback parameters. Keep Sentry; do not remove it as a shortcut for performance work. |

These are bounded corrections. Add focused regression coverage where useful, then use the repository's normal verification rules. Do not rewrite the test suite or reopen unrelated feature work.

### 2. Make the hosted configuration match the application

A frontend deploy alone does not install the database schema, deploy the delete-account function, or configure Auth email delivery.

- Choose the Supabase project that will serve real users. **A second hosted project is not mandatory.** Reusing the existing hosted project is reasonable if it is configured correctly and stops being used for destructive development testing. A separate production project remains a useful optional isolation choice.
- Apply the required structural database migrations and deploy the deletion function. “No data migration” means no transfer of existing user data; the new backend still needs its schema and permissions.
- Check Vercel's build command, output directory, Production Branch and public environment variables. Ensure the production bundle points to the chosen hosted backend, not localhost. Keep private/service-role credentials out of client configuration.
- Make the canonical domain and exact Auth callback allowlist agree. During the audit, the apex redirected to **www**, while older Auth documentation listed only the apex callback. The app derives callbacks from `window.location.origin`, so confirm the actual settings and delivered links. Keeping www is the simplest default, but preserving an old storage origin is not a requirement for this fresh launch.
- Verify signup verification, password recovery and email-change messages are delivered and lead to the right screens. Branded email styling is optional; functional links are essential.

Avoid blindly pushing all local Supabase configuration: `supabase/RESEND_DNS_AUTH.md` records that local SMTP settings differ from hosted settings and a blanket push could disable hosted mail.

Keep a short note of the chosen backend, deployed commit and any manual settings needed to reproduce it. A large release manifest is unnecessary. Correct the deployment instructions that still claim there is no backend; broader documentation cleanup can wait.

### 3. Retain basic security without building a large operations system

Account isolation, private-key handling and functioning account deletion remain essential regardless of audience size. Use the existing tests and a small hosted check with two disposable accounts to confirm that one cannot read or change the other's records and that deletion removes only its owner's data. Inspect deployed grants/RLS and any available provider security findings; investigate relevant serious findings rather than treating every advisory as a project.

For abuse protection, inspect the limits already supplied by the hosted services and the app. The audit found an isolate-local deletion limiter and no application-level feedback throttle. Those are limitations to consider, not an automatic requirement to build distributed infrastructure.

**CAPTCHA and a distributed rate limiter are not mandatory launch tasks under this revised scope.** Check for an obvious unbounded public endpoint or easy path to exhausting email/storage allowances. Address a concrete exposure with the smallest effective control if necessary. Otherwise start with existing protections, know how to disable a problematic public feature, and revisit if abuse occurs. A small intended audience does not itself prevent automated traffic.

Do not make a separate security platform, formal penetration test, or exhaustive certification exercise a prerequisite.

### 4. Do one focused acceptance pass

Use the intended release version and a small, realistic dataset. Prefer existing automated evidence for detailed edge cases; manually check the things that depend on the real browser, domain and hosted services.

- **Guest practice:** fresh visit, onboarding, select/create a trick, timed and open-ended Sesh, pause/resume, completion, Stats and reload. Briefly check a note, goal, sequence and multi-trick run. Background a timed session beyond its deadline and confirm sensible completion without duplicate history.
- **Accounts:** sign up using a real delivered verification link, import newly created guest practice, sign out/in, and confirm saved data returns. Exercise password recovery, email change and deletion using disposable accounts.
- **Sync and privacy:** use two browser contexts to confirm a small set of offline edits synchronizes after reconnecting, without duplicate sessions or another account's data appearing. Reuse existing domain tests for the broader conflict/retry matrix unless this check reveals a problem.
- **Hosting and usability:** directly load/refresh dynamic URLs; check 320px and desktop layouts, basic keyboard navigation and form errors. Confirm guest and signed-in feedback and configured Sentry work under the actual headers. Assess whether a normal first visit feels usable; investigate a real slow load rather than imposing a speculative performance budget.

Use a clean browser context for fresh-launch checks. Old developer browser data can be cleared in that disposable context; it does not justify adding a legacy-data migration system.

Run the normal app verification and required CI for the selected release, plus the relevant existing backend/security checks for the changes being shipped. Reuse trustworthy results for the same code and environment; repeat affected checks after a fix rather than restarting the entire audit. A passing mock does not establish working production email or database permissions.

The audit showed completed history survives reload and an active Sesh survives ordinary tab navigation. Reloading the page loses an unfinished Sesh. Treat full active-session restoration as deferred; briefly explain that limitation if needed rather than building a recovery subsystem for launch.

### 5. Make support and expectations straightforward

Have a working feedback/contact route and know where to read incoming feedback and errors. A short accurate privacy/data explanation should describe guest versus account storage, the services receiving data and what account deletion removes. Feedback is stored independently of accounts, so avoid implying account deletion also removes previously submitted feedback.

**Backup durability is a small owner decision, not a restoration-drill gate.** Before inviting people to rely on account storage, understand what the chosen service plan actually provides and avoid promising recovery you cannot deliver. Accepting limited recovery guarantees is an option for this small launch. Periodic exports or managed backups are optional improvements based on the value of the data and the maintenance/cost you want to accept. No new backup automation, paid plan or recovery-time target has been approved by this document.

## Deliberately outside the launch requirements

| Earlier requirement or backlog area | Revised treatment |
| --- | --- |
| Legacy-data migration, old browser upgrade compatibility, prelaunch account transfer | Removed: no existing users/data will be migrated. |
| T162 Phase 6 as a complete gate | Superseded by the owner's explicit scope decision and this shorter plan. Do not recreate it automatically. |
| Multi-year synthetic capacity tests / speculative load infrastructure | Deferred. Existing 1,200-row pagination evidence plus a small realistic sync check is enough initially. |
| Mandatory CAPTCHA / distributed rate limiting | Replaced by a proportionate review of existing protections and concrete exposure. Add controls when justified. |
| Mandatory second Supabase project | Optional isolation choice; never reset a backend containing real users. |
| Backup automation, full restore drills, formal incident plans | Optional operational investment, with honest initial durability expectations. |
| Forty-eight-hour observation window / formal launch sign-off document / 25-account review trigger | Not conditions for declaring shipped. A brief check after inviting the first users is sensible; no new scheduled process is required. |
| T208 celebration, T216 email branding, remaining T223 input styling, T224 callback timing | Optional polish. Finish only a deliberately chosen bounded batch; do not let it postpone functional release indefinitely. |
| S105 performance | Keep Sentry. Optimize demonstrated slowness; no arbitrary bundle-reduction target or dependency purge. |
| Native hardening, full session restoration, new features or visual redesign | Deferred to a future iteration. |

This does not close or change any existing ticket. Task status may have advanced since the audit and should be checked before planning further work.

## Deployment and “shipped” checklist

1. **Choose the release commit.** Include intended completed development work and the fixes above. Do not merge every branch merely because it exists.
2. **Prepare the backend and settings.** Install the schema/function, check permissions, email, domain and environment configuration. Decide whether to reuse the hosted project. No existing user-data transfer is needed.
3. **Verify and deploy.** Obtain passing applicable checks and promote through the repository's approved path. At audit time this was development → main → production; confirm Vercel's actual Production Branch. CI did not automatically run on production PRs/pushes, so do not assume the last promotion supplies an extra test gate.
4. **Check the deployed app.** Complete the short acceptance pass above using disposable accounts before inviting users. Fix blocking defects; record known minor limitations without turning them into another launch project.
5. **Call it shipped.** The intended version is live, core guest/account flows work, accounts are private, feedback/diagnostics are usable, and no known defect prevents the product's basic promise. No mandatory waiting period or zero-bug claim is needed.

If the deployment is seriously broken, stop inviting users and fix forward or return to a known working deployment. Before the first real users, no existing production data needs protecting. After users begin saving practice, preserve that new data when responding to problems; do not reset the backend or assume the old August frontend is a compatible rollback target. A simple fallback is sufficient; building a special rollback-compatible application is not a prelaunch task.

After shipping, the ongoing work can be modest: respond to genuine bug reports, review useful error/security notifications, keep the domain and hosted services working, and revisit limits or backups when actual usage warrants it. This is maintenance, not a commitment to keep adding features.

## Audit evidence retained for reference

The findings below were measured on **2026-09-04 against commit `0c3feaf270a607ec7c977e1ec594cc75a35fb273`**. This document revision did not rerun tests, inspect hosted settings or verify subsequent fixes. All file references above refer to that snapshot.

| Evidence | Result and limit |
| --- | --- |
| Full app baseline | **154 suites / 1,881 tests passed**, lint, full typecheck and web export passed. Node 24.14.0 / Yarn 1.22.22 locally; CI used Node 22. |
| Guest browser flow | Onboarding, open-ended practice, lace, pause/resume and completion worked. Stats showed 1 lace / 01:19 and survived reload. |
| Local Data API | 133 passed, 7 cancelled following an Auth setup HTTP 504; exact affected suite retry passed 7/7. All 140 cases obtained passing evidence across two runs. Includes cross-user checks and 1,200-row pagination. |
| Deletion | 26/26 tests passed, including local cascade, old-token denial and lost-response retry. Not proof of hosted function configuration. |
| Security | Header checks 5/5; production-like browser checks 17/17. Placeholder backend configuration did not prove real Auth or Sentry delivery. |
| Secret scanning | Pinned scanner examined 9.73 MB of exported content and found no leaks. Used placeholder configuration; actual production environment still needs correct secret handling. |
| Dependency audit | Direct network audit completed with three high advisory IDs already on the allowlist and four moderate IDs. The wrapper's false-success behavior was separately reproduced. Reassess current advisories during release work. |
| Initial JS payload | About 8.9 MB raw / 2.4 MB gzip. This is a payload measurement, not a user-perceived load-time result. |
| Remaining browser evidence gaps | 320px override failed to take effect; full keyboard, timed/background and hosted Auth acceptance were not completed. The short acceptance pass covers them. |
| Hosted access | Vercel/Supabase dashboards required sign-in. Build settings, backend project choice, Auth settings and actual email/Sentry delivery remained unverified. |

At audit time, main was `dabfc65631a708e6b313825b14270e6a5c25e0ee` and production was `f9b61b86e1928afd116334c5429e9d745688fa86`. The last recorded successful Production deployment was August 10, deployment `5834484792`. The apex redirected to www; callback and feedback routes returned 404 on that old public deployment. Development advanced during the audit to `34a8c8b08aad8799e0b690121f43182004fee402`, with more work in progress. These are historical observations, not today's release selection.

README, PRODUCT_CAPABILITIES, V1_LAUNCH_PLAN and DEPLOYMENT_HANDOFF contain outdated descriptions, including “no backend,” the old access gate and old task status. Use current code/configuration and the owner's clarified scope. Update the operational instructions actually needed for deployment; a complete documentation overhaul is optional.

Useful source records:

- [Audited source snapshot](https://github.com/lukemillur/daily-dama/tree/0c3feaf270a607ec7c977e1ec594cc75a35fb273)
- [PR #299 CI](https://github.com/lukemillur/daily-dama/actions/runs/33825850860)
- [PR #300 CI](https://github.com/lukemillur/daily-dama/actions/runs/33877503947)
- [Historical production deployment metadata](https://api.github.com/repos/lukemillur/daily-dama/deployments/5834484792)

Temporary local evidence remains recorded at `/tmp/daily-dama-ship-verify.json`, `/tmp/daily-dama-ship-data-api.log`, `/tmp/daily-dama-ship-goals-retry.log`, `/tmp/daily-dama-ship-functions.log`, `/tmp/daily-dama-ship-headers.log`, `/tmp/daily-dama-ship-security-browser.log`, `/tmp/daily-dama-ship-yarn-audit.jsonl`, `/tmp/daily-dama-ship-yarn-audit-sandbox.jsonl`, `/tmp/daily-dama-ship-dependencies.log` and `/tmp/daily-dama-ship-bundle-scan-retry.log`. The OS may clear these files; the relevant results are summarized above. No production changes were made during the audit or this revision.
