# Web security headers (T162.1 / T162.2)

This is the handoff for the static web export report-only Content Security Policy
(CSP) shipped in T162.1. Enforcement (flipping the header name to enforcing mode) is
T162.2 and depends on this report-only phase turning up nothing that requires a policy
change first.

## Where the policy lives

`vercel.json`'s `headers` block sets `Content-Security-Policy-Report-Only` on every
route (`"source": "/(.*)"`). Report-only means violations are visible in the browser
console and to `securitypolicyviolation` listeners, but nothing is actually blocked yet.

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
  exactly like Vercel would (clean URLs, the one `vercel.json` rewrite, the CSP header),
  and asserts the header is present and identical across sampled routes, matches an
  independently written expected allow-list, contains no bare wildcard, and that the
  `script-src` hash matches a fresh recomputation from the export.
- `yarn test:e2e:security` -- Playwright suite (`e2e/security/`) against the same
  build-and-serve setup. Registers a `securitypolicyviolation` listener before
  navigating each Auth and core app route (plus the two sandbox routes) and asserts no
  violations fire; a second spec is a positive control proving the listener and header
  are genuinely active by fetching a definitely-unlisted origin and asserting a
  `connect-src` violation is recorded.
- Manual local-Supabase testing: `node security/scripts/serve-web-export.mjs
  --dir=dist --extra-connect-src="http://127.0.0.1:54321"` appends a loopback origin to
  the served response's `connect-src` only, without ever baking a dev-only loopback
  origin into the committed production policy in `vercel.json`. Not wired into any
  automated test -- the automated suites use a placeholder Supabase URL instead, which
  is enough to exercise the real `supabase-client.ts` code path and the wildcard match.

Neither `security:check-headers` nor `test:e2e:security` runs inside
`.claude/scripts/verify.mjs`'s default loop -- like `test:db`/`test:e2e:auth`, they need
to build+serve a fresh export and are not part of the fast default sequence.

## Status

This ships **report-only**. Enforcement is T162.2, and flipping
`Content-Security-Policy-Report-Only` to `Content-Security-Policy` in `vercel.json` is
the only mechanical change that ticket needs to make, assuming the report-only phase
does not turn up anything that requires a policy change first.
