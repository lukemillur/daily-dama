import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { type PropsWithChildren, useEffect, useState } from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required by jest hoisting
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import {
  aggregatePracticeStats,
  INITIAL_PRACTICE_HISTORY,
  type PracticeHistory,
  type PracticeSessionRecord,
} from '@/features/stats/model/practice-history';
import type { PracticeSessionRow } from '@/features/stats/persistence/practice-history-cloud-repository';
import { usePracticeHistoryDomainSync } from '@/features/stats/state/use-practice-history-domain-sync';
import { createIdentityContext } from '@/shared/persistence/identity-context';
import { createUserIdentity, GUEST_IDENTITY, type Identity } from '@/shared/persistence/identity';
import { IdentityHandleContext } from '@/shared/persistence/identity-provider';
import type { SyncTransportRepository } from '@/shared/sync/transport';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const USER_IDENTITY: Identity = createUserIdentity(USER_ID)!;
const TIMESTAMP = '2026-01-01T00:00:00.000Z';

function toRow(session: PracticeSessionRecord): PracticeSessionRow {
  return {
    user_id: USER_ID,
    id: session.id,
    trick_id: session.trickId,
    trick_name: session.trickName,
    started_at: session.startedAt,
    completed_at: session.completedAt,
    duration_ms: session.durationMs,
    lace_count: session.laceCount,
    planned_duration_ms: session.plannedDurationMs ?? null,
    origin: session.origin ?? null,
    created_at: TIMESTAMP,
  };
}

interface FakeTransportOptions {
  readonly seedRows?: readonly PracticeSessionRow[];
}

interface FakeTransport extends SyncTransportRepository<PracticeSessionRow> {
  setFailPush(fail: boolean): void;
  setFailPull(fail: boolean): void;
  getRow(id: string): PracticeSessionRow | undefined;
  getRowCount(): number;
  getUpsertCallCount(id: string): number;
  getPushAttemptCount(id: string): number;
}

function createFakePracticeHistorySyncTransport(options: FakeTransportOptions = {}): FakeTransport {
  const rows = new Map<string, PracticeSessionRow>((options.seedRows ?? []).map((row) => [row.id, row]));
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

      if (request.operationType === 'delete') {
        return { status: 'failed', error: { kind: 'validation', message: 'immutable; delete not supported' } };
      }

      const recordId = request.recordId;
      const payload = request.payload as Record<string, unknown>;

      // 23505-as-success: if the row already exists, treat as an idempotent
      // retry -- return the existing row unchanged, never duplicate.
      const existing = rows.get(recordId);
      if (existing) {
        return { status: 'succeeded', row: existing };
      }

      const row: PracticeSessionRow = {
        user_id: USER_ID,
        id: recordId,
        trick_id: payload.trick_id as string,
        trick_name: payload.trick_name as string,
        started_at: payload.started_at as number,
        completed_at: payload.completed_at as number,
        duration_ms: payload.duration_ms as number,
        lace_count: payload.lace_count as number,
        planned_duration_ms: (payload.planned_duration_ms as number | null) ?? null,
        origin: (payload.origin as string | null) ?? null,
        created_at: TIMESTAMP,
      };
      rows.set(recordId, row);
      upsertCallCounts.set(recordId, (upsertCallCounts.get(recordId) ?? 0) + 1);
      return { status: 'succeeded', row };
    },

    setFailPush: (fail: boolean) => {
      failPush = fail;
    },
    setFailPull: (fail: boolean) => {
      failPull = fail;
    },
    getRow: (id: string) => rows.get(id),
    getRowCount: () => rows.size,
    getUpsertCallCount: (id: string) => upsertCallCounts.get(id) ?? 0,
    getPushAttemptCount: (id: string) => pushAttemptCounts.get(id) ?? 0,
  };
}

interface Driver {
  readonly setIdentity: (next: Identity) => void;
}

// Same test-only stand-in for `IdentityProvider` as
// `use-custom-trick-domain-sync.test.tsx` -- lets a test drive identity
// switches directly while exercising the real `IdentityHandleContext` the
// production hook (and, transitively, `usePracticeHistoryDomainSync`) reads
// from.
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
  history?: PracticeHistory;
  recordSession?: (session: PracticeSessionRecord) => void;
  runSync?: ReturnType<typeof usePracticeHistoryDomainSync>['runSync'];
  isSyncing?: boolean;
}

function makeHarness(
  initialHistory: PracticeHistory,
  getTransport: () => FakeTransport | undefined,
  captured: Captured,
) {
  return function Harness() {
    const [history, setHistory] = useState(initialHistory);
    const sync = usePracticeHistoryDomainSync({
      history,
      hasHydratedHistory: true,
      dispatchHistory: (action) => {
        if (action.type === 'historyRestored') setHistory(action.history);
      },
      getTransport,
    });

    useEffect(() => {
      captured.history = history;
      // Test-only local mutation, bypassing the reducer's SeshSummary
      // requirement -- appends a session directly the same way the
      // provider's `recordCompletedSesh` would, for the purpose of
      // exercising the sync driver's diff/outbox behavior.
      captured.recordSession = (session: PracticeSessionRecord) => {
        setHistory((current) =>
          current.sessions.some((existing) => existing.id === session.id)
            ? current
            : { sessions: [...current.sessions, session] },
        );
      };
      captured.runSync = sync.runSync;
      captured.isSyncing = sync.isSyncing;
    });

    return <Text>{JSON.stringify(history)}</Text>;
  };
}

async function mountHarness(
  initialHistory: PracticeHistory,
  getTransport: () => FakeTransport | undefined,
  identity: Identity = USER_IDENTITY,
) {
  const captured: Captured = {};
  const Harness = makeHarness(initialHistory, getTransport, captured);
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

function makeSession(id: string, overrides: Partial<PracticeSessionRecord> = {}): PracticeSessionRecord {
  return {
    id,
    trickId: 'lighthouse',
    trickName: 'Lighthouse',
    startedAt: 1_000,
    completedAt: 5_000,
    durationMs: 4_000,
    laceCount: 2,
    ...overrides,
  };
}

describe('usePracticeHistoryDomainSync', () => {
  // Every test in this suite uses the same fixed USER_IDENTITY -- without
  // clearing between tests, a later test's "fresh envelope" would actually
  // read an earlier test's persisted (mocked) AsyncStorage data.
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('records sessions offline: enqueues outbox ops, persists them, and reloads on remount', async () => {
    const transport = createFakePracticeHistorySyncTransport();
    transport.setFailPush(true);

    const { root, captured } = await mountHarness(INITIAL_PRACTICE_HISTORY, () => transport, USER_IDENTITY);
    await flush();

    act(() => {
      captured.recordSession?.(makeSession('session-offline-1'));
    });
    await flush();
    act(() => {
      captured.recordSession?.(makeSession('session-offline-2', { startedAt: 2_000, completedAt: 6_000 }));
    });
    await flush();

    expect(transport.getRow('session-offline-1')).toBeUndefined();
    expect(transport.getRow('session-offline-2')).toBeUndefined();

    act(() => {
      root.unmount();
    });

    // Remount under the same identity, still offline -- the persisted
    // envelope for this identity must still carry both pending operations
    // (durability).
    const second = await mountHarness(INITIAL_PRACTICE_HISTORY, () => transport, USER_IDENTITY);
    await flush();

    transport.setFailPush(false);
    await act(async () => {
      await second.captured.runSync?.('manual');
    });
    await flush();

    expect(transport.getRow('session-offline-1')?.trick_id).toBe('lighthouse');
    expect(transport.getRow('session-offline-2')?.trick_id).toBe('lighthouse');

    act(() => {
      second.root.unmount();
    });
  });

  it('reload and retry after a lost acknowledgement: a pending op whose push already landed server-side is absorbed with no duplicate', async () => {
    const landedSession = makeSession('session-lost-ack');
    // The pull already contains a row matching this still-pending local
    // outbox operation -- simulating "the push actually landed, the ack was
    // lost, and now this device is retrying."
    const transport = createFakePracticeHistorySyncTransport({ seedRows: [toRow(landedSession)] });

    const { root, captured } = await mountHarness(INITIAL_PRACTICE_HISTORY, () => transport, USER_IDENTITY);
    await flush();

    // Local state doesn't know the push landed -- it still has the session
    // queued as a pending local mutation (simulated directly, since the
    // real push never actually happened from this process's perspective).
    transport.setFailPush(true);
    act(() => {
      captured.recordSession?.(landedSession);
    });
    await flush();
    transport.setFailPush(false);

    await act(async () => {
      await captured.runSync?.('manual');
    });
    await flush();

    // Exactly one row server-side, exactly one session locally.
    expect(transport.getRowCount()).toBe(1);
    expect(captured.history?.sessions).toHaveLength(1);
    expect(captured.history?.sessions[0]?.id).toBe('session-lost-ack');

    // The push attempt for the pending op completed via 23505-as-success in
    // the fake transport (superseded, not left forever pending) -- proven
    // by a second sync run not re-attempting it once acknowledged, or by no
    // duplicate ever appearing regardless. Either way: no infinite pending
    // state.
    await act(async () => {
      await captured.runSync?.('manual');
    });
    await flush();
    expect(transport.getRowCount()).toBe(1);

    act(() => {
      root.unmount();
    });
  });

  it('deduplicates by stable record identity: a session already present locally is not double-counted after a pull returns it again', async () => {
    const session = makeSession('session-dedupe');
    const transport = createFakePracticeHistorySyncTransport({ seedRows: [toRow(session)] });

    const { root, captured } = await mountHarness({ sessions: [session] }, () => transport, USER_IDENTITY);
    await flush();

    await act(async () => {
      await captured.runSync?.('manual');
    });
    await flush();
    await act(async () => {
      await captured.runSync?.('manual');
    });
    await flush();

    expect(captured.history?.sessions).toHaveLength(1);
    const stats = aggregatePracticeStats(captured.history?.sessions ?? []);
    expect(stats.sessionCount).toBe(1);
    expect(stats.totalLaces).toBe(session.laceCount);

    act(() => {
      root.unmount();
    });
  });

  it('second-browser rehydrate: a fresh envelope pulls a fake-seeded fixture and the primary reducer matches it exactly', async () => {
    const seeded = [makeSession('session-seed-1'), makeSession('session-seed-2', { startedAt: 10_000, completedAt: 20_000 })];
    const transport = createFakePracticeHistorySyncTransport({ seedRows: seeded.map(toRow) });

    const { root, captured } = await mountHarness(INITIAL_PRACTICE_HISTORY, () => transport, USER_IDENTITY);
    await flush();

    expect(captured.history?.sessions.map((session) => session.id).sort()).toEqual(['session-seed-1', 'session-seed-2']);

    act(() => {
      root.unmount();
    });
  });

  it('derives identical Stats locally and after second-browser rehydration', async () => {
    const fixture: readonly PracticeSessionRecord[] = [
      makeSession('stats-1', { trickId: 'lighthouse', trickName: 'Lighthouse', laceCount: 3 }),
      makeSession('stats-2', { trickId: 'lighthouse', trickName: 'Lighthouse', laceCount: 5, startedAt: 2_000, completedAt: 8_000, durationMs: 6_000 }),
      makeSession('stats-3', { trickId: 'big-cup', trickName: 'Big cup', laceCount: 1, startedAt: 3_000, completedAt: 4_000, durationMs: 1_000 }),
      makeSession('stats-4', { trickId: 'big-cup', trickName: 'Big cup', laceCount: 0, startedAt: 4_000, completedAt: 9_000, durationMs: 5_000, origin: 'assessment' }),
    ];
    const expectedStats = aggregatePracticeStats(fixture);

    // (a) recorded locally, one at a time, no sync.
    const transportA = createFakePracticeHistorySyncTransport();
    transportA.setFailPush(true); // sync never actually needed for this arm
    const localArm = await mountHarness(INITIAL_PRACTICE_HISTORY, () => transportA, USER_IDENTITY);
    await flush();
    for (const session of fixture) {
      act(() => {
        localArm.captured.recordSession?.(session);
      });
      await flush(1);
    }
    await flush();
    const localStats = aggregatePracticeStats(localArm.captured.history?.sessions ?? []);
    expect(localStats).toEqual(expectedStats);
    act(() => {
      localArm.root.unmount();
    });

    // (b) starts empty, seeds the fake transport's pull with the fixture,
    // runs a sync, computes Stats over the rehydrated state.
    const transportB = createFakePracticeHistorySyncTransport({ seedRows: fixture.map(toRow) });
    const rehydratedArm = await mountHarness(INITIAL_PRACTICE_HISTORY, () => transportB, USER_IDENTITY);
    await flush();
    await act(async () => {
      await rehydratedArm.captured.runSync?.('manual');
    });
    await flush();
    const rehydratedStats = aggregatePracticeStats(rehydratedArm.captured.history?.sessions ?? []);
    expect(rehydratedStats).toEqual(expectedStats);
    act(() => {
      rehydratedArm.root.unmount();
    });

    expect(localStats).toEqual(rehydratedStats);
  });

  it('guest identity never enqueues operations and runSync is a no-op', async () => {
    const transport = createFakePracticeHistorySyncTransport();
    const { root, captured } = await mountHarness(INITIAL_PRACTICE_HISTORY, () => transport, GUEST_IDENTITY);
    await flush();

    act(() => {
      captured.recordSession?.(makeSession('session-guest'));
    });
    await flush();

    let result: Awaited<ReturnType<NonNullable<Captured['runSync']>>> | undefined;
    await act(async () => {
      result = await captured.runSync?.('manual');
    });
    expect(result?.outcome).toEqual({ status: 'succeeded' });
    expect(transport.getRow('session-guest')).toBeUndefined();

    act(() => {
      root.unmount();
    });
  });
});
