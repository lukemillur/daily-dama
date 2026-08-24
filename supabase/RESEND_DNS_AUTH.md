# Resend + DNS authentication for `auth.dailydama.com` (T153.3)

**Status: verified live on 2026-08-24.** The delivery record below reflects
live checks against the hosted `Daily Dama Dev` Supabase project, public DNS
for `auth.dailydama.com`, and two real test messages (confirmation + recovery)
received through Resend at a real, non-Mailpit inbox.

## Why this exists

T153.3 requires Supabase custom SMTP through Resend on a dedicated
`auth.dailydama.com` sending subdomain, with link tracking disabled, SPF/DKIM
passing, and a visible DMARC `p=none` policy. Completing that needs three
things this environment did not have when this file was written:

1. T153.2 finished (a live hosted Supabase project ref, with Auth already
   configured) — T153.2 was blocked on Supabase PAT/dashboard access.
2. A Resend account or API key, to add/verify the `auth.dailydama.com`
   sending domain and read its real DKIM values.
3. DNS provider access for `dailydama.com`, to publish the SPF/DKIM/DMARC
   records Resend specifies.

See `.claude/plans/T153.3.md` for the full reasoning behind why this file
originally existed only as scaffolding. All three blockers above are now
resolved (T153.2 merged, Resend connected via its own Supabase Integration
wizard, DNS published) — see the **Delivery record** section below for the
live values actually observed. The drafted table and runbook immediately
below are kept for historical context; where they guessed at exact values,
the Delivery record's live DNS lookups supersede the guess.

## Drafted DNS record shapes (unverified — confirm live before publishing)

| Record | Host | Type | Value | Confirm before publishing |
| --- | --- | --- | --- | --- |
| SPF | `auth.dailydama.com` | TXT | `v=spf1 include:amazonses.com ~all` | Resend sends via AWS SES; confirm this exact `include` value on Resend's live domain-setup screen for this account, and confirm Resend's current docs still model a sending subdomain here rather than the apex. |
| DKIM | one or more CNAME hosts under `auth.dailydama.com`, exact names supplied by Resend | CNAME | opaque, per-domain value Resend generates | Cannot be predicted; copy verbatim from Resend's domain page once the domain is added. |
| DMARC | `_dmarc.auth.dailydama.com` | TXT | `v=DMARC1; p=none;` | Matches the task's explicit `p=none` requirement. T162 may tighten this later using observed delivery evidence — do not preemptively raise it here. |

## Runbook: once credentials exist

1. In Resend, add the `auth.dailydama.com` domain.
2. Copy the exact SPF/DKIM record values Resend's UI shows (do not reuse the
   drafted values above without confirming they match).
3. Publish all three records (SPF, DKIM, DMARC) with the DNS provider that
   controls `dailydama.com` — confirm which provider (see
   `DEPLOYMENT_HANDOFF.md`'s DNS section) before assuming Vercel-managed DNS.
4. Wait for Resend to mark the domain verified.
5. In Resend's domain settings, turn off "Open and click tracking" for
   `auth.dailydama.com` — this is the exit criteria's tracking-disable
   requirement, and it must be confirmed off, not just left at Resend's
   default.
6. Configure Supabase custom SMTP on the hosted project (Management
   API/dashboard, using the same access T153.2 needed): Resend's SMTP host
   and port, the Resend SMTP username, and the Resend API key as the SMTP
   password. This lives only in Supabase's own project-side config — never
   in a tracked file, `.env.example`, or any `EXPO_PUBLIC_*` variable, since
   those are inlined into the client bundle (see `DEPLOYMENT_HANDOFF.md`).
7. Confirm the hosted project's Auth email templates for confirmation and
   recovery are the repository-owned copies in `supabase/templates/`
   (uploaded via Management API/dashboard — `config.toml` only drives the
   local CLI stack, not the hosted project).
8. Send a real confirmation email and a real recovery email to a real inbox
   (not Mailpit — Mailpit never touches Resend or DNS). For each, confirm:
   - It arrives from `auth.dailydama.com`.
   - The message headers show SPF, DKIM, and DMARC as pass.
   - The callback URL in the email body is untouched (no Resend link-rewrite
     domain in the href) — this depends on step 5 actually being off.
9. Fill in the delivery record below with what was actually observed. Do not
   pre-fill any field with an assumed "pass" before it is actually observed.

## Delivery record (secret-free)

- **Date:** 2026-08-24
- **Hosted Supabase project ref:** `ylyoqswauqyesuwmetnl` (`Daily Dama Dev`)
- **Custom SMTP confirmed live** (`GET /v1/projects/{ref}/config/auth`):
  `smtp_host=smtp.resend.com`, `smtp_user=resend`, `smtp_port=465`,
  `smtp_admin_email=team@auth.dailydama.com`, `smtp_sender_name=Daily Dama`.
  Confirmed already wired by Resend's own Supabase Integration wizard —
  not configured by this task.
- **Repository-owned templates uploaded to the hosted project:** the hosted
  project's Auth config previously held Supabase's generic default copy for
  both `confirmation` and `recovery` (`mailer_templates_custom_contents` was
  `false` for both). This task set `mailer_subjects_confirmation`,
  `mailer_templates_confirmation_content`, `mailer_subjects_recovery`, and
  `mailer_templates_recovery_content` via `PATCH /v1/projects/{ref}/config/auth`
  from the exact contents of `supabase/templates/confirmation.html` and
  `supabase/templates/recovery.html`, then re-read the config back to confirm
  the upload matched the tracked files byte-for-byte at the start.
- **SPF:** live DNS shows `send.auth.dailydama.com` (Resend's SPF-relevant
  host for this domain) is a CNAME to `send.forge.rmta.net`, which resolves
  a TXT record `v=spf1 include:_spf.forge.rmta.net ~all` (Resend's current
  sending infrastructure — the plan's earlier guess of a direct
  `include:amazonses.com` SPF record was unconfirmed and is superseded by
  this live lookup). A real received message's underlying second
  `DKIM-Signature` header (`d=amazonses.com`) confirms Amazon SES is still
  present further down Resend's delivery chain.
- **DKIM:** live DNS shows `resend._domainkey.auth.dailydama.com` publishes
  a TXT record (`p=MIGfMA0GCSqG...`, RSA public key). Both the confirmation
  and recovery test messages carry a `DKIM-Signature: ... s=resend;
  d=auth.dailydama.com` header matching this exact domain/selector pair —
  the message was actually signed with the key this DNS record advertises.
- **DMARC:** `_dmarc.auth.dailydama.com` itself publishes no dedicated TXT
  record; `_dmarc.dailydama.com` (the organizational domain) publishes
  `v=DMARC1; p=none;`. Per DMARC's own inheritance rule (RFC 7489 §6.6.3), a
  subdomain with no dedicated `_dmarc` record is evaluated under its
  organizational domain's policy, so `auth.dailydama.com` mail is covered by
  this `p=none` policy today. This is a deliberate reliance on inheritance,
  not a dedicated subdomain record — flagging this explicitly in case a
  later ticket (T162) wants a dedicated `_dmarc.auth.dailydama.com` record
  instead.
- **Link tracking:** confirmed disabled by observation rather than a Resend
  dashboard checkbox (no separate Resend API key was available to this
  session). Both real delivered messages below link directly to Supabase's
  own `.../auth/v1/verify` endpoint with the exact `redirect_to` query
  parameter untouched — a Resend click-tracking rewrite would have replaced
  this href with a Resend-hosted redirect domain, which did not happen.
- **Confirmation email — observed:** sent from `team@auth.dailydama.com`,
  subject `Confirm your Daily Dama account` (repository-owned copy, not
  Supabase's generic default), received at a real disposable inbox (not
  Mailpit) via a live `POST /auth/v1/signup` call against the hosted
  project. Callback URL in the delivered message:
  `https://ylyoqswauqyesuwmetnl.supabase.co/auth/v1/verify?token=<opaque>&type=signup&redirect_to=https://dailydama.com/auth/callback`
  — `redirect_to` intact and unrewritten.
- **Recovery email — observed:** sent from `team@auth.dailydama.com`,
  subject `Reset your Daily Dama password` (repository-owned copy), received
  at the same real inbox via a live `POST /auth/v1/recover` call. Callback
  URL in the delivered message:
  `https://ylyoqswauqyesuwmetnl.supabase.co/auth/v1/verify?token=<opaque>&type=recovery&redirect_to=https://dailydama.com/auth/callback`
  — `redirect_to` intact and unrewritten.
- **Not independently confirmed:** a receiving-MTA `Authentication-Results`
  header showing explicit `spf=pass dkim=pass dmarc=pass` verdicts. The
  disposable-inbox provider used to receive the real test messages does not
  attach one. The evidence above (matching DKIM domain/selector between the
  live DNS record and the actual signed message, live SPF-relevant DNS
  records resolving, and successful non-bounced delivery from
  `auth.dailydama.com`) is offered as the available substitute; a stronger
  header-level check would need either Resend's own dashboard/API access or
  a receiving mailbox that publishes authentication verdicts.

No SMTP credential, Resend API key, or Supabase PAT is recorded in this file
or any other tracked file.
