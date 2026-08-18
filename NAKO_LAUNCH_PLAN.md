# NAKO Launch Plan

Written 2026-08-18. Target: dailydama.com is a worthwhile, correct, polished first
impression before a social media post goes out Friday morning promoting Daily Dama
to the North America Kendama Open (NAKO) community. Luke isn't attending in person —
distribution is a social post, not a QR code/flyer at a booth.

This document is a planning input, not a ticket format. Intended next step: run it
through the `product-manager` skill (Refine mode) to turn the core items into
`BACKLOG_STORIES.md` entries, then `scope-tickets` into `TASKS.md`.

## The finding that reorders this plan

`production` (the branch that actually serves dailydama.com) is frozen at the exact
commit from its first deploy on 2026-08-10. Every task since — T001 through today's
theming and QA-pass work, ~89 commits on `development` — has never been promoted.
`main` itself is 78 commits ahead of `production`.

Consequence: none of the work discussed in this thread matters for Friday unless the
promotion pipeline (`development` → `main` → `production`) actually runs, and running
it means deploying roughly two weeks of accumulated, never-in-production work at once.
That pipeline is higher-risk and less-rehearsed than anything else in this plan, so it
should happen *first*, not last — it needs the most runway to surface surprises.

## Already done (this thread)

- Vercel Analytics wired into the root layout, web-only (`Platform.OS === 'web'` gated).
- A feedback mailto link added to Profile.
- Landing hero copy drafted and approved (Direction B — founder voice, "It took me
  six weeks to land my first Lunar").
- Meta description drafted and approved (147 chars, doubles as OG/Twitter description).
- Landing page shape decided: enhance the existing onboarding intro screen
  (`OnboardingIntroStep`), not a new route — it's already the first thing a
  no-profile visitor sees.
- **Not yet committed**: the analytics + feedback changes are still uncommitted on
  `development` (`package.json`, `src/app/_layout.tsx`, `src/app/profile/index.tsx`,
  `yarn.lock`). First step of execution, not a planning item.

## Core work

### 1. Run the promotion pipeline early (do this Tue night / Wed morning)

- Commit the pending analytics/feedback changes.
- Promote `development` → `main`. Given the size of the gap, this isn't a rubber
  stamp — run the full verification sequence and a broad manual smoke test of the
  merged result before going further.
- Promote `main` → `production` (requires Luke's explicit go-ahead per the working
  agreement — this is not something to automate even under time pressure).
- Verify the *live* dailydama.com end to end post-deploy, not just the local build.
- **Why first:** if something in ~89 commits of never-deployed work breaks in
  production, Wednesday is when you want to find out, not Thursday night.

### 2. Landing hero copy + document head tags

- Add the approved copy to `OnboardingIntroStep` (`src/features/onboarding/components/onboarding-intro-step.tsx`) — eyebrow, headline, body, existing CTA. Small, single-component change.
- Add `<title>`, meta description, and Open Graph / Twitter Card tags to
  `src/app/+html.tsx` (currently has none of these). This is the actual content of
  the link-preview card the social post will render.

### 3. Share-card image (1200×630 OG image)

- No asset exists yet (`logo-glow.png`/`icon.png` are square, wrong shape for a link
  preview). This can be composed directly — an HTML card built from the existing
  design system (AppColors, typography) and screenshotted at the right dimensions —
  without needing an external designer. Worth treating as a real, scoped piece of
  work, not an afterthought; it's the first thing anyone sees before they click.

### 4. Mobile-web + cold-start verification

- Distribution is 100% social/mobile, so this is a mobile-*web* correctness pass
  (Safari/Chrome on a phone), not a native-app task — squarely in scope. The
  existing 320px nav-fit check only covers the tab bar; this needs the full
  cold-start path (root intro → assessment → Tricks/Sesh) checked at real phone
  widths.
- Luke is doing a subjective UX pass on the onboarding→Tricks flow separately.
  Proposing a complementary technical pass alongside it: drive the actual cold-start
  flow in the browser tool, watch for console errors, broken states, and layout
  breaks at mobile widths — objective bugs, not a duplicate of the subjective review.

### 5. Analytics follow-through

- Vercel Analytics needs to be switched on in the Vercel project dashboard — an
  account-level action only Luke can do; flagging so it isn't missed.
- Optional, low-cost addition: a custom event (`track('onboarding_completed')` via
  `@vercel/analytics`, already installed) so the numbers after Friday show engagement,
  not just pageviews.

## Explicitly out of scope for this push

Recapping decisions already made in this thread, so they don't get re-litigated:

- **Backend (auth/sync)** — deferred until after real NAKO usage data exists to
  inform it. Also would add signup friction for cold first-time tries, working
  against the actual goal.
- **SEO / search indexing** — wrong channel for this launch (discovery is via a
  social link, not search) and can't produce results in this window regardless. OG
  tags are handled above because they matter for the *social* share card, not search.
- **Schema migration infrastructure** — separate, already-scoped-for-later thread;
  not blocking this launch.
- **In-app share-out feature** (e.g. "share your stats") — a real idea, but net-new
  scope for this window. Flagging as next-iteration material, not doing now.
- **Any native/iOS/Android work** — out of the repo's active platform scope
  regardless of the deadline.

## Action items for Luke (outside agent scope)

Refined into `BACKLOG_STORIES.md` as S022–S026: hero copy, head/OG tags, the
share-card image, the mobile-web technical QA pass, and the analytics event. Those
are agent work end to end. Everything below is not — it's gated on an account
credential, an explicit production go-ahead, or Luke's own subjective judgment, so it
stays a manual checklist rather than a ticket.

- [ ] **Commit the pending `development` changes** — analytics + feedback additions
  currently uncommitted (`package.json`, `src/app/_layout.tsx`,
  `src/app/profile/index.tsx`, `yarn.lock`). First step before anything else below.
- [ ] **Promote `development` → `main`.** Run the full verification sequence and a
  broad manual smoke test of the merged result — not a rubber stamp, given ~89
  never-deployed commits.
- [ ] **Give the explicit go-ahead for `main` → `production`.** Per the working
  agreement this isn't something to automate even under time pressure.
- [ ] **Verify the live dailydama.com end to end**, post-deploy — the real production
  site, not just the local build.
- [ ] **Turn on Vercel Analytics in the Vercel project dashboard.** Account-level;
  only Luke can do this. Without it, the wiring already in `_layout.tsx` (and S026's
  event once it lands) collects nothing.
- [ ] **Do the subjective UX pass over onboarding → Tricks.** Separate from S025's
  objective/technical mobile-web pass — this is a judgment call on the experience,
  not a bug hunt.
- [ ] **Re-run the promotion pipeline once S022–S024 (hero copy, head tags,
  share-card image) land on `development`** — same two go/no-go steps as above,
  now lower-risk since the pipeline's already been exercised once.
- [ ] **Thursday evening: final smoke test against the live production URL**,
  ideally on an actual phone.
- [ ] **Preview the shared link in an actual social composer** to confirm the
  share-card renders as designed before it goes out.
- [ ] **Friday AM: post.**

## Suggested sequencing

- **Tue night / Wed AM:** Commit pending changes. Run the `development` → `main` →
  `production` pipeline. Verify live site.
- **Wed:** Hero copy + head tags on `development`, verified locally. Compose the
  share-card image.
- **Thu:** Promote the landing-page changes through the (now-exercised, lower-risk)
  pipeline. Luke's subjective onboarding→Tricks review + the complementary technical
  pass, in parallel. Fix whatever surfaces.
- **Thu evening:** Final smoke test against the *live* production URL, ideally on an
  actual phone. If possible, preview the link in an actual social composer to confirm
  the share card renders as designed.
- **Fri AM:** Post.

## Cut line, if time gets tight Thursday

Non-negotiable: the promotion pipeline working, hero copy live, head/OG tags correct,
share-card image in place. If something has to give: the custom analytics event and
the in-app share-out idea were already cut above; next to go would be the
complementary automated QA pass (falls back to Luke's manual review alone), not the
live production smoke test itself.
