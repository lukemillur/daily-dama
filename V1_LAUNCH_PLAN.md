# Daily Dama — V1 Launch Plan

Written 2026-08-26, following a conversation that compared Daily Dama against Kendamapedia (a mature kendama trick-reference/exam app) and used that comparison to sharpen what Daily Dama actually is: a daily-practice habit loop, not a trick encyclopedia, credentialing tool, or social platform. This document reconciles the existing backlog against the product-differentiation decisions that conversation produced, corrects one mischaracterization made during it, and sequences the remaining work toward a launch-ready v1.

No code or tracker files were changed by this document. It's a direction-setting plan, not an implementation.

## Product-differentiation decisions (context)

**Ruled out, permanently — none of these should be (re-)proposed without revisiting this decision explicitly:**

- Trick descriptions, video, or visualization shown to the practicing user. Tricks are identified by name only — the product assumes the user already knows the trick, the same way a running app doesn't teach you how to run.
- Integrating `src/features/trick-viz/` into the real Tricks/Sesh UI. The code can remain an unscoped side project if the geometry work is enjoyable on its own terms, but it is not "how tricks get described."
- Any prerequisite/dependency graph between tricks, or spatial/map-based trick browsing. Tricks are a flat, personally-curated list — there's nothing to explore, the user already knows what they know.
- Trick composition/notation authoring beyond the existing custom-trick and non-nested-sequence flow.
- Social features — friends, comments, leaderboards. Daily Dama is a solitary habit tool; this is a positive identity choice, not a gap.
- Formal Kyu/Dan exam simulation or tournament-data integration. Daily Dama isn't a credentialing authority tied to the JKA system.
- Video hosting/embedding anywhere in the app.

**Keep as-is, resist expanding:** Sesh as the core loop; Stats derived from immutable practice history; the flat Tricks list; custom tricks and non-nested sequences; Kentei data used for sorting.

**Lean into — the actual differentiator (rhythm and consistency, not content depth):** Sesh-loop polish (the one thing Kendamapedia structurally lacks entirely — no session concept at all); day-to-day consistency signals in Stats (streaks, recency) rather than lifetime totals; practice reminders; faster/frictionless trick selection (search/filter by grip or category) rather than richer trick information.

**Left open, not resolved by this plan:**

- (a) Whether the assessed Kentei rank stays as-is, becomes a lighter checklist, or shifts toward being derived from practice history over time.
- (b) Whether trick selection ever needs a minimal identification aid short of description or visualization.

## Reconciliation against the current backlog

Checked TASKS.md, TASKS_BACKLOG.md, and BACKLOG_STORIES.md against the ruled-out list above. **Nothing needs pruning.** `trick-viz` was already correctly excluded from TASKS.md by its own scope note, and its only production footprint is [T123](TASKS_DONE.md) — a decorative, non-interactive landing-page hero animation, not in-app trick instruction. No social graph, map UI, or exam-ladder feature exists anywhere in the codebase or backlog. The backlog was already clean relative to these decisions.

## Correction: the Kentei assessment is more substantial than described mid-conversation

During the conversation, the assessed Kentei rank was characterized as effectively a boring self-report field, in contrast to Kendamapedia's exam simulator. Reading [PRODUCT_CAPABILITIES.md](PRODUCT_CAPABILITIES.md) and the completed-task history shows that's inaccurate. Daily Dama already has a substantial, practice-based assessment system, iterated across roughly a dozen tasks ([T013](TASKS_DONE.md), [T029](TASKS_DONE.md).1–.5, [T055](TASKS_DONE.md)–[T062](TASKS_DONE.md), [T070](TASKS_DONE.md).1–.2, [T080](TASKS_DONE.md)):

- Onboarding assessment is landing-based, not a number picker — the user self-describes a rough starting level, then answers whether they can land each presented trick, and the rank is derived from those answers.
- A separate, ongoing Kentei-assessment tool lives in Profile: full bottom-to-top runs, start-from-a-rank runs, current-rank-only runs, rank-skip previews, progression-gap warnings, and automatic rank promotion on qualifying results.

This is already closer in kind to Kendamapedia's Kyu/Dan exam than given credit for — missing only the visual flourish (spatial map, gated attempt-counter tension), not the underlying mechanic. Open question (a) above should be read as "does this already-built, already-iterated system need better presentation," not "does a boring form need gamifying."

## What "launch-ready v1" already concretely means

This doesn't need a new definition — the backend roadmap already has a hard, mechanical one: **[T162](TASKS.md), the first-external-user launch gate.** External signup is currently disabled until its 8 children pass. Three are done (T162.1–T162.3: report-only CSP, enforced CSP, CI dependency/secret/bundle scanning). Five remain:

- **T162.4** — Supabase Security Advisor + RLS/grants/function review + CAPTCHA + rate-limit verification
- **T162.5** — reproduce the tested backend in the actual production Supabase project
- **T162.6** — synthetic multi-year capacity/pagination test
- **T162.7** — free-tier backup/recovery decision, tested
- **T162.8** — assemble the evidence, record launch approval

## Sequenced plan

### Stage 1 — Clear the three stuck product decisions in BACKLOG_STORIES.md

- **S051** (email-format validation) — already implemented per scoping trace; needs the user's confirmation to close, or a concrete counter-example if it was seen to fail.
- **S006** (footer theme following rainbow presets) — traced as already-working in code; same, needs confirmation in the live app or a specific repro.
- **S057** (email-uniqueness messaging at signup) — needs an actual product decision. Its acceptance criteria directly contradicts an existing deliberate anti-enumeration design (`sign-up-screen.tsx` intentionally routes a duplicate-account signup through the identical success path as a real signup). Keep the current anti-enumeration behavior and reject the story, or accept the enumeration tradeoff and scope the change — the user's call either way.

None of these block anything downstream, but they're the only genuinely open loose threads currently sitting in the backlog, and they're cheap to close.

### Stage 2 — Finish the account-lifecycle spine

The largest block of `Not started` work in TASKS.md, and a hard prerequisite for real users independent of the launch gate itself:

- [T158](TASKS.md) — guarded logout against unsynchronized account changes
- [T159](TASKS.md).1–.5 — guest-to-account data merge
- [T160](TASKS.md).1–.3 — sync conflict recovery
- [T161](TASKS.md).2–.5 — remaining account-deletion hardening (T161.1 is already done)

The app can't credibly be called ready for outside users while guest data can't merge into a real account or a stuck sync can silently eat someone's practice history.

### Stage 3 — Clear the Auth/Account QA tail, weighted by trust impact over polish

[T176](TASKS.md) (Account section not rendering until manual refresh) and [T179](TASKS.md) (require current-password confirmation before changing email) affect first impressions of account security — prioritize these ahead of the rest. [T172](TASKS.md), [T174](TASKS.md), [T177](TASKS.md), [T178](TASKS.md), [T180](TASKS.md), [T181](TASKS.md), [T171](TASKS.md), [T173](TASKS.md), [T175](TASKS.md), [T164](TASKS.md) are genuine polish and can trail behind Stage 2 rather than block it.

### Stage 4 — Run the Phase 6 launch gate (T162.4–T162.8)

Once Stage 2's account-lifecycle work is in place — several of its children explicitly depend on it (T162.4 depends on T155.8/T153.13/T161.3; T162.8 depends on all prior evidence).

### Parked correctly already — not gating

[T042](TASKS_BACKLOG.md) (native tab icons), [T043](TASKS_BACKLOG.md).2, [T044](TASKS_BACKLOG.md) (keyboard-aware mobile forms) are genuinely mobile-only and correctly deferred per AGENTS.md's active-platform scope. One flag: [T043.1](TASKS_BACKLOG.md) (foreground/background Sesh reconciliation) isn't actually mobile-specific in its own exit criteria — it concerns app-lifecycle timing generally, which browser-tab visibility also triggers. Worth checking that assumption before leaving it parked with the rest of T043/T044.

### Separate track, not a launch dependency — the "lean into" differentiation work

Sesh-loop polish, streak/recency-weighted Stats, practice reminders, faster trick selection: none of these exist as scoped stories yet. Route them through `product-manager` into BACKLOG_STORIES.md whenever that thread is picked up, but don't let them compete for sequencing against Stage 2–4 — the launch gate is a hard technical/security dependency chain; this is a product-quality investment that can happen before, after, or alongside it without consequence.

## Open questions, still unresolved

Neither blocks any stage above:

- **(a)** The Kentei assessment's future — reframed above as a presentation question, not a rebuild-from-scratch question.
- **(b)** Whether trick selection ever needs a minimal identification aid short of description or visualization.
