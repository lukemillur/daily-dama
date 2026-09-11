# Tasks

Working backlog for Daily Dama **core-functionality** work. This file is the checkpoint mechanism: a session — including a fresh one after context compaction — reads it top to bottom to know what's done, what's next, and how to verify it, instead of relying on conversation memory or a todo list that only exists in-context.

**Scope note:** Trick visualization (`src/features/trick-viz/`) is intentionally excluded from this file right now. Its own backlog lives in [TRICK_VIZ_HANDOFF.md](TRICK_VIZ_HANDOFF.md) §15. Do not pull items from there into this file unless explicitly told to resume that thread.

**Automation note:** [TASKS_BACKLOG.md](TASKS_BACKLOG.md) holds scoped, ready-to-work tasks that are deliberately kept out of this file so the `newTicket` workflow (`.claude/skills/newTicket/SKILL.md`) never claims, plans, or implements them automatically. Moving an entry between the two files is a deliberate human decision, not something to do as a side effect of other work.

**Collaborative queue:** [TASKS_COLLABORATIVE.md](TASKS_COLLABORATIVE.md) holds tickets requiring owner decisions or external verification, executed one at a time with `$guided-ticket`. It is excluded from automatic claiming. Allocate new IDs across all three queues and `TASKS_DONE.md`. Existing claimed tickets remain with their current workflow; the new queue records any residual follow-up explicitly.

## How to use this file

**Picking up work:**

1. Read this file top to bottom before touching code.
2. Take the first `Backlog` entry with status `Not started` or `In progress`. Before claiming it, follow the branch-check protocol in _Working across multiple agents_ below — this file's status field is a human-readable picture, not the authoritative claim signal.
3. Read its exit criteria before writing anything — that's the definition of done, not a vibe check.
4. If the exit criteria depend on something no longer true (file moved, API changed, decision superseded), stop and flag it rather than guessing.

**Completing a task:**

1. Do the work.
2. Run the task's own exit criteria yourself — don't mark it done on assumption.
3. Run the risk-based local checks for the changed area in [AGENTS.md](AGENTS.md), including full typechecking for TypeScript changes. Reserve the complete app sequence for the escalation conditions documented there; narrow tasks rely on the required CI app gate for the broad baseline.
4. Commit the change on its own, referencing the task ID in the message. Focused commits, never pushed automatically (see AGENTS.md § Git state expectations).
5. In that same commit, move the entry from `Backlog` in this file to [TASKS_DONE.md](TASKS_DONE.md), flipping its status to `Done`. If this task was the last remaining child of a parent umbrella entry (every sibling child is now `Done`), move the parent entry to `TASKS_DONE.md` as well, in the same commit, flipping its status to `Done` too — an umbrella with no exit criteria of its own is done exactly when its children are.
6. Open a PR into `development`, wait for required CI checks to pass, then squash-merge it — no human review gate is required, and the automated merge remains pre-authorized (see [AGENTS.md](AGENTS.md) § Git state expectations). `development`, not `main`, is where task branches land; promoting `development` into `main` is a separate, manual step outside this protocol.

**Getting stuck:**

- If a task turns out bigger than scoped, don't silently expand it. Split it into new entries and mark the original `Blocked` with a one-line reason.
- If a task depends on a product decision, mark it `Blocked` with the specific open question, not a guess — but this should be rare in practice. See _Scoping a task_ below: most decisions should already have been surfaced and resolved before an entry ever reached `Backlog`.

## Status legend

- `Not started`
- `In progress` — being actively worked. If you find a task already in this state at the start of a session, verify how far it actually got (check the commit log) rather than trusting the label alone.
- `Blocked` — reason required, one line, specific enough to unblock without a meeting.
- `Done` — moved to [TASKS_DONE.md](TASKS_DONE.md), not left in Backlog.

## Task template

Copy this shape for every new entry. Keep exit criteria mechanical — a test that passes, a command that exits 0, a specific behavior checked in-browser — never "looks right" or "seems fine."

```
### [T###] Short imperative title

- **Area:** e.g. Sesh, Stats, Tricks, persistence, navigation
- **Priority:** High / Medium / Low
- **Status:** Not started
- **Planning:** Required / Implementer
- **Description:** What changes and why, in 1-3 sentences — enough for a fresh session to start without re-deriving intent.
- **Exit criteria:** Mechanical and checkable.
- **Notes:** Assumptions made, decisions deferred, anything a resuming session needs to know.
```

### The Planning field

`Planning` decides whether the [newTicket workflow](.claude/skills/newTicket/SKILL.md) spends a separate high-rigor planning pass on the task before implementing it.

- **`Required`** — run the separate planner and keep its durable plan at `.claude/plans/<ID>.md`. Use this for persistence or schema changes, state-machine and concurrency work, changes that move an architectural boundary, unfamiliar native/platform APIs, and anything where being wrong is expensive to undo.
- **`Implementer`** — the implementer writes a short plan for itself and gets straight to work. Use this for genuinely local S-sized tickets: one or two files, a known pattern, no open questions.

Rules that hold regardless of what an entry says:

- **Omitting the field is safe.** An entry with no `Planning` line gets the separate planner, so every pre-existing task keeps its old behavior.
- **Priority is not complexity.** A High-priority label change is still `Implementer`; a Low-priority reducer change is still `Required`.
- **The workflow can escalate but never de-escalate.** An entry marked `Implementer` whose title, area, description or notes name persistence, schema/migration, reducers/state machines/concurrency, architectural boundaries, or native/iOS/Android APIs is promoted back to the separate planner automatically, and the run says so.

## Scoping a task

Rough ideas do not go straight into `Backlog`. They land in `Needs scoping` first, and only get promoted once they pass every check below. This is a rigid gate on purpose — a vaguely-scoped entry sitting in `Backlog` is worse than no entry, because it looks actionable and isn't.

**Promotion checklist — an idea may move to `Backlog` only if all four are true:**

1. **Single area.** It stays inside one feature area or persistence domain (see AGENTS.md's three domains — profile, custom tricks, practice history — and the Sesh/Stats/Tricks/navigation split). If it spans two, split it into one entry per area.
2. **One exit criterion.** The definition of done is a single coherent verification of _one_ behavior or change — it can involve running a whole suite or several related checks together, as long as they're all confirming the same thing. What doesn't fit: bolting on verification of a second, unrelated behavior ("and also verify X") — that's a second task wearing one entry's clothes.
3. **No embedded decision.** If answering it requires a product or technical call only you can make, it is not ready — it goes to `Blocked` with the specific open question, not into `Not started` with an assumption baked in.

   Push on this _during scoping itself_, not after. While an idea sits in `Needs scoping`, actively hunt for any product or technical question it raises and get it answered in that conversation. The goal is for `Blocked` to be rare and reserved for questions that only became visible during implementation — not a routine landing spot for decisions that could've been asked about in five seconds while scoping.

4. **One commit.** The whole thing lands in a single focused commit. If it can't, it isn't one task — see sizing below.

If an idea fails any check, either split it into entries that each pass all four, or resolve the open question first. Don't force a fit.

**Sizing — by checkpoint count, not duration:**

- **S — single commit.** One exit criterion, one commit. This is the target size; most `Backlog` entries should be S.
- **M — a chain of S's.** Only for genuinely sequential steps that can't be reordered or done independently. Written as a parent entry (`[T010]`) plus numbered children (`[T010.1]`, `[T010.2]`, ...), each S-sized with its own exit criteria. The parent is an umbrella only — it has no exit criteria of its own and is marked `Done` when every child is `Done`.

Nothing else is a valid size. An idea that doesn't reduce to S or a numbered M-chain isn't scoped yet — leave it in `Needs scoping` and keep discussing it rather than forcing it into a template.

## Working across multiple agents

Tasks here may be picked up by more than one agent at a time — possibly different harnesses, possibly different machines. Real-time coordination happens through git, not through this file: a pushed branch is the authoritative claim, and this file's `Status` field is the human-readable picture that catches up whenever that branch eventually merges. Don't trust `Status` alone to mean a task is actually free.

**Before claiming a task:**

1. Pull latest `development`.
2. Check whether a branch already exists for it: `git ls-remote origin 'refs/heads/task/T0NN-*'` (substitute the real ID, e.g. `T003` or a child like `T005.1`). If one exists, it's already claimed — pick a different task.
3. If the task notes a dependency (e.g. T013 depends on T012), confirm that dependency is actually in [TASKS_DONE.md](TASKS_DONE.md), not just referenced as resolved in a conversation. From another agent's perspective, only a merged, archived task is really done.

**Claiming and working:**

1. Create a branch named `task/T0NN-short-slug`, using the task's own ID, branched from `development`.
2. Push the branch immediately, _before_ starting the actual work — this push is the claim (see the narrow exception to "never push automatically" in AGENTS.md § Git state expectations). If the push is rejected because the branch name already exists, someone beat you to it — stop and pick another task. Never `--force` here; a rejected push is the collision detector working as intended, not an obstacle to push through.
3. Do the work on that branch. Everything under _Completing a task_ above still applies — including that moving the entry to `TASKS_DONE.md` happens in a commit on this branch, not a direct edit on `development`.
4. Open a PR into `development` when ready, wait for required CI checks to pass, and then squash-merge it — this is pre-authorized and needs no human review gate (see AGENTS.md § Git state expectations). A failed or unavailable required check blocks the merge; do not bypass it.
5. Pushing further commits to your own branch, opening the PR, and squash-merging it into `development` are all covered by working normally on a task. Promoting `development` into `main` is a separate, manual step and still needs the usual confirmation.

**Stale claims:** a pushed branch with no activity and no PR is an abandoned claim, not a real one. Deleting it releases the task — ordinary git housekeeping, no special protocol required. Deleting it is a deliberate human decision: no agent or script may take over a claim branch on its own, and branch age is never treated as proof that a claim was abandoned.

**Resuming your own interrupted task:** if a run stopped partway — a usage limit, a crashed session — the claim branch and any committed `.claude/plans/<ID>.md` are still there, and that's exactly what recovery uses. Resume it explicitly with `/newTicket resume T0NN`. Resuming reads the branch, never rewrites it: it stops with a blocker if no branch matches the ID, if more than one does, or if the branch doesn't actually contain that task. If a durable plan is on the branch, implementation continues from it instead of planning again.

**Claiming is scripted, not improvised.** `node .claude/scripts/ticket-claim.mjs` performs selection, the dependency check, the collision check, the branch, the status flip, the claim commit and the claim push, inside a temporary worktree it removes itself. It never force-pushes, never deletes a branch it doesn't own, and never touches the checkout it's invoked from. Run it with `--dry-run` to see which task would be picked without changing anything.

## Needs scoping

_Raw ideas land here — a name and a one-line description, nothing more. Discuss and apply the promotion checklist above before moving an entry down to Backlog._

- **First-lace "extra flashy" tiering** (Medium, follow-on to T008) — escalate the celebration based on time/attempts/sessions spent before landing; thresholds undefined.
- **Competition mode** (Low) — trick lists by competition skill level, portable into sesh mode.
- **Longest-grind-per-trick metric** (Low) — time-to-first-lace per trick; display surface (Stats?) undecided.
- **Double-digit lace animation** (Low) — animation design undefined.
- **Buzzer-beater lace animation** (Low) — landing with under 10s remaining; threshold is clear, animation design is not.
- **Time-of-day success correlation** (Low) — surface whether the user lands more in morning vs. night seshes; what counts as a meaningful difference is undefined.
- **Line generator** (Low) — random line of tricks; trick pool source (all / unlocked / selected) undecided.
- **Collection management** (Low) — photos + metadata for physical kendama collection, with kendama-specific lace lists. Likely a new persistence domain; substantial scope on its own.

## Backlog

---

_T272–T273 come from stories S138–S139 in [BACKLOG_STORIES.md](BACKLOG_STORIES.md) (the user's 2026-09-11 QA pass on T267/T268, both follow-up gaps on already-`Done` tickets). Both are `Implementer`: T272 is a local restyle of the existing shared `GoalRow` component in `trick-goals-screen.tsx` (T267's own recent change, fully local, no diagnosis ambiguity); T273 is a CSS-only change to the same single file T268 itself edited, matching that ticket's own `Implementer` rating for a visual/layout-only sticky-header change on `TrickDirectory`._

### [T272] Restore the practice affordance on goal cards

- **Area:** Goals
- **Priority:** High
- **Status:** Not started
- **Planning:** Implementer
- **Description:** T267 (`a0a2672`) fixed a nested-`<button>` defect in `GoalRow` (`src/features/goals/components/trick-goals-screen.tsx`) by narrowing the card's pressable practice area (`PracticeArea`) to wrap only `GoalHeaderRow`, leaving the `GoalActionsRow` — including the `PracticeHintText` reading "Practice toward this goal" — outside any pressable and therefore dead space. Restructure the card so the hint-text row is also part of the practice affordance, while keeping the Delete control (`GoalAction` in `GoalActionsRow`) a separate, non-nested sibling pressable, preserving T267's fix.
- **Exit criteria:** `trick-goals-screen.test.tsx` gains an assertion that `PracticeHintText` ("Practice toward this goal") renders as a descendant of the `accessibilityLabel="Practice <trick name>"` pressable, not the separate Delete pressable — i.e. pressing that row triggers the same navigation as pressing the header row. The existing `does not nest the Delete button inside the Practice button` test in the same file continues to pass unmodified, proving T267's fix isn't reverted. Full `trick-goals-screen.test.tsx` suite passes.
- **Notes:** `GoalRow` is the one shared component rendered by both `TrickGoalsScreen` (single-trick) and `AllTrickGoalsScreen` (aggregate "Trick goals" screen) — see `all-trick-goals-screen.tsx:102` — so one component-level test fix covers both screens named in S138's acceptance criteria; no separate per-screen verification is needed.

### [T273] Remove scroll-snap-induced auto-scroll from the trick list

- **Area:** Tricks
- **Priority:** High
- **Status:** Not started
- **Planning:** Implementer
- **Description:** T268 (`4d1243e`) fixed the sticky rank header overlapping the previous section's last row by both (a) reserving a section-boundary gap sized to the header's measured height, and (b) adding web-only `scroll-snap-type`/`scroll-padding-top`/`scroll-snap-align` CSS in `trick-directory.tsx` to force a released scroll to always settle clear of the header. Per the user's QA comment, (b) itself now automatically re-positions or hides a rank header when scrolling back up to read it, which is worse than the overlap it closes. Remove the scroll-snap CSS (`scrollSnapListStyle`, the `Platform.OS === 'web'` scroll-snap-align line in `trickRowLayout`) while keeping (a), the section-boundary gap, which independently addresses the original overlap.
- **Exit criteria:** In the running Expo web dev server on `/tricks`: (1) scrolling the trick list up and down, including a released/flicked momentum scroll, never moves the list beyond the user's own scroll input and never hides or obscures a rank header once it has scrolled back into view; (2) scrolling to the boundary just above a custom-sequence row (T268's original repro case) still shows the full row — trick name and "Custom sequence" label — unobscured by the sticky header once scrolling settles, confirming the boundary-gap fix alone still holds without the snap CSS. `yarn tsc --noEmit` passes.
- **Notes:** The user's stated preference was a full revert of T268, which would also reintroduce the original overlap defect. Try removing only the scroll-snap CSS first (per S139's acceptance criteria, which requires both no-unwanted-motion and no-overlap). If that reintroduces a narrow overlap edge case the boundary gap alone doesn't catch, stop and flag the tradeoff back to the user rather than silently choosing between accepting the edge case or a full revert.

---

_T266–T271 come from stories S131–S136 in [BACKLOG_STORIES.md](BACKLOG_STORIES.md) — an autonomous exploratory QA pass on 2026-09-10 (an agent driving the local dev server, not the user directly; see `outputs/qa-pass-2026-09-10.md`), not a reviewed PR/commit range. T266 (S131) and T267 (S132) are `Required`/high severity: T266 is a Sesh-reducer-adjacent interaction bug whose exact bleed-through mechanism QA could not confirm from the browser session alone, matching this project's established precedent (T212, T221) for a runtime-diagnosis-first fix; T267 is `Implementer` despite being high severity because the nesting defect and its fix are fully local to one shared component, with no diagnosis ambiguity. T268 (S133) is `Implementer`: a CSS/layout-only sticky-header overlap in one existing file, visual-only per QA. T269 (S134) and T270 (S135) are `Implementer`: local, low-risk UX corrections (validation-timing gate; an additive selector plus confirmation copy) with no open product question. T271 (S136) is `Implementer` documentation-only. S137 was left `Proposed` per its own notes (low-confidence, non-reproducible) and was not scoped in this pass._

---

_T253–T254, T256–T257 come from stories S123, S124, S127, S128 in [BACKLOG_STORIES.md](BACKLOG_STORIES.md) (the user's 2026-09-08 QA pass on the first live dailydama.com production deployment). S125 (email template branding) was scoped as T255 in `TASKS_COLLABORATIVE.md` instead, since it's Supabase-dashboard configuration rather than application code. S126 was intentionally never created — the reported broken auth redirect is already covered by `T231` in `TASKS_COLLABORATIVE.md`, which the user is actively working in a separate session; nothing here touches it. All four are `Implementer`: each is a local fix inside a single existing component, matching this project's established precedent (T237, T238) for a QA-reported symptom that needs a browser-only diagnosis first but is genuinely local in scope once found — none of them touch a persistence domain, state machine, or architectural boundary._

---

_T249–T252 come from stories S119–S122 in [BACKLOG_STORIES.md](BACKLOG_STORIES.md) (the user's 2026-09-08 QA pass on T208/T241, plus two general-feedback items describing one consistent rule, combined into S122/T252). T249 (S119) is `Required`: T208's overlay wiring (`useGlobalSearchParams` read in `_layout.tsx`, `auth-callback-screen.tsx`'s `newAccount=1` redirect param) looks correct on inspection but doesn't render in the flow the user tested — the same class of gap as T212/T221/T237, needing runtime diagnosis before a fix. T250 (S120) is `Implementer`: a color-only swap between `text-field.tsx`'s existing border and shadow expressions, the same narrow scope T241 itself shipped. T251 (S121) is `Implementer`: a mechanical rule change to the existing `password-policy.ts`/`validateNewPassword` shape, applied to both signup and reset-password since they already share that module (flagged in the story as an assumption, not explicitly requested). T252 (S122) is `Required`, matching this project's established precedent for reading onboarding/auth state into routing or copy decisions (T200, T242, T243) — it reuses `useCachedOnboardingStatus()` exactly as T242/T243 already do, but on two new call sites (Sign up, Sign in) that don't read that state today._

_T247–T248.2 come from critical findings D001–D002 in [DESLOPPIFY.md](DESLOPPIFY.md). The other critical findings remain owned by T226–T229 and were not duplicated. T247 closes the fail-open discard path first; T248 then builds general local-durability reporting and recovery on its typed persistence outcome. These tickets extend T158/T160 without reopening their completed scope._

_T208–T215 come from stories S090–S097 in [BACKLOG_STORIES.md](BACKLOG_STORIES.md) (the user's 2026-09-02 QA pass on T195/T201/T205/T207, plus three items of general feedback). T209 (S091), T210 (S092), T211 (S093), T213 (S095), and T214 (S096) are `Implementer` — local, known-pattern changes, several reusing an existing precedent in this codebase (T205's `DisplayTitle` title style for T209; `RankUpCelebrationModal`'s `theme.accent` precedent for T211; `trick-goals-screen.tsx`'s `GoalHeaderRow`/`GoalTrickName` pattern for T214). T208 (S090) is `Required`: it mounts a new full-screen overlay above `<Slot />` in `_layout.tsx` and introduces `useGlobalSearchParams`, which has no precedent anywhere in this codebase today — both are boundary-level changes per this project's Planning rules, even though the celebration visual mechanism itself already exists via `RankUpCelebrationModal`. T212 (S094) is `Required` because T195's confirmed-working hosted-project fix (`supabase/RESEND_DNS_AUTH.md`'s 2026-09-01 entry) has now regressed — this needs a fresh runtime diagnosis of why the fix didn't hold, not a repeat of the same PATCH. T215 (S097) is `Required` for the same class of reason as T199/T206 before it: `StatsScreen` renders synchronously off `usePracticeHistory().sessions` with no guest-import-pending gate, unlike `home.tsx`'s existing `isGuestImportPendingResolution` check — this needs runtime tracing to confirm whether the same gate suffices for Stats before a fix can be written._

_T219–T224 come from stories S098–S104 in [BACKLOG_STORIES.md](BACKLOG_STORIES.md) (the user's 2026-09-03 QA pass on T210/T213/T217.2, plus general feedback not tied to a specific ticket). T219 (S098), T220 (S099), and T222 (S102) are `Implementer` — local, known-pattern changes reusing existing precedent in this codebase (T210's own `InlineSignupInvite` placement for T219; T213/T214's typographic-parity bumps for T220). T221 (S100) is `Required`: both `feedback-screen.tsx`'s success-state branch and `submit-feedback.ts`'s insert call look correct on inspection, so the QA-reported failure needs a fresh runtime diagnosis against the real environment the user tested in, matching the class of bug already established for T188/T195/T199/T206/T212 rather than a known local fix reapplied. T223 (S103) is an M-chain: no shared themed text-input component exists anywhere in the codebase today (`src/components/ui/` holds only `button.tsx`/`screen.tsx`/`typography.tsx`; every screen currently defines its own local styled `TextInput`), so T223.1 is `Required` to introduce that new shared UI primitive (mirroring `button.tsx`'s own precedent) and apply it to the Authentication area the original QA note explicitly named; T223.2–T223.8 mechanically apply the resulting component to the remaining areas (Feedback, Sesh, Trick notes, Tricks, Trick goals, Onboarding, Profile) once it exists and are `Implementer`. T224 (S104) is `Implementer`: it adds a minimum-visible-duration delay to `auth-callback-screen.tsx`'s existing default-branch redirect only, deliberately not touching its error/recovery/email-change branches. S101 (the new-account banner's readability/persistence/animation problems) was not scoped as its own ticket — it targets `home.tsx`'s `NewAccountBanner`, which T208 (already `Not started` above) replaces outright with a new full-screen overlay; S101's requirements were folded into T208's own Description/Exit criteria/Notes instead, to avoid writing a ticket against code T208 is about to delete.

_T236–T246 come from stories S106–S118 in [BACKLOG_STORIES.md](BACKLOG_STORIES.md) (the user's 2026-09-04 QA pass on T224/T223.8, plus eleven items of general feedback). T236 (S106), T240 (S112), T241 (S113), T244 (S116), T245 (S117), and T246 (S118) are `Implementer` — local, known-pattern changes: T236 mirrors T224's own precedent exactly (`CALLBACK_MIN_VISIBLE_MS`); T241 mirrors `landing-cta.tsx`'s existing explicit-`style`-prop `boxShadow` pattern (documented inline there, since styled-components/native's CSS shorthand lowers to deprecated RN shadow props); T240 has an existing `fill`/`$fill` width-100% prop on `button.tsx` to reuse. T237 (S107) is `Implementer` despite needing a diagnosis first: tracing `theme-color-picker.tsx` and `text-field.tsx` shows the swatch is already wired through as `TextField`'s `rightAccessory` exactly as T223.8's own notes describe, so the defect is a rendering/layout issue only visible in-browser, not a missing wiring change — genuinely local once found, no architectural risk. T238 (S108+S109+S110) merges three landing-page screenshot stories into one ticket because they'd otherwise recapture the same screenshots twice in two separate passes — `product-manager`'s own notes on S108/S109/S110 flagged this overlap. T239 (S111) is `Required`: `sesh.tsx`'s target-laces field (`targetLandingCount`, line 434-444) has no persistence today, and per `AGENTS.md`'s three-domain state boundary, deciding which existing domain (or a new field on one) owns this value is a persistence-shape decision, not a local styling fix. T242 (S114) and T243 (S115) are both `Required`: T242 reverses a documented deliberate design decision in `landing-auth-cta.tsx` (its own doc comment: "renders nothing once a visitor is authenticated") and adds a new authenticated-only UI surface plus a logout action on a route several prior tickets (T145, T170, T189, T200) have already shown is easy to get wrong around hydration/redirect ordering; T243 changes `landing-cta.tsx`'s copy-selection logic to read `useAuthState()` alongside or instead of `useCachedOnboardingStatus()`, the same class of routing/auth-state boundary risk T200 was scoped `Required` for.

---

_Ship-readiness batch approved 2026-09-04, from `SHIP_READINESS_AUDIT.md`: A1 → T225, A4 → T228, A9 → T233 are autonomous work. A2/A3/A5/A6/A7/A8/A10/A11 → T226/T227/T229/T230/T231/T232/T234/T235 live in `TASKS_COLLABORATIVE.md`. The audit describes a historical snapshot, not this checkout or a selected release. These entries do not restore the removed T162 Phase 6 launch gate; older phase-gating prose above is historical and superseded by the revised audit scope._


---
