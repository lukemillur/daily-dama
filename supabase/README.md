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

**Never commit the output of `supabase status`.** If you save the printed
anon/service keys anywhere for manual testing, put them in `.env.local` at the
repo root (already gitignored) — never in `.env.example` or any other tracked
file.

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
    "password": "ninechar1",
    "options": { "emailRedirectTo": "http://localhost:8081/auth/callback" }
  }'
```

Expect a 4xx response citing the 10-character minimum.

**Unverified user cannot sign in:**

Repeat the signup with a 10+ character password (the confirmation email goes
to Mailpit and the account stays unconfirmed):

```sh
curl -i -X POST 'http://127.0.0.1:54321/auth/v1/signup' \
  -H "apikey: LOCAL_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "tencharacters",
    "options": { "emailRedirectTo": "http://localhost:8081/auth/callback" }
  }'
```

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
