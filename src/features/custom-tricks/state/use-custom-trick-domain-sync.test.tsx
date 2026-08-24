import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { type PropsWithChildren, useEffect, useState } from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required by jest hoisting
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { INITIAL_CUSTOM_TRICKS, type CustomTrickCollection } from '@/features/custom-tricks/model/custom-trick';
import type { CustomTrickRow } from '@/features/custom-tricks/persistence/custom-trick-cloud-repository';
import { useCustomTrickDomainSync } from '@/features/custom-tricks/state/use-custom-trick-domain-sync';
import { createIdentityContext } from '@/shared/persistence/identity-context';
import { createUserIdentity, GUEST_IDENTITY, type Identity } from '@/shared/persistence/identity';
import { IdentityHandleContext } from '@/shared/persistence/identity-provider';
import type { SyncTransportRepository } from '@/shared/sync/transport';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const USER_IDENTITY: Identity = createUserIdentity(USER_ID)!;
const TIMESTAMP = '2026-01-01T00:00:00.000Z';

interface FakeTransportOptions {
  readonly seedRows?: readonly CustomTrickRow[];
}

interface FakeTransport extends SyncTransportRepository<CustomTrickRow> {
  setFailPush(fail: boolean): void;
  setFailPull(fail: boolean): void;
  getRow(id: string): CustomTrickRow | undefined;
  getUpsertCallCount(id: string): number;
  getPushAttemptCount(id: string): number;
}

function createFakeCustomTrickSyncTransport(options: FakeTransportOptions = {}): FakeTransport {
  const rows = new Map<string, CustomTrickRow>((options.seedRows ?? []).map((row) => [row.id, row]));
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

      const trickId = request.recordId;
      const existing = rows.get(trickId);

      if (request.operationType === 'delete') {
        if (request.expectedRevision !== null && existing && existing.revision !== request.expectedRevision) {
          return {
            status: 'conflict',
            conflict: {
              operationId: request.operationId,
              recordId: trickId,
              expectedRevision: request.expectedRevision,
              serverRevision: existing.revision,
            },
          };
        }
        rows.delete(trickId);
        return {
          status: 'succeeded',
          row:
            existing ??
            ({
              id: trickId,
              user_id: USER_ID,
              kind: 'standalone',
              name: 'deleted',
              kentei_rank: null,
              steps: null,
              revision: 0,
              created_at: TIMESTAMP,
              updated_at: TIMESTAMP,
            } as CustomTrickRow),
        };
      }

      if (request.expectedRevision !== null && existing && existing.revision !== request.expectedRevision) {
        return {
          status: 'conflict',
          conflict: {
            operationId: request.operationId,
            recordId: trickId,
            expectedRevision: request.expectedRevision,
            serverRevision: existing.revision,
          },
        };
      }
      const payload = request.payload as Record<string, unknown>;
      const row: CustomTrickRow = {
        id: trickId,
        user_id: USER_ID,
        kind: (payload.kind as 'standalone' | 'sequence') ?? 'standalone',
        name: (payload.name as string) ?? '',
        kentei_rank: (payload.kentei_rank as number | null) ?? null,
        steps: (payload.steps as CustomTrickRow['steps']) ?? null,
        created_at: TIMESTAMP,
        updated_at: TIMESTAMP,
        revision: (existing?.revision ?? 0) + 1,
      };
      rows.set(trickId, row);
      upsertCallCounts.set(trickId, (upsertCallCounts.get(trickId) ?? 0) + 1);
      return { status: 'succeeded', row };
    },

    setFailPush: (fail: boolean) => {
      failPush = fail;
    },
    setFailPull: (fail: boolean) => {
      failPull = fail;
    },
    getRow: (id: string) => rows.get(id),
    getUpsertCallCount: (id: string) => upsertCallCounts.get(id) ?? 0,
    getPushAttemptCount: (id: string) => pushAttemptCounts.get(id) ?? 0,
  };
}

interface Driver {
  readonly setIdentity: (next: Identity) => void;
}

// Same test-only stand-in for `IdentityProvider` as
// `use-profile-domain-sync.test.tsx` -- lets a test drive identity switches
// directly while exercising the real `IdentityHandleContext` the production
// hook (and, transitively, `useCustomTrickDomainSync`) reads from.
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
  collection?: CustomTrickCollection;
  setCollection?: (next: CustomTrickCollection) => void;
  runSync?: ReturnType<typeof useCustomTrickDomainSync>['runSync'];
  isSyncing?: boolean;
}

function makeHarness(
  initialCollection: CustomTrickCollection,
  getTransport: () => FakeTransport | undefined,
  captured: Captured,
) {
  return function Harness() {
    const [collection, setCollection] = useState(initialCollection);
    const sync = useCustomTrickDomainSync({
      collection,
      hasHydratedCollection: true,
      dispatchCollection: (action) => {
        if (action.type === 'customTricksRestored') setCollection(action.collection);
      },
      getTransport,
    });

    useEffect(() => {
      captured.collection = collection;
      captured.setCollection = setCollection;
      captured.runSync = sync.runSync;
      captured.isSyncing = sync.isSyncing;
    });

    return <Text>{JSON.stringify(collection)}</Text>;
  };
}

async function mountHarness(
  initialCollection: CustomTrickCollection,
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

describe('useCustomTrickDomainSync', () => {
  // Every test in this suite uses the same fixed USER_IDENTITY -- without
  // clearing between tests, a later test's "fresh envelope" would actually
  // read an earlier test's persisted (mocked) AsyncStorage data.
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('offline create of a standalone trick and a sequence: enqueues outbox ops, persists them, and reloads on remount', async () => {
    const transport = createFakeCustomTrickSyncTransport();
    transport.setFailPush(true);

    const standalone: CustomTrickCollection = {
      tricks: [{ id: 'custom-standalone', kind: 'standalone', name: 'Around the World' }],
    };
    const withSequence: CustomTrickCollection = {
      tricks: [
        ...standalone.tricks,
        {
          id: 'custom-sequence',
          kind: 'sequence',
          name: 'Morning line',
          steps: [
            { kind: 'customText', name: 'a' },
            { kind: 'customText', name: 'b' },
          ],
        },
      ],
    };

    const { root, captured } = await mountHarness(INITIAL_CUSTOM_TRICKS, () => transport, USER_IDENTITY);
    await flush();

    act(() => {
      captured.setCollection?.(standalone);
    });
    await flush();
    act(() => {
      captured.setCollection?.(withSequence);
    });
    await flush();

    expect(transport.getRow('custom-standalone')).toBeUndefined();
    expect(transport.getRow('custom-sequence')).toBeUndefined();

    act(() => {
      root.unmount();
    });

    // Remount under the same identity, still offline -- the persisted
    // envelope for this identity must still carry both pending operations.
    const second = await mountHarness(INITIAL_CUSTOM_TRICKS, () => transport, USER_IDENTITY);
    await flush();

    transport.setFailPush(false);
    await act(async () => {
      await second.captured.runSync?.('manual');
    });
    await flush();

    expect(transport.getRow('custom-standalone')?.name).toBe('Around the World');
    expect(transport.getRow('custom-sequence')?.name).toBe('Morning line');

    act(() => {
      second.root.unmount();
    });
  });

  it('offline edit and offline delete survive a remount', async () => {
    const transport = createFakeCustomTrickSyncTransport();
    transport.setFailPush(true);

    const created: CustomTrickCollection = {
      tricks: [{ id: 'custom-1', kind: 'standalone', name: 'Original' }],
    };
    const edited: CustomTrickCollection = {
      tricks: [{ id: 'custom-1', kind: 'standalone', name: 'Edited' }],
    };
    const deleted: CustomTrickCollection = { tricks: [] };

    const { root, captured } = await mountHarness(INITIAL_CUSTOM_TRICKS, () => transport, USER_IDENTITY);
    await flush();
    act(() => {
      captured.setCollection?.(created);
    });
    await flush();
    act(() => {
      captured.setCollection?.(edited);
    });
    await flush();
    act(() => {
      captured.setCollection?.(deleted);
    });
    await flush();

    act(() => {
      root.unmount();
    });

    const second = await mountHarness(INITIAL_CUSTOM_TRICKS, () => transport, USER_IDENTITY);
    await flush();

    transport.setFailPush(false);
    await act(async () => {
      await second.captured.runSync?.('manual');
    });
    await flush();

    // Coalesced to a single delete op for custom-1 (create -> edit -> delete
    // all landed as one pending op per record, per `replacePendingOperationForRecord`).
    expect(transport.getRow('custom-1')).toBeUndefined();

    act(() => {
      second.root.unmount();
    });
  });

  it('reconnect: pending ops push, get acknowledged, and no duplicate rows are created', async () => {
    const transport = createFakeCustomTrickSyncTransport();
    transport.setFailPush(true);

    const { root, captured } = await mountHarness(INITIAL_CUSTOM_TRICKS, () => transport, USER_IDENTITY);
    await flush();

    act(() => {
      captured.setCollection?.({ tricks: [{ id: 'custom-1', kind: 'standalone', name: 'Reconnect trick' }] });
    });
    await flush();

    expect(transport.getRow('custom-1')).toBeUndefined();

    transport.setFailPush(false);
    await act(async () => {
      await captured.runSync?.('manual');
    });
    await flush();

    expect(transport.getRow('custom-1')?.name).toBe('Reconnect trick');
    expect(transport.getUpsertCallCount('custom-1')).toBe(1);

    // A second sync run with no new local mutations must not re-push
    // anything (the op was acknowledged and removed from the outbox).
    await act(async () => {
      await captured.runSync?.('manual');
    });
    await flush();
    expect(transport.getUpsertCallCount('custom-1')).toBe(1);

    act(() => {
      root.unmount();
    });
  });

  it('second-browser rehydrate: a fresh envelope pulls a fake-seeded fixture and the primary reducer matches it exactly', async () => {
    const seededStandalone: CustomTrickRow = {
      id: 'custom-standalone-seed',
      user_id: USER_ID,
      kind: 'standalone',
      name: 'Seeded standalone',
      kentei_rank: 5,
      steps: null,
      created_at: TIMESTAMP,
      updated_at: TIMESTAMP,
      revision: 1,
    };
    const seededSequence: CustomTrickRow = {
      id: 'custom-sequence-seed',
      user_id: USER_ID,
      kind: 'sequence',
      name: 'Seeded sequence',
      kentei_rank: null,
      steps: [
        { kind: 'customText', name: 'a' },
        { kind: 'customText', name: 'b' },
      ],
      created_at: TIMESTAMP,
      updated_at: TIMESTAMP,
      revision: 1,
    };
    const transport = createFakeCustomTrickSyncTransport({ seedRows: [seededStandalone, seededSequence] });

    const { root, captured } = await mountHarness(INITIAL_CUSTOM_TRICKS, () => transport, USER_IDENTITY);
    await flush();

    expect(captured.collection).toEqual({
      tricks: [
        { id: 'custom-standalone-seed', kind: 'standalone', name: 'Seeded standalone', kenteiRank: 5 },
        {
          id: 'custom-sequence-seed',
          kind: 'sequence',
          name: 'Seeded sequence',
          steps: [
            { kind: 'customText', name: 'a' },
            { kind: 'customText', name: 'b' },
          ],
        },
      ],
    });

    act(() => {
      root.unmount();
    });
  });

  it('preserves the stored step-name snapshot after a pull-adopt even when it diverges from the (absent) live source trick', async () => {
    // Simulates the source trick having been renamed after the sequence was
    // created: the sequence step's stored `name` ("Old Big Cup Name") is the
    // only data this fixture provides for `sourceTrickId` -- there is no
    // live row for it in this fake-seeded fixture at all.
    const seededSequence: CustomTrickRow = {
      id: 'custom-sequence-historical',
      user_id: USER_ID,
      kind: 'sequence',
      name: 'Historical sequence',
      kentei_rank: null,
      steps: [
        { kind: 'existingTrick', sourceTrickId: 'renamed-or-deleted-source', name: 'Old Big Cup Name' },
        { kind: 'customText', name: 'Freehand spike' },
      ],
      created_at: TIMESTAMP,
      updated_at: TIMESTAMP,
      revision: 1,
    };
    const transport = createFakeCustomTrickSyncTransport({ seedRows: [seededSequence] });

    const { root, captured } = await mountHarness(INITIAL_CUSTOM_TRICKS, () => transport, USER_IDENTITY);
    await flush();

    const restoredSequence = captured.collection?.tricks.find((trick) => trick.id === 'custom-sequence-historical');
    expect(restoredSequence?.kind).toBe('sequence');
    if (restoredSequence?.kind === 'sequence') {
      expect(restoredSequence.steps[0]).toEqual({
        kind: 'existingTrick',
        sourceTrickId: 'renamed-or-deleted-source',
        name: 'Old Big Cup Name', // the stored snapshot, not a live re-derivation
      });
    }

    act(() => {
      root.unmount();
    });
  });

  it('a stale-revision conflict on one trick does not block an unrelated trick, and the conflicted op stays pending', async () => {
    const transport = createFakeCustomTrickSyncTransport();
    const { root, captured } = await mountHarness(INITIAL_CUSTOM_TRICKS, () => transport, USER_IDENTITY);
    await flush();

    // First, a clean successful create so this device observes a real
    // revision (1) for custom-1 in its envelope's revision cache.
    act(() => {
      captured.setCollection?.({ tricks: [{ id: 'custom-1', kind: 'standalone', name: 'First' }] });
    });
    await flush();
    await act(async () => {
      await captured.runSync?.('manual');
    });
    await flush();
    expect(transport.getRow('custom-1')?.revision).toBe(1);

    // Offline: edit custom-1 (its cached expectedRevision is still 1) and
    // add an unrelated custom-2.
    transport.setFailPush(true);
    act(() => {
      captured.setCollection?.({
        tricks: [
          { id: 'custom-1', kind: 'standalone', name: 'Edited locally' },
          { id: 'custom-2', kind: 'standalone', name: 'Second' },
        ],
      });
    });
    await flush();

    // A concurrent write from another device lands on custom-1 server-side,
    // bumping its revision to 2 -- this device's still-pending custom-1 op
    // (cached expectedRevision 1) will now genuinely conflict on push.
    // Bypasses this run's `failPush` flag (it models a write from a
    // different, online device, not this device's own queued push).
    transport.setFailPush(false);
    await transport.push({
      operationId: 'seed-conflict',
      recordId: 'custom-1',
      operationType: 'upsert',
      payload: { user_id: USER_ID, id: 'custom-1', kind: 'standalone', name: 'Concurrent edit', kentei_rank: null, steps: null },
      expectedRevision: 1,
    });
    expect(transport.getRow('custom-1')?.revision).toBe(2);

    await act(async () => {
      await captured.runSync?.('manual');
    });
    await flush();

    // custom-2 (unrelated) succeeded regardless of custom-1's conflict.
    expect(transport.getRow('custom-2')?.name).toBe('Second');
    const custom2AttemptsAfterFirstRun = transport.getPushAttemptCount('custom-2');

    // custom-1's conflicted push never overwrote the server row.
    expect(transport.getRow('custom-1')?.name).toBe('Concurrent edit');
    expect(transport.getRow('custom-1')?.revision).toBe(2);

    // The conflicted op is still pending (unacknowledged), proven by a
    // second sync run re-attempting a push for custom-1 -- an acknowledged
    // operation would never be retried. custom-2, already acknowledged and
    // removed from the outbox, is not re-attempted.
    const custom1AttemptsBeforeSecondRun = transport.getPushAttemptCount('custom-1');
    await act(async () => {
      await captured.runSync?.('manual');
    });
    await flush();
    expect(transport.getPushAttemptCount('custom-1')).toBeGreaterThan(custom1AttemptsBeforeSecondRun);
    expect(transport.getPushAttemptCount('custom-2')).toBe(custom2AttemptsAfterFirstRun);

    act(() => {
      root.unmount();
    });
  });

  it('rapid edits to the same trick id offline coalesce to one pending outbox operation', async () => {
    const transport = createFakeCustomTrickSyncTransport();
    transport.setFailPush(true);

    const { root, captured } = await mountHarness(INITIAL_CUSTOM_TRICKS, () => transport, USER_IDENTITY);
    await flush();

    for (const name of ['Name 1', 'Name 2', 'Name 3', 'Name 4', 'Final name']) {
      act(() => {
        captured.setCollection?.({ tricks: [{ id: 'custom-1', kind: 'standalone', name }] });
      });
      await flush(1);
    }
    await flush();

    transport.setFailPush(false);
    await act(async () => {
      await captured.runSync?.('manual');
    });
    await flush();

    expect(transport.getRow('custom-1')?.name).toBe('Final name');
    expect(transport.getRow('custom-1')?.revision).toBe(1); // exactly one push landed, not five
    expect(transport.getUpsertCallCount('custom-1')).toBe(1);

    act(() => {
      root.unmount();
    });
  });

  it('guest identity never enqueues operations and runSync is a no-op', async () => {
    const transport = createFakeCustomTrickSyncTransport();
    const { root, captured } = await mountHarness(INITIAL_CUSTOM_TRICKS, () => transport, GUEST_IDENTITY);
    await flush();

    act(() => {
      captured.setCollection?.({ tricks: [{ id: 'custom-1', kind: 'standalone', name: 'Guest trick' }] });
    });
    await flush();

    let result: Awaited<ReturnType<NonNullable<Captured['runSync']>>> | undefined;
    await act(async () => {
      result = await captured.runSync?.('manual');
    });
    expect(result?.outcome).toEqual({ status: 'succeeded' });
    expect(transport.getRow('custom-1')).toBeUndefined();

    act(() => {
      root.unmount();
    });
  });
});
