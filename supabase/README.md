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
regression check linger in the running local DB. T155.8 will consolidate
this into one repeatable command as more tables/tests are added; until then,
this two-command sequence is how migration tests are run locally.

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
table's per-operation grant matrix) alongside the JSON-invariant suite above,
run via the same `yarn test:data-api` command — both concerns live in the
same directory and share the same run steps.

Like pgTAP, `yarn test:data-api` is **not** part of `node .claude/scripts/
verify.mjs` or the standard `yarn test`/`lint`/`tsc`/`export` sequence: it
requires a running local Supabase/Docker stack that CI and the standard
verification loop do not assume. T155.8 will consolidate every security/
migration test source (pgTAP, this suite, and later Data API suites) into one
repeatable command; until then, run it explicitly as shown above.

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

## Non-goals of this ticket

- No hosted/remote Supabase project changes (T153.2).
- No secure email/password-change policy beyond the generated defaults
  (T154.1).
- No application code consumes this configuration yet (T153.4+).
