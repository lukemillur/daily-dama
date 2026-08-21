# Daily Dama Backend Roadmap

## Recommendation and alternatives analysis

Supabase remains the best fit.

It is not perfect—particularly for offline synchronization and free-tier recovery—but it is the only evaluated option that satisfies the agreed Auth requirement while keeping Auth, authorization, relational storage, generated APIs, and privileged JavaScript functions within one security boundary.

| Platform | Advantages | Why it is not preferable |
| --- | --- | --- |
| **Supabase** | Supabase Auth JWTs integrate directly with Postgres RLS; relational schema suits sessions, goals, notes, and custom tricks; generated Data API avoids a custom server; free Edge Functions can delete accounts. | Offline synchronization must be built; Free projects pause after inactivity; no accessible automatic backups on Free. |
| **Firebase** | Strong client offline persistence; free Auth and Firestore quotas. | Replacing Supabase Auth violates the requirement. Firestore resolves concurrent document changes using last-write-wins rather than the chosen explicit conflict model, and Cloud Functions require the billing-enabled Blaze plan. [Firebase offline behavior](https://firebase.google.com/docs/firestore/manage-data/enable-offline), [Firebase plan requirements](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans). |
| **Appwrite Cloud** | Integrated Auth, document database, React Native SDK, and free Functions. | Also replaces Supabase Auth; free projects cannot use custom SMTP, include only two Functions, and have lower monthly database-operation limits. [Appwrite pricing](https://appwrite.io/pricing). |
| **Convex** | JavaScript/TypeScript backend functions and reactive data access. | Supabase Auth would require a custom JWT/OIDC integration; the data model and access layer would be replaced wholesale; the free database allocation is still 0.5 GB. [Convex Auth](https://docs.convex.dev/auth/overview), [Convex pricing](https://www.convex.dev/pricing). |
| **Neon + Vercel Functions** | Free Postgres, short restore history, and conventional Node.js functions. | Requires building and securing a complete API/JWT-validation layer between Supabase Auth and Neon. Neon’s own Auth would make the Supabase requirement redundant. [Neon pricing](https://neon.com/pricing). |
| **Turso + Vercel Functions** | Generous free SQLite capacity and replication-oriented tooling. | Requires a custom authorization/API service, replaces Postgres with SQLite, and spreads security and operations across three vendors. [Turso pricing](https://turso.tech/pricing). |

**Decision:** use Supabase Auth, Postgres, Data API, and one JavaScript Edge Function. Do not add a second database provider or custom REST server.

## Backend interfaces and schema

### Auth interfaces

Consume Supabase Auth through `@supabase/supabase-js`:

- Signup and email verification
- Email/password login
- Password recovery
- Signed-in password change
- Secure email change
- Current-device logout
- Account deletion

Use PKCE with exact callbacks:

- Production web: `https://dailydama.com/auth/callback`
- Local web: explicit localhost development URLs
- Native: `dailydama://auth/callback`

Do not permit wildcard production redirects or accept arbitrary `next` URLs from callback query parameters.

Frontend routes:

- `/auth/sign-up`
- `/auth/sign-in`
- `/auth/check-email`
- `/auth/forgot-password`
- `/auth/callback`
- `/auth/reset-password`
- `/app/profile/account/security`
- `/app/profile/account/delete`
- `/app/profile/sync-conflicts`

Guests retain access to `/app`; Auth adds synchronization rather than becoming an application gate.

### Database resources

Expose only these resources through the Supabase Data API:

| Resource | Contents |
| --- | --- |
| `api.profiles` | Onboarding state, Kentei rank, last Sesh configuration, streak threshold, theme preferences |
| `api.user_trick_states` | Focused and manually laced state per trick |
| `api.custom_tricks` | Standalone tricks and sequences |
| `api.practice_sessions` | Immutable completed-Sesh records |
| `api.goals` | Lace/time goals and synchronization tombstones |
| `api.notes` | Notes, optional Sesh association, edit version, and tombstones |

Important invariants:

- `user_id` references `auth.users(id) ON DELETE CASCADE`.
- Client payloads never determine `user_id`.
- Practice sessions remain insert-only.
- Historical trick-name snapshots remain authoritative.
- Sequence-step names remain snapshots and do not foreign-key to current trick names.
- Sequences may not contain other sequences.
- Mutable records use integer `revision` fields for optimistic concurrency.
- Server triggers own `created_at`, `updated_at`, and revision increments.
- `deleted_at` tombstones prevent offline devices from resurrecting removed records.
- Domain timestamps such as Sesh start/end remain client facts; separate server timestamps record receipt and mutation time.
- Queries use deterministic ordering and pagination rather than assuming fewer than 1,000 records. Supabase’s default response cap is 1,000 rows. [Supabase API row limit](https://supabase.com/docs/guides/local-development/cli/config).

### JavaScript Edge Function

Only one custom endpoint is initially required:

`POST /functions/v1/delete-account`

Request:

```json
{
  "currentPassword": "user-entered password",
  "confirmation": "DELETE"
}
```

Behavior:

1. Require a valid user JWT.
2. Fetch the trusted user identity server-side.
3. Rate-limit attempts per user and IP.
4. Verify the current password without returning the resulting session.
5. Hard-delete the Auth user with the service-role client.
6. Cascade-delete application rows.
7. Return `204` with `Cache-Control: no-store`.
8. Never log the request body, password, JWT, or email.

If deletion succeeds but the response is lost, the frontend verifies the Auth state on retry; a missing user is treated as completed deletion and triggers local cleanup.

The service-role key exists only in Supabase secrets. Auth user deletion requires server-side admin credentials. [Supabase admin deletion](https://supabase.com/docs/reference/javascript/auth-admin-deleteuser).

## Security audit changes

The following holes from the first draft are explicit requirements.

### Database and API security

- Use a dedicated exposed `api` schema and a non-exposed `private` schema for helper and trigger functions.
- Revoke automatic/default privileges; grant each table operation explicitly.
- Grant no database access to `anon`.
- Enable RLS in the same migration that creates every exposed table.
- Every insert/update policy includes both:
  - `USING ((select auth.uid()) = user_id)`
  - `WITH CHECK ((select auth.uid()) = user_id)`
- Protect server-owned columns with triggers and restricted update grants; RLS alone does not prevent a user changing unrestricted columns.
- Validate JSON sequence steps and discriminated record shapes inside Postgres, since a malicious caller can bypass frontend validation.
- Review every `SECURITY DEFINER` function, set an explicit safe `search_path`, and keep it outside exposed schemas.
- Index `user_id` and common user-scoped ordering columns for RLS and pagination performance.
- Run negative tests using raw HTTP/Data API requests, not only the trusted SDK.

Supabase’s Data API is protected by both grants and RLS; relying on only one is insufficient. [Supabase API security](https://supabase.com/docs/guides/api/securing-your-api).

### Auth and session security

- Require verified emails.
- Set a minimum password length of 10 characters.
- Keep error messages generic for signup, login recovery, and email changes to reduce account enumeration.
- Enable secure email change and require the current password for signed-in password changes.
- Keep the default one-hour access-token lifetime.
- Use `signOut({ scope: "local" })` for normal logout so other devices remain signed in. [Supabase sign-out scopes](https://supabase.com/docs/guides/auth/signout).
- Require 2FA on the owner’s Supabase, Resend, GitHub, Vercel, and DNS accounts.
- Configure CAPTCHA and review Auth rate limits before the first external account.
- Treat Supabase’s paid-only leaked-password protection as unavailable under the free constraint.

### Email and redirect security

- Use Resend custom SMTP; Supabase’s built-in sender is testing-only.
- Verify SPF and DKIM and add a DMARC policy for the sending subdomain.
- Disable email link tracking so single-use Auth URLs are not rewritten.
- Permit exact production and development redirect URLs.
- Exchange each PKCE callback code once, clear sensitive callback parameters, and navigate only to a fixed internal destination.
- Do not place access tokens, refresh tokens, or user emails in analytics events.

### Client storage and web security

- Use only the publishable Supabase key in the application bundle.
- Keep the service-role key out of Expo environment variables and Vercel client-exposed variables.
- Store native Auth credentials through a SecureStore-backed adapter during mobile hardening.
- The static web client must persist its session in JavaScript-accessible storage; therefore XSS is the principal web-token threat.
- Add a tested Content Security Policy, initially report-only and then enforced, allowing only required Expo/Vercel/Supabase/Resend-related origins.
- Add HSTS, `frame-ancestors`, `X-Content-Type-Options`, `Referrer-Policy`, and a restrictive `Permissions-Policy`.
- Audit uses of raw HTML and prevent unsanitized note/custom-trick text from reaching HTML sinks.
- Run dependency and secret scanning in CI.
- Never log Supabase sessions or full API errors that may contain identifiers.

Account domain data remains unencrypted in AsyncStorage during this iteration. Purging on logout prevents ordinary cross-account exposure but is not guaranteed forensic erasure. That is an accepted prototype limitation and must be documented before external testing.

### Synchronization security and correctness

- Partition caches as `guest` and `user:<verified-user-id>`.
- Never reuse one account’s pending operations under another identity.
- Ignore any `user_id` supplied in mutation payloads.
- Store local domain state and its outbox atomically in the same versioned persistence envelope.
- Run only one sync per identity at a time.
- Tag sync runs with an identity/generation token so a late result cannot update state after logout or account switching.
- Paginate all pulls with stable ordering.
- Treat a successful server write followed by a lost acknowledgment as an idempotent retry, not a duplicate.
- Apply server-returned revisions and timestamps after every accepted mutation.
- Pause only the conflicting record; continue unrelated operations.
- Warn before logout when unsynced account changes exist, offering Retry, Cancel, or Discard and log out.
- Never let synchronization effects alter an active Sesh state machine.

## Phased roadmap

### Phase 1 — Auth foundation and account routes

Good enough: guests continue using Daily Dama, while account creation, verification, credential recovery, and login work securely on web.

Backend tickets:

1. Add Supabase CLI configuration and reproducible local development.
2. Create one hosted free development project; reserve the second project for production.
3. Configure email/password Auth, PKCE, exact redirect URLs, ten-character minimum passwords, and one-hour JWT expiry.
4. Configure Resend SMTP and DNS authentication.
5. Configure secure email change and current-password validation for password changes.
6. Document secrets, local Mailpit testing, and environment separation.

Frontend tickets:

1. Add the platform-aware Supabase client and discriminated Auth state:
   - `initializing`
   - `guest`
   - `authenticated`
2. Create the signup, sign-in, verification, recovery, callback, and reset-password routes.
3. Add Auth error, expiry, resend, throttling, and offline states.
4. Add Profile account entry points for guests and authenticated users.
5. Add signed-in password and email change flows.
6. Invite guest account creation from Profile and through a dismissible post-first-Sesh prompt.
7. Implement current-device logout with unsynced-change protection.
8. Add callback redirect and account-enumeration security tests.

### Phase 2 — Secure database foundation

Good enough: every persisted domain has a constrained, isolated database representation before any provider synchronizes.

Backend tickets:

1. Create the `api` and `private` schemas and revoke default privileges.
2. Add the six application tables, foreign keys, indexes, constraints, revisions, and tombstones.
3. Add server-owned timestamp and revision triggers.
4. Add database-level validation for profile invariants, goal variants, custom-trick variants, and sequence steps.
5. Add explicit grants and RLS policies.
6. Make practice sessions select/insert-only.
7. Generate TypeScript database types for the frontend.
8. Add migration, constraint, grant, and RLS test suites.

Frontend tickets:

1. Define one cloud repository interface per existing persistence domain.
2. Add database-row/domain-model mapping and runtime response validation.
3. Keep reducers unaware of Supabase and network state.
4. Preserve existing hydration fallbacks and skipped-initial-write behavior.

Because there are no cloud users, schema corrections during these first phases can replace provisional migrations before production rather than carrying compatibility migrations for nonexistent accounts.

### Phase 3 — Local-first synchronization

Good enough: authenticated data rehydrates on another browser while all current workflows remain usable offline.

Shared tickets:

1. Partition guest and account storage.
2. Add durable per-domain outboxes and mutation identifiers.
3. Build a single-flight sync coordinator.
4. Add paginated pulls and ordered, idempotent pushes.
5. Add optimistic revision checks and tombstone handling.
6. Sync on login, foreground, local mutation, reconnection, and manual retry.
7. Add Profile status for last sync, pending changes, conflicts, offline state, and retry.
8. Defer Realtime subscriptions.

Guest conversion tickets:

1. Show local/cloud counts before merging guest data.
2. Upload all guest data to a new empty account.
3. For an existing account:
   - Union distinct immutable records.
   - Deduplicate identical IDs and payloads.
   - Union focused and manually laced trick states.
   - Ask which profile/preferences to keep.
   - Flag same-ID/different-payload records.
4. Add per-record conflict resolution.
5. Make interrupted imports resumable.
6. Clear guest data only after accepted records are acknowledged.

Domain rollout order:

1. Profile and trick state
2. Custom tricks and sequences
3. Practice history
4. Goals
5. Notes

Each domain rollout receives its own repository, provider integration, conflict cases, and cross-account isolation tests.

### Phase 4 — Account security and deletion

Good enough: an authenticated user can maintain credentials and permanently remove their account.

Backend tickets:

1. Implement `delete-account` in plain JavaScript with JSDoc and runtime request validation.
2. Add current-password verification, rate limiting, no-store responses, and log redaction.
3. Test cascade deletion across every table.
4. Test calls from anonymous, expired, wrong-user, and stale sessions.
5. Test old JWT behavior after deletion and verify foreign keys prevent row recreation.

Frontend tickets:

1. Add the account security route for password and email changes.
2. Add the deletion route with current password and typed `DELETE`.
3. Warn that deletion is immediate and permanent.
4. On success, remove credentials, account cache, outboxes, and sync metadata.
5. Reconcile a lost deletion response by checking whether the Auth user still exists.
6. Return to a fresh guest workspace.

No account-data export endpoint or UI is included.

### Phase 5 — Cross-platform hardening

Good enough: the same account works across web, iOS, and Android without sacrificing offline practice.

1. Verify Auth, merge, sync, conflicts, logout, and deletion across independent web browser profiles.
2. Add native PKCE callback handling using the existing `dailydama` scheme.
3. Add a SecureStore-backed native Auth storage adapter.
4. Validate confirmation, recovery, and email-change links on iOS and Android.
5. Test offline creation, editing, deletion, and reconnection on both platforms.
6. Verify an account switch cannot expose the previous account’s cached notes or history.
7. Verify foreground synchronization does not alter an active Sesh.
8. Complete mobile work only after mobile hardening is explicitly resumed.

### Phase 6 — First-user launch gate

There are currently no active users, so this phase must not pretend usage metrics exist.

Before the first external account:

1. Finish the security and cross-account test suite.
2. Run Supabase Security Advisor and manually audit grants, RLS, and exposed functions.
3. Enable CAPTCHA and verify Auth/Edge rate limits.
4. Enforce web security headers and CSP.
5. Verify Resend deliverability and DNS records.
6. Create the reserved production Supabase project from tested migrations.
7. Seed no user data; only structural/static reference data may be seeded.
8. Perform a synthetic capacity check using representative multi-year practice history.
9. Make an explicit recovery decision before external signup is enabled.

The recovery decision is a hard gate because Supabase Free does not provide accessible automatic backups. Supabase recommends free projects create off-site logical dumps. [Supabase backup documentation](https://supabase.com/docs/guides/platform/backups). No backup automation will be built until that decision is made.

After external signup begins, hold the first infrastructure review at the earlier of:

- 25 authenticated accounts, or
- 30 days after the first external signup.

That review uses actual database size, egress, Edge invocations, email volume, Auth failures, sync conflicts, and project-pausing behavior. Until then, there is no justification for production-scale infrastructure or speculative optimization.

## Verification and acceptance

Backend:

- Rebuild a local Supabase instance entirely from migrations.
- Test explicit grants as well as RLS.
- Prove anonymous access is denied.
- Prove user A cannot access or modify user B’s rows.
- Prove users cannot change `user_id`, revision, or server timestamps.
- Send malformed JSON and discriminated records directly to the Data API.
- Test pagination beyond 1,000 sessions.
- Test idempotent retries and stale revisions.
- Test tombstones against an offline stale client.
- Test deletion, response loss, and old JWTs.
- Scan deployed JavaScript bundles and repository history for secret-key exposure.

Frontend:

- Test every Auth state and callback failure.
- Test generic recovery and signup responses.
- Test guest operation with no network.
- Test outbox persistence across reloads.
- Test overlapping sync suppression and late-result cancellation.
- Test login/logout/account-switch cache isolation.
- Test logout with pending writes.
- Test guest-to-new and guest-to-existing account merges.
- Test conflict resolution without blocking unrelated records.
- Test all existing snapshot and Stats derivation invariants.
- Run the existing Jest, lint, TypeScript, and Expo web-export verification sequence.

## Assumptions and deferred work

- Supabase remains the selected backend.
- Custom backend runtime code is plain JavaScript; SQL migrations and generated frontend TypeScript types remain necessary.
- Immediate account deletion remains required.
- User-facing data export is removed.
- There are no existing cloud accounts or backend records to migrate.
- Existing local data is handled only through guest import.
- Remote trick catalogs, reminders, weekly recaps, public share links, Realtime sync, user MFA, and media attachments remain outside this roadmap.
- Free-tier durability is acceptable during development with no external users; it is not silently assumed acceptable after signup opens.
