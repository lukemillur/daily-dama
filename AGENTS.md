# Expo documentation

Treat the Expo and Expo Router versions installed in this repository as the implementation source of truth.

Consult the matching versioned Expo documentation when an Expo API is unfamiliar, its behavior may be version-sensitive, or a change materially depends on Expo-specific behavior. Routine React, React Native, styling, and application-code changes do not require a documentation lookup solely because this is an Expo project.

# Working agreement

## Collaboration style

Treat me as an experienced engineer (5 years RN/Expo, CS background), not a beginner — skip foundational explanations of components, state, or routing. I'm newer to Expo Router specifically, TypeScript-as-design-tool, and to agentic workflows themselves (plan mode, subagents, delegating implementation) — be explicit about *those* when relevant.

Act as a candid partner, not just an implementer. Execute what I ask faithfully, but flag better product/UX/technical approaches when you see them — clearly separate what I asked for from your recommendation. Challenge scope creep, unnecessary complexity, and weak product reasoning directly, with a concrete alternative attached, not a vague objection. Don't repeat a challenge I've already declined without new evidence.

I retain final say on product and technical decisions.

Teach transferable concepts as we build — grounded in the code we're actually touching, not abstract lectures. Tell me to dial it down if it's excessive.

## Autonomy

Full autonomy for routine implementation: creating/editing/refactoring, fixing closely related defects, minor nearby cleanup. Don't stop for small decisions — make a reasonable call, note material assumptions afterward.

Propose a plan first for changes that would materially affect the state/persistence domain boundaries below, auth, the managed-workflow choice, or a real expansion of what was asked for.

## Iteration and scope

At the start of a meaningful chunk of work, say what "good enough for this iteration" looks like and protect that boundary — note deferred ideas rather than folding them in. Near the end, separate essential finishing work from worthwhile polish from next-iteration material.

# Daily Dama project handoff

## Current product shape

Daily Dama is a local-first Expo prototype for choosing Kendama tricks, running open-ended or timed practice sessions ("Seshes"), and reviewing accumulated practice Stats.

The primary web navigation order is Home, Sesh, Tricks, Stats, Profile. Tricks is the authoritative route for browsing, selecting, creating, editing, and deleting tricks. Profile covers assessed Kentei rank display, Account sign-up/sign-in, a Kentei assessment entry point, theme customization with contrast ratios, a daily-streak setting, and a feedback link; do not restore the trick directory there unless the product direction changes.

Standard Kentei data lives in `src/features/tricks/data/kendama-kentei-tricks.ts`. The checked-in CSV and review artifacts under `data/` and `outputs/` are source/review material, not runtime state.

## State and persistence boundaries

There are five independent persistent domains, each backed by AsyncStorage and a provider in `src/app/app/_layout.tsx`:

- User profile: onboarding status, assessed Kentei rank, and selected trick IDs.
- Custom tricks: standalone custom tricks and custom sequences.
- Practice history: immutable completed-Sesh records used to derive Stats.
- Goals: user-authored practice goals and their completion state.
- Notes: user-authored trick and session notes.

Each domain owns its reducer, runtime validation, local persistence adapter, cloud mapping, reconciliation policy, and recovery semantics. Identity-scoped storage, sync envelopes, outboxes, the sync coordinator, and guest import are shared infrastructure around those domains rather than additional domain stores. Writes pass through `createWriteQueue` in `src/shared/persistence/storage.ts` to preserve ordering. Do not combine these domains into a global store merely because they are all persistent, and do not let shared sync infrastructure become the authority for domain rules.

Adding or materially changing a persistent domain requires updating the current architecture documentation and the shared persistence/sync contract coverage in the same change. Preserve domain ownership even when consolidating repeated orchestration.

The providers deliberately wait for hydration and skip the first persistence effect. This prevents initial empty state from overwriting restored data and also prevents the server-rendered app from exposing partially hydrated UI. Preserve this behavior when changing provider setup.

Practice-history records store snapshots of trick ID and name. Consequently, editing or deleting a custom trick must not rewrite historical Stats. Completed Sesh recording is deduplicated in the Sesh component and again by the history reducer.

### Durability and failure semantics

An in-memory state transition is not evidence that a user mutation is durable. When a workflow depends on local or remote persistence, report success only after the required write has completed successfully. Preserve structured failure results through every abstraction layer; do not convert failure-bearing operations to `Promise<void>`, discard a durability-critical promise with `void`, or log a failure while allowing the caller to proceed as if it succeeded.

Destructive, identity-changing, and data-transfer workflows must fail closed. Logout, account deletion, pending-change discard, import, and equivalent transitions may advance only after their durability prerequisites succeed. Cover these flows with fault-injection tests that prove the transition stops and the user receives actionable recovery guidance when a prerequisite fails.

## Custom-trick model invariants

The custom-trick document currently uses `version: 1`, and its schema remains provisional only while the project has no external-user data that must be preserved. During that phase, an incompatible prototype reset may be proposed explicitly rather than hidden inside ordinary implementation work. Once real user data exists, persisted-schema changes require backward compatibility, a migration, or explicit owner approval for data loss. Do not introduce migration infrastructure or a v2 document before the team intentionally freezes a release-ready contract, but do not treat this prototype exception as permanent permission to discard user data.

Sequence steps are a discriminated union:

- `existingTrick` stores both `sourceTrickId` and a name snapshot.
- `customText` stores a manually entered name.

The stored name snapshot is authoritative. Rendering a sequence must not resolve its step names from current source tricks, because referenced tricks may later be renamed or deleted.

Sequences may reference standard tricks and standalone custom tricks, but not other sequences. Keep this rule centralized through `selectSequenceStepCandidates`; nested sequences would require explicit cycle, editing, deletion, and rendering semantics that are outside the current prototype.

Custom tricks use stable generated IDs unrelated to editable names. Ranked custom tricks sort after all standard tricks at the same rank. Unranked custom tricks appear in the final Custom section.

The perceived Kentei rank is a number from 1 through 12 or `undefined`. Creation and editing use the visual radio-style rank picker; do not replace it with numeric text input. Selection meaning must remain available through labels and selection indicators rather than color alone.

## Sesh and Stats behavior

`PracticeTrick` is the lightweight snapshot passed into the Sesh state machine. Custom sequences additionally carry `sequenceSteps` as name strings so selection, countdown, active practice, and the completion summary can render without querying the custom-trick store.

The Sesh reducer is the authority for countdown, active, and completed transitions. Timed sessions count down and complete at their exact deadline; an early end records actual elapsed practice time. Keep timer effects and `Date.now()` calls outside the reducer and pass timestamps through actions.

Stats are derived from completed practice-history records rather than maintained as mutable totals. Preserve this derivation so totals cannot drift from session history.

## Module and responsibility boundaries

Expo Router files are route entry points and composition roots, not reusable component libraries. Feature modules must not import reusable UI, domain utilities, or state machinery from `src/app`; move reusable code into the owning feature or an intentionally shared layer. Likewise, do not place cross-feature domain formatting or computation in a presentation component merely because that component was its first consumer.

File length alone is not a defect. Treat a component or hook as under architectural pressure when it coordinates several independent effect systems, owns unrelated workflows, or must change for otherwise independent product behavior. Before adding another responsibility, separate orchestration, domain computation, persistence, and presentation while preserving the reducer or state machine as the authority for meaningful transitions.

Repetition becomes an architectural concern when stateful or correctness-critical behavior appears in three or more domains. Before adding another copy, review whether a shared kernel or contract is warranted, characterize existing behavior with tests, and preserve domain-specific policies behind typed boundaries. Do not generalize purely visual similarity unless drift is already causing defects or material maintenance cost.

## Errors and asynchronous workflows

Async provider and service APIs must handle failures consistently: return typed outcomes for expected failures or reject for unexpected failures, without silently mixing the two contracts. Submission handlers must use `finally` or equivalent total control flow so loading and disabled states always recover. Expected failures need actionable user feedback and a retry or safe exit where appropriate; unexpected render failures need a route-level recovery surface. Logging is diagnostic evidence, not user-facing recovery, and sensitive values must be redacted before reaching logs or telemetry.

## Verification and local development

Use Yarn. Verification is risk-based: use the narrowest trustworthy evidence
while iterating, then escalate according to the changed boundary. Do not run the
complete app sequence merely because a task is being completed.

- **App UI/routes:** exact component and route tests while iterating; relevant
  feature tests plus full `yarn tsc --noEmit` before completion. Run a web export
  when routing, bundling, assets, Expo configuration, or dependencies can be
  affected.
- **Domain/state:** exact model tests while iterating; all model tests in the
  affected domain plus full typechecking before completion.
- **Persistence/sync:** affected domain persistence, mapping, envelope, and hook
  tests plus the relevant shared persistence/sync contracts. Escalate to the
  complete app suite for hydration, identity, write ordering, provider hierarchy,
  concurrency, or cross-domain changes.
- **Supabase/Auth/security:** use their dedicated suites documented in
  `supabase/README.md` and `security/README.md`. Do not substitute the app Jest
  suite for a real database, Auth, or browser security boundary.
- **Workflow tooling:** exact Node test files while iterating and
  `yarn test:workflow` before completion; app verification is unnecessary unless
  app code/configuration also changed.
- **Configuration/dependencies:** run the complete app sequence plus any
  dedicated dependency, security, or platform checks affected by the change.
- **Documentation only:** inspect commands, links, and referenced paths. No app
  suite is required unless the documentation changes an executable workflow
  contract.

Verification must cover every affected trust and runtime boundary, not only the layer where the implementation lives:

- **User-entered data:** align UI constraints, domain and persisted-document validation, cloud mapping, and database constraints. UI validation is not a security or integrity boundary.
- **Authorization:** verify guest and authenticated database behavior with the dedicated Supabase suites; UI visibility does not prove authorization.
- **Dynamic web routes:** verify router behavior, production-host rewrites, direct navigation, and hard refresh for every affected route shape.
- **External SDKs and CLIs:** cover thrown exceptions, structured failure results, exit status, and actionable reporting. A resolved process is not necessarily a successful operation.
- **Telemetry and network endpoints:** verify data minimization/redaction, consent or default state, CSP/connect policy, and deployed headers together.
- **Destructive workflows:** inject prerequisite failures and prove that the irreversible transition does not occur.

Use `yarn eslint <changed-files...>` for a scoped lint pass during iteration.
TypeScript changes normally receive the full typecheck because it is fast and
indirect type dependencies are not safely file-selectable.

Treat lint and formatting debt as a ratchet rather than a reason for unrelated churn. Changed production files must introduce no new lint warnings; resolve existing warnings in substantially edited code when safe, and explain any narrow suppression. Repository-wide warning removal and formatting-tool adoption belong in dedicated changes. Do not combine a mass reformat with functional work.

The complete app sequence, reserved for release/foundational/configuration/
dependency changes and conservative escalation, is:

```sh
yarn test --runInBand
yarn lint
yarn tsc --noEmit
yarn expo export --platform web --output-dir /tmp/daily-dama-web-export
```

`node .claude/scripts/verify.mjs` runs all four in order as one command, prints
one line per step, and on failure prints the failing command's output and exits
non-zero. `--test-file <path>` is repeatable and runs exact Jest files only;
`--skip-export` omits export; `--only <step>` selects named steps; `--json`
returns machine-readable evidence. Successful logs do not need to be inspected.

For task branches, the relevant local evidence and exit criteria must pass before
opening the PR. CI's full app checks must then pass before squash-merging into
`development`; this replaces mandatory local full-suite repetition for narrow
changes. CI is an automated gate, not a human review gate.

For tickets in `TASKS_COLLABORATIVE.md`, the owner-approved preparation-PR exception allows a PR after all applicable local checks pass while explicitly listed hosted criteria remain pending. Keep the ticket open until hosted verification passes. Required CI still applies to merging, and existing owner authorization is still required for collaborative Git publication and production deployment; this exception changes evidence timing, not action permissions.

The workflow tooling under `.claude/scripts/` has its own dependency-free test suite, separate from the app's jest suite: `yarn test:workflow`.

For browser verification, run the Expo development server rather than serving the static export with a generic file server. Expo Router's extensionless routes such as `/tricks` need appropriate fallback/routing behavior. If the usual port is occupied, select another explicit port instead of assuming the page at that port belongs to this repository.

The five-link web navigation has been measured to fit a 320 px viewport. Recheck that width whenever labels, gaps, or padding change. Two known-benign warnings exist (`useNativeDriver` fallback, styled-components/native media-query) — don't assume a *new* warning or runtime error is one of these without checking.

The minimum web UX baseline includes keyboard-operable controls; programmatic labels, descriptions, errors, and state; announced asynchronous success and failure feedback; intentional focus movement after modal closure, destructive confirmation, and meaningful screen changes; and explicit loading, empty, error, and retry states. Formal compliance work may be scoped separately, but new flows must not omit these foundations.

### Active platform scope

Web is the only active implementation and verification target. iOS and Android are deliberately deferred until the user explicitly resumes mobile hardening in the current conversation.

- Do not launch or use an iOS simulator, Android emulator, Expo Go, a development build, or mobile-device tooling without that explicit instruction.
- Do not make iOS- or Android-specific code, configuration, dependency, build, or native-project changes without that explicit instruction.
- A task's mention of iOS, Android, native checks, or eventual cross-platform support does not itself authorize mobile work. For a web task with stale native verification wording, verify web and automated behavior only, then record native validation as deferred. For a task whose core purpose is native hardening, stop and report that it is deferred rather than claiming or implementing it.
- Continue to keep React Native code portable where that is low-cost, but do not spend iteration time validating it on mobile platforms.

## Active work

Core-functionality work in progress is tracked in [TASKS.md](TASKS.md) — check it before starting session work in this area. It's the checkpoint mechanism across context compaction and new sessions: scan it top to bottom at summary depth (entry title and status) to find the right entry, then read that entry's full description, exit criteria, and notes before touching code — don't load every entry's full body just to triage which one to work on. Update the file in the same commit that closes a task. Trick visualization is deliberately excluded from it; see below.

Tasks requiring owner decisions or external verification live in [TASKS_COLLABORATIVE.md](TASKS_COLLABORATIVE.md), outside automatic claiming. Use the repository's [guided-ticket skill](.agents/skills/guided-ticket/SKILL.md) for one such ticket at a time, retaining its step-by-step execution guide at `outputs/guided-tickets/<ID>.md`. These tickets follow the existing Git authority rules; the new queue does not extend the automatic push/merge exception below. Allocate task IDs across this queue, `TASKS.md`, `TASKS_BACKLOG.md`, and `TASKS_DONE.md`.

## Documentation and code-history hygiene

Keep `AGENTS.md` focused on durable working rules and current architectural invariants; keep the current system inventory and data flows in `ARCHITECTURE.md`; keep specialized operational constraints in feature handoffs; and keep planned and completed work in the task queues. Architecture-affecting changes must update the appropriate current-state documentation in the same change.

Production comments should explain a present-tense invariant, constraint, or non-obvious tradeoff. Do not preserve ticket chronology or obsolete future-work descriptions in production code when the current reason can be stated directly. When removing apparently unused routes, assets, or components, first confirm references and whether the item is an intentional development tool; dead-code cleanup should be explicit rather than incidental.

## Feature-specific handoffs

Some areas have their own root-level handoff document. Read the relevant one before working in that area rather than re-deriving it:

- [.claude/scripts/README.md](.claude/scripts/README.md) — the `newTicket` workflow's deterministic tooling (claim/resume, verification wrapper, worktree cleanup, config validation) and the agent/skill boundaries around it.
- [TRICK_VIZ_HANDOFF.md](TRICK_VIZ_HANDOFF.md) — procedural 3D trick visualization (`src/features/trick-viz/`). Verified kendama geometry, the ken-pose abstraction, keyframe/easing pitfalls, the verlet string, and environment traps (React Compiler, stale console buffers, sandbox access gating).
- [DEPLOYMENT_HANDOFF.md](DEPLOYMENT_HANDOFF.md) — web deploy to dailydama.com.
- [supabase/README.md](supabase/README.md) — local Supabase Auth CLI configuration: rebuild/reset workflow, local policy (verified email, 10-character password minimum, one-hour JWTs, fixed `localhost:8081/auth/callback`), and manual REST/Mailpit verification.
- [security/README.md](security/README.md) — the report-only web Content Security Policy: policy rationale, the raw-HTML sink audit guard, and the header-check/Playwright/manual verification commands.

# Git state expectations

Focused local commits are welcome and make agent work easier to audit. Never push automatically, **except** within the multi-agent protocol in [TASKS.md](TASKS.md) § Working across multiple agents, and scoped strictly to an agent's own `task/T0NN-*` branch: pushing a brand-new branch to stake a claim, pushing further work commits to that same branch, opening a PR from it into `development`, and squash-merging that PR into `development` are all allowed without asking — this is the one exception to "never merge automatically." A rejected claim push is the protocol's own collision detector, and none of this ever touches `main` or `production` directly. Promoting `development` into `main`, pushing to `main`/`production` directly, any `--force`, and anything outside an agent's own claimed branch still require the usual confirmation. Preserve unrelated work and inspect `git status` before editing. Recent persistence, custom-trick, Tricks-route, and Sesh work is intentionally split into focused commits, so consult `git log` when the reasoning behind a boundary is unclear.

Merge strategy differs by target: task branches merge into `development` by squash (kept above). Promotions of `development` into `main` and `main` into `production` merge by **merge commit**, not squash, so individual PR history survives the promotion and stays reviewable later. This only applies going forward — history before the PR #285/#331 promotions was already squash-flattened and stays that way.
