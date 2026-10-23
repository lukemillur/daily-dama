import { SYNC_DOMAINS, type SyncDomain } from '@/shared/sync/domain';

/**
 * Pure reducer/state-machine for a single-flight, identity-aware sync run.
 * No React, no Supabase/network calls, no timers, no `Date.now()` -- every
 * timestamp/id/generation is supplied by the caller, exactly like
 * `src/features/sesh/model/sesh.ts`. A future driver is expected to
 * wrap this in a hook the way `useIdentityScopedDomain`
 * (`src/shared/persistence/use-identity-scoped-domain.ts`) wraps a domain
 * reducer around `useIdentityHandle()` -- that hook is *not* built here.
 */

export type SyncTrigger = 'login' | 'foreground' | 'localMutation' | 'reconnect' | 'manual' | 'retry';

export type DomainSyncOutcome =
  | { readonly status: 'succeeded' }
  | { readonly status: 'failed'; readonly errorMessage: string };

export interface DomainSyncRecord {
  readonly domain: SyncDomain;
  readonly outcome: DomainSyncOutcome;
  readonly settledAt: number;
}

export interface ActiveSyncRun {
  readonly runId: string;
  readonly identityGeneration: number;
  readonly trigger: SyncTrigger;
  readonly startedAt: number;
  readonly domainResults: Readonly<Partial<Record<SyncDomain, DomainSyncRecord>>>;
  // A trigger that arrived while this run was in flight, coalesced instead of
  // starting a second concurrent run. First coalesced trigger wins -- this is
  // a deliberate simplification, not a priority scheme; nothing in the exit
  // criteria requires trigger-priority ordering.
  readonly queuedRerunTrigger: SyncTrigger | undefined;
}

export type FinishedSyncRunOutcome = 'completed' | 'cancelled';

export interface FinishedSyncRun {
  readonly runId: string;
  readonly identityGeneration: number;
  readonly trigger: SyncTrigger;
  readonly startedAt: number;
  readonly endedAt: number;
  readonly outcome: FinishedSyncRunOutcome;
  // Partial when outcome === 'cancelled' (identity changed mid-run); full
  // (one entry per SyncDomain) when outcome === 'completed'.
  readonly domainResults: Readonly<Partial<Record<SyncDomain, DomainSyncRecord>>>;
}

export type SyncCoordinatorState =
  | {
      readonly status: 'idle';
      readonly identityGeneration: number;
      readonly lastRun: FinishedSyncRun | undefined;
      // Set when the run that produced `lastRun` had a coalesced trigger
      // queued. A future driver should notice this is defined on
      // the idle state and immediately dispatch a fresh `syncRequested` for
      // it; this reducer only surfaces the fact, it never starts the rerun
      // itself (no clock/id generation happens inside the reducer). The
      // 'running' state variant has no such field -- it lives on
      // `ActiveSyncRun.queuedRerunTrigger` while a run is in flight and only
      // migrates here once that run finishes.
      readonly pendingRerunTrigger: SyncTrigger | undefined;
    }
  | {
      readonly status: 'running';
      readonly identityGeneration: number;
      // Single-flight is structural, not just enforced by an `if`: this
      // union has exactly one `run` slot, so it is impossible at the type
      // level to represent two concurrent runs.
      readonly run: ActiveSyncRun;
    };

export type SyncCoordinatorAction =
  | {
      readonly type: 'syncRequested';
      readonly trigger: SyncTrigger;
      readonly identityGeneration: number; // generation captured by the driver at trigger time
      readonly runId: string;
      readonly now: number;
    }
  | {
      readonly type: 'domainSettled';
      readonly runId: string;
      readonly identityGeneration: number;
      readonly domain: SyncDomain;
      readonly outcome: DomainSyncOutcome;
      readonly now: number;
    }
  | {
      readonly type: 'identityChanged';
      readonly identityGeneration: number; // the NEW generation
      readonly now: number;
    };

export function createInitialCoordinatorState(identityGeneration: number): SyncCoordinatorState {
  return {
    status: 'idle',
    identityGeneration,
    lastRun: undefined,
    pendingRerunTrigger: undefined,
  };
}

// Same deterministic-injectable-id pattern as createOutboxOperationId
// (src/shared/sync/outbox-operation.ts): timestamp+random base36, fully
// unit-testable, never reads a clock itself.
export function createSyncRunId(now = Date.now(), random = Math.random()): string {
  return `run-${now.toString(36)}-${Math.floor(random * 0x100000000).toString(36)}`;
}

export function syncCoordinatorReducer(
  state: SyncCoordinatorState,
  action: SyncCoordinatorAction,
): SyncCoordinatorState {
  switch (action.type) {
    case 'syncRequested': {
      // A trigger captured under a since-superseded generation (e.g. a
      // debounced foreground check that fires after the user switched
      // accounts) must not start or affect anything.
      if (action.identityGeneration !== state.identityGeneration) {
        return state;
      }

      if (state.status === 'idle') {
        return {
          status: 'running',
          identityGeneration: action.identityGeneration,
          run: {
            runId: action.runId,
            identityGeneration: action.identityGeneration,
            trigger: action.trigger,
            startedAt: action.now,
            domainResults: {},
            queuedRerunTrigger: undefined,
          },
        };
      }

      // Already running: single-flight -- do not start a second run.
      // Coalesce into queuedRerunTrigger, first trigger wins.
      return {
        status: 'running',
        identityGeneration: state.identityGeneration,
        run: {
          ...state.run,
          queuedRerunTrigger: state.run.queuedRerunTrigger ?? action.trigger,
        },
      };
    }

    case 'domainSettled': {
      // Stale-completion guard: this is the literal mechanism for "no late
      // result can mutate current state after logout or account switching",
      // and for discarding stragglers from an already-finished run.
      if (
        state.status !== 'running' ||
        state.run.runId !== action.runId ||
        state.run.identityGeneration !== action.identityGeneration
      ) {
        return state;
      }

      // A failing domain is recorded, never thrown/rejected up -- this is
      // the concrete "contained operation failure" mechanism; nothing else
      // about the run state changes because one domain failed.
      const domainResults = {
        ...state.run.domainResults,
        [action.domain]: {
          domain: action.domain,
          outcome: action.outcome,
          settledAt: action.now,
        },
      };

      if (Object.keys(domainResults).length < SYNC_DOMAINS.length) {
        return {
          status: 'running',
          identityGeneration: state.identityGeneration,
          run: {
            ...state.run,
            domainResults,
          },
        };
      }

      // All domains reported: the run is finished. `outcome: 'completed'`
      // means "ran to conclusion," independent of whether individual
      // domains succeeded -- callers inspect `domainResults` for partial
      // failure, exactly like SeshSummary records what happened rather than
      // judging it.
      return {
        status: 'idle',
        identityGeneration: state.identityGeneration,
        lastRun: {
          runId: state.run.runId,
          identityGeneration: state.run.identityGeneration,
          trigger: state.run.trigger,
          startedAt: state.run.startedAt,
          endedAt: action.now,
          outcome: 'completed',
          domainResults,
        },
        pendingRerunTrigger: state.run.queuedRerunTrigger,
      };
    }

    case 'identityChanged': {
      if (state.status === 'running') {
        // The in-flight run is cancelled. queuedRerunTrigger was a reason to
        // resync under the OLD identity and must not leak into the new one.
        return {
          status: 'idle',
          identityGeneration: action.identityGeneration,
          lastRun: {
            runId: state.run.runId,
            identityGeneration: state.run.identityGeneration,
            trigger: state.run.trigger,
            startedAt: state.run.startedAt,
            endedAt: action.now,
            outcome: 'cancelled',
            domainResults: state.run.domainResults,
          },
          pendingRerunTrigger: undefined,
        };
      }

      // Still idle: adopt the new generation and clear lastRun/
      // pendingRerunTrigger. Even though nothing was running, a previous
      // identity's "last synced"/pending-rerun info must not be visible
      // under the new identity.
      return {
        status: 'idle',
        identityGeneration: action.identityGeneration,
        lastRun: undefined,
        pendingRerunTrigger: undefined,
      };
    }

    default:
      return state;
  }
}

export function isSyncRunning(state: SyncCoordinatorState): boolean {
  return state.status === 'running';
}

export function getActiveRunId(state: SyncCoordinatorState): string | undefined {
  return state.status === 'running' ? state.run.runId : undefined;
}
