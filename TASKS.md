# Tasks

Working backlog for Daily Dama **core-functionality** work. This file is the checkpoint mechanism: a session — including a fresh one after context compaction — reads it top to bottom to know what's done, what's next, and how to verify it, instead of relying on conversation memory or a todo list that only exists in-context.

**Scope note:** Trick visualization (`src/features/trick-viz/`) is intentionally excluded from this file right now. Its own backlog lives in [TRICK_VIZ_HANDOFF.md](TRICK_VIZ_HANDOFF.md) §15. Do not pull items from there into this file unless explicitly told to resume that thread.

**Automation note:** [TASKS_BACKLOG.md](TASKS_BACKLOG.md) holds scoped, ready-to-work tasks that are deliberately kept out of this file so the `newTicket` workflow (`.claude/skills/newTicket/SKILL.md`) never claims, plans, or implements them automatically. Moving an entry between the two files is a deliberate human decision, not something to do as a side effect of other work.

## How to use this file

**Picking up work:**

1. Read this file top to bottom before touching code.
2. Take the first `Backlog` entry with status `Not started` or `In progress`. Before claiming it, follow the branch-check protocol in _Working across multiple agents_ below — this file's status field is a human-readable picture, not the authoritative claim signal.
3. Read its exit criteria before writing anything — that's the definition of done, not a vibe check.
4. If the exit criteria depend on something no longer true (file moved, API changed, decision superseded), stop and flag it rather than guessing.

**Completing a task:**

1. Do the work.
2. Run the task's own exit criteria yourself — don't mark it done on assumption.
3. Run the project's standard verification sequence (`yarn test --runInBand`, `yarn lint`, `yarn tsc --noEmit` — see [AGENTS.md](AGENTS.md)). A task isn't done if it breaks the baseline, even when its own criteria pass.
4. Commit the change on its own, referencing the task ID in the message. Focused commits, never pushed automatically (see AGENTS.md § Git state expectations).
5. In that same commit, move the entry from `Backlog` in this file to [TASKS_DONE.md](TASKS_DONE.md), flipping its status to `Done`. If this task was the last remaining child of a parent umbrella entry (every sibling child is now `Done`), move the parent entry to `TASKS_DONE.md` as well, in the same commit, flipping its status to `Done` too — an umbrella with no exit criteria of its own is done exactly when its children are.
6. Open a PR into `development` and squash-merge it immediately — no review gate, this is pre-authorized (see [AGENTS.md](AGENTS.md) § Git state expectations). `development`, not `main`, is where task branches land; promoting `development` into `main` is a separate, manual step outside this protocol.

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
4. Open a PR into `development` when ready and squash-merge it immediately — this is pre-authorized, no review gate (see AGENTS.md § Git state expectations). CI runs the standard verification sequence on the PR, but the merge itself does not wait on it.
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

_This round came out of a review pass over the first batch of completed work (T001–T014). Entries below are either defects in what shipped or follow-on functionality that first pass surfaced. Where an entry corrects a completed task, it names that task — but the archived entry in [TASKS_DONE.md](TASKS_DONE.md) stays as-written; history isn't rewritten._

_T112–T112.6 come from stories S027–S031 in [BACKLOG_STORIES.md](BACKLOG_STORIES.md) (a dedicated pre-app landing page), refined by `product-manager` from a direct user request and scoped in this pass. T111 (drop the access-gate password screen) isn't from a story — it's a decision made during this scoping conversation, in answer to a question the landing-page work raised directly: the app is currently gated behind a password on every route, which defeats the purpose of a publicly shareable landing page, and the user chose to remove the gate outright rather than scope it to just `/app`. T111 is listed first because T112.1 assumes it's already gone, though nothing technically blocks doing them in the other order. T112.1 is the foundation the rest of T112's children build on — it does the actual `/app` route nesting — so it's sequenced first within the umbrella._

_T113–T120 come from stories S001–S008 in [BACKLOG_STORIES.md](BACKLOG_STORIES.md) (the user's 2026-08-19 QA pass on T112.4/T112.6 plus general landing-page feedback), refined by `product-manager` and scoped in this pass. T117 is a two-child umbrella: T117.1 captures new web-layout screenshots (mirroring T112.3's dedicated capture task) and T117.2 wires the platform-based swap, split because the capture step is genuinely separable in risk and effort from the display-logic change. Two open product questions surfaced during scoping and were resolved here rather than left `Blocked`: T114 moves the CTA to the top rather than duplicating it, and T120 clears background/accent only (not text color), matching the existing "Reset background & accent" button's scope. All other entries are independent S-sized tickets — no required ordering between them beyond what each entry's own Notes call out.

_T121–T131 come from stories S001–S011 in [BACKLOG_STORIES.md](BACKLOG_STORIES.md) (the user's 2026-08-20 QA pass on T115–T120 plus general landing-page feedback), refined by `product-manager` and scoped in this pass. T123 is a two-child umbrella: T123.1 builds and validates the looping, text-bearing Big Cup scene in the trick-viz sandbox in isolation, and T123.2 wires it into the production landing page with a WebGL fallback — split because validating a wholly new capability (3D text, autoplay looping) in isolation is a different risk profile from integrating it into a page every visitor loads, mirroring how T117 split screenshot capture from display-logic wiring. Three product questions surfaced during S003's refinement were resolved before scoping rather than left `Blocked`: the hero is decorative-only (no drag/orbit/tap interaction), needs a static-image fallback for visitors whose browser can't run WebGL, and does not need to respect `prefers-reduced-motion` this iteration. All other entries are independent S-sized tickets — no required ordering between them beyond what each entry's own Notes call out (T124 and T128 both touch landing-page desktop sizing but are independent of each other; T131 references T130's corrected animation duration but has no hard git-level dependency on it)._

_T132–T152 come from stories S001–S022 in [BACKLOG_STORIES.md](BACKLOG_STORIES.md) (the user's 2026-08-21 QA pass on T122–T131 plus general feedback across landing, goals, onboarding, theming, tricks, and Sesh), refined by `product-manager` and scoped in this pass. S006 (footer background responding to the rainbow theme preset) was not scoped: tracing `AppFooterBar` → `useResolvedTheme()` → `resolveTheme()` shows the footer's background already derives from the user's saved `themeBackgroundColor`/`themeAccentColor`, which preset selection already sets — the story's premise appears to already hold in the current code, so it's flagged back rather than scoped as a duplicate fix; see its Notes in `BACKLOG_STORIES.md` for the traced call chain. No umbrella tasks were needed — every story reduced to one independent S-sized ticket. T145 (S015, the landing-page load flicker) and T150 (S020, auto-focusing a trick on goal creation) were scoped `Planning: Required` from the start — both cross the persistence/provider boundaries AGENTS.md calls out. T146 (S016, onboarding theme preview) was also `Required` from the start, despite being a small, local change, because it modifies the onboarding flow's own state machine. Three more — T140 (S010, scroll-triggered showcase animation), T144 (S014, trick name/goals heading), and T149 (S019, hiding focused tricks while searching) — were raised from `Implementer` to `Required` during the scoping review pass (see each entry's Notes for why); their exit criteria are unchanged. T133 (S002) and T142 (S012) both touch hero sizing and are worth verifying together — a larger hero (T142) can reintroduce the mobile overlap T133 is fixing. T134 (S003) depends on T138's (S008) final content-column width to size against, so implementing T138 first avoids sizing against a stale value. T152 (S022, the sesh-timer audio cue) uses `expo-audio`, this SDK's supported audio API — `expo-av` is deprecated at the installed Expo SDK version (~57) and isn't present in the project's dependencies._

---

_All currently actionable backend-roadmap work is phase-gated and active in dependency order: Phase 1/Auth T153–T154, Phase 2 T155, Phase 3 T156–T160, Phase 4 T161, and the Phase 6 launch gate T162. T154 is the shared credential-maintenance prerequisite named by both Phase 1 and Phase 4, and is ordered before T158's guarded-logout integration. Phase 5 has no active ticket while native hardening is deferred. Supabase, unrestricted guest access, web PKCE, exact callbacks, local-first synchronization, immediate deletion, and the roadmap's security requirements are settled decisions._

### [T153] Establish optional web account access and recovery

- **Area:** Authentication
- **Priority:** High
- **Status:** Not started
- **Description:** Add the complete Phase 1 web Auth foundation while preserving unrestricted guest access to `/app`.
- **Notes:** Umbrella from S032. Complete T153.1–T153.13. Native callbacks, SecureStore, and synchronization are excluded.

### [T153.2] Configure the hosted development project and Auth policy

- **Area:** Hosted Supabase Auth configuration
- **Priority:** High (inherited from parent T153)
- **Status:** Not started
- **Planning:** Required
- **Description:** Create the single hosted free development project and mirror T153.1's verified-email password policy, exact web callback allowlist, ten-character password minimum, and one-hour access-token lifetime without creating the reserved production project.
- **Exit criteria:** A dated, secret-free configuration record shows the hosted development project has verified-email password Auth, exactly the approved `http://localhost:8081/auth/callback` and `https://dailydama.com/auth/callback` redirects, a ten-character minimum, and a 3,600-second JWT lifetime; live probes reject a nine-character signup and deny sign-in before email verification.
- **Notes:** From S032 and roadmap Phase 1 backend items 2–3. Depends on T153.1. Secure email change belongs to T154.1; Resend and DNS belong to T153.3.

### [T153.3] Configure Resend Auth email delivery and DNS authentication

- **Area:** Auth email delivery
- **Priority:** High (inherited from parent T153)
- **Status:** Not started
- **Planning:** Required
- **Description:** Configure Supabase custom SMTP through Resend using the dedicated `auth.dailydama.com` sending subdomain, mirror the repository-owned confirmation and recovery templates into the hosted project, and disable link tracking so single-use Auth URLs are not rewritten.
- **Exit criteria:** A dated, secret-free delivery record proves hosted confirmation and recovery messages arrive through Resend from the Auth subdomain with their callback URLs intact, Resend link tracking is disabled, SPF and DKIM pass, and the subdomain publishes a visible DMARC `p=none` policy; no SMTP credential appears in tracked files or client-exposed environment values.
- **Notes:** From S032 and roadmap Phase 1 backend item 4 plus the email/redirect security requirements. Depends on T153.1–T153.2. T162 later repeats deliverability checks before external signup and may tighten the DMARC policy using observed delivery evidence.

### [T153.13] Verify Phase 1 web Auth security end to end

- **Area:** Authentication security testing
- **Priority:** High (inherited from parent T153)
- **Status:** Not started
- **Planning:** Required
- **Description:** Add a black-box Phase 1 acceptance suite spanning a clean local Supabase reset and the completed web routes. Verify already-implemented behavior only: this checkpoint must not become a second implementation ticket for missing Auth branches or redaction logic.
- **Exit criteria:** One documented command resets local Supabase and passes an acceptance matrix covering new/existing signup equivalence, unknown/wrong-password sign-in equivalence, known/unknown recovery equivalence, verification and reset, resend limits, expired sessions, missing/reused/malformed/verifier-mismatched callbacks, open-redirect rejection, application-log/Analytics redaction, and guest access to every existing `/app` top-level route while Auth is initializing, offline, or unavailable; the standard Jest, lint, TypeScript, and static web-export sequence also passes with all `/auth/*` routes present.
- **Notes:** From S032 and roadmap Phase 1 security/verification requirements. Depends on T153.1 and T153.4–T153.12. The redaction boundary covers application-owned console calls and Vercel Analytics events; Supabase service logs and browser network tooling are outside this frontend acceptance boundary. Defects found here return to their owning ticket or a new focused follow-up rather than being silently implemented in this suite.

_Phase 1/4 shared account-maintenance activation: T154 comes from S033 and the credential-maintenance/logout items repeated across `BACKEND_ROADMAP.md` Phases 1 and 4. It follows the core Auth routes and precedes Phase 3's T158 guarded logout, while account deletion stays separate in T161._

### [T154] Add secure signed-in credential maintenance

- **Area:** Account security
- **Priority:** Medium
- **Status:** Not started
- **Description:** Let authenticated web users maintain credentials and end only the current device session.
- **Notes:** Umbrella from S033. Complete T154.1–T154.2. Pending-sync logout protection is T158. The shared Auth error/redaction boundary moved to active task T153.5 so it exists before any Auth route.

### [T154.1] Add signed-in password and email change flows

- **Area:** Account security UI
- **Priority:** Medium
- **Status:** Not started
- **Planning:** Required
- **Description:** Configure Supabase secure email change and add `/app/profile/account/security` with current-password verification for password changes, including reauthentication, expiry, generic errors, and confirmation guidance through T153.5's shared boundary.
- **Exit criteria:** Route/provider tests and a browser walkthrough confirm a signed-in user can change a password only after supplying the current password, can initiate and complete secure email change, and receives actionable expired/offline states without exposing sensitive values in URLs, logs, or analytics.
- **Notes:** From S033 and roadmap Phase 1 backend item 5/frontend item 5. Depends on T153.2, T153.3, T153.4, T153.5, and T153.7. T153.7 establishes the callback allowlist; this task adds only the fixed secure-email-change result needed by this route. Do not add MFA or account deletion.

_Phase 2 activation: T155 comes from S034 and `BACKEND_ROADMAP.md` Phase 2. Its thirteen S-sized children establish the database security boundary, model all six resources, prove grants/RLS and constraints, generate typed repository contracts, and add pure runtime mappings before any provider synchronizes. The sequence is dependency-driven: schema and tests precede generated types and mappings; existing reducer authority, hydration fallback, and skipped-initial-write behavior remain unchanged._


---

_Phase 3 activation: T156–T160 come from S035–S038 and `BACKEND_ROADMAP.md` Phase 3. The dependency chain deliberately separates identity-partitioned persistence (T156), durable synchronization mechanics and ordered domain rollout (T157), outbox-aware logout (T158), resumable guest conversion (T159), and visible conflict recovery (T160). Each child owns one persistence, orchestration, domain, or UX boundary; Realtime remains deferred and synchronization may never alter the active Sesh state machine._

### [T157] Add local-first synchronization across every domain

- **Area:** Synchronization
- **Priority:** High
- **Status:** Not started
- **Description:** Add durable, ordered, identity-owned synchronization while keeping every current workflow usable offline and every reducer independent of Supabase.
- **Notes:** Umbrella from S035. Complete T157.1–T157.9 in order. Depends on T155 and T156. Realtime subscriptions remain deferred.

### [T157.3] Implement paginated pulls and idempotent ordered pushes

- **Area:** Synchronization transport
- **Priority:** High
- **Status:** In progress
- **Planning:** Required
- **Description:** Add repository-agnostic transport orchestration for stable ordered pagination, mutation-ID-based idempotent retries, optimistic revision checks, tombstones, and application of server-returned revisions/timestamps.
- **Exit criteria:** Transport tests pull more than 1,000 ordered fixtures without gaps/duplicates, retry a successful write after a simulated lost acknowledgement without duplication, reject stale revisions into a typed conflict, apply authoritative server metadata, and continue unrelated operations after one conflict.
- **Notes:** From S035. Depends on T155.9, T157.1, and T157.2. Use injected clocks/network repositories for deterministic tests.

### [T157.4] Synchronize profile and trick state first

- **Area:** Profile synchronization
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Integrate the profile/trick repositories, runtime mappings, scoped persistence envelope, and coordinator with `UserProfileProvider`, preserving current reducer authority, hydration behavior, and local offline writes.
- **Exit criteria:** Integration tests create and edit all profile/trick-state variants offline, reload with pending work, reconnect and synchronize, rehydrate the result in a second browser identity fixture, resolve accepted server revisions, and prove no sync effect changes active Sesh state.
- **Notes:** From S035 domain rollout 1. Depends on T155.10 and T157.3.

### [T157.5] Synchronize custom tricks and sequences

- **Area:** Custom-trick synchronization
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Integrate custom tricks with the scoped outbox/coordinator while preserving stable IDs, stored step-name snapshots, deletion tombstones, and the no-nested-sequences rule offline and across browsers.
- **Exit criteria:** Integration tests create, edit, and delete standalone tricks and sequences offline; retry/reconnect without duplicates; rehydrate on a second browser; preserve historical step names after source rename/deletion; and surface same-record stale revisions without blocking unrelated tricks.
- **Notes:** From S035 domain rollout 2. Depends on T157.4 and T155.11.

### [T157.6] Synchronize immutable practice history

- **Area:** Practice-history synchronization
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Integrate completed-Sesh insertion and paginated pulls with the synchronization layer, retaining provider/reducer deduplication, immutable snapshots, client-fact timestamps, and Stats derivation.
- **Exit criteria:** Integration tests record sessions offline, reload and retry after a lost acknowledgement, synchronize more than 1,000 records, deduplicate by stable record identity, reject attempted remote mutation, and derive identical Stats locally and after second-browser rehydration.
- **Notes:** From S035 domain rollout 3. Depends on T157.5 and T155.12. Synchronization must never alter an in-progress Sesh reducer.

### [T157.7] Synchronize goals with optimistic revisions and tombstones

- **Area:** Goal synchronization
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Integrate goal creation, editing, deletion, tombstones, and stale-revision detection with the scoped outbox and coordinator without coupling GoalProvider to Supabase.
- **Exit criteria:** Integration tests exercise count/time goals offline through reconnect, lost acknowledgements, edits, deletion, stale-device resurrection attempts, and second-browser hydration; conflicts pause only the affected goal and accepted results update local revision metadata.
- **Notes:** From S035 domain rollout 4. Depends on T157.6 and the goal portion of T155.13.

### [T157.8] Synchronize notes with optimistic revisions and tombstones

- **Area:** Note synchronization
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Integrate notes, optional completed-Sesh references, edits, deletion tombstones, and stale-revision detection with the scoped outbox and coordinator while preserving trick/session snapshots.
- **Exit criteria:** Integration tests create/edit/delete notes offline, retain optional practice-session associations, retry idempotently, defeat stale-device resurrection, rehydrate on a second browser, and continue unrelated note/goal operations when one note conflicts.
- **Notes:** From S035 domain rollout 5. Depends on T157.7 and the note portion of T155.13.

### [T157.9] Trigger synchronization without disrupting active practice

- **Area:** Synchronization lifecycle
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Wire login, foreground, local mutation, reconnection, and manual-retry triggers into the coordinator with debouncing/coalescing appropriate to each event and an explicit guard against synchronization effects changing Sesh state.
- **Exit criteria:** Integration tests fire overlapping login/foreground/reconnect/local-mutation/manual events and prove they coalesce into single-flight runs, offline events remain pending, foreground during every active Sesh status leaves the Sesh state machine unchanged, and unmount/logout cancels subscriptions and stale work.
- **Notes:** From S035. Depends on T157.4–T157.8. Do not add Realtime subscriptions.

### [T158] Protect logout when account changes are unsynchronized

- **Area:** Authentication / synchronization boundary
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Upgrade current-device logout to inspect the current identity's durable outboxes and offer Retry, Cancel, or Discard and log out, then clear in-memory account state without exposing or submitting it under the guest namespace.
- **Exit criteria:** Provider/browser tests cover no-pending logout, successful Retry then logout, failed Retry with the prompt retained, Cancel, explicit Discard, offline behavior, and identity changes during the prompt; other-device sessions remain signed in and subsequent guest/user identities cannot access discarded account cache or operations.
- **Notes:** From S038. Depends on T154.2, T156.3, and T157.9. Account-deletion cleanup is separate in T161.5.

### [T159] Merge guest data into new or existing accounts

- **Area:** Guest conversion
- **Priority:** High
- **Status:** Not started
- **Description:** Import guest data through explicit, resumable merge rules without clearing any local source record before server acknowledgement.
- **Notes:** Umbrella from S036. Complete T159.1–T159.5. Depends on T157 and the identity isolation established by T156.

### [T159.1] Model resumable guest import and preview its scope

- **Area:** Guest import orchestration
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Add an explicit import state machine and durable progress record that inventories guest/cloud counts by domain before mutation, owns an import identity, and can resume after reload or network loss.
- **Exit criteria:** State-machine tests cover inventory, awaiting confirmation, uploading, awaiting profile choice, conflicts, interruption, resume, completion, cancellation, and identity change; the UI shows accurate per-domain local/cloud counts before any guest record is uploaded.
- **Notes:** From S036. Depends on T157.9. Keep effects/clocks/network calls outside the reducer.

### [T159.2] Import all guest data into a new empty account

- **Area:** Guest-to-new-account import
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Implement the empty-account path using the standard outboxes/repositories, preserving operation IDs and source guest data until each domain's records are acknowledged.
- **Exit criteria:** Integration tests import fixtures spanning all five local domains into an empty account, simulate interruption and lost acknowledgements at each domain boundary, resume without duplicates, rehydrate the complete result in another browser, and retain every unacknowledged guest record locally.
- **Notes:** From S036. Depends on T159.1.

### [T159.3] Merge immutable records and trick state into an existing account

- **Area:** Guest-to-existing-account merge
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Implement deterministic union rules for immutable practice records, focused/manually-laced trick state, identical IDs/payloads, and non-conflicting custom tricks, goals, and notes when the target account already contains data.
- **Exit criteria:** Table-driven tests cover disjoint, identical, and overlapping fixtures for every domain; distinct immutable records and trick states union, identical IDs/payloads deduplicate, no target data is silently overwritten, and same-ID/different-payload records are emitted as conflicts.
- **Notes:** From S036. Depends on T159.2.

### [T159.4] Let users choose profile preferences and resolve import conflicts

- **Area:** Guest merge decisions
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Add the explicit choice between guest and cloud profile/preferences plus per-record handling for same-ID/different-payload import conflicts, with no implicit last-write-wins fallback.
- **Exit criteria:** Browser/state tests present complete profile/preference comparisons, persist the chosen source, resolve each conflicting record independently, allow unrelated records to continue, and prevent completion while an acknowledged required choice remains unresolved.
- **Notes:** From S036. Depends on T159.3. Reuse the conflict primitives planned for T160 where practical without coupling the two flows prematurely.

### [T159.5] Finalize guest import only after acknowledgements

- **Area:** Guest import recovery
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Complete resumability and cleanup so acknowledged source records are tracked durably, retries cannot duplicate server data, and the guest namespace is cleared only after all accepted records and choices are confirmed.
- **Exit criteria:** Fault-injection tests interrupt every import phase, restart with the same import identity, and prove accepted records are not duplicated, rejected/unresolved records remain available, guest data is never cleared early, and successful completion switches to the account namespace with a matching second-browser dataset.
- **Notes:** From S036. Depends on T159.2–T159.4.

### [T160] Expose synchronization health and record-level conflict recovery

- **Area:** Synchronization UX
- **Priority:** High
- **Status:** Not started
- **Description:** Make pending work, failures, offline state, freshness, retry, and conflicts understandable without allowing one bad record to stop unrelated synchronization.
- **Notes:** Umbrella from S037. Complete T160.1–T160.3. Depends on T157.

### [T160.1] Add a trustworthy synchronization status model and Profile surface

- **Area:** Profile / sync status
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Derive a serializable user-facing status from coordinator/outbox facts—last successful sync, pending count, syncing, offline, retryable failure, and conflicts—and render it in Profile with a manual retry action.
- **Exit criteria:** Selector and component tests cover every mutually exclusive/combined state, pluralization and timestamps, retry dispatch, reload persistence, and identity changes; the UI never reports "synced" while pending or conflicting operations exist.
- **Notes:** From S037. Depends on T157.9. Keep transient runtime handles outside provider/domain state.

### [T160.2] Add per-record conflict resolution

- **Area:** Synchronization conflicts
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Add `/app/profile/sync-conflicts` with typed comparisons and explicit local/server resolution for profile, custom-trick, goal, and note conflicts, while immutable-session duplicates follow their deterministic identity rule.
- **Exit criteria:** Route/state tests render representative conflicts for every mutable resource, apply either resolution as a new revision-aware operation, persist unresolved conflicts across reload, remove only resolved items, and leave unrelated outbox operations running.
- **Notes:** From S037. Depends on T160.1 and T157.4–T157.8. No automatic last-write-wins option.

### [T160.3] Prove stale revisions and tombstones cannot block or resurrect unrelated data

- **Area:** Synchronization conflict testing
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Add a cross-domain fault-injection suite for concurrent edits, stale revisions, delete-vs-edit tombstones, lost acknowledgements, and conflicts interleaved with valid operations.
- **Exit criteria:** The suite proves only the conflicting record pauses, accepted operations advance and apply server metadata, stale clients cannot resurrect tombstoned goals/notes/custom tricks, retries remain idempotent, and conflict resolution converges two browser fixtures on identical domain state.
- **Notes:** From S037. Depends on T160.2 and T155.8.

---

_Phase 4 activation: T161 comes from S039 and `BACKEND_ROADMAP.md` Phase 4. Its five S-sized children separate the privileged Edge Function boundary, abuse/leakage hardening, destructive-operation security acceptance tests, the confirmation UI, and identity-safe local cleanup/recovery. User-facing export and delayed deletion remain excluded._

### [T161] Add immediate, recoverable account deletion

- **Area:** Account deletion
- **Priority:** High
- **Status:** Not started
- **Description:** Let an authenticated user permanently remove the Auth identity and every application row, then return to a clean guest workspace even when the success response is lost.
- **Notes:** Umbrella from S039. Complete T161.1–T161.5. User-facing data export is excluded.

### [T161.1] Implement the authenticated delete-account Edge Function

- **Area:** Supabase Edge Function
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Add `POST /functions/v1/delete-account` in plain JavaScript with JSDoc and runtime request validation; require a valid JWT, fetch trusted identity server-side, validate `currentPassword` plus exact `DELETE`, and use the service-role client only inside Supabase secrets to remove the Auth user.
- **Exit criteria:** Local function tests prove valid input returns `204` and cascades all application rows, while missing/invalid JWTs, malformed bodies, wrong confirmation, wrong passwords, and attempts to supply another identity are rejected; the service-role key is absent from app environment values and web bundles.
- **Notes:** From S039 and the roadmap Edge Function contract. Depends on T155.7 and T153.5.

### [T161.2] Harden deletion against abuse, leakage, and lost responses

- **Area:** Account deletion security
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Add per-user/IP rate limiting, current-password verification without retaining the resulting session, `Cache-Control: no-store`, structured redaction, and idempotent handling for a retry whose Auth user is already absent after a lost success response.
- **Exit criteria:** Function tests enforce the configured attempt limit for user and IP dimensions, expose no password/JWT/email/body in logs, include `no-store` on every response, never return the verification session, and treat a verified retry for an already-deleted identity as completed rather than recreating or leaking state.
- **Notes:** From S039. Depends on T161.1. Use a trusted server-side identity; never rate-limit or delete based on caller-supplied `user_id`.

### [T161.3] Prove cascade deletion and old-session denial

- **Area:** Account deletion testing
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Add backend acceptance tests for complete cascade cleanup and calls from anonymous, expired, wrong-user, stale, and pre-deletion sessions, including attempts to recreate rows with an old JWT.
- **Exit criteria:** Against a clean local reset, fixtures populate all six resources for two users; deleting user A removes only A, user B remains intact, every old user-A token is denied, foreign keys/policies prevent row recreation, and simulated response loss followed by retry converges on the same empty result.
- **Notes:** From S039. Depends on T161.2 and T155.8.

### [T161.4] Add the permanent account-deletion route

- **Area:** Account deletion UI
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Add `/app/profile/account/delete` with an explicit immediate/permanent warning, current-password field, exact typed `DELETE` confirmation, safe disabled/loading/error states, and invocation of the hardened Edge Function.
- **Exit criteria:** Route tests and a browser walkthrough confirm the action cannot submit without both confirmations, wrong/offline/rate-limited/expired states are actionable without leaking account facts, success cannot be double-submitted, and no password or token reaches logs, analytics, or the URL.
- **Notes:** From S039. Depends on T161.2 and T154.1. Do not add export or delayed-deletion semantics.

### [T161.5] Purge account state and reconcile deletion response loss

- **Area:** Account lifecycle / local persistence
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** On deletion success—or after a lost response when Auth verification proves the user no longer exists—remove credentials, account cache, outboxes, conflicts, import progress, and sync metadata, invalidate the identity generation, and enter a fresh guest namespace.
- **Exit criteria:** Integration tests cover normal success, response loss with missing user, response loss with user still present, offline retry, and a late in-flight sync result; completed deletion exposes no former account data to the new guest, does not erase unrelated guest/other-user namespaces, and cannot be reversed by stale work.
- **Notes:** From S039. Depends on T156.3, T158, T159.5, T160.2, and T161.4. AsyncStorage purge is accepted prototype cleanup, not claimed forensic erasure.

---

_Phase 5 consideration: no cross-platform account-hardening ticket is activated. S040 remains `Proposed` in [BACKLOG_STORIES.md](BACKLOG_STORIES.md) because [AGENTS.md](AGENTS.md) makes web the only active platform until mobile hardening is explicitly resumed. Native PKCE callbacks, SecureStore Auth storage, and iOS/Android verification therefore remain deliberately deferred rather than being disguised as actionable web work._

---

_Phase 6 activation: T162 comes from S041 and `BACKEND_ROADMAP.md` Phase 6. Its eight S-sized children turn “ready for first external account” into an inspectable hard gate: report-only then enforced CSP, CI scanning, hosted authorization/abuse review, production-environment reproduction, synthetic capacity evidence, a tested recovery decision, and explicit launch approval. It depends on completed Phase 1–4 evidence and does not claim that usage metrics exist before signup._

### [T162] Enforce the first-external-user launch gate

- **Area:** Security / operations
- **Priority:** High
- **Status:** Not started
- **Description:** Keep external signup disabled until web security, abuse controls, production isolation, deliverability, capacity, recovery, and the complete acceptance suite have recorded evidence.
- **Notes:** Umbrella from S041. Complete T162.1–T162.8 after the applicable T153–T161 work. This is a hard gate, not a speculative scale-up project.

### [T162.1] Deploy and evaluate a report-only Content Security Policy

- **Area:** Web security headers
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Add a minimally permissive report-only CSP for the static Expo/Vercel app, covering only required Daily Dama, Supabase, Vercel Analytics, font/asset, and development origins; audit raw-HTML sinks and sanitize or remove any path that could inject note/custom-trick content.
- **Exit criteria:** The production-like web export serves the report-only policy, automated header checks reject unlisted script/connect/frame origins, browser walkthroughs cover Auth and core app routes with no unexplained violations, and tests prove untrusted note/custom-trick text cannot become executable HTML.
- **Notes:** From S041 and roadmap client/web security. Depends on the final web Auth/sync origin set. Start report-only; enforcement is T162.2.

### [T162.2] Enforce CSP and the remaining defensive web headers

- **Area:** Web deployment security
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Promote the validated CSP to enforcement and add HSTS, `frame-ancestors`, `X-Content-Type-Options`, `Referrer-Policy`, and a restrictive `Permissions-Policy` through the deployed Vercel/static-host configuration.
- **Exit criteria:** Automated checks against a production preview confirm every HTML route returns the exact enforced headers, an inline/unlisted script and framing attempt are blocked, Auth callbacks and Supabase requests still work, and browser console/network inspection shows no new policy failures across the core web flow.
- **Notes:** From S041. Depends on T162.1. Preserve the static Expo Router rewrites documented in `DEPLOYMENT_HANDOFF.md` and `vercel.json`.

### [T162.3] Add dependency, secret, and built-bundle scanning to CI

- **Area:** CI security
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Extend `.github/workflows/ci.yml` with pinned, least-privilege dependency and secret scanning plus a built-web-bundle check for service-role keys, SMTP secrets, Auth sessions, and other forbidden server values.
- **Exit criteria:** CI passes on the clean repository, fails on representative committed-secret and generated-bundle fixtures in an isolated test, reports actionable locations without echoing secret values, and runs for pull requests to `development`/`main` without gaining write permissions.
- **Notes:** From S041 and roadmap client security. Select free tooling compatible with the existing GitHub workflow; do not add paid observability.

### [T162.4] Audit deployed Supabase authorization and Auth abuse controls

- **Area:** Supabase launch security
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Run Security Advisor, manually review exposed schemas/functions/grants/RLS, enable CAPTCHA, and verify Auth plus Edge Function rate limits before any external account is allowed.
- **Exit criteria:** A dated, secret-free launch record contains Security Advisor results, an operation-by-operation grants/RLS/function review, successful CAPTCHA challenge tests, measured Auth/delete-account rate-limit behavior, and zero unresolved High/Critical findings; raw cross-user negative tests pass against the hosted environment.
- **Notes:** From S041. Depends on T155.8, T153.13, and T161.3. Paid leaked-password protection remains unavailable under the free constraint.

### [T162.5] Reproduce the tested backend in the reserved production environment

- **Area:** Production backend / email
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Create the reserved production Supabase project from the tested migrations, configure only exact production redirects and secrets, reproduce Resend SMTP/DNS settings without seeding user data, and verify environment separation from development.
- **Exit criteria:** Production migration hashes/types match the tested source, only structural/static reference data exists, development credentials cannot access production and vice versa, SPF/DKIM/DMARC and no-link-tracking checks pass, and a controlled production signup/recovery/delete smoke test completes without exposing secrets.
- **Notes:** From S041. Depends on T153–T161 and T162.4. Creating this project is deliberately deferred until the schema and security suite are stable.

### [T162.6] Exercise representative multi-year capacity and pagination

- **Area:** Backend capacity validation
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Generate a representative synthetic account containing multi-year practice history plus realistic custom tricks, goals, notes, tombstones, and outbox churn; measure storage, query pagination, sync convergence, and Edge usage without real user data.
- **Exit criteria:** A reproducible script/report records fixture size, database bytes, request/egress counts, page counts, full and incremental sync duration, and deletion duration; all queries return deterministically beyond 1,000 rows and results identify any free-tier limit that would block the first 25 accounts.
- **Notes:** From S041 and roadmap Phase 6. Depends on T157–T161. This is a synthetic check, not speculative production optimization.

### [T162.7] Make and test the free-tier recovery decision

- **Area:** Data recovery operations
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Choose and document the acceptable pre-launch recovery procedure for Supabase Free, including off-site logical dumps, frequency, storage location, restoration ownership, and the explicit data-loss window; do not silently assume inaccessible automatic backups are sufficient.
- **Exit criteria:** A sanitized production-like logical dump is created off-site, restored into a fresh temporary project from documented commands, schema and row-count/checksum checks pass, measured recovery time and recovery-point objective are recorded, and the product owner explicitly accepts or rejects the resulting risk before signup is enabled.
- **Notes:** From S041. Depends on T162.5–T162.6. Backup automation remains optional until this decision shows it is necessary.

### [T162.8] Record launch approval and the first infrastructure-review trigger

- **Area:** Launch operations
- **Priority:** High
- **Status:** Not started
- **Planning:** Required
- **Description:** Assemble evidence from the complete backend/frontend/security verification matrix, keep external signup disabled until every hard gate is signed off, and define how the first review is triggered at 25 authenticated accounts or 30 days after first signup.
- **Exit criteria:** A dated launch checklist links passing evidence for Auth states, generic responses, offline/outbox recovery, sync races, cross-account isolation, merges, conflicts, deletion, grants/RLS, headers, deliverability, capacity, secret scans, and recovery; signup enablement is recorded only after all gates pass, and the earlier-of-25-accounts/30-days review has an owner and measurable inputs.
- **Notes:** From S041. Depends on T162.1–T162.7 and all applicable T153–T161 children. Metrics are operational counts only; no unsupported claim of existing-user behavior is permitted.
