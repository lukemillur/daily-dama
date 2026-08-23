import { describe, expect, it } from '@jest/globals';

import { SYNC_DOMAINS, type SyncDomain } from '@/shared/sync/domain';
import {
  createInitialCoordinatorState,
  getActiveRunId,
  isSyncRunning,
  syncCoordinatorReducer,
  type SyncCoordinatorState,
} from '@/shared/sync/coordinator';

function settleAll(
  state: SyncCoordinatorState,
  runId: string,
  identityGeneration: number,
  now: number,
  overrides: Partial<Record<SyncDomain, { status: 'succeeded' } | { status: 'failed'; errorMessage: string }>> = {},
): SyncCoordinatorState {
  return SYNC_DOMAINS.reduce<SyncCoordinatorState>(
    (acc, domain) =>
      syncCoordinatorReducer(acc, {
        type: 'domainSettled',
        runId,
        identityGeneration,
        domain,
        outcome: overrides[domain] ?? { status: 'succeeded' },
        now,
      }),
    state,
  );
}

describe('syncCoordinatorReducer', () => {
  it('1. initial state is idle at the given generation with no lastRun/pendingRerunTrigger', () => {
    const state = createInitialCoordinatorState(1);
    expect(state).toEqual({
      status: 'idle',
      identityGeneration: 1,
      lastRun: undefined,
      pendingRerunTrigger: undefined,
    });
  });

  it('2. basic run lifecycle: syncRequested starts a run, all domains settling completes it', () => {
    let state = createInitialCoordinatorState(1);
    state = syncCoordinatorReducer(state, {
      type: 'syncRequested',
      trigger: 'login',
      identityGeneration: 1,
      runId: 'run-1',
      now: 100,
    });

    expect(state.status).toBe('running');
    if (state.status !== 'running') throw new Error('expected running');
    expect(state.run.runId).toBe('run-1');
    expect(state.run.trigger).toBe('login');
    expect(state.run.startedAt).toBe(100);

    state = settleAll(state, 'run-1', 1, 200);

    expect(state.status).toBe('idle');
    if (state.status !== 'idle') throw new Error('expected idle');
    expect(state.lastRun?.outcome).toBe('completed');
    expect(state.lastRun?.runId).toBe('run-1');
    expect(Object.keys(state.lastRun?.domainResults ?? {})).toHaveLength(SYNC_DOMAINS.length);
  });

  it('3. overlapping triggers coalesce single-flight, first-wins, then rerun on pendingRerunTrigger', () => {
    let state = createInitialCoordinatorState(1);
    state = syncCoordinatorReducer(state, {
      type: 'syncRequested',
      trigger: 'login',
      identityGeneration: 1,
      runId: 'run-1',
      now: 100,
    });

    state = syncCoordinatorReducer(state, {
      type: 'syncRequested',
      trigger: 'foreground',
      identityGeneration: 1,
      runId: 'run-2',
      now: 110,
    });

    if (state.status !== 'running') throw new Error('expected running');
    expect(state.run.runId).toBe('run-1');
    expect(state.run.queuedRerunTrigger).toBe('foreground');

    state = syncCoordinatorReducer(state, {
      type: 'syncRequested',
      trigger: 'reconnect',
      identityGeneration: 1,
      runId: 'run-3',
      now: 120,
    });

    if (state.status !== 'running') throw new Error('expected running');
    expect(state.run.runId).toBe('run-1');
    expect(state.run.queuedRerunTrigger).toBe('foreground');

    state = settleAll(state, 'run-1', 1, 200);

    if (state.status !== 'idle') throw new Error('expected idle');
    expect(state.pendingRerunTrigger).toBe('foreground');

    state = syncCoordinatorReducer(state, {
      type: 'syncRequested',
      trigger: 'foreground',
      identityGeneration: 1,
      runId: 'run-4',
      now: 210,
    });

    expect(state.status).toBe('running');
    if (state.status !== 'running') throw new Error('expected running');
    expect(state.run.runId).toBe('run-4');
  });

  it('4. stale trigger with mismatched generation is a no-op', () => {
    const state: SyncCoordinatorState = {
      status: 'idle',
      identityGeneration: 2,
      lastRun: undefined,
      pendingRerunTrigger: undefined,
    };

    const next = syncCoordinatorReducer(state, {
      type: 'syncRequested',
      trigger: 'manual',
      identityGeneration: 1,
      runId: 'run-stale',
      now: 100,
    });

    expect(next).toEqual(state);
  });

  it('5. identity change mid-run cancels the run and drops queuedRerunTrigger', () => {
    let state = createInitialCoordinatorState(1);
    state = syncCoordinatorReducer(state, {
      type: 'syncRequested',
      trigger: 'login',
      identityGeneration: 1,
      runId: 'run-1',
      now: 100,
    });

    state = syncCoordinatorReducer(state, {
      type: 'domainSettled',
      runId: 'run-1',
      identityGeneration: 1,
      domain: 'profile',
      outcome: { status: 'succeeded' },
      now: 110,
    });
    state = syncCoordinatorReducer(state, {
      type: 'domainSettled',
      runId: 'run-1',
      identityGeneration: 1,
      domain: 'customTricks',
      outcome: { status: 'succeeded' },
      now: 120,
    });

    // Set up a queued rerun trigger before cancelling.
    state = syncCoordinatorReducer(state, {
      type: 'syncRequested',
      trigger: 'foreground',
      identityGeneration: 1,
      runId: 'run-2',
      now: 125,
    });

    state = syncCoordinatorReducer(state, {
      type: 'identityChanged',
      identityGeneration: 2,
      now: 200,
    });

    expect(state.status).toBe('idle');
    if (state.status !== 'idle') throw new Error('expected idle');
    expect(state.identityGeneration).toBe(2);
    expect(state.lastRun?.outcome).toBe('cancelled');
    expect(state.lastRun?.runId).toBe('run-1');
    expect(Object.keys(state.lastRun?.domainResults ?? {})).toHaveLength(2);
    expect(state.pendingRerunTrigger).toBeUndefined();
  });

  it('6. identity change while idle clears lastRun/pendingRerunTrigger and adopts new generation', () => {
    const state: SyncCoordinatorState = {
      status: 'idle',
      identityGeneration: 1,
      lastRun: {
        runId: 'run-1',
        identityGeneration: 1,
        trigger: 'login',
        startedAt: 100,
        endedAt: 200,
        outcome: 'completed',
        domainResults: {},
      },
      pendingRerunTrigger: 'foreground',
    };

    const next = syncCoordinatorReducer(state, {
      type: 'identityChanged',
      identityGeneration: 2,
      now: 300,
    });

    expect(next).toEqual({
      status: 'idle',
      identityGeneration: 2,
      lastRun: undefined,
      pendingRerunTrigger: undefined,
    });
  });

  it('7. a failed domain is contained: run stays running, then completes with the failure recorded', () => {
    let state = createInitialCoordinatorState(1);
    state = syncCoordinatorReducer(state, {
      type: 'syncRequested',
      trigger: 'login',
      identityGeneration: 1,
      runId: 'run-1',
      now: 100,
    });

    state = syncCoordinatorReducer(state, {
      type: 'domainSettled',
      runId: 'run-1',
      identityGeneration: 1,
      domain: 'goals',
      outcome: { status: 'failed', errorMessage: 'network error' },
      now: 150,
    });

    expect(state.status).toBe('running');
    if (state.status !== 'running') throw new Error('expected running');
    expect(state.run.domainResults.goals?.outcome).toEqual({
      status: 'failed',
      errorMessage: 'network error',
    });

    const remaining = SYNC_DOMAINS.filter((d) => d !== 'goals');
    state = remaining.reduce<SyncCoordinatorState>(
      (acc, domain) =>
        syncCoordinatorReducer(acc, {
          type: 'domainSettled',
          runId: 'run-1',
          identityGeneration: 1,
          domain,
          outcome: { status: 'succeeded' },
          now: 160,
        }),
      state,
    );

    expect(state.status).toBe('idle');
    if (state.status !== 'idle') throw new Error('expected idle');
    expect(state.lastRun?.outcome).toBe('completed');
    expect(state.lastRun?.domainResults.goals?.outcome).toEqual({
      status: 'failed',
      errorMessage: 'network error',
    });
    expect(state.lastRun?.domainResults.profile?.outcome).toEqual({ status: 'succeeded' });
  });

  it('8. retry after failure starts a fresh run with empty domainResults, not seeded from the old failure', () => {
    let state = createInitialCoordinatorState(1);
    state = syncCoordinatorReducer(state, {
      type: 'syncRequested',
      trigger: 'login',
      identityGeneration: 1,
      runId: 'run-1',
      now: 100,
    });
    state = settleAll(state, 'run-1', 1, 150, {
      goals: { status: 'failed', errorMessage: 'network error' },
    });

    if (state.status !== 'idle') throw new Error('expected idle');
    expect(state.lastRun?.domainResults.goals?.outcome).toEqual({
      status: 'failed',
      errorMessage: 'network error',
    });
    const priorLastRun = state.lastRun;

    state = syncCoordinatorReducer(state, {
      type: 'syncRequested',
      trigger: 'retry',
      identityGeneration: 1,
      runId: 'run-2',
      now: 200,
    });

    expect(state.status).toBe('running');
    if (state.status !== 'running') throw new Error('expected running');
    expect(state.run.runId).toBe('run-2');
    expect(state.run.domainResults).toEqual({});

    state = syncCoordinatorReducer(state, {
      type: 'domainSettled',
      runId: 'run-2',
      identityGeneration: 1,
      domain: 'goals',
      outcome: { status: 'succeeded' },
      now: 210,
    });

    if (state.status !== 'running') throw new Error('expected running');
    expect(state.run.domainResults.goals?.outcome).toEqual({ status: 'succeeded' });
    expect(state.run.domainResults).not.toBe(priorLastRun?.domainResults);
    // The old completed run's own record is untouched.
    expect(priorLastRun?.domainResults.goals?.outcome).toEqual({
      status: 'failed',
      errorMessage: 'network error',
    });
  });

  it('9. partial-domain failure settles order-independently without clobbering other domains', () => {
    let state = createInitialCoordinatorState(1);
    state = syncCoordinatorReducer(state, {
      type: 'syncRequested',
      trigger: 'manual',
      identityGeneration: 1,
      runId: 'run-1',
      now: 100,
    });

    const dispatchOrder: Array<{
      domain: SyncDomain;
      outcome: { status: 'succeeded' } | { status: 'failed'; errorMessage: string };
    }> = [
      { domain: 'customTricks', outcome: { status: 'failed', errorMessage: 'boom-1' } },
      { domain: 'goals', outcome: { status: 'failed', errorMessage: 'boom-2' } },
      { domain: 'profile', outcome: { status: 'succeeded' } },
      { domain: 'practiceHistory', outcome: { status: 'succeeded' } },
      { domain: 'notes', outcome: { status: 'succeeded' } },
    ];

    state = dispatchOrder.reduce<SyncCoordinatorState>(
      (acc, { domain, outcome }) =>
        syncCoordinatorReducer(acc, {
          type: 'domainSettled',
          runId: 'run-1',
          identityGeneration: 1,
          domain,
          outcome,
          now: 150,
        }),
      state,
    );

    expect(state.status).toBe('idle');
    if (state.status !== 'idle') throw new Error('expected idle');
    expect(state.lastRun?.outcome).toBe('completed');
    expect(state.lastRun?.domainResults.customTricks?.outcome).toEqual({
      status: 'failed',
      errorMessage: 'boom-1',
    });
    expect(state.lastRun?.domainResults.goals?.outcome).toEqual({
      status: 'failed',
      errorMessage: 'boom-2',
    });
    expect(state.lastRun?.domainResults.profile?.outcome).toEqual({ status: 'succeeded' });
    expect(state.lastRun?.domainResults.practiceHistory?.outcome).toEqual({ status: 'succeeded' });
    expect(state.lastRun?.domainResults.notes?.outcome).toEqual({ status: 'succeeded' });
  });

  it('10. a stale domainSettled after normal completion leaves state unchanged', () => {
    let state = createInitialCoordinatorState(1);
    state = syncCoordinatorReducer(state, {
      type: 'syncRequested',
      trigger: 'login',
      identityGeneration: 1,
      runId: 'run-1',
      now: 100,
    });
    state = settleAll(state, 'run-1', 1, 150);

    const completedState = state;
    expect(completedState.status).toBe('idle');

    const next = syncCoordinatorReducer(completedState, {
      type: 'domainSettled',
      runId: 'run-1',
      identityGeneration: 1,
      domain: 'profile',
      outcome: { status: 'failed', errorMessage: 'late straggler' },
      now: 999,
    });

    expect(next).toEqual(completedState);
  });

  it('11. a stale domainSettled after cancellation (matching runId, stale generation) leaves state unchanged', () => {
    let state = createInitialCoordinatorState(1);
    state = syncCoordinatorReducer(state, {
      type: 'syncRequested',
      trigger: 'login',
      identityGeneration: 1,
      runId: 'run-1',
      now: 100,
    });
    state = syncCoordinatorReducer(state, {
      type: 'identityChanged',
      identityGeneration: 2,
      now: 150,
    });

    const cancelledState = state;
    expect(cancelledState.status).toBe('idle');
    if (cancelledState.status !== 'idle') throw new Error('expected idle');
    expect(cancelledState.lastRun?.outcome).toBe('cancelled');

    const next = syncCoordinatorReducer(cancelledState, {
      type: 'domainSettled',
      runId: 'run-1',
      identityGeneration: 1,
      domain: 'profile',
      outcome: { status: 'succeeded' },
      now: 999,
    });

    expect(next).toEqual(cancelledState);
  });

  it('12. a stale domainSettled from a cancelled run does not affect a new run under the new generation', () => {
    let state = createInitialCoordinatorState(1);
    state = syncCoordinatorReducer(state, {
      type: 'syncRequested',
      trigger: 'login',
      identityGeneration: 1,
      runId: 'run-1',
      now: 100,
    });
    state = syncCoordinatorReducer(state, {
      type: 'identityChanged',
      identityGeneration: 2,
      now: 150,
    });
    state = syncCoordinatorReducer(state, {
      type: 'syncRequested',
      trigger: 'login',
      identityGeneration: 2,
      runId: 'run-2',
      now: 160,
    });

    const runningState = state;
    expect(runningState.status).toBe('running');

    const next = syncCoordinatorReducer(runningState, {
      type: 'domainSettled',
      runId: 'run-1',
      identityGeneration: 1,
      domain: 'profile',
      outcome: { status: 'succeeded' },
      now: 999,
    });

    expect(next).toEqual(runningState);
  });

  it('13. isSyncRunning / getActiveRunId selectors', () => {
    const idle = createInitialCoordinatorState(1);
    expect(isSyncRunning(idle)).toBe(false);
    expect(getActiveRunId(idle)).toBeUndefined();

    const running = syncCoordinatorReducer(idle, {
      type: 'syncRequested',
      trigger: 'manual',
      identityGeneration: 1,
      runId: 'run-1',
      now: 100,
    });
    expect(isSyncRunning(running)).toBe(true);
    expect(getActiveRunId(running)).toBe('run-1');
  });
});
