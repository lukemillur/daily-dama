# Backlog Stories

Product outcomes, technical enablers, security controls, and launch gates awaiting technical scoping. An item is `Ready for scoping` once its product decision is settled; `scope-tickets` turns it into one or more entries in `TASKS.md` or the non-automated `TASKS_BACKLOG.md`. Harness-specific workflows live under `.claude/skills/` for Claude Code and `.agents/skills/` for Codex.

## Stories

_S001–S022 came from the user's 2026-08-21 QA pass on T122–T131 (landing page and trick goals), compiled via the `qa-handoff` artifact and refined by `product-manager`. S001–S005 and S007–S022 were scoped in this pass into T132–T152 (see `TASKS.md`) and removed from this file per the usual promotion cleanup. S006 was held back pending confirmation and later closed (see the S042–S062 note below)._

_S032–S041 were refined from [BACKEND_ROADMAP.md](BACKEND_ROADMAP.md) on 2026-08-21 using the Codex `product-manager` workflow. S032–S039 and S041 were scoped into umbrellas T153–T162 and removed from this file; T153 was later activated in [TASKS.md](TASKS.md), while T154–T162 remain in [TASKS_BACKLOG.md](TASKS_BACKLOG.md). S040 remains proposed because mobile hardening is explicitly deferred by [AGENTS.md](AGENTS.md)._

_S042–S062 came from the user's 2026-08-25 QA pass on the Full-Batch of PR #158–223 (three items were follow-up gaps on already-`Done` tickets T144/T146/T153.12; the rest were general feedback, mostly Auth/Account UI). 19 were scoped into T163–T181 (see `TASKS.md`) and removed from this file. S051 and S006 were confirmed working in the live app by the user on 2026-08-26 and removed per the usual promotion cleanup. S057 was rejected by the user on 2026-08-26 — see [V1_LAUNCH_PLAN.md](V1_LAUNCH_PLAN.md) Stage 1._

_S063–S074 came from the user's 2026-08-31 QA pass on PRs #224–256 — the batch that closed T163–T181. Every reviewed T163–T181 item came back with a follow-up gap (the implementation shipped but didn't fully satisfy the QA scenario), plus six items of general feedback not tied to a specific ticket. All twelve are refinements/corrections to already-`Done` work, not new features. All twelve were scoped into T182–T193 (see `TASKS.md`) and removed from this file: S063→T182, S064→T183, S065→T184, S066→T185, S067→T186 (T186.1–T186.2), S068→T187 (T187.1–T187.2), S069→T188, S070→T189, S071→T190, S072→T191, S073→T192, S074→T193._

_S075–S088 came from the user's 2026-09-01 QA pass on T182–T193 (the batch closed by the 2026-08-31 pass, S063–S074). Every reviewed T188/T189/T191/T192/T193 item came back with a follow-up gap, T186.1 came back with two distinct problems, T183 came back with a styling gap, and seven items are general feedback not tied to a specific ticket. All fourteen were scoped into T194–T206 (see `TASKS.md`) and removed from this file: S075→T194, S076→T195, S077→T196, S078→T197, S079→T198 (visible-UI/flash symptom) & T199 (onboarding-recurrence symptom), S080→T200, S081→T201, S082→T201 (combined with S081), S083→T202, S084→T203, S085→T204, S086→T205, S087→T206, S088→T198 (combined with S079's UI symptom)._

_S089 was refined on 2026-09-01 from the user's direct observation that a newly created account gets no success acknowledgment. It was scoped into T207 (see `TASKS.md`) and removed from this file._

_S090–S097 came from the user's 2026-09-02 QA pass on T195/T201/T205/T207 (the batch closed by the 2026-09-01 pass, S075–S089), plus three items of general feedback not tied to a specific ticket. S090's direction question was resolved the same day (reuse the celebration mechanism/visual identity, own copy). All eight were scoped into T208–T215 (see `TASKS.md`) and removed from this file: S090→T208, S091→T209, S092→T210, S093→T211, S094→T212, S095→T213, S096→T214, S097→T215._

_S098–S105 came from the user's 2026-09-03 QA pass on T210/T213/T217.2 (three follow-up gaps on already-`Done` tickets), plus five items of general feedback not tied to a specific ticket. S098–S104 were scoped into T219–T224 (see `TASKS.md`) and removed from this file: S098→T219, S099→T220, S100→T221, S101→T208 (folded into that already-queued ticket, which replaces the exact component S101 targeted, rather than a new ticket against soon-to-be-deleted code), S102→T222, S103→T223 (T223.1–T223.8), S104→T224. S105 remains `Proposed` pending a discovery pass (see below)._

_S106–S118 came from the user's 2026-09-04 QA pass on T224/T223.8 (two follow-up gaps on already-`Done` tickets), plus eleven items of general feedback not tied to a specific ticket. All thirteen were scoped into T236–T246 (see `TASKS.md`) and removed from this file: S106→T236, S107→T237, S108→T238, S109→T238 (combined with S108/S110 — one screenshot-refresh pass), S110→T238, S111→T239, S112→T240, S113→T241, S114→T242, S115→T243, S116→T244, S117→T245, S118→T246._

_S119–S122 came from the user's 2026-09-08 QA pass on T208/T241 (two follow-up gaps on already-`Done` tickets), plus three items of general feedback not tied to a specific ticket (two of which describe one consistent copy rule and were combined into S122). All four were scoped into T249–T252 (see `TASKS.md`) and removed from this file: S119→T249, S120→T250, S121→T251, S122→T252._

_S123–S128 came from the user's 2026-09-08 QA pass on the first live production deployment at dailydama.com. S126 is intentionally unused: the reported broken email-verification redirect (404) was not turned into a new story — it's already fully described by `T231` in `TASKS_COLLABORATIVE.md` ("Align and deploy the selected web release with hosted Auth settings"), which the user is actively working on in a separate session. S123, S124, S127, and S128 were scoped into `TASKS.md` and removed from this file: S123→T253, S124→T254, S127→T256, S128→T257. S125 was scoped into `TASKS_COLLABORATIVE.md` (not `TASKS.md`, since it's Supabase-dashboard configuration rather than application code) as T255 and removed from this file._

_S129–S130 were refined on 2026-09-10 from the user's pre-launch task list (new favicon from the finalized logo; an SEO pass). Both were scoped and removed from this file: S129→T263, S130→T264 (an umbrella split into T264.1/T264.2)._

_S131–S137 came from an autonomous exploratory QA pass on 2026-09-10 (run by an agent driving the local dev server as a user, not the user directly — see `outputs/qa-pass-2026-09-10.md`) while the user was away, covering Home/Sesh/Tricks/Stats/Profile plus persistence and the custom-trick/sequence invariants. Two are confirmed functional/accessibility bugs (S131, S132), one is a visual bug (S133), three are minor UX/documentation corrections (S134–S136), and one is a low-confidence, non-reproducible observation held back for confirmation (S137). All core AGENTS.md invariants under test (custom-trick sort order, sequence step name-snapshot authority, exclusion of sequences from `selectSequenceStepCandidates`, Stats derived from history, hydration-safe reload) were verified intact and did not generate stories. S131–S136 were scoped into `TASKS.md` and removed from this file: S131→T266, S132→T267, S133→T268, S134→T269, S135→T270, S136→T271. S137 remains `Proposed`._

_S138–S139 came from the user's 2026-09-11 QA pass on T267–T271 (the batch closed by the 2026-09-10 autonomous pass, S131–S136). Both are follow-up gaps on already-`Done` tickets: T267's fix left the goal card's own practice affordance unpressable in the area it visually occupies, and T268's fix introduced a scroll behavior the user finds worse than the overlap it fixed. T269–T271 were confirmed with no follow-up gap. Both were scoped into `TASKS.md` and removed from this file: S138→T272, S139→T273._

### [S137] Investigate occasional empty page title after a custom-trick save

- **As a:** any user
- **I want:** the page title to stay stable through custom-trick form submissions
- **So that:** the browser tab/history always shows a meaningful title
- **Evidence:** `outputs/qa-pass-2026-09-10.md` finding 7 (low, low-confidence). One observation of an empty `<title>` immediately after saving a new custom trick, before the Tricks list re-rendered; did not reproduce reliably and had no confirmed user-visible effect in a screenshot.
- **Priority:** Low
- **Status:** Proposed
- **Notes:** Deliberately left at `Proposed`, not `Ready for scoping` — reproduction was inconsistent and severity/user impact is unconfirmed. Worth a quick reproduction attempt before committing scoping effort; may be a transient render-order artifact rather than a real defect.

### [S105] Improve application performance and initial load time

- **As a:** any user
- **I want:** the app, especially the very first load, to feel fast
- **So that:** I'm not waiting on a sluggish experience before I can start practicing
- **Evidence:** User request; no specific measured regression evidence yet in this pass.
- **Priority:** Medium
- **Status:** Proposed
- **Acceptance criteria:** Initial page/app load is measurably faster than the current baseline, with all existing functionality preserved. Any dependency removed to achieve this has no user-visible functional loss. Sentry is explicitly out of scope for removal.
- **Notes:** Deliberately left at `Proposed`, not `Ready for scoping` — "do whatever you can" needs a baseline measurement and a bounded set of candidate changes (bundle analysis, dependency audit, code-splitting, lazy loading) before this is a scopeable ticket rather than an open-ended mandate. Recommend a quick discovery pass (bundle-size audit + Lighthouse/web-vitals baseline) before promoting.

### [S057] Enforce email uniqueness at signup with a clear message — REJECTED

- **Status:** Rejected (2026-08-26)
- **Reason:** Its acceptance criteria (a distinguishable "account already exists" message) directly contradicts a deliberate anti-enumeration design already in the code: `sign-up-screen.tsx`'s `handleSubmit` intentionally routes a duplicate-account signup through the identical success path as a real signup, specifically so the distinct branch can't be used as an email-enumeration oracle (see the inline comment at that call site). The user chose to keep the current anti-enumeration behavior over the enumeration tradeoff this story would introduce.

### [S040] Harden account behavior on iOS and Android

- **Type:** User outcome
- **Beneficiary:** Mobile practitioners
- **Outcome:** The same account, callback, secure credential storage, offline sync, conflicts, logout, and deletion behavior works across web, iOS, and Android.
- **Evidence:** `BACKEND_ROADMAP.md` Phase 5.
- **Priority:** Medium
- **Status:** Proposed
- **Acceptance criteria:** Independent platform verification covers native PKCE callbacks, SecureStore-backed Auth storage, Auth email links, offline mutation and reconnection, account isolation, and active-Sesh safety on both iOS and Android.
- **Notes:** Deliberately deferred. `AGENTS.md` makes web the only active target until the user explicitly resumes mobile hardening; do not scope or implement this item under the current agreement.
