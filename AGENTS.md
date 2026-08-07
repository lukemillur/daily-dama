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

The primary web navigation order is Home, Sesh, Tricks, Stats, Profile. Tricks is the authoritative route for browsing, selecting, creating, editing, and deleting tricks. Profile is intentionally only a placeholder; do not restore the trick directory there unless the product direction changes.

Standard Kentei data lives in `src/features/tricks/data/kendama-kentei-tricks.ts`. The checked-in CSV and review artifacts under `data/` and `outputs/` are source/review material, not runtime state.

## State and persistence boundaries

There are three independent persistent domains, each backed by AsyncStorage and a provider in `src/app/_layout.tsx`:

- User profile: onboarding status, assessed Kentei rank, and selected trick IDs.
- Custom tricks: standalone custom tricks and custom sequences.
- Practice history: immutable completed-Sesh records used to derive Stats.

Each domain owns its reducer, runtime validation, persistence adapter, and hydration fallback. Writes pass through `createWriteQueue` in `src/shared/persistence/storage.ts` to preserve ordering. Do not combine these domains into a global store merely because they are all persistent.

The providers deliberately wait for hydration and skip the first persistence effect. This prevents initial empty state from overwriting restored data and also prevents the server-rendered app from exposing partially hydrated UI. Preserve this behavior when changing provider setup.

Practice-history records store snapshots of trick ID and name. Consequently, editing or deleting a custom trick must not rewrite historical Stats. Completed Sesh recording is deduplicated in the Sesh component and again by the history reducer.

## Custom-trick model invariants

The custom-trick document currently uses `version: 1`, but its schema is explicitly provisional during prototyping. It is acceptable to change this v1 shape in place and let obsolete prototype data recover to an empty custom-trick collection. Do not introduce migration infrastructure or a v2 document until the team intentionally freezes a release-ready v1 contract.

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

## Verification and local development

Use Yarn. The standard verification sequence is:

```sh
yarn test --runInBand
yarn lint
yarn tsc --noEmit
yarn expo export --platform web --output-dir /tmp/daily-dama-web-export
```

At the time of this handoff, the suite contains 9 test suites and 78 behavioral tests. Update this note if the suite structure changes materially; do not treat the exact count as a quality target.

For browser verification, run the Expo development server rather than serving the static export with a generic file server. Expo Router's extensionless routes such as `/tricks` need appropriate fallback/routing behavior. If the usual port is occupied, select another explicit port instead of assuming the page at that port belongs to this repository.

The five-link web navigation has been measured to fit a 320 px viewport. Recheck that width whenever labels, gaps, or padding change. Existing React Native Web development warnings include the animated `useNativeDriver` fallback and styled-components/native media-query warnings; neither currently prevents the verified layout from functioning, but new warnings or runtime errors should not be dismissed as the same issue without checking.

Web is the current first verification surface. iOS and Android remain required eventual targets, but this iteration has not yet received deliberate device hardening.

## Feature-specific handoffs

Some areas have their own root-level handoff document. Read the relevant one before working in that area rather than re-deriving it:

- [TRICK_VIZ_HANDOFF.md](TRICK_VIZ_HANDOFF.md) — procedural 3D trick visualization (`src/features/trick-viz/`). Verified kendama geometry, the ken-pose abstraction, keyframe/easing pitfalls, the verlet string, and environment traps (React Compiler, stale console buffers, sandbox access gating).
- [DEPLOYMENT_HANDOFF.md](DEPLOYMENT_HANDOFF.md) — web deploy to dailydama.com.

# Git state expectations

Focused local commits are welcome and make agent work easier to audit. Never push automatically. Preserve unrelated work and inspect `git status` before editing. Recent persistence, custom-trick, Tricks-route, and Sesh work is intentionally split into focused commits, so consult `git log` when the reasoning behind a boundary is unclear.
