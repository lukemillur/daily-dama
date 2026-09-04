# Hosted development project — Auth configuration record

**Date:** 2026-08-24
**Project:** `Daily Dama Dev` (hosted, free plan), region `us-east-2`. This is the
single hosted development project referenced by `EXPO_PUBLIC_SUPABASE_URL` /
`EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in each developer's own gitignored
`.env.local` per `.env.example`. No production project was created as part of
this task; that remains reserved for a later ticket.

This record intentionally contains no secrets. The project ref, anon/publishable
key, service-role key, and DB password all live only in `.env.local` files and
the account owner's password manager — never in this file or any tracked file.

## Auth policy, confirmed live via the Management API (`GET /v1/projects/{ref}/config/auth`)

| Setting | Value |
| --- | --- |
| Email confirmation required before sign-in (`mailer_autoconfirm`) | `false` (confirmation required) |
| Password minimum length (`password_min_length`) | `10` |
| Access-token (JWT) lifetime (`jwt_exp`) | `3600` seconds |
| Redirect allowlist (`uri_allow_list`) | exactly `http://localhost:8081/auth/callback,https://dailydama.com/auth/callback` — no wildcard, no other entries |
| Site URL (`site_url`) | `https://dailydama.com` |
| Enabled Auth provider (`external_email_enabled`) | `true` (email/password only; no OAuth/phone providers enabled) |

These four values mirror T153.1's local `supabase/config.toml` `[auth]` block
exactly (verified-email password policy, ten-character minimum, one-hour JWT
lifetime), plus the hosted project's own redirect allowlist covering both the
local dev callback and the live `dailydama.com` callback, since this same
hosted dev project currently backs the live site until a separate production
project is created (a later ticket).

## Live probe results

Run against `https://<project-ref>.supabase.co/auth/v1/*` using the project's
publishable (`anon`) key as the `apikey` header — never the service-role key.

- **Nine-character password signup** (`POST /auth/v1/signup`, `password:
  "9characte"`): `HTTP 422`, `error_code: "weak_password"`,
  `"msg": "Password should be at least 10 characters."` — rejected as required.
- **Sign-in before email confirmation**: a fresh signup with a 10+ character
  password succeeded (`HTTP 200`, `email_verified: false` in the response),
  and an immediate `POST /auth/v1/token?grant_type=password` with the same
  credentials returned `HTTP 400`, `error_code: "email_not_confirmed"`,
  `"msg": "Email not confirmed"` — sign-in denied as required.

Both probes used throwaway addresses under a real deliverable domain (not
`@example.com`); this hosted project rejects `@example.com` at signup with
`400 email_address_invalid` (its email validation differs from the local
dev stack, which does not reject `example.com`). This is informational only
and does not affect the exit criteria above — it does not touch password
policy, confirmation-gating, redirects, or JWT lifetime.

## Explicit non-goals for this task

- No custom SMTP, Resend integration, or DNS authentication — that is
  T153.3's job. The project currently uses Supabase's default mailer, which
  has a low send-rate limit.
- No secure-email-change or reauthentication policy changes — that is
  T154.1's job.
- No second (production) hosted project was created. This task configured
  exactly one project, `Daily Dama Dev`.

## Where the real values live

The project URL and publishable/anon key belong in each developer's own
gitignored `.env.local`, matching the variable names already documented in
`.env.example` (`EXPO_PUBLIC_SUPABASE_URL`,
`EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`). The DB password and any Management
API personal access token belong only in the account owner's password
manager or a gitignored local file — never in this repository.

## 2026-08-24 update — T154.1 (signed-in password/email change)

This ticket's app-layer work (`AuthProvider.changePassword`/`changeEmail`,
`AccountSecurityScreen`, `AuthCallbackScreen`'s email-change destination) was implemented and
verified against the **local** Supabase/Mailpit stack only. This run's environment did not have
the hosted project's Management API personal access token available, so the following from the
ticket's plan step 3 was **not** performed and remains open:

- Confirming the hosted equivalent of `double_confirm_changes` (likely
  `mailer_secure_email_change_enabled` -- not yet confirmed against a live `GET
  /v1/projects/{ref}/config/auth` response) is enabled.
- Confirming the hosted equivalent of `secure_password_change` stays at its default/off value.

Whoever next has Management API access to the hosted `Daily Dama Dev` project should run that
`GET`, record the actual field name and value here, and set it if it isn't already enabled --
the app's email-change flow silently degrades to single-confirmation if secure email change is
off on the hosted project (still functional, just not the two-address-confirmation design this
ticket assumes).

No redirect-allowlist change was needed for this ticket's `?flow=email_change` callback
discriminator against the **local** stack (see `supabase/config.toml`'s
`additional_redirect_urls` comment for the live-verified reason: GoTrue's match here ignores the
query string). This has not been separately verified against the hosted project's
`uri_allow_list` matching behavior -- treat that as unconfirmed until it is checked live, rather
than assuming it behaves identically.

## 2026-09-04 update — T216 (branded email-change template)

Applied `supabase/templates/email_change.html` (same branded pattern as
`confirmation.html`: `#f8f1dd` cream/paper background, `2px solid #18382e` ink
border, `8px 8px 0 #18382e` hard drop shadow, `#d84929` red uppercase eyebrow
badge, `#18382e`-background/`#f4c94d`-text button) to the hosted `Daily Dama
Dev` project via a targeted `PATCH /v1/projects/{ref}/config/auth`
(`mailer_subjects_email_change` and `mailer_templates_email_change_content`
only -- following the same narrow-PATCH pattern as T153.3/T195, leaving
`site_url`, `uri_allow_list`, and SMTP settings untouched), and got `HTTP 200`.

Verified both exit-criteria bullets:

- **Local:** a real signup/confirm/`updateUser({ email })` cycle against the
  local stack delivered the new template to Mailpit with all five branding
  elements intact and a valid `type=email_change` confirmation link.
- **Hosted:** the account owner temporarily pointed `.env.local` at the hosted
  project, signed in with a real confirmed hosted account, and triggered a
  real `changeEmail` request through `AccountSecurityScreen`'s UI. The
  delivered branded `email_change` message was confirmed present in Resend's
  own delivery log (not Mailpit), consistent with the "Mailpit isn't proof of
  hosted email delivery" guidance in `supabase/README.md`.
