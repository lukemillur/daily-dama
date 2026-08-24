# Web security headers (T162.1 / T162.2)

This is the handoff for the static web export Content Security Policy (CSP) and the
remaining defensive headers. T162.1 shipped the CSP in report-only mode; T162.2
flipped it to enforcing mode and added Strict-Transport-Security,
X-Content-Type-Options, Referrer-Policy, and a fully restrictive Permissions-Policy.

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

## Status

This ships **enforced** as of T162.2. `Content-Security-Policy` is enforcing (no
longer `-Report-Only`), and `vercel.json` also sets Strict-Transport-Security,
X-Content-Type-Options, Referrer-Policy, and Permissions-Policy on every route.
