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

## Non-goals of this ticket

- No hosted/remote Supabase project changes (T153.2).
- No secure email/password-change policy beyond the generated defaults
  (T154.1).
- No application code consumes this configuration yet (T153.4+).
