# Local Supabase development

This directory holds the repository-owned local Supabase Auth configuration
for Daily Dama. It establishes a reproducible local backend contract only —
application code does not consume it yet (see T153.4).

## Prerequisites

- Docker Desktop (or a compatible engine: Colima, OrbStack) running locally.
- Supabase CLI, pinned to `2.116.0`. Use it via `npx --yes supabase@2.116.0 <command>`
  rather than a global install, so everyone on the team runs the exact same
  version this config was authored and tested against.

## First-time / clean-reset workflow

From the repository root:

```sh
npx --yes supabase@2.116.0 start      # boots Postgres, GoTrue, Mailpit, Studio, etc.
npx --yes supabase@2.116.0 db reset   # clean local database reset (re-applies migrations/seed)
npx --yes supabase@2.116.0 status     # prints local API URL, anon key, service_role key, Studio/Mailpit URLs
```

`supabase start` reads `supabase/config.toml` in this directory. Re-run
`db reset` any time you want a clean local database without tearing down the
whole stack.

### Running migration tests (pgTAP)

Schema migrations under `supabase/migrations/` are covered by pgTAP tests
under `supabase/tests/` (one `.test.sql` file per ticket for now). Run them
against a freshly reset local database:

```sh
npx --yes supabase@2.116.0 db reset       # re-apply all migrations from clean
npx --yes supabase@2.116.0 test db --local
```

The first `test db --local` run pulls the `public.ecr.aws/supabase/pg_prove`
Docker image, so it needs network access once. Always finish on another
`db reset` so no fixture rows or manually-dropped constraints from a
regression check linger in the running local DB. See "One repeatable
command" below for the consolidated way to run this alongside every other
migration/security test source.

**Never commit the output of `supabase status`.** If you save the printed
anon/service keys anywhere for manual testing, put them in `.env.local` at the
repo root (already gitignored) — never in `.env.example` or any other tracked
file.

### Running Data API JSON-invariant tests

Every domain-invariant proof above (pgTAP) runs SQL directly inside a
transaction that gets rolled back. `supabase/tests/data-api/` proves the same
invariants a second way: real HTTP requests through PostgREST (the Data API),
using a genuine, confirmed, signed-in `authenticated` JWT — the actual path a
client takes, not a SQL-level shortcut. It covers every discriminated shape
(profile `lastSesh` plan variants, custom-trick step variants including
nested-sequence rejection in both directions, goal count/time variants) with
valid/malformed parameterized cases, plus a few cases pgTAP cannot exercise at
all: forged server-owned columns (expect `42501`), unrecognized JSON keys that
aren't any column (expect PostgREST's own `PGRST204`), and bulk (JSON-array)
insert atomicity.

This suite needs a running local stack with a recent `db reset` (it exercises
real rows against the live stack, not a rolled-back transaction):

```sh
npx --yes supabase@2.116.0 start       # if not already running
npx --yes supabase@2.116.0 db reset
yarn test:data-api
```

Each test file creates and deletes its own confirmed test user via the
`auth/v1/admin/users` API, so no manual signup/Mailpit step is needed (unlike
the Auth-policy manual-verification steps below). Deleting that user cascades
to every `api.*` row it owns, so no per-table teardown is needed either.
Finish with `npx --yes supabase@2.116.0 db reset` afterward, the same way the
pgTAP section above instructs, so no fixture rows linger for a subsequent run
of either suite.

### Running the delete-account Edge Function tests

`supabase/tests/functions/` proves T161.1's `delete-account` Edge Function
contract over real HTTP against a running local stack: valid input with a
correct password and exact `DELETE` confirmation returns `204` and cascades
every application row plus the Auth user itself; missing/invalid JWTs,
malformed bodies, wrong confirmation text, wrong passwords, and a body that
tries to name another user's id are all rejected.

The handler applies a 30-attempt limit per trusted Auth user and per trusted
edge-proxy client IP in a 15-minute window. The prototype limiter is bounded
and isolate-local; hosted deployments need distributed enforcement validation
in T162.4. The proxy-provided IP is used only as a rate-limit dimension, never
as an authorization identity.

This suite needs the same running local stack and recent `db reset` as the
Data API suite above (the CLI serves any function under
`supabase/functions/<name>/` automatically once the stack is running, so no
separate `supabase functions serve` step is needed):

```sh
npx --yes supabase@2.116.0 start       # if not already running
npx --yes supabase@2.116.0 db reset
yarn test:functions
```

It is folded into `yarn test:db` as a step after the Data API suite, and
like that suite is not part of `node .claude/scripts/verify.mjs` (it needs a
running Docker-backed local stack that the no-Docker verification sequence
does not assume). Finish with `npx --yes supabase@2.116.0 db reset`
afterward for the same reason the sections above do.

`t161_3_delete_account_acceptance.test.mjs` extends this real-stack boundary
with a single clean-reset A/B fixture covering all six exposed resources. It
proves complete Auth/FK cascade isolation, anonymous and genuinely signed
expired-JWT denial, wrong-user and stale/pre-deletion behavior, old-token row
recreation rejection, and a discarded successful response followed by an
idempotent retry. It reads the local JWT signing secret from `supabase status
-o json` only in memory to construct the expired token; it never hardcodes or
prints that secret. Run the focused acceptance test with:

```sh
node --test supabase/tests/functions/t161_3_delete_account_acceptance.test.mjs
```

The consolidated `yarn test:db` command runs this through the existing
`yarn test:functions` glob after a clean reset and always performs its final
cleanup reset. A missing Docker/local Supabase stack or missing runtime JWT
secret is a blocked acceptance prerequisite, not a reason to substitute the
app Jest suite.

`supabase/tests/data-api/` also carries T155.7's authorization suite
(anonymous denial, cross-user isolation, ownership-change rejection, and each
table's per-operation grant matrix) and T155.8's pagination fixture
(`t155_8_pagination.test.mjs`: 1,200 `practice_sessions` rows for one user,
paginated past PostgREST's 1,000-row `max_rows` cap) alongside the
JSON-invariant suite above, run via the same `yarn test:data-api` command —
all three concerns live in the same directory and share the same run steps.

Like pgTAP, `yarn test:data-api` is **not** part of `node .claude/scripts/
verify.mjs` or the standard `yarn test`/`lint`/`tsc`/`export` sequence: it
requires a running local Supabase/Docker stack that CI and the standard
verification loop do not assume. Run it explicitly as shown above, or as
part of the consolidated `yarn test:db` command below.

### Generating TypeScript database types

`src/shared/supabase/database-types.ts` is a checked-in, generated
`Database` type (Supabase CLI's `gen types typescript`) covering every table
in the `api` schema. It is the source of the `Row`/`Insert`/`Update` types
every domain's cloud repository (`src/features/*/persistence/*-cloud-
repository.ts`) is built from — never hand-edit it.

```sh
npx --yes supabase@2.116.0 start      # if not already running
yarn db:generate-types                # regenerate + overwrite the checked-in file
```

Standalone `yarn db:generate-types` (`supabase/scripts/generate-database-types.mjs`)
always runs `supabase start` then a clean `db reset` before generating, so
the output only ever reflects `supabase/migrations/` from a clean state, not
whatever ad hoc state the local stack happened to be in. It generates with
an explicit `--schema api` (rather than relying on `config.toml`'s default
schema list) and always finishes with another cleanup `db reset`, regardless
of outcome, so the stack is never left dirty.

Run `yarn db:generate-types -- --check` to verify the checked-in file has no
drift against a fresh generation, without overwriting it — it diffs
byte-for-byte and exits non-zero on mismatch. This is wired into `yarn
test:db` (see below), right after its existing `db reset` and before pgTAP,
so schema/type drift is caught before the rest of the suite runs against a
schema the checked-in types no longer describe.

Regenerate (`yarn db:generate-types`, no `--check`) and commit the result
after any migration change.

## One repeatable command

`yarn test:db` (`supabase/tests/run-db-tests.mjs`) consolidates the
clean-reset, pgTAP, and Data API steps above into one command, suitable for
local work and CI (non-interactive, exit-code-driven — it is not itself
wired into a CI workflow, since none exists yet that references Supabase).
It requires Docker/the local Supabase stack, same as the individual commands
above; if the stack isn't started yet, the command starts it itself.

```sh
yarn test:db
```

In order: `supabase start` (idempotent), `db reset`, a generated-types drift
check that reuses that clean database and compares against the checked-in
`database-types.ts`, pgTAP (`test db --local`), the Data API suite (`yarn
test:data-api`, including the T155.8 pagination fixture), then a final cleanup
`db reset` that always runs even if an earlier step failed — so the stack is
never left dirty by a failed run. The command's own exit code preserves any
earlier test-step failure; a
passing cleanup reset never masks an earlier failure, and a failed cleanup
reset after an otherwise-passing run still exits non-zero.

### Mutation check

`yarn test:db -- --mutation-check` proves the whole harness fails closed
against a real, live policy regression — not just that today's pgTAP/Data
API assertions pass. It resets to a clean baseline, deliberately weakens
`practice_sessions_select_own` (the strictest exposed table's cross-user
isolation policy) to `using (true)`, reruns the cross-user isolation suite
expecting it to fail, then always restores the migration-defined policy via
another `db reset` regardless of the outcome. The script itself exits `0`
with a "mutation check passed" message if the suite caught the weakened
policy, or `1` with a "mutation check FAILED" message if it didn't (a real
coverage gap).

This is noisier than the default run (it prints an expected-looking test
failure, and it mutates the live local DB, even though it restores it
afterward) and mutates a real policy, so it is not part of the routine
per-commit loop. Run it whenever RLS policies change, and periodically as a
sanity check that the harness still fails closed.

## Local Auth policy (see `config.toml`)

- Email confirmations are required (`enable_confirmations = true`) — unverified
  users cannot sign in.
- Minimum password length is 10 characters (`minimum_password_length = 10`).
- JWTs expire after one hour (`jwt_expiry = 3600`), pinned explicitly per
  `BACKEND_ROADMAP.md` Phase 1 policy.
- The only local redirect origin is `http://localhost:8081/auth/callback`
  (`site_url` and `additional_redirect_urls`). Use `localhost`, not
  `127.0.0.1`, everywhere in this workflow — browsers treat these as different
  origins for storage/PKCE purposes, and a mismatch here is the single most
  likely way to silently break the callback while looking like a config bug.
- The signup-confirmation email uses the repository-owned template at
  `supabase/templates/confirmation.html` instead of Supabase's generic
  default copy.
- The password-recovery email uses the repository-owned template at
  `supabase/templates/recovery.html` instead of Supabase's generic default
  copy.

This config is local-only. It does not touch the hosted Supabase project —
that is mirrored separately in T153.2.

## Manual verification of the behavioral exit criteria

No frontend consumes Supabase Auth yet (that begins in T153.4), so drive
GoTrue's REST API directly with curl. Get the local anon key from
`npx --yes supabase@2.116.0 status` first.

**Nine-character signup rejected:**

```sh
curl -i -X POST 'http://127.0.0.1:54321/auth/v1/signup' \
  -H "apikey: LOCAL_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "ninechar1"
  }'
```

Expect a 4xx response citing the 10-character minimum.

**Unverified user cannot sign in:**

Repeat the signup with a 10+ character password (the confirmation email goes
to Mailpit and the account stays unconfirmed):

```sh
curl -i -X POST 'http://127.0.0.1:54321/auth/v1/signup?redirect_to=http%3A%2F%2Flocalhost%3A8081%2Fauth%2Fcallback' \
  -H "apikey: LOCAL_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "tencharacters"
  }'
```

Note: the raw REST endpoint reads the redirect target from the redirect_to
query parameter, not from a body field. (supabase-js's emailRedirectTo
option is a client-library abstraction that sends this same query parameter
under the hood -- it is not a JSON body key on the wire. Sending it nested
under options in the body here is silently ignored and the email falls
back to site_url, so it must be the exact query parameter shown above to
hit the exact callback.)

Then attempt to sign in before confirming:

```sh
curl -i -X POST 'http://127.0.0.1:54321/auth/v1/token?grant_type=password' \
  -H "apikey: LOCAL_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "email": "test@example.com", "password": "tencharacters" }'
```

Expect a 400 response ("Email not confirmed" or equivalent) rather than a
session.

**Mailpit receives the repository-owned confirmation email targeting the
exact callback:**

Open `http://127.0.0.1:54324`, find the confirmation email, and confirm:

- The subject/body match `supabase/templates/confirmation.html` (Daily Dama
  branding), not Supabase's generic "Confirm your signup" default.
- The confirmation link's `redirect_to` (or `next`) query parameter is
  exactly `http://localhost:8081/auth/callback` — not a substring/prefix
  match, and not silently falling back to `site_url`.

**Mailpit receives the repository-owned recovery (password reset) email
targeting the exact callback:**

Trigger a recovery email with the raw REST call (there is no frontend yet):

```sh
curl -i -X POST 'http://127.0.0.1:54321/auth/v1/recover?redirect_to=http%3A%2F%2Flocalhost%3A8081%2Fauth%2Fcallback' \
  -H "apikey: LOCAL_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "email": "test@example.com" }'
```

Open `http://127.0.0.1:54324`, find the recovery email, and confirm:

- The subject/body match `supabase/templates/recovery.html` (Daily Dama
  branding, "Reset your Daily Dama password" subject), not Supabase's
  generic "Reset password" default.
- The recovery link's `redirect_to` (or `next`) query parameter is exactly
  `http://localhost:8081/auth/callback`, matching the same callback
  convention as confirmation.

## Automated Phase 1 Auth acceptance suite (T153.13)

`yarn test:e2e:auth` is the one documented command for the black-box Playwright
acceptance suite under `e2e/auth/`. It:

1. Starts the local stack if it is not already running.
2. Runs a single `db reset` (see the email-budget note below for why only one).
3. Reads the anon key, service-role key, and API URL from the local CLI's own status
   output at run time -- never hardcoded, never printed, never written to a tracked
   file -- and exports them into the Playwright child process's environment only.
4. Runs Playwright (`e2e/auth/*.spec.ts`) against a real Expo web dev server it starts
   on port 8081.

### One-time host prerequisite

Playwright's Chromium browser is not vendored into the repo. Install it once per
machine:

```sh
npx playwright install chromium
```

### Email-budget design

`email_sent = 2` per hour (see `config.toml`) is global to the whole local GoTrue
instance, not scoped per address or per IP. Two mechanisms keep the suite well under
that cap for everything except the two scenarios that must prove a real email
actually arrives and works:

- `supabase.auth.admin.createUser({ email_confirm: true })` seeds an already-verified
  account instantly, for every scenario that needs a known/confirmed user but is not
  itself testing an email send (sign-in equivalence, wrong password, the existing-user
  side of signup equivalence, the unknown side of recovery equivalence).
- `supabase.auth.admin.generateLink()` was originally planned as a zero-cost way to
  synthesize PKCE callback codes too, but live-probing during implementation showed
  it cannot produce a PKCE `code` redirect at all -- without a client-supplied
  `code_challenge`, GoTrue falls back to an implicit-flow hash-token redirect instead.
  The reused and verifier-mismatched callback scenarios therefore ride on the one real
  signup send below instead of getting their own zero-cost file.

That leaves exactly two real sends for the whole suite, both in
`e2e/auth/04-real-email-flows.spec.ts`: one signup-confirmation send (which also
covers verification, the reused callback case, and the verifier-mismatched callback
case) and one recovery send (which also covers reset). A third request in the same
hour window -- resending the first signup's confirmation -- proves the resend-limit
rejection. Playwright's config pins `workers: 1`, `fullyParallel: false`, and
`retries: 0` so this ordering is guaranteed, not accidental. Do not add a mid-run
second `db reset`; rerunning the whole `yarn test:e2e:auth` command (which resets
first) is the retry story.

A further finding from live-probing: `email_sent` (the rate limit above) only applies
when a real SMTP provider is configured (`[auth.email.smtp]`, which this local stack
deliberately does not have -- see the comment on `email_sent` in config.toml itself).
A 3rd real send against local Mailpit succeeds rather than being rejected, so the
resend-limit spec intercepts that one request and fulfills it with GoTrue's real
`over_email_send_rate_limit` response shape instead -- proving the *app's* reaction to
that response, since the server-side enforcement itself is not exercisable locally.

T154.1's `e2e/auth/07-account-security.spec.ts` spends four further real sends this
same way, riding on the same no-op-without-SMTP finding above: two for the full
two-address `double_confirm_changes` email-change scenario (one to the current
address, one to the new address, in the one `updateUser({ email })` call) and two
more for the parallel email-change redaction scenario. All four are real Mailpit
sends read back via `fetchLatestAuthLink`, not synthesized links -- `generateLink`
was already ruled out above for not producing an exchangeable PKCE `code`.

## Non-goals of this ticket

- No hosted/remote Supabase project changes (T153.2).
- No secure email/password-change policy beyond the generated defaults
  (T154.1).
- No application code consumes this configuration yet (T153.4+).
