# Daily Dama — Deployment Handoff (dailydama.com)

Written 2026-08-06 so a fresh context can pick up the web deploy without re-discovering the project. Nothing has been deployed yet — no hosting provider or DNS has been touched. This is prep, not a completed migration.

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

None of these config files exist in the repo yet — whichever host gets picked needs this added, and it should be verified post-deploy (see checklist below).

## 3. The access gate — read before deploying

`src/features/access-gate/` gates the whole app behind a password screen, controlled by `EXPO_PUBLIC_ACCESS_PASSWORD` in `.env` (gitignored, not committed — currently set locally). Two things matter for deployment:

1. **This is not real security.** `EXPO_PUBLIC_*` vars are inlined into the JS bundle at build time (`src/features/access-gate/model/access-gate.ts:2`), so the password is readable in plaintext by anyone who opens dev tools on the deployed site. It's a soft "keep casual visitors out" gate, not an auth system. Fine for a prototype behind an obscure domain; worth knowing before treating it as a real barrier.
2. **If the env var isn't set at build time on the hosting platform, the gate silently doesn't exist.** `AccessGateProvider` checks `getConfiguredAccessPassword()`; if it's `undefined`, `isUnlocked` defaults to `true` and the app is wide open (`src/features/access-gate/state/access-gate-provider.tsx:16-17`). Whatever host you pick needs `EXPO_PUBLIC_ACCESS_PASSWORD` set as a **build-time** environment variable (not just available at runtime — it has to be present when `expo export` runs), using the same value that's in the local `.env` file, or the gate will just be absent in production.

## 4. What's genuinely undecided (needs your input, not mine)

I did not pick a host or touch DNS — these are calls only you can make:

- **Hosting provider.** No `vercel.json`, `netlify.toml`, `eas.json`, or `.github/workflows` exist in the repo — nothing has been chosen. Static-export-friendly options that support the `/stats/[trickId]` rewrite: Vercel, Netlify, Cloudflare Pages. (EAS Hosting is also an option — `app.json` already has an `eas.projectId`, but that's from `expo-router`/EAS Update tooling being installed, not evidence a hosting decision was made.)
- **DNS for dailydama.com.** I don't know your registrar or current DNS setup. Once a host is chosen, you'll point an A/ALIAS or CNAME record at it per that host's instructions, and most of the above providers auto-provision HTTPS via Let's Encrypt once the custom domain is added and DNS propagates.
- **Whether the access-gate password should rotate for a public domain.** Currently `sillyGoose!2026` (unchanged from prototype setup). Worth deciding whether that's fine to ship as-is or should change now that it's reachable at a real domain — I didn't change it.

## 5. Suggested next steps

1. Pick a host (Vercel/Netlify/Cloudflare Pages are the closest fits given the static + rewrite-rule requirement).
2. Connect the GitHub repo, set the build command (`yarn expo export --platform web --output-dir dist` or equivalent per platform convention) and output/publish directory (`dist`).
3. Add `EXPO_PUBLIC_ACCESS_PASSWORD` as a build-time env var on the host, matching local `.env`.
4. Add the `/stats/*` → `/stats/[trickId].html` rewrite rule for that host.
5. Point `dailydama.com` DNS at the host and let it provision HTTPS.
6. Run the verification checklist below against the live domain.

## 6. Post-deploy verification checklist

Beyond the project's standard local verification sequence (in AGENTS.md — `yarn test --runInBand`, `yarn lint`, `yarn tsc --noEmit`, all passing as of the last commit), check on the **live domain**, not just via client-side nav:

- [ ] Hard-refresh (not client nav) on each route: `/`, `/tricks`, `/sesh`, `/stats`, `/profile`, and a real `/stats/<trickId>` URL — the last one is the one most likely to break (see §2).
- [ ] Access gate actually appears on first visit (incognito/private window) and the configured password unlocks it.
- [ ] The 320px-viewport nav bar still fits (AGENTS.md notes this was measured and should be rechecked if anything upstream of it changes — deploy config shouldn't affect it, but worth a glance).
- [ ] `localStorage` persistence survives a reload (add a custom trick or complete a sesh, refresh, confirm it's still there) — confirms AsyncStorage's web backend is working under the production build, not just dev.
- [ ] HTTPS is valid on `dailydama.com` (no cert warnings).

## 7. What I did *not* do

- Did not create any hosting account, config file, or DNS record.
- Did not push anything beyond what was already on `origin/main`.
- Did not change the access-gate password.
- Did not add `generateStaticParams` or a rewrite-rule config file for `/stats/[trickId]` — flagged above instead, since fixing it depends on which host you pick.
