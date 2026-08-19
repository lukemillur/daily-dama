# Daily Dama — Deployment Handoff (dailydama.com)

Written 2026-08-06, updated 2026-08-10 once deployment actually happened. **This is no longer prep** — Vercel is connected and a live Production deployment exists. The rest of this document is still accurate about build/gate mechanics, but §4, §5, and §7 have been corrected to match what's actually live rather than what was originally planned.

## Current deploy model — read this first

As of 2026-08-10, Vercel's GitHub integration is connected (deployments show `vercel[bot]` as creator) and `vercel.json` exists in the repo with the build command, output directory, and the `/stats/:trickId` rewrite (see §2). **Production deploys are no longer triggered by pushing to `main`.** `production` is a separate branch, set as Vercel's Production Branch; only a merge into `production` triggers a deploy to the live domain.

`main` accumulates ordinary work — including task branches merging in per the multi-agent protocol in [TASKS.md](TASKS.md) — and only reaches production when a PR from `main` into `production` is opened and merged deliberately. This is intentional: it means agents merging task PRs into `main` never accidentally ship straight to the public domain.

This was configured directly in the Vercel dashboard, not from anything in this repo, so if deploy behavior ever seems off, check Vercel's Project Settings → Git → Production Branch before assuming the config here is wrong.

## 1. What this project is

Daily Dama is a local-first Expo Router app (Kendama trick practice tracker). Repo: `github.com/lukemillur/daily-dama`, local clone at `/Users/luke/Personal Projects/kendama-project`, branch `main`, working tree clean and in sync with `origin/main` as of commit `b0cf894`.

All state is client-side (AsyncStorage → `localStorage` on web, keys prefixed `daily-dama:`). There is no backend, database, or API. That makes static hosting sufficient — no server runtime is required for the app itself.

Full project context (state boundaries, product shape, collaboration style) lives in [AGENTS.md](AGENTS.md) at the repo root — read that first if anything here is ambiguous.

## 2. Build output

`app.json` has `"web": { "output": "static" }`, so Expo Router pre-renders each route to its own HTML file rather than shipping a single SPA shell. Build with:

```bash
yarn expo export --platform web --output-dir dist
```

I ran this during prep (to a scratch dir, not committed) and confirmed the output shape:

```
dist/
  index.html
  tricks.html
  sesh.html
  profile.html
  stats/
    index.html
    [trickId].html      <- literally named with brackets
  _sitemap.html
  +not-found.html
  favicon.ico
  _expo/static/...      <- JS/CSS bundles
  assets/...
```

**Important gotcha:** `stats/[trickId].html` is a single generic file, not one per trick — there's no `generateStaticParams` wired up for that dynamic route. Client-side navigation to a trick's detail page works fine (the SPA router handles it after JS loads), but a **direct hit or hard refresh on a URL like `dailydama.com/stats/moshikame-x10`** will 404 unless the host is configured to rewrite that pattern to `stats/[trickId].html`. `_expo/.routes.json` in the export confirms no redirects are auto-generated — this has to be configured manually on whichever host is chosen. Example rules:

- **Netlify** (`_redirects` file in the publish dir): `/stats/*  /stats/[trickId].html  200`
- **Vercel** (`vercel.json`): a `rewrites` entry mapping `/stats/:trickId` → `/stats/[trickId].html`
- **Cloudflare Pages**: same idea via a `_redirects` file

`vercel.json` now exists in the repo with exactly this rewrite (`/stats/:trickId` → `/stats/[trickId].html`), plus the build command and output directory. Still worth verifying post-deploy (see checklist below) rather than trusting the config alone.

## 3. (Removed) The access gate

The password-gate feature this section used to describe (`src/features/access-gate/`, gated on `EXPO_PUBLIC_ACCESS_PASSWORD`) was removed entirely in T111. The app is now reachable without a password prompt on every route, in every environment. `EXPO_PUBLIC_ACCESS_PASSWORD` is no longer read anywhere in the codebase — it's an unused, safe-to-delete env var on Vercel.

## 4. What's genuinely undecided (needs your input, not mine)

- **Hosting provider — decided.** Vercel, connected via its GitHub App, with `vercel.json` in the repo. See *Current deploy model* above.
- **DNS for dailydama.com.** Still not independently verified from this side — I haven't confirmed the custom domain is actually pointed at Vercel and resolving, as opposed to a deployment simply existing at Vercel's own `*.vercel.app` URL. Check before assuming `dailydama.com` itself is live.

## 5. Suggested next steps

1. ~~Pick a host~~ — done, Vercel.
2. ~~Connect the GitHub repo, set build command and output directory~~ — done, see `vercel.json`.
3. ~~Confirm `EXPO_PUBLIC_ACCESS_PASSWORD` is set on Vercel~~ — moot, the access gate was removed in T111 (see §3). Worth removing the now-unused env var from Vercel's dashboard.
4. ~~Add the `/stats/*` rewrite rule~~ — done, in `vercel.json`.
5. Confirm `dailydama.com` DNS actually points at Vercel and HTTPS is provisioned — not independently verified, see §4.
6. Run the verification checklist below against the live domain — not yet done from this side.

## 6. Post-deploy verification checklist

Beyond the project's standard local verification sequence (in AGENTS.md — `yarn test --runInBand`, `yarn lint`, `yarn tsc --noEmit`, all passing as of the last commit), check on the **live domain**, not just via client-side nav:

- [ ] Hard-refresh (not client nav) on each route: `/`, `/tricks`, `/sesh`, `/stats`, `/profile`, and a real `/stats/<trickId>` URL — the last one is the one most likely to break (see §2).
- [ ] No password prompt appears on first visit (incognito/private window) — the access gate was removed in T111.
- [ ] The 320px-viewport nav bar still fits (AGENTS.md notes this was measured and should be rechecked if anything upstream of it changes — deploy config shouldn't affect it, but worth a glance).
- [ ] `localStorage` persistence survives a reload (add a custom trick or complete a sesh, refresh, confirm it's still there) — confirms AsyncStorage's web backend is working under the production build, not just dev.
- [ ] HTTPS is valid on `dailydama.com` (no cert warnings).

## 7. What I did *not* do

- The hosting account, `vercel.json`, the `production` branch, and the Vercel Production Branch setting were all set up directly by the project owner, not by an agent — none of it came from work in this repo.
- The access gate itself was later removed entirely (T111, see §3) rather than having its password changed.
- Did not add `generateStaticParams` for `/stats/[trickId]` — the rewrite rule in `vercel.json` covers the direct-hit 404 case (§2), but per-trick static generation for that route still isn't implemented.
- Have not independently verified DNS or the build-time env var are actually correct in Vercel (see §4) — flagging rather than assuming.
