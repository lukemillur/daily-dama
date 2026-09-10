# Tasks — Collaborative execution

Tickets requiring owner decisions, dashboard actions, or external verification. Work through one named ticket with `$guided-ticket T230` (or resume with `$guided-ticket resume T230`). The skill is in [`.agents/skills/guided-ticket/SKILL.md`](.agents/skills/guided-ticket/SKILL.md).

`new-ticket` reads `TASKS.md` only. Never copy a ticket into that queue to make its claim script work. `TASKS_BACKLOG.md` remains the separate deferred queue. IDs are unique across all three queues and `TASKS_DONE.md`.

## Working agreement

- **Execution: External gate** means the agent completes authorized preparation and implementation, then guides the owner through remaining access, deployment, or verification steps.
- **Execution: Owner-in-loop** means the agent also presents recommendations at the ticket's named decision points before performing work that depends on those choices. Routine preparation proceeds without repeated approval.
- **Owner gates** names the required decisions/actions. **Automation boundary** says what the agent can complete independently. Neither field grants new production or Git authority.
- Keep `Status` compatible with `TASKS.md`: `Not started`, `In progress`, `Blocked` (reason required), `Done`. Use a separate **Checkpoint**: `Preparing`, `Implementing`, `Awaiting owner action`, `Awaiting external verification`, `Verifying`, `Ready to complete`, or `Complete`. Expected owner waits remain `In progress`; access failures or unsatisfied dependencies can be `Blocked` with the exact reason.
- Before starting, inspect task status, relevant local worktrees, and remote claims/PRs. This queue has no distributed claim mechanism; the owner coordinates concurrent sessions. Never take over an existing claim or infer abandonment from age.
- Keep a resumable execution guide at `outputs/guided-tickets/<ID>.md`. Record the checkout/branch/commit, target environment, decisions, completed steps, next owner action, and evidence. Keep secrets, full callback URLs, raw user data, and credentials out of the guide.
- Every collaborative ticket must begin on a focused checked-out branch named `task/<ID>-<short-ticket-slug>` (or an equivalent focused worktree with that branch). Create and check out the branch before changing the tracker, execution guide, source, tests, or configuration. If the current checkout is dirty with unrelated work, preserve it and use a separate worktree. Recheck local/remote branch collisions immediately before creation; an existing branch or ambiguous ownership is a coordination gate. Work in focused local checkpoints. Collaborative deployment tickets can require preparation commits before hosted verification and a final evidence/closure commit afterward. Follow `AGENTS.md` for Git authority; this queue does not inherit the automatic claim/push/merge exception for `TASKS.md`.
- **Preparation PR exception (owner approved 2026-09-04):** A preparation PR may open once all applicable local checks pass, with hosted criteria explicitly listed as pending and the ticket still open. Its merge requires the normal CI checks and existing owner authorization. This permits getting the implementation deployed for verification; it does not permit claiming hosted success early or grant automatic push, merge or production-deployment authority.
- Completion requires the ticket's actual exit criteria. Mark each criterion passed, failed, blocked, or not run with its source and environment. A guide written, local tests passed, or owner saying "saved" is not proof that a deployed flow works. Accept specific owner-observed evidence when the agent cannot observe it, labeling its source accurately.
- Once all criteria pass, move the entry to `TASKS_DONE.md` as `Done`, retaining the guide/evidence link. Do not close other tickets or proceed to another ticket automatically. If delivery or deployment is part of the criteria, it must finish before closure; otherwise report local completion and any pending Git delivery distinctly.

## Ship-readiness batch

Approved 2026-09-04 from [SHIP_READINESS_AUDIT.md](SHIP_READINESS_AUDIT.md). A1 → T225, A4 → T228 and A9 → T233 are in `TASKS.md`; the eight remaining proposals are below. The audit's findings require reconciliation against current code. Do not recreate Phase 6, legacy migrations, native hardening, mandatory CAPTCHA/distributed throttling, backup automation, a second hosted project, performance targets, or a waiting-period gate.

T221 already has remote claim `task/T221-diagnose-and-fix-the-feedback-form-s` (observed 2026-09-04; no PR returned at that check). Its entry remains in `TASKS.md` to preserve that workflow. T226 owns only the remaining signed-in permission/hosted evidence gap after T221, and must reuse any completed work.

Backend selection and release selection are explicit owner gates. T230/T231 preparation may occur before individual fix tickets close: a fix can supply a verified preparation commit for the owner to deploy, then record hosted evidence afterward. Do not invent a circular dependency requiring every hosted-verification ticket to be complete before deploying the code needed to verify it.

### [T232] Verify the hosted account lifecycle and account isolation

- **Area:** Hosted account acceptance
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Execution:** Owner-in-loop
- **Owner gates:** Confirm the target deployment and disposable accounts/inboxes; assist with real delivered links where access is unavailable; confirm the precise disposable account to delete.
- **Automation boundary:** Prepare fixtures and steps, run authorized browser/API checks, compare against existing backend security tests, and collect sanitized results.
- **Description:** On the prepared release, verify signup/verification, newly created guest-data import, sign-out/in with saved data restored, password recovery, email change and account deletion. Use two disposable accounts to confirm that neither can read/change the other's records and deletion affects only its owner.
- **Exit criteria:** A recorded hosted acceptance pass covers the complete lifecycle using actual delivered emails and two identified disposable fixtures, demonstrates guest import and saved-data return, proves cross-account read/write denial, and confirms deletion removes the selected owner's data while the other account remains intact. Missing access or delivery keeps the affected criterion open.
- **Notes:** From A8; audit sections 3–4. Depends on T225. Environment prerequisites are a prepared T230 backend and deployed T231 build, not closure of those tickets. Reuse existing data/API and deletion checks where applicable; never run the local reset-based database test harness against a hosted project. No legacy-data migration or branded-email requirement.

### [T234] Verify hosted synchronization and release-browser usability

- **Area:** Hosted web acceptance
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Execution:** External gate
- **Owner gates:** Confirm release URL/commit and disposable account access; provide any inaccessible hosted feedback/diagnostic evidence and disposition of discovered blockers.
- **Automation boundary:** Prepare and execute browser scenarios in isolated contexts, compare reusable evidence by commit/environment, and produce a focused acceptance report.
- **Description:** Verify a small realistic set of offline edits synchronizes after reconnection across two browser contexts without duplicate sessions or identity leakage. Complete the release-browser pass at 320px and desktop, checking keyboard navigation, form errors and first-visit usability, with deployed routing/feedback/Sentry evidence reused from their owning tickets.
- **Exit criteria:** The selected-release report records passing synchronization/browser scenarios, applicable T233 guest evidence or affected reruns, direct-load/refresh coverage, and guest/signed-in feedback and Sentry delivery under actual headers. Each reused result names its source commit/environment; all required gaps are resolved, and only nonblocking limitations remain explicitly documented.
- **Notes:** From A10; audit section 4. Depends on T225. Requires an identified deployed build and disposable fixtures from T230/T231 preparation. T226/T227/T229/T232 own detailed hosted evidence; reuse their results only when applicable, without requiring duplicate checks. Inspect actual first-load usability; do not introduce speculative budgets, multi-year datasets, native checks, or full active-Sesh restoration. Report new defects rather than broadening this acceptance task into unrelated implementation.

### [T235] Publish accurate deployment, support and data expectations

- **Area:** Release documentation
- **Priority:** Medium
- **Status:** Not started
- **Planning:** Implementer
- **Execution:** External gate
- **Owner gates:** Confirm support/feedback and error-review destinations, chosen service-plan recovery guarantees and acceptable durability expectations; confirm the user-facing privacy/data explanation.
- **Automation boundary:** Trace actual storage, deletion and service use, draft the operational and user-facing copy, and verify referenced commands/paths against current implementation.
- **Description:** Correct the deployment instructions that still describe an app without a backend and add a short accessible privacy/data explanation covering guest versus account storage, receiving services and deletion limits. Record how the owner reads feedback/errors and the chosen backend/release settings, reusing the other guides.
- **Exit criteria:** Deployment documentation matches the selected configuration and provides reproducible steps with working references; the deployed user-facing explanation accurately describes current storage/services and account deletion without claiming previously submitted feedback is deleted. The owner confirms feedback/error access and records actual plan recovery guarantees with accepted limitations, without unsupported recovery promises.
- **Notes:** From A11; audit sections 2 and 5. Depends on T225. Use the chosen configuration and verified evidence from T230/T231 when available; do not invent those decisions or require their closure before drafting. Confirm current plan facts at execution time. No backup automation, paid-plan purchase, legal certification, new support platform, or broad documentation overhaul is included.

## Production regression follow-up

### [T265] Diagnose and fix the landing header bar still blocking content after scroll

- **Area:** Landing page
- **Priority:** High
- **Status:** In progress
- **Checkpoint:** Awaiting owner action
- **Planning:** Implementer
- **Execution:** Owner-in-loop
- **Owner gates:** Reproduce with real browser DevTools open (desktop Chrome first, since it's confirmed to reproduce there every time on scroll-down) and, with the Elements panel, inspect/hover the actual node rendering the visible gold bar over the content — confirm whether it is `[data-testid="landing-header-bar"]` (report its computed `display`/`opacity`/`background-color` at that moment) or a different node, and whether it disappears/updates if you force a repaint (resize the window by 1px, or toggle a DevTools "Paint flashing"/layer check). Separately reproduce and report the same on a real iOS Safari device, since the original report was on mobile. Confirm any proposed fix resolves it in both.
- **Automation boundary:** Inspect the current code, form and test fix hypotheses, run the existing `landing-page.test.tsx` header-bar suite, and drive the header's `display`/`opacity` toggle programmatically (synthetic `scroll`/`wheel` events, direct state/prop manipulation) against both a local dev server and the live production DOM — but cannot reproduce the bug that way: every synthetic-event pass in this session resolved the header to `display: none; opacity: 0` with a zero-size rect and no duplicate node, exactly as intended, on the identical production page the owner saw it fail on. This session's browser tool also cannot perform a genuine OS-level interactive scroll (the embedded pane reports "hidden" and times out on scroll/drag actions), so it cannot rule out a paint/compositing-layer bug that only shows up under real scroll input. A session or owner with an actually-rendered, interactive browser is required to get further.
- **Description:** The user reported (screenshot, production) that after scrolling the landing page, a solid gold bar the shape/height of the header remains visibly rendered over the top of the hero heading ("Play with intention.") and, separately, over the "Start your first sesh." CTA card — confirmed via follow-up as a distinct bar sitting on top of the content, not the CTA card's own cropped edge, and confirmed to happen on every scroll-down, on both mobile (original report) and desktop Chrome (follow-up screenshot). T254 already shipped exactly this fix — `HeaderBar` in `landing-auth-cta.tsx` toggles `display: ${$visible ? 'flex' : 'none'}` alongside its existing `opacity`/`pointerEvents`, driven by `landing-page.tsx`'s scroll-derived `headerVisible` state — and was verified in T254 via Playwright against a local dev server at 375x812 and 1280x900 in desktop Chromium. That verification evidently didn't catch this. A diagnostic pass in this session against the live production site — synthetic `scroll` events, rapid synthetic `wheel`+`scroll` sequences simulating momentum, and a direct DOM query for duplicate header nodes — could not reproduce it: the computed style always correctly resolved to `display: none` with an empty rect. That rules out a broken/stale `headerVisible` state or event listener as the sole cause. Leading candidate given computed style is correct but real scrolling still shows a persistent bar: a paint/compositing bug specific to the `position: absolute` + `transition: opacity` + `z-index: 10` combination on `HeaderBar`, where the browser's GPU-composited layer for that element isn't being invalidated/repainted after `display` flips to `none` under real scroll-driven paint timing, leaving a frozen visual remnant of its last-painted frame on screen even though the DOM/computed style already says it's gone. This is a hypothesis, not confirmed — needs eyes-on DevTools inspection during an actual reproduction to confirm or rule out.
- **Exit criteria:** DevTools inspection (or equivalent) during a live reproduction identifies the actual node/cause of the persistent bar and records it in the execution guide. The owner confirms, after the fix, that scrolling down on both desktop Chrome and a real iOS Safari device no longer leaves any header-shaped bar, background, or border visible over page content past the threshold, and that scrolling back near the top restores the full header exactly as before. `landing-page.test.tsx`'s `LandingPage header bar` describe block still passes, extended with a regression case matching the confirmed root cause if the fix isn't fully covered by computed-style assertions alone (e.g. a compositing-layer fix may need a real-browser Playwright screenshot diff rather than a jsdom style assertion).
- **Notes:** Reported directly by the user 2026-09-10 via a production screenshot (mobile), then confirmed via a second production screenshot (desktop Chrome) and follow-up Q&A that it's a distinct overlay bar, reproducing on every scroll-down — after T254 (from S124) had already shipped and been marked `Done`. Routed to this queue rather than `TASKS.md` because getting further requires a session or person with an actually interactive, rendered browser (this session's embedded browser pane could not perform real scroll input) and, for the mobile leg, a real iOS Safari device or WebKit remote inspection that AGENTS.md's Active platform scope section bars simulator/emulator tooling from substituting for. Don't assume the fix is a `HeaderBar`-only change until the blocking node is actually identified — the computed-style evidence gathered so far argues against a simple state/effect bug in the shipped T254 mechanism.
