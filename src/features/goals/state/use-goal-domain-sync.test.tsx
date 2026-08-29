import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { type PropsWithChildren, useEffect, useState } from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required by jest hoisting
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { INITIAL_GOALS, type GoalCollection } from '@/features/goals/model/goal';
import type { GoalRow } from '@/features/goals/persistence/goal-cloud-repository';
import { useGoalDomainSync } from '@/features/goals/state/use-goal-domain-sync';
import { createIdentityContext } from '@/shared/persistence/identity-context';
import { createUserIdentity, GUEST_IDENTITY, type Identity } from '@/shared/persistence/identity';
import { IdentityHandleContext } from '@/shared/persistence/identity-provider';
import type { SyncTransportRepository } from '@/shared/sync/transport';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const USER_IDENTITY: Identity = createUserIdentity(USER_ID)!;
const TIMESTAMP = '2026-01-01T00:00:00.000Z';

interface FakeTransportOptions {
  readonly seedRows?: readonly GoalRow[];
}

interface FakeTransport extends SyncTransportRepository<GoalRow> {
  setFailPush(fail: boolean): void;
  setFailPull(fail: boolean): void;
  setNextPushConflict(fail: boolean): void;
  getRow(id: string): GoalRow | undefined;
  getUpsertCallCount(id: string): number;
  getPushAttemptCount(id: string): number;
}

function createFakeGoalSyncTransport(options: FakeTransportOptions = {}): FakeTransport {
  const rows = new Map<string, GoalRow>((options.seedRows ?? []).map((row) => [row.id, row]));
  const upsertCallCounts = new Map<string, number>();
  const pushAttemptCounts = new Map<string, number>();
  let failPush = false;
  let failPull = false;

  return {
    async pull() {
      if (failPull) return { status: 'failed', error: { kind: 'network', message: 'fake pull failure' } };
      return { status: 'succeeded', page: { items: Array.from(rows.values()), nextCursor: null } };
    },
    async push(request) {
      pushAttemptCounts.set(request.recordId, (pushAttemptCounts.get(request.recordId) ?? 0) + 1);
      if (failPush) return { status: 'failed', error: { kind: 'network', message: 'fake push failure' } };

      const goalId = request.recordId;
      const existing = rows.get(goalId);

      if (request.operationType === 'delete') {
        if (existing === undefined) {
          return {
            status: 'succeeded',
            row: {
              id: goalId,
              user_id: USER_ID,
              trick_id: `deleted:${goalId}`,
              trick_name: `deleted:${goalId}`,
              kind: 'count',
              target_count: 1,
              target_ms: null,
              revision: 0,
              created_at: TIMESTAMP,
              updated_at: TIMESTAMP,
              deleted_at: TIMESTAMP,
            } as GoalRow,
          };
        }
        if (existing.deleted_at !== null) {
          // Already tombstoned -- idempotent success, matching the real
          // adapter's own tombstone-vs-delete disambiguation.
          return { status: 'succeeded', row: existing };
        }
        if (request.expectedRevision !== null && existing.revision !== request.expectedRevision) {
          return {
            status: 'conflict',
            conflict: {
              operationId: request.operationId,
              recordId: goalId,
              expectedRevision: request.expectedRevision,
              serverRevision: existing.revision,
            },
          };
        }
        const tombstoned: GoalRow = { ...existing, deleted_at: TIMESTAMP, revision: existing.revision + 1 };
        rows.set(goalId, tombstoned);
        return { status: 'succeeded', row: tombstoned };
      }

      // upsert (create or edit)
      if (existing?.deleted_at) {
        // The real adapter's tombstone-rejection posture: an edit against
        // an already-tombstoned goal is a stale-device resurrection
        // attempt -- conflict, never a silent success.
        return {
          status: 'conflict',
          conflict: {
            operationId: request.operationId,
            recordId: goalId,
            expectedRevision: request.expectedRevision,
            serverRevision: existing.revision,
          },
        };
      }
      if (request.expectedRevision !== null && existing && existing.revision !== request.expectedRevision) {
        return {
          status: 'conflict',
          conflict: {
            operationId: request.operationId,
            recordId: goalId,
            expectedRevision: request.expectedRevision,
            serverRevision: existing.revision,
          },
        };
      }
      const payload = request.payload as Record<string, unknown>;
      const row: GoalRow = {
        id: goalId,
        user_id: USER_ID,
        trick_id: (payload.trick_id as string) ?? '',
        trick_name: (payload.trick_name as string) ?? '',
        kind: (payload.kind as 'count' | 'time') ?? 'count',
        target_count: (payload.target_count as number | null) ?? null,
        target_ms: (payload.target_ms as number | null) ?? null,
        created_at: existing?.created_at ?? TIMESTAMP,
        updated_at: TIMESTAMP,
        deleted_at: null,
        revision: (existing?.revision ?? 0) + 1,
      };
      rows.set(goalId, row);
      upsertCallCounts.set(goalId, (upsertCallCounts.get(goalId) ?? 0) + 1);
      return { status: 'succeeded', row };
    },

    setFailPush: (fail: boolean) => {
      failPush = fail;
    },
    setFailPull: (fail: boolean) => {
      failPull = fail;
    },
    setNextPushConflict: () => {
      // unused stand-in kept for interface symmetry with other domains' test files
    },
    getRow: (id: string) => rows.get(id),
    getUpsertCallCount: (id: string) => upsertCallCounts.get(id) ?? 0,
    getPushAttemptCount: (id: string) => pushAttemptCounts.get(id) ?? 0,
  };
}

interface Driver {
  readonly setIdentity: (next: Identity) => void;
}

function IdentityHandleTestProvider({
  children,
  onDriverReady,
}: PropsWithChildren<{ readonly onDriverReady: (driver: Driver) => void }>) {
  const [context] = useState(() => createIdentityContext());
  const [handle, setHandle] = useState(() => ({
    identity: context.getIdentity(),
    generation: context.getGeneration(),
    context,
  }));

  onDriverReady({
    setIdentity: (next) => {
      const generation = context.setIdentity(next);
      setHandle({ identity: next, generation, context });
    },
  });

  return <IdentityHandleContext.Provider value={handle}>{children}</IdentityHandleContext.Provider>;
}

interface Captured {
  collection?: GoalCollection;
  setCollection?: (next: GoalCollection) => void;
  runSync?: ReturnType<typeof useGoalDomainSync>['runSync'];
  isSyncing?: boolean;
  pendingCount?: number;
  conflictCount?: number;
  discardPending?: () => Promise<void>;
}

function makeHarness(
  initialCollection: GoalCollection,
  getTransport: () => FakeTransport | undefined,
  captured: Captured,
) {
  return function Harness() {
    const [collection, setCollection] = useState(initialCollection);
    const sync = useGoalDomainSync({
      collection,
      hasHydratedCollection: true,
      dispatchCollection: (action) => {
        if (action.type === 'goalsRestored') setCollection(action.collection);
      },
      getTransport,
    });

    useEffect(() => {
      captured.collection = collection;
      captured.setCollection = setCollection;
      captured.runSync = sync.runSync;
      captured.isSyncing = sync.isSyncing;
      captured.pendingCount = sync.pendingCount;
      captured.conflictCount = sync.conflictCount;
      captured.discardPending = sync.discardPending;
    });

    return <Text>{JSON.stringify(collection)}</Text>;
  };
}

async function mountHarness(
  initialCollection: GoalCollection,
  getTransport: () => FakeTransport | undefined,
  identity: Identity = USER_IDENTITY,
) {
  const captured: Captured = {};
  const Harness = makeHarness(initialCollection, getTransport, captured);
  let setIdentity: Driver['setIdentity'] | undefined;

  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(
      <IdentityHandleTestProvider onDriverReady={(driver) => (setIdentity = driver.setIdentity)}>
        <Harness />
      </IdentityHandleTestProvider>,
    );
  });

  if (identity.kind === 'user') {
    await act(async () => {
      setIdentity?.(identity);
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  return { root, captured };
}

async function flush(times = 4) {
  for (let i = 0; i < times; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

describe('useGoalDomainSync', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('offline create of a goal: enqueues an outbox op, persists it, and reloads on remount', async () => {
    const transport = createFakeGoalSyncTransport();
    transport.setFailPush(true);

    const created: GoalCollection = {
      goals: [{ id: 'goal-1', trickId: 'big-cup', trickName: 'Big cup', kind: 'count', targetCount: 10, createdAt: 1 }],
    };

    const { root, captured } = await mountHarness(INITIAL_GOALS, () => transport, USER_IDENTITY);
    await flush();

    act(() => {
      captured.setCollection?.(created);
    });
    await flush();

    expect(transport.getRow('goal-1')).toBeUndefined();

    act(() => {
      root.unmount();
    });

    const second = await mountHarness(INITIAL_GOALS, () => transport, USER_IDENTITY);
    await flush();

    transport.setFailPush(false);
    await act(async () => {
      await second.captured.runSync?.('manual');
    });
    await flush();

    expect(transport.getRow('goal-1')?.target_count).toBe(10);

    act(() => {
      second.root.unmount();
    });
  });

  it('reconnect: pending ops push, get acknowledged, and no duplicate rows are created', async () => {
    const transport = createFakeGoalSyncTransport();
    transport.setFailPush(true);

    const { root, captured } = await mountHarness(INITIAL_GOALS, () => transport, USER_IDENTITY);
    await flush();

    act(() => {
      captured.setCollection?.({
        goals: [{ id: 'goal-1', trickId: 'big-cup', trickName: 'Big cup', kind: 'count', targetCount: 10, createdAt: 1 }],
      });
    });
    await flush();

    expect(transport.getRow('goal-1')).toBeUndefined();

    transport.setFailPush(false);
    await act(async () => {
      await captured.runSync?.('manual');
    });
    await flush();

    expect(transport.getRow('goal-1')?.target_count).toBe(10);
    expect(transport.getUpsertCallCount('goal-1')).toBe(1);

    await act(async () => {
      await captured.runSync?.('manual');
    });
    await flush();
    expect(transport.getUpsertCallCount('goal-1')).toBe(1);

    act(() => {
      root.unmount();
    });
  });

  it('second-browser rehydrate: a fresh envelope pulls a fake-seeded fixture and the primary reducer matches it exactly', async () => {
    const seededGoal: GoalRow = {
      id: 'goal-seed',
      user_id: USER_ID,
      trick_id: 'big-cup',
      trick_name: 'Big cup',
      kind: 'count',
      target_count: 25,
      target_ms: null,
      created_at: TIMESTAMP,
      updated_at: TIMESTAMP,
      deleted_at: null,
      revision: 1,
    };
    const transport = createFakeGoalSyncTransport({ seedRows: [seededGoal] });

    const { root, captured } = await mountHarness(INITIAL_GOALS, () => transport, USER_IDENTITY);
    await flush();

    // T157.9: login-triggering moved from this hook to the shared sync
    // coordinator, so this hook's own tests must drive the pull-adopt
    // explicitly rather than relying on an auto-fired login effect.
    await act(async () => {
      await captured.runSync?.('manual');
    });
    await flush();

    expect(captured.collection).toEqual({
      goals: [
        {
          id: 'goal-seed',
          trickId: 'big-cup',
          trickName: 'Big cup',
          kind: 'count',
          targetCount: 25,
          createdAt: Date.parse(TIMESTAMP),
        },
      ],
    });

    act(() => {
      root.unmount();
    });
  });

  it('second-browser rehydrate filters out tombstoned goals from the composed collection', async () => {
    const activeGoal: GoalRow = {
      id: 'goal-active',
      user_id: USER_ID,
      trick_id: 'big-cup',
      trick_name: 'Big cup',
      kind: 'count',
      target_count: 25,
      target_ms: null,
      created_at: TIMESTAMP,
      updated_at: TIMESTAMP,
      deleted_at: null,
      revision: 1,
    };
    const tombstonedGoal: GoalRow = {
      id: 'goal-tombstoned',
      user_id: USER_ID,
      trick_id: 'stilt-flip',
      trick_name: 'Stilt flip',
      kind: 'time',
      target_count: null,
      target_ms: 600000,
      created_at: TIMESTAMP,
      updated_at: TIMESTAMP,
      deleted_at: TIMESTAMP,
      revision: 2,
    };
    const transport = createFakeGoalSyncTransport({ seedRows: [activeGoal, tombstonedGoal] });

    const { root, captured } = await mountHarness(INITIAL_GOALS, () => transport, USER_IDENTITY);
    await flush();

    // T157.9: login-triggering moved from this hook to the shared sync
    // coordinator, so this hook's own tests must drive the pull-adopt
    // explicitly rather than relying on an auto-fired login effect.
    await act(async () => {
      await captured.runSync?.('manual');
    });
    await flush();

    expect(captured.collection?.goals.map((goal) => goal.id)).toEqual(['goal-active']);

    act(() => {
      root.unmount();
    });
  });

  it('a stale-revision conflict on one goal does not block an unrelated goal, and the conflicted op stays pending', async () => {
    const transport = createFakeGoalSyncTransport();
    const { root, captured } = await mountHarness(INITIAL_GOALS, () => transport, USER_IDENTITY);
    await flush();

    act(() => {
      captured.setCollection?.({
        goals: [{ id: 'goal-1', trickId: 'big-cup', trickName: 'Big cup', kind: 'count', targetCount: 10, createdAt: 1 }],
      });
    });
    await flush();
    await act(async () => {
      await captured.runSync?.('manual');
    });
    await flush();
    expect(transport.getRow('goal-1')?.revision).toBe(1);

    transport.setFailPush(true);
    act(() => {
      captured.setCollection?.({
        goals: [
          { id: 'goal-1', trickId: 'big-cup', trickName: 'Big cup', kind: 'count', targetCount: 99, createdAt: 1 },
          { id: 'goal-2', trickId: 'stilt-flip', trickName: 'Stilt flip', kind: 'count', targetCount: 5, createdAt: 2 },
        ],
      });
    });
    await flush();

    transport.setFailPush(false);
    await transport.push({
      operationId: 'seed-conflict',
      recordId: 'goal-1',
      operationType: 'upsert',
      payload: {
        user_id: USER_ID,
        id: 'goal-1',
        trick_id: 'big-cup',
        trick_name: 'Big cup',
        kind: 'count',
        target_count: 50,
        target_ms: null,
      },
      expectedRevision: 1,
    });
    expect(transport.getRow('goal-1')?.revision).toBe(2);

    await act(async () => {
      await captured.runSync?.('manual');
    });
    await flush();

    expect(transport.getRow('goal-2')?.target_count).toBe(5);
    const goal2AttemptsAfterFirstRun = transport.getPushAttemptCount('goal-2');

    expect(transport.getRow('goal-1')?.target_count).toBe(50);
    expect(transport.getRow('goal-1')?.revision).toBe(2);

    const goal1AttemptsBeforeSecondRun = transport.getPushAttemptCount('goal-1');
    await act(async () => {
      await captured.runSync?.('manual');
    });
    await flush();
    expect(transport.getPushAttemptCount('goal-1')).toBeGreaterThan(goal1AttemptsBeforeSecondRun);
    expect(transport.getPushAttemptCount('goal-2')).toBe(goal2AttemptsAfterFirstRun);

    act(() => {
      root.unmount();
    });
  });

  it('rapid edits to the same goal id offline coalesce to one pending outbox operation', async () => {
    const transport = createFakeGoalSyncTransport();
    transport.setFailPush(true);

    const { root, captured } = await mountHarness(INITIAL_GOALS, () => transport, USER_IDENTITY);
    await flush();

    for (const targetCount of [1, 2, 3, 4, 5]) {
      act(() => {
        captured.setCollection?.({
          goals: [{ id: 'goal-1', trickId: 'big-cup', trickName: 'Big cup', kind: 'count', targetCount, createdAt: 1 }],
        });
      });
      await flush(1);
    }
    await flush();

    transport.setFailPush(false);
    await act(async () => {
      await captured.runSync?.('manual');
    });
    await flush();

    expect(transport.getRow('goal-1')?.target_count).toBe(5);
    expect(transport.getRow('goal-1')?.revision).toBe(1); // exactly one push landed, not five
    expect(transport.getUpsertCallCount('goal-1')).toBe(1);

    act(() => {
      root.unmount();
    });
  });

  it('guest identity never enqueues operations and runSync is a no-op', async () => {
    const transport = createFakeGoalSyncTransport();
    const { root, captured } = await mountHarness(INITIAL_GOALS, () => transport, GUEST_IDENTITY);
    await flush();

    act(() => {
      captured.setCollection?.({
        goals: [{ id: 'goal-1', trickId: 'big-cup', trickName: 'Big cup', kind: 'count', targetCount: 10, createdAt: 1 }],
      });
    });
    await flush();

    let result: Awaited<ReturnType<NonNullable<Captured['runSync']>>> | undefined;
    await act(async () => {
      result = await captured.runSync?.('manual');
    });
    expect(result?.outcome).toEqual({ status: 'succeeded' });
    expect(transport.getRow('goal-1')).toBeUndefined();

    act(() => {
      root.unmount();
    });
  });

  // T157.7-specific #1: offline edit of an existing goal, then reconnect.
  it('offline edit of an existing goal pushes as an upsert against the extended grant, gets acknowledged, revision recorded', async () => {
    const transport = createFakeGoalSyncTransport();
    const { root, captured } = await mountHarness(INITIAL_GOALS, () => transport, USER_IDENTITY);
    await flush();

    act(() => {
      captured.setCollection?.({
        goals: [{ id: 'goal-1', trickId: 'big-cup', trickName: 'Big cup', kind: 'count', targetCount: 10, createdAt: 1 }],
      });
    });
    await flush();
    await act(async () => {
      await captured.runSync?.('manual');
    });
    await flush();
    expect(transport.getRow('goal-1')?.revision).toBe(1);

    transport.setFailPush(true);
    act(() => {
      captured.setCollection?.({
        goals: [{ id: 'goal-1', trickId: 'big-cup', trickName: 'Big cup', kind: 'count', targetCount: 42, createdAt: 1 }],
      });
    });
    await flush();
    expect(transport.getRow('goal-1')?.target_count).toBe(10); // still offline, not yet pushed

    transport.setFailPush(false);
    await act(async () => {
      await captured.runSync?.('manual');
    });
    await flush();

    expect(transport.getRow('goal-1')?.target_count).toBe(42);
    expect(transport.getRow('goal-1')?.revision).toBe(2);
  });

  // T157.7-specific #2: the tombstone-conflict case from the adapter's own
  // real-stack test, proven again here with a fake transport that returns
  // 'conflict' for an edit op against an already-tombstoned goal -- confirms
  // the driver parks just that one goal's operation without touching any
  // other pending operation, and the domain-level outcome is still
  // 'succeeded' (a conflict alone never makes the whole domain outcome
  // 'failed').
  it('an edit against a since-tombstoned goal parks that goal only; the run still reports succeeded', async () => {
    const tombstoned: GoalRow = {
      id: 'goal-tombstoned',
      user_id: USER_ID,
      trick_id: 'big-cup',
      trick_name: 'Big cup',
      kind: 'count',
      target_count: 10,
      target_ms: null,
      created_at: TIMESTAMP,
      updated_at: TIMESTAMP,
      deleted_at: TIMESTAMP,
      revision: 2,
    };
    const transport = createFakeGoalSyncTransport({ seedRows: [tombstoned] });

    // Start with a fresh envelope (revision cache empty for this record) --
    // the tombstoned row is pulled and its revision recorded, but the goal
    // is filtered out of the composed collection (since it's tombstoned).
    const { root, captured } = await mountHarness(INITIAL_GOALS, () => transport, USER_IDENTITY);
    await flush();
    expect(captured.collection?.goals).toEqual([]);

    // A stale in-flight local edit against the same id (simulating a device
    // that queued this edit before observing the tombstone) plus an
    // unrelated new goal in the same batch.
    act(() => {
      captured.setCollection?.({
        goals: [
          { id: 'goal-tombstoned', trickId: 'big-cup', trickName: 'Big cup', kind: 'count', targetCount: 99, createdAt: 1 },
          { id: 'goal-unrelated', trickId: 'stilt-flip', trickName: 'Stilt flip', kind: 'count', targetCount: 3, createdAt: 2 },
        ],
      });
    });
    await flush();

    let result: Awaited<ReturnType<NonNullable<Captured['runSync']>>> | undefined;
    await act(async () => {
      result = await captured.runSync?.('manual');
    });
    await flush();

    expect(result?.outcome).toEqual({ status: 'succeeded' });
    expect(transport.getRow('goal-unrelated')?.target_count).toBe(3);
    // The tombstoned goal's edit was rejected as a conflict, never applied.
    expect(transport.getRow('goal-tombstoned')?.target_count).toBe(10);

    const attemptsBeforeSecondRun = transport.getPushAttemptCount('goal-tombstoned');
    await act(async () => {
      await captured.runSync?.('manual');
    });
    await flush();
    // Still pending -- retried on the next run (never silently acknowledged).
    expect(transport.getPushAttemptCount('goal-tombstoned')).toBeGreaterThan(attemptsBeforeSecondRun);

    act(() => {
      root.unmount();
    });
  });

  it('retrying the same operation after a lost acknowledgement is idempotent and does not block an unrelated goal', async () => {
    const transport = createFakeGoalSyncTransport();
    const { root, captured } = await mountHarness(INITIAL_GOALS, () => transport, USER_IDENTITY);
    await flush();

    act(() => {
      captured.setCollection?.({
        goals: [{ id: 'goal-1', trickId: 'big-cup', trickName: 'Big cup', kind: 'count', targetCount: 10, createdAt: 1 }],
      });
    });
    await flush();
    await act(async () => {
      await captured.runSync?.('manual');
    });
    await flush();
    expect(transport.getRow('goal-1')?.revision).toBe(1);

    act(() => {
      captured.setCollection?.({
        goals: [
          { id: 'goal-1', trickId: 'big-cup', trickName: 'Big cup', kind: 'count', targetCount: 42, createdAt: 1 },
          { id: 'goal-2', trickId: 'stilt-flip', trickName: 'Stilt flip', kind: 'count', targetCount: 5, createdAt: 2 },
        ],
      });
    });
    await flush();

    await transport.push({
      operationId: 'lost-ack-direct',
      recordId: 'goal-1',
      operationType: 'upsert',
      payload: {
        user_id: USER_ID,
        id: 'goal-1',
        trick_id: 'big-cup',
        trick_name: 'Big cup',
        kind: 'count',
        target_count: 42,
        target_ms: null,
      },
      expectedRevision: 1,
    });
    expect(transport.getRow('goal-1')?.revision).toBe(2);
    expect(transport.getRow('goal-1')?.target_count).toBe(42);

    await act(async () => {
      await captured.runSync?.('manual');
    });
    await flush();

    expect(transport.getRow('goal-1')?.revision).toBe(2);
    expect(transport.getRow('goal-1')?.target_count).toBe(42);
    expect(captured.conflictCount).toBe(1);

    expect(transport.getRow('goal-2')?.target_count).toBe(5);
    expect(transport.getRow('goal-2')?.revision).toBe(1);

    const goal2AttemptsAfterFirstRun = transport.getPushAttemptCount('goal-2');
    for (let i = 0; i < 2; i += 1) {
      await act(async () => {
        await captured.runSync?.('manual');
      });
      await flush();
      expect(captured.conflictCount).toBe(1);
    }
    expect(transport.getRow('goal-1')?.revision).toBe(2);
    expect(transport.getPushAttemptCount('goal-2')).toBe(goal2AttemptsAfterFirstRun);

    act(() => {
      root.unmount();
    });
  });

  it('pendingCount reflects the outbox length and updates as operations are applied and acknowledged', async () => {
    const transport = createFakeGoalSyncTransport();
    const { root, captured } = await mountHarness(INITIAL_GOALS, () => transport, USER_IDENTITY);
    await flush();

    expect(captured.pendingCount).toBe(0);

    act(() => {
      captured.setCollection?.({
        goals: [{ id: 'goal-1', trickId: 'big-cup', trickName: 'Big cup', kind: 'count', targetCount: 10, createdAt: 1 }],
      });
    });
    await flush();

    expect(captured.pendingCount).toBe(1);

    await act(async () => {
      await captured.runSync?.('manual');
    });
    await flush();

    expect(captured.pendingCount).toBe(0);

    act(() => {
      root.unmount();
    });
  });

  it('discardPending clears the outbox and persists the cleared envelope', async () => {
    const transport = createFakeGoalSyncTransport();
    transport.setFailPush(true);
    const { root, captured } = await mountHarness(INITIAL_GOALS, () => transport, USER_IDENTITY);
    await flush();

    act(() => {
      captured.setCollection?.({
        goals: [{ id: 'goal-1', trickId: 'big-cup', trickName: 'Big cup', kind: 'count', targetCount: 10, createdAt: 1 }],
      });
    });
    await flush();
    expect(captured.pendingCount).toBe(1);

    await act(async () => {
      await captured.discardPending?.();
    });
    await flush();

    expect(captured.pendingCount).toBe(0);
    expect(captured.collection?.goals[0]?.id).toBe('goal-1');

    act(() => {
      root.unmount();
    });

    const second = await mountHarness(INITIAL_GOALS, () => transport, USER_IDENTITY);
    await flush();
    expect(second.captured.pendingCount).toBe(0);

    act(() => {
      second.root.unmount();
    });
  });

  it('discardPending is a safe no-op when the outbox is already empty', async () => {
    const transport = createFakeGoalSyncTransport();
    const { root, captured } = await mountHarness(INITIAL_GOALS, () => transport, USER_IDENTITY);
    await flush();

    expect(captured.pendingCount).toBe(0);

    await act(async () => {
      await captured.discardPending?.();
    });
    await flush();

    expect(captured.pendingCount).toBe(0);

    act(() => {
      root.unmount();
    });
  });

  it('discardPending is scoped to its own identity: a fresh identity never observes a prior identitys pending outbox', async () => {
    const transport = createFakeGoalSyncTransport();
    transport.setFailPush(true);
    const { root, captured } = await mountHarness(INITIAL_GOALS, () => transport, USER_IDENTITY);
    await flush();

    act(() => {
      captured.setCollection?.({
        goals: [{ id: 'goal-1', trickId: 'big-cup', trickName: 'Big cup', kind: 'count', targetCount: 10, createdAt: 1 }],
      });
    });
    await flush();
    expect(captured.pendingCount).toBe(1);

    act(() => {
      root.unmount();
    });

    const OTHER_USER_IDENTITY = createUserIdentity('22222222-2222-2222-2222-222222222222')!;
    const other = await mountHarness(INITIAL_GOALS, () => transport, OTHER_USER_IDENTITY);
    await flush();
    expect(other.captured.pendingCount).toBe(0);

    act(() => {
      other.root.unmount();
    });
  });
});
