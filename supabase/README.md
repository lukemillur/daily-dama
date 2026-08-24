# Local Supabase development

This directory holds the repository-owned local Supabase Auth configuration
for Daily Dama. It establishes a reproducible local backend contract only —
application code does not consume it yet (see T153.4).

## Prerequisites

- Docker Desktop (or a compatible engine: Colima, OrbStack) running locally.
- Supabase CLI, pinned to `2.115.0`. Use it via `npx --yes supabase@2.115.0 <command>`
  rather than a global install, so everyone on the team runs the exact same
  version this config was authored and tested against.

## First-time / clean-reset workflow

From the repository root:

```sh
npx --yes supabase@2.115.0 start      # boots Postgres, GoTrue, Mailpit, Studio, etc.
npx --yes supabase@2.115.0 db reset   # clean local database reset (re-applies migrations/seed)
npx --yes supabase@2.115.0 status     # prints local API URL, anon key, service_role key, Studio/Mailpit URLs
```

`supabase start` reads `supabase/config.toml` in this directory. Re-run
`db reset` any time you want a clean local database without tearing down the
whole stack.

### Running migration tests (pgTAP)

Schema migrations under `supabase/migrations/` are covered by pgTAP tests
under `supabase/tests/` (one `.test.sql` file per ticket for now). Run them
against a freshly reset local database:

```sh
npx --yes supabase@2.115.0 db reset       # re-apply all migrations from clean
npx --yes supabase@2.115.0 test db --local
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
npx --yes supabase@2.115.0 start       # if not already running
npx --yes supabase@2.115.0 db reset
yarn test:data-api
```

Each test file creates and deletes its own confirmed test user via the
`auth/v1/admin/users` API, so no manual signup/Mailpit step is needed (unlike
the Auth-policy manual-verification steps below). Deleting that user cascades
to every `api.*` row it owns, so no per-table teardown is needed either.
Finish with `npx --yes supabase@2.115.0 db reset` afterward, the same way the
pgTAP section above instructs, so no fixture rows linger for a subsequent run
of either suite.

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
npx --yes supabase@2.115.0 start      # if not already running
yarn db:generate-types                # regenerate + overwrite the checked-in file
```

`yarn db:generate-types` (`supabase/scripts/generate-database-types.mjs`)
always runs `supabase start` then a clean `db reset` before generating, so
the output only ever reflects `supabase/migrations/` from a clean state, not
whatever ad hoc state the local stack happened to be in. It generates with
an explicit `--schema api` (rather than relying on `config.toml`'s default
schema list) and always finishes with another cleanup `db reset`, regardless
of outcome, so the stack is never left dirty.

Run `yarn db:generate-types -- --check` to verify the checked-in file has no
drift against a fresh generation, without overwriting it — it diffs
byte-for-byte and exits non-zero on mismatch. This is wired into `yarn
test:db` (see below), right after `db reset` and before pgTAP, so schema/type
drift is caught before the rest of the suite runs against a schema the
checked-in types no longer describe.

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

In order: `supabase start` (idempotent), `db reset`, a `yarn db:generate-
types -- --check` drift check against the checked-in `database-types.ts`,
pgTAP (`test db --local`), the Data API suite (`yarn test:data-api`,
including the T155.8 pagination fixture), then a final cleanup `db reset`
that always runs even if an earlier step failed — so the stack is never left
dirty by a failed
run. The command's own exit code reflects only the first four steps; a
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
`npx --yes supabase@2.115.0 status` first.

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

## Non-goals of this ticket

- No hosted/remote Supabase project changes (T153.2).
- No secure email/password-change policy beyond the generated defaults
  (T154.1).
- No application code consumes this configuration yet (T153.4+).
