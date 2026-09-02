# Web security headers (T162.1 / T162.2) and CI scanning (T162.3)

This is the handoff for the static web export Content Security Policy (CSP), the
remaining defensive headers, and CI dependency/secret/bundle scanning. T162.1 shipped
the CSP in report-only mode; T162.2 flipped it to enforcing mode and added
Strict-Transport-Security, X-Content-Type-Options, Referrer-Policy, and a fully
restrictive Permissions-Policy. T162.3 added `.github/workflows/ci.yml` jobs that
scan dependencies, secrets, and the built web bundle. Their current risk-based
cadence is documented below.

## Where the policy lives

`vercel.json`'s `headers` block sets `Content-Security-Policy` (enforced, as of
T162.2), `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`, and
`Permissions-Policy` on every route (`"source": "/(.*)"`). Enforcing mode means the
browser actually blocks disallowed script execution, connections, and framing --
violations still surface in the console and to `securitypolicyviolation` listeners.

Note: `frame-ancestors 'none'` is a CSP directive (already enforced since T162.1), not
a standalone HTTP header. No separate `frame-ancestors` header or legacy
`X-Frame-Options` header exists or is needed -- that would be redundant. If you go
looking for one, stop; it was deliberately never added.

## Policy rationale

- `script-src 'self' 'sha256-...'` -- Expo Router's static export bakes one small
  inline `<script type="module">` (the hydration bootstrap) into every page. That exact
  string is hash-pinned rather than allowed via `'unsafe-inline'`, because inline-script
  injection is the dangerous case (arbitrary JS execution). `security/scripts/check-csp-headers.mjs`
  recomputes this hash from a fresh export on every run and fails loudly if it drifts
  (for example after an Expo Router upgrade changes the bootstrap snippet) -- if that
  happens, recompute the hash and update `vercel.json`; do not "fix" it by loosening to
  `'unsafe-inline'`.
- `style-src 'self' 'unsafe-inline'` -- the export also bakes the app's entire compiled
  atomic CSS ruleset inline on every page, and it legitimately changes on almost every
  styling commit. Hash-pinning it would mean regenerating and re-committing `vercel.json`
  on nearly every styling PR, which is not practical for this prototype. This is a
  deliberate, asymmetric tradeoff: inline style injection alone is much lower severity in
  modern browsers than inline script injection.
- `connect-src 'self' https://*.supabase.co` -- the exact hosted Supabase project ref is
  an environment variable set per-deploy in Vercel's dashboard, not checked into this
  repo, so the policy allows the wildcard subdomain rather than hardcoding a ref into a
  static, committed config file. If the team later wants the literal ref hardcoded, that
  is a small, mechanical tightening -- not a redesign.
- `frame-src 'none'` and `frame-ancestors 'none'` -- there are no iframes anywhere in
  the app, and nothing should be able to frame it either.
- `img-src 'self' data:` -- react-native-web renders a couple of small assets (spinner,
  reset) as inline `data:` URIs; nothing else needs an image origin.
- Vercel Analytics needs no extra origin: in a production export it loads its script and
  posts beacons through same-origin `/_vercel/insights/*` paths proxied by Vercel's edge,
  not an external origin.
- No `report-to`/`report-uri` -- there is no backend to receive reports, and none is
  needed for this ticket. Violations are visible in DevTools and to script listeners
  without a collector.

## Defensive headers added in T162.2

- `Strict-Transport-Security: max-age=63072000; includeSubDomains` -- forces HTTPS for
  two years, covering subdomains. Deliberately omits `preload`: submitting to a
  browser-shipped HSTS preload list is a separate, much harder-to-reverse commitment
  than setting the header itself, and is left for the product owner to opt into
  deliberately later, not bundled into this ticket.
- `X-Content-Type-Options: nosniff` -- stops browsers from MIME-sniffing served
  content into an unintended, potentially executable type.
- `Referrer-Policy: strict-origin-when-cross-origin` -- sends the full URL as referrer
  for same-origin requests, but only the origin (no path/query) cross-origin, and
  nothing at all on a downgrade to HTTP.
- `Permissions-Policy` -- a full deny-list (every standard gated browser feature, each
  written as `feature=()`). Grepped `src/`, including `src/features/trick-viz`, for
  camera, microphone, geolocation, fullscreen, clipboard, share, and sensor API usage:
  none found anywhere in the app, so a fully restrictive policy is safe.
- `frame-ancestors 'none'` needs no new standalone header: it was already enforced via
  the CSP directive of the same name as of T162.1, and `Permissions-Policy` and
  `X-Frame-Options` are two different mechanisms -- don't conflate them.

## Raw-HTML sink audit

There is exactly one `dangerouslySetInnerHTML` in the whole `src/` tree
(`src/app/+html.tsx`), and its value is a fixed, hardcoded CSS string -- never
note/custom-trick/user content. `security/dangerous-html-audit.test.ts` is a permanent
regression guard for this invariant; it fails loudly if any new raw-HTML sink appears,
or if the one known sink starts interpolating a non-literal value. It runs as part of
the standard `yarn test`/`verify.mjs` loop.

Note bodies and custom-trick/sequence-step names render through React Native `Text`-based
components, which render as plain escaped text nodes on web -- never parsed as HTML.
`all-notes-screen.test.tsx`, `trick-directory.test.tsx`, and `sesh.test.tsx` each carry a
regression test proving hostile markup in a note body, a custom-trick name, and a
sequence-step name round-trips as literal text.

## Running the checks

- `yarn security:check-headers` -- builds a fresh production-like export, serves it
  exactly like Vercel would (clean URLs, the one `vercel.json` rewrite, all five
  headers), and asserts the CSP header is present and identical across sampled routes,
  matches an independently written expected allow-list, contains no bare wildcard, that
  the `script-src` hash matches a fresh recomputation from the export, and that
  Strict-Transport-Security, X-Content-Type-Options, Referrer-Policy, and
  Permissions-Policy are each present with their exact expected values.
- `yarn test:e2e:security` -- Playwright suite (`e2e/security/`) against the same
  build-and-serve setup:
  - Spec 01 registers a `securitypolicyviolation` listener before navigating each Auth
    and core app route (plus the two sandbox routes) and asserts no violations fire.
    Under enforcement, a violation here also means broken functionality on that route,
    not just a console warning.
  - Spec 02 is a positive control proving the listener and header are genuinely active
    by fetching a definitely-unlisted origin, asserting a `connect-src` violation is
    recorded, and asserting its `disposition` is `"enforce"` (not `"report"`).
  - Spec 03 (added in T162.2) proves the enforced CSP actually blocks, not merely logs:
    an unlisted inline script never executes and is recorded with `disposition:
    "enforce"`, and an attempt to frame `/app/home` in an iframe is blocked by
    `frame-ancestors`.
- Manual local-Supabase testing: `node security/scripts/serve-web-export.mjs
  --dir=dist --extra-connect-src="http://127.0.0.1:54321"` appends a loopback origin to
  the served response's `connect-src` only, without ever baking a dev-only loopback
  origin into the committed production policy in `vercel.json`. Not wired into any
  automated test -- the automated suites use a placeholder Supabase URL instead, which
  is enough to exercise the real `supabase-client.ts` code path and the wildcard match.

Neither `security:check-headers` nor `test:e2e:security` runs inside
`.claude/scripts/verify.mjs`'s default loop -- like `test:db`/`test:e2e:auth`, they need
to build+serve a fresh export and are not part of the fast default sequence.

## "Production preview" substitution

No Vercel CLI/project link exists in this development environment. The automated
checks above (`yarn security:check-headers`, `yarn test:e2e:security`) run against
`security/scripts/build-and-serve.mjs`'s local server, which serves the real `dist`
export through the real `vercel.json` headers and rewrites -- this is the stand-in for
a live Vercel "production preview" in this repo's automated evidence, following
T162.1's own precedent. A real live-preview header spot-check (curl or DevTools once a
Vercel preview deploy exists) is a manual, owner-side step, the same pattern as the
existing manual checklist in `DEPLOYMENT_HANDOFF.md` section 6. Strict-Transport-Security
in particular is only honored by browsers over a real HTTPS connection, so its runtime
effect (an actual protocol upgrade) can only be verified against a real HTTPS deploy,
never this local HTTP harness -- the automated checks here can only confirm the header
is present with the correct value.

## CI dependency, secret, and built-bundle scanning (T162.3)

The real-history `secret-scan` runs on every pull request and push to `main`.
The other three jobs are selected by risk: relevant pull-request paths, every
push to `main`, every published release, a weekly Monday schedule, and manual
workflow dispatch. A small dependency-free selector
(`security/scripts/select-ci-scans.mjs`) keeps unrelated PRs cheap while still
letting each skipped job report a completed/skipped check to branch protection.
This differs from `security:check-headers`/`test:e2e:security` above, which remain
manual-only build-and-serve checks outside `.claude/scripts/verify.mjs`.

The pull-request path matrix is intentionally explicit:

- Dependency manifests/lockfiles, the accepted-advisory file, or the dependency
  audit script run `dependency-audit`.
- Application source/assets/public files, Expo/bundler configuration,
  dependencies, or bundle-scanner wiring run `bundle-secret-scan`.
- Gitleaks configuration or the shared scanner/export/self-test wiring runs
  `secret-scan-self-test`.
- Changes to `ci.yml` or the selector itself conservatively run all three.

Scheduled, release, `main`-push, and manual runs ignore paths and run all three,
so newly published advisories and external scanner drift are still detected even
when the repository has not changed.

- `dependency-audit` -- runs `yarn security:check-dependency-audit`
  (`security/scripts/check-dependency-audit.mjs`). `yarn audit --level <severity>` does
  **not** gate Yarn Classic's exit code: the flag only filters the printed report, while
  the actual exit code is a bitmask of every severity present regardless of `--level`
  (confirmed locally while planning this task). This script instead runs
  `yarn audit --json`, parses the NDJSON output itself, and fails if any `high`/`critical`
  advisory isn't listed in `security/accepted-dependency-advisories.json`. That file is a
  small, dated, reasoned allowlist -- currently the four Metro/bundler-devDependency
  advisories (`image-size` x2, `nanoid`, `uuid`) that have no upstream patch as of
  2026-08-24 and are build-time-only (never shipped in the web bundle). Revisit it on the
  next Expo/Metro upgrade; prefer bumping the dependency and removing the entry over
  leaving it stale.
- `secret-scan` -- `gitleaks/gitleaks-action@v3` scans the full checked-out git history
  (`fetch-depth: 0`) using this repo's `.gitleaks.toml`, which extends gitleaks' default
  ruleset (already covers this app's real secret shapes -- Supabase anon/service_role
  keys and Auth session/refresh JWTs are all JWT- or high-entropy-token-shaped, matching
  the default `jwt`/`generic-api-key` rules) plus a small allowlist of four confirmed
  false positives found while planning this task (the jwt.io example JWT and a synthetic
  refresh-token fixture in `src/features/auth/model/auth-test-fixtures.ts`, a
  deliberately-wrong-password test fixture in `e2e/auth/01-sign-in-equivalence.spec.ts`,
  and the `LOCAL_ANON_KEY` documented placeholder in `supabase/README.md`). Each
  allowlist entry matches on the exact leaked *value* via a regex, not a whole file path,
  so a real secret later pasted into one of those files would still be caught.
  `GITLEAKS_ENABLE_COMMENTS` is set to `"false"` so the job never needs
  `pull-requests: write` -- see the permissions note below.
- `bundle-secret-scan` -- runs `yarn security:check-bundle-secrets`
  (`security/scripts/check-bundle-secrets.mjs`): builds a fresh production-like export
  via the same `buildExport()` used by `check-csp-headers.mjs`, then scans `dist/` with
  the plain `gitleaks` CLI (via its official Docker image, pinned by digest -- required
  because `gitleaks-action` only scans a checked-out repo's git history, not an
  arbitrary directory). Catches secrets accidentally baked into the client bundle
  (only `EXPO_PUBLIC_*` values are ever safe there).
- `secret-scan-self-test` -- runs `yarn security:verify-secret-detection`
  (`security/scripts/verify-secret-detection.mjs`, `node:test`-based). A permanent
  regression guard proving the scanning wiring itself still works, in the same spirit as
  `security/dangerous-html-audit.test.ts`. It builds a synthetic, clearly-fake
  Supabase-service-role-shaped JWT into a throwaway scratch git repo and a throwaway
  copy of a real `dist/` export **at test run time**, asserts gitleaks flags both, and
  asserts an unmodified control (an empty scratch repo; an unmodified export copy)
  scans clean. No secret-shaped fixture content is ever committed to this repo's real,
  permanent history or working tree -- that's the trap a naive "commit a fixture secret"
  test would fall into. Scratch dirs are created under a repo-local, gitignored
  `.security-scratch/` directory rather than the OS temp dir: Docker Desktop's default
  macOS file sharing does not cover `/tmp`/`/var/folders`, so mounting a system-tmpdir
  path into the gitleaks container silently scans 0 bytes there; a repo-local path works
  both locally and on native-Linux CI runners.

**Documented gap:** there is no default gitleaks rule specific to Resend/SMTP secrets.
Nothing in this repo's source or env handling currently touches those (SMTP config is
Supabase-dashboard-side per `supabase/RESEND_DNS_AUTH.md`), so a bespoke rule wasn't
worth adding for this task. Revisit if SMTP credentials are ever handled in-repo.

**Permissions:** `ci.yml` sets a workflow-level `permissions: contents: read`, made
explicit in the file itself (matching the repo's actual default) rather than left as an
invisible external setting. No job above needs write access to any permission scope.
`secret-scan` additionally sets a job-level `permissions: pull-requests: read` override
-- discovered from a real CI run: `gitleaks-action` calls the GitHub API to list a PR's
commits on `pull_request` events, which needs `pull-requests: read`, and failed with
"Resource not accessible by integration" under the contents-only workflow default. This
is still read-only, so it doesn't change the "no write permissions" guarantee; PR
commenting (the one gitleaks-action feature that would need `pull-requests: write`)
stays disabled via `GITLEAKS_ENABLE_COMMENTS: "false"`.

**Running these locally** (the two Docker-based ones require Docker running locally,
same as the local Supabase stack in `supabase/README.md`):

- `yarn security:check-dependency-audit` -- no Docker needed.
- `yarn security:check-bundle-secrets` -- requires Docker.
- `yarn security:verify-secret-detection` -- requires Docker.

## Status

This ships **enforced** as of T162.2. `Content-Security-Policy` is enforcing (no
longer `-Report-Only`), and `vercel.json` also sets Strict-Transport-Security,
X-Content-Type-Options, Referrer-Policy, and Permissions-Policy on every route.
CI dependency/secret/bundle scanning shipped in T162.3. Real commit scanning is
universal on PRs; the more expensive dependency, bundle, and scanner-self-test
jobs follow the risk-based PR, weekly, release, `main`-push, and manual cadence
documented above.
