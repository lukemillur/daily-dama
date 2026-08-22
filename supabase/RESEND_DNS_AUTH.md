# Resend + DNS authentication for `auth.dailydama.com` (T153.3)

**Status: drafted, not yet verified live.** This file is scaffolding for a
future credentialed session, not a substitute for the live delivery record
T153.3's exit criteria require. Nothing in this document has been confirmed
against a real Resend domain-setup screen, a real DNS zone, or a real hosted
Supabase project.

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

See `.claude/plans/T153.3.md` for the full reasoning. This document only
records the record *shapes* so a future credentialed session can move fast.

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

## Delivery record (secret-free — fill in only after live verification)

- **Date:**
- **Hosted Supabase project ref:**
- **SPF result:**
- **DKIM result:**
- **DMARC policy published (must show `p=none`):**
- **Link tracking confirmed disabled (Resend domain settings):**
- **Confirmation email — observed sending domain / callback URL:**
- **Recovery email — observed sending domain / callback URL:**

No SMTP credential, Resend API key, or Supabase PAT may ever be recorded in
this file or any other tracked file.
