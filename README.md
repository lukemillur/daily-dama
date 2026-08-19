# Daily Dama

Daily Dama is a local-first Expo app for choosing Kendama tricks, running open-ended or timed practice sessions ("Seshes"), and reviewing accumulated practice Stats. There is no backend — all state lives on-device (AsyncStorage, backed by `localStorage` on web).

Built with Expo, Expo Router, and TypeScript.

## Supported platforms

Web is the primary, actively verified platform. iOS and Android are required eventual targets via Expo, but have not yet received deliberate device hardening — treat them as functional but less polished.

## Setup

This project uses **Yarn**, not npm.

```bash
yarn install
```

Copy `.env.example` to `.env` and fill in any values you need (see [Environment variables](#environment-variables) below):

```bash
cp .env.example .env
```

Start the dev server:

```bash
yarn web    # web (primary verification surface)
yarn ios    # iOS simulator
yarn android # Android emulator
```

You can also run `yarn start` and choose a target from the Expo CLI output (development build, simulator/emulator, or Expo Go).

## Environment variables

See `.env.example` for the full list.

## Source layout

```
src/
  app/                  Expo Router routes (file-based routing)
  features/             One directory per product area (home, sesh, tricks,
                         stats, profile, onboarding, custom-tricks, goals,
                         notes, trick-viz), each typically split
                         into components/model/persistence/state
  components/           Shared UI components
  shared/persistence/    Shared AsyncStorage write-queue and helpers
  constants, hooks, types  Cross-cutting utilities and shared types
```

Tricks is the authoritative route for browsing, selecting, creating, editing, and deleting tricks. Profile is intentionally a placeholder for now.

## Local-first persistence

App state is split into three independent persistent domains, each backed by AsyncStorage and its own provider in `src/app/_layout.tsx`:

- **User profile** — onboarding status, assessed Kentei rank, selected trick IDs.
- **Custom tricks** — standalone custom tricks and custom sequences.
- **Practice history** — immutable completed-Sesh records used to derive Stats.

Each domain owns its own reducer, runtime validation, persistence adapter, and hydration fallback, and writes go through a shared write-queue to preserve ordering. Stats are always derived from practice history rather than stored as mutable totals, so they can't drift from session history. See `AGENTS.md` for the full set of invariants (custom-trick schema, sequence rules, Sesh reducer behavior, etc.) before making changes in these areas.

## Verification

```bash
yarn test --runInBand
yarn lint
yarn tsc --noEmit
yarn expo export --platform web --output-dir /tmp/daily-dama-web-export
```

`node .claude/scripts/verify.mjs` runs all four in sequence, prints one line per step, and on failure shows the failing command's output. Pass `--skip-export` for docs- or test-only changes.

The workflow tooling under `.claude/scripts/` has its own separate, dependency-free test suite: `yarn test:workflow`.

## Further reading

- [`AGENTS.md`](AGENTS.md) — full working agreement, product shape, and state/persistence invariants. Read this before working in the state, custom-trick, Tricks, or Sesh areas.
- [`TASKS.md`](TASKS.md) — active backlog and the checkpoint mechanism across sessions/agents.
- [`.claude/scripts/README.md`](.claude/scripts/README.md) — the `newTicket` workflow tooling (claim/resume, verification wrapper, worktree cleanup).
- [`TRICK_VIZ_HANDOFF.md`](TRICK_VIZ_HANDOFF.md) — procedural 3D trick visualization.
- [`DEPLOYMENT_HANDOFF.md`](DEPLOYMENT_HANDOFF.md) — web deploy to dailydama.com.
