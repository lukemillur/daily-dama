# Daily Dama

A practice companion for kendama players. Pick tricks from the standard Kendama Kentei ladder or your own custom tricks and sequences, run open-ended or timed practice sessions ("Seshes"), and track progress through goals, notes, and Stats derived from your session history.

**Live:** [www.dailydama.com](https://www.dailydama.com)

Built with Expo SDK 57, Expo Router, React 19, TypeScript (strict), styled-components, and Supabase. Web is the active platform; the code stays React Native–portable for later iOS and Android hardening.

## Architecture in one paragraph

Daily Dama is **local-first with optional cloud sync**. Guests use the app fully offline: state lives in AsyncStorage (`localStorage` on web). Signing up imports guest data into Supabase, and later changes sync through per-domain outboxes. State is split into five independent persistent domains (user profile, custom tricks, practice history, goals, notes). Each one owns its reducer, runtime validation, storage adapter, cloud mapping, and conflict policy. Shared infrastructure (identity-scoped storage, sync envelopes, outboxes, a sync coordinator) wraps those domains but holds no domain rules. Practice history is an immutable log, and every Stat, streak, personal best, and rank promotion is derived from it rather than stored as a counter. Destructive and identity-changing flows (logout with pending changes, account deletion, guest import) fail closed: they advance only after the writes they depend on succeed.

The invariants that changes must preserve are in [`AGENTS.md`](AGENTS.md). [`ARCHITECTURE.md`](ARCHITECTURE.md) is a detailed as-built guide to the local-first core. It was written before cloud sync was added.

## Where to look

| If you want to see… | Look at |
| --- | --- |
| Workflow modeling with discriminated unions and a pure reducer | [`src/features/sesh/model/sesh.ts`](src/features/sesh/model/sesh.ts) |
| Offline sync: outbox, envelopes, conflict resolution, coordinator | [`src/shared/sync/`](src/shared/sync/) |
| Fault-injection and convergence tests | [`two-browser-convergence.integration.test.tsx`](src/shared/sync/two-browser-convergence.integration.test.tsx), [`cross-domain-conflict-fault-injection.integration.test.tsx`](src/shared/sync/cross-domain-conflict-fault-injection.integration.test.tsx), [`logout-guard.discard-isolation.test.tsx`](src/shared/sync/logout-guard.discard-isolation.test.tsx) |
| Database authorization: RLS, grants, server-owned fields | [`supabase/migrations/`](supabase/migrations/) and the DB/Data API suites in [`supabase/README.md`](supabase/README.md) |
| CI and security gates: pinned actions, secret scanning, dependency audit, CSP | [`.github/workflows/ci.yml`](.github/workflows/ci.yml), [`security/README.md`](security/README.md) |
| Procedural 3D trick animation (react-three-fiber) | [`src/features/trick-viz/`](src/features/trick-viz/), [`TRICK_VIZ_HANDOFF.md`](TRICK_VIZ_HANDOFF.md) |
| How the project is built with AI agents | [`HOW_I_WORK_WITH_AI.md`](HOW_I_WORK_WITH_AI.md) |

## Setup

This project uses **Yarn**.

```bash
yarn install
cp .env.example .env   # Supabase and Sentry values are optional; see .env.example
yarn web
```

Without Supabase variables, Auth and sync are disabled and the app runs in guest mode. See [`supabase/README.md`](supabase/README.md) for a local Supabase stack and [`DEPLOYMENT_HANDOFF.md`](DEPLOYMENT_HANDOFF.md) for the hosted deployment.

## Verification

```bash
yarn test --runInBand
yarn lint
yarn tsc --noEmit
yarn expo export --platform web --output-dir /tmp/daily-dama-web-export
```

`node .claude/scripts/verify.mjs` runs all four in order and prints the output of any step that fails. The database, Auth, and security suites are separate and documented in [`supabase/README.md`](supabase/README.md) and [`security/README.md`](security/README.md). The agent workflow tooling has its own suite: `yarn test:workflow`.

## Source layout

```
src/
  app/          Expo Router routes (composition roots only)
  features/     One directory per product area, usually split into
                components/ model/ persistence/ state/
  shared/       Cross-feature infrastructure: persistence, sync, Supabase,
                observability, color
  components/   Shared UI primitives
supabase/       Migrations, Edge Functions, and database test suites
security/       CSP policy, header checks, and audit scripts
.claude/        Agent definitions, skills, and workflow scripts
```

## License

See [`LICENSE`](LICENSE).
