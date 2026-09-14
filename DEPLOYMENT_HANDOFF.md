# Daily Dama — Deployment Handoff (dailydama.com)

Written 2026-08-06, updated 2026-08-10 once deployment actually happened, updated again 2026-09-14 to correct §1's stale "no backend" claim once Supabase Auth/Postgres, Sentry, and the feedback table went live in production. **This is no longer prep** — Vercel is connected and a live Production deployment exists. The rest of this document is still accurate about build/gate mechanics, but §1, §4, §5, and §7 have been corrected to match what's actually live rather than what was originally planned.

## Current deploy model — read this first

As of 2026-08-10, Vercel's GitHub integration is connected (deployments show `vercel[bot]` as creator) and `vercel.json` exists in the repo with the build command, output directory, and the `/app/stats/:trickId` rewrite (see §2). **Production deploys are no longer triggered by pushing to `main`.** `production` is a separate branch, set as Vercel's Production Branch; only a merge into `production` triggers a deploy to the live domain.

`main` accumulates ordinary work — including task branches merging in per the multi-agent protocol in [TASKS.md](TASKS.md) — and only reaches production when a PR from `main` into `production` is opened and merged deliberately. This is intentional: it means agents merging task PRs into `main` never accidentally ship straight to the public domain.

This was configured directly in the Vercel dashboard, not from anything in this repo, so if deploy behavior ever seems off, check Vercel's Project Settings → Git → Production Branch before assuming the config here is wrong.

## 1. What this project is

Daily Dama is a local-first Expo Router app (Kendama trick practice tracker). Repo: `github.com/lukemillur/daily-dama`, local clone at `/Users/luke/Personal Projects/kendama-project`, branch `main`.

The app is **not** client-only. Every guest's state starts client-side (AsyncStorage → `localStorage` on web, keys prefixed `daily-dama:`), covering the five persistent domains in [AGENTS.md](AGENTS.md)'s state/persistence boundaries — but production is also backed by a real, live hosted Supabase project (Postgres + Auth + Edge Functions), a feedback table, and third-party error/email services. Concretely, as of 2026-09-14:

- **Backend:** Supabase project `lnudjcpotidplbjqcfcx` (`us-east-2`), backing `www.dailydama.com`. A separate project, `ylyoqswauqyesuwmetnl`, backs `development`/staging deploys and is not touched by production traffic. Once a user signs up, their profile, custom tricks/sequences, practice history, goals, and notes sync to Postgres tables scoped by `user_id` with `on delete cascade` FKs to `auth.users`; deleting an account (`supabase/functions/delete-account`, an Edge Function) permanently removes all of that data along with the Auth user itself. Guests who never sign up never reach Supabase at all, except through the guest-import path if/when they do sign up.
- **Feedback:** the in-app Feedback screen writes to a standalone `api.feedback` table that has **no** `user_id` or foreign key to `auth.users` at all (`supabase/migrations/20260902000000_add_feedback_table_with_anon_insert.sql`) — submissions aren't linked to an account and are **not** deleted when the submitting user later deletes their account, because there's no FK to cascade through. Feedback is reviewed manually via Supabase Studio's Table Editor/SQL Editor against `api.feedback` on the production project; there is no in-app or automated read path.
- **Error monitoring:** Sentry project `daily-dama` (org `luke-miller-technologies`) captures uncaught web errors and unhandled promise rejections automatically (no manual `captureException`, tracing, or replay). Reviewed manually via the Sentry `daily-dama` project's Issues dashboard.
- **Transactional email:** Resend delivers Auth email (signup confirmation, password reset, email change) via Supabase's built-in SMTP integration; the app doesn't call Resend directly and doesn't retain email content beyond delivery.
- **Backup/recovery posture:** confirmed live on 2026-09-14 via `npx supabase backups list --project-ref lnudjcpotidplbjqcfcx` — PITR is disabled (`pitr_enabled: false`) and no physical backups are on file for either the production or development project. Today, a hard database failure on either project has no Supabase-managed backup to restore from; don't assume otherwise without re-checking that command, since plan/entitlement changes could change this silently.

None of the above requires an app-owned server runtime — the Expo Router build itself is still static assets, so static hosting remains sufficient for serving the app. But the app talks to real backend and third-party services at runtime; "no backend, database, or API" is no longer an accurate description of production.

Full project context (state boundaries, product shape, collaboration style) lives in [AGENTS.md](AGENTS.md) at the repo root — read that first if anything here is ambiguous.

## 2. Build output

`app.json` has `"web": { "output": "static" }`, so Expo Router pre-renders each route to its own HTML file rather than shipping a single SPA shell. Build with:

```bash
yarn expo export --platform web --output-dir dist
```

I ran this during prep (to a scratch dir, not committed) and confirmed the output shape:

```
dist/
  index.html             <- redirects to /app/home (T112.1); will become the landing page (T112.2)
  app/
    home.html
    tricks/
      index.html
    sesh/
      index.html
    profile/
      index.html
    stats/
      index.html
      [trickId].html      <- literally named with brackets
  _sitemap.html
  +not-found.html
  favicon.ico
  _expo/static/...      <- JS/CSS bundles
  assets/...
```

**Important gotcha:** `stats/[trickId].html` is a single generic file, not one per trick — there's no `generateStaticParams` wired up for that dynamic route. Client-side navigation to a trick's detail page works fine (the SPA router handles it after JS loads), but a **direct hit or hard refresh on a URL like `dailydama.com/app/stats/moshikame-x10`** will 404 unless the host is configured to rewrite that pattern to `app/stats/[trickId].html`. `_expo/.routes.json` in the export confirms no redirects are auto-generated — this has to be configured manually on whichever host is chosen. Example rules:

- **Netlify** (`_redirects` file in the publish dir): `/app/stats/*  /app/stats/[trickId].html  200`
- **Vercel** (`vercel.json`): a `rewrites` entry mapping `/app/stats/:trickId` → `/app/stats/[trickId].html`
- **Cloudflare Pages**: same idea via a `_redirects` file

`vercel.json` now exists in the repo with this rewrite (`/app/stats/:trickId` → `/app/stats/[trickId]`) plus equivalent rewrites for every other dynamic route added since (`/app/tricks/:trickId/notes`, `/app/tricks/:trickId/goals`, `/app/tricks/custom/:trickId/edit`, `/app/tricks/custom/:trickId/delete`), the build command, and the output directory. Still worth verifying post-deploy (see checklist below) rather than trusting the config alone.

## 3. (Removed) The access gate

The password-gate feature this section used to describe (`src/features/access-gate/`, gated on `EXPO_PUBLIC_ACCESS_PASSWORD`) was removed entirely in T111. The app is now reachable without a password prompt on every route, in every environment. `EXPO_PUBLIC_ACCESS_PASSWORD` is no longer read anywhere in the codebase — it's an unused, safe-to-delete env var on Vercel.

## 4. What's genuinely undecided (needs your input, not mine)

- **Hosting provider — decided.** Vercel, connected via its GitHub App, with `vercel.json` in the repo. See *Current deploy model* above.
- **DNS for dailydama.com — confirmed live.** `https://dailydama.com` redirects (`308`) to the canonical `https://www.dailydama.com`, which returns `200` with valid HTTPS (verified 2026-09-08 in T231, and again live on 2026-09-14). Nothing left to check here; kept as a heading only because §5/§7 below used to point back to it.

## 5. Suggested next steps

1. ~~Pick a host~~ — done, Vercel.
2. ~~Connect the GitHub repo, set build command and output directory~~ — done, see `vercel.json`.
3. ~~Confirm `EXPO_PUBLIC_ACCESS_PASSWORD` is set on Vercel~~ — moot, the access gate was removed in T111 (see §3). Worth removing the now-unused env var from Vercel's dashboard.
4. ~~Add the `/app/stats/*` rewrite rule~~ — done, in `vercel.json`, along with the other dynamic-route rewrites added since (§2).
5. ~~Confirm `dailydama.com` DNS actually points at Vercel and HTTPS is provisioned~~ — done, see §4.
6. ~~Run the verification checklist below against the live domain~~ — done in T231/T232's live acceptance passes; the checklist below still applies to any future redeploy.

## 6. Post-deploy verification checklist

Beyond the project's standard local verification sequence (in AGENTS.md — `yarn test --runInBand`, `yarn lint`, `yarn tsc --noEmit`, all passing as of the last commit), check on the **live domain**, not just via client-side nav:

- [ ] Hard-refresh (not client nav) on each route: `/`, `/app/home`, `/app/tricks`, `/app/sesh`, `/app/stats`, `/app/profile`, and a real `/app/stats/<trickId>` URL — the last one is the one most likely to break (see §2).
- [ ] No password prompt appears on first visit (incognito/private window) — the access gate was removed in T111.
- [ ] The 320px-viewport nav bar still fits (AGENTS.md notes this was measured and should be rechecked if anything upstream of it changes — deploy config shouldn't affect it, but worth a glance).
- [ ] `localStorage` persistence survives a reload (add a custom trick or complete a sesh, refresh, confirm it's still there) — confirms AsyncStorage's web backend is working under the production build, not just dev.
- [ ] HTTPS is valid on `dailydama.com` (no cert warnings).

## 7. What I did *not* do

- The hosting account, `vercel.json`, the `production` branch, and the Vercel Production Branch setting were all set up directly by the project owner, not by an agent — none of it came from work in this repo.
- The access gate itself was later removed entirely (T111, see §3) rather than having its password changed.
- Did not add `generateStaticParams` for `/app/stats/[trickId]` — the rewrite rule in `vercel.json` covers the direct-hit 404 case (§2), but per-trick static generation for that route still isn't implemented.
- Have not independently re-verified every build-time env var in Vercel beyond what T231 confirmed live (Supabase URL/key, Sentry DSN embedded correctly) — re-check the Vercel dashboard if a variable is ever suspected of drifting.
