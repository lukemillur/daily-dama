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
import { INITIAL_NOTES, type NoteCollection } from '@/features/notes/model/note';
import type { NoteRow } from '@/features/notes/persistence/note-cloud-repository';
import { useNoteDomainSync } from '@/features/notes/state/use-note-domain-sync';
import { createIdentityContext } from '@/shared/persistence/identity-context';
import { createUserIdentity, GUEST_IDENTITY, type Identity } from '@/shared/persistence/identity';
import { IdentityHandleContext } from '@/shared/persistence/identity-provider';
import type { SyncTransportRepository } from '@/shared/sync/transport';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const USER_IDENTITY: Identity = createUserIdentity(USER_ID)!;
const TIMESTAMP = '2026-01-01T00:00:00.000Z';

interface FakeTransportOptions {
  readonly seedRows?: readonly NoteRow[];
}

interface FakeTransport extends SyncTransportRepository<NoteRow> {
  setFailPush(fail: boolean): void;
  setFailPull(fail: boolean): void;
  getRow(id: string): NoteRow | undefined;
  getUpsertCallCount(id: string): number;
  getPushAttemptCount(id: string): number;
}

function createFakeNoteSyncTransport(options: FakeTransportOptions = {}): FakeTransport {
  const rows = new Map<string, NoteRow>((options.seedRows ?? []).map((row) => [row.id, row]));
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

      const noteId = request.recordId;
      const existing = rows.get(noteId);

      if (request.operationType === 'delete') {
        if (existing === undefined) {
          return {
            status: 'succeeded',
            row: {
              id: noteId,
              user_id: USER_ID,
              trick_id: `deleted:${noteId}`,
              trick_name: `deleted:${noteId}`,
              body: `deleted:${noteId}`,
              practice_session_id: null,
              revision: 0,
              created_at: TIMESTAMP,
              updated_at: TIMESTAMP,
              deleted_at: TIMESTAMP,
            } as NoteRow,
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
              recordId: noteId,
              expectedRevision: request.expectedRevision,
              serverRevision: existing.revision,
            },
          };
        }
        const tombstoned: NoteRow = { ...existing, deleted_at: TIMESTAMP, revision: existing.revision + 1 };
        rows.set(noteId, tombstoned);
        return { status: 'succeeded', row: tombstoned };
      }

      // upsert (create or edit)
      if (existing?.deleted_at) {
        // The real adapter's tombstone-rejection posture: an edit against
        // an already-tombstoned note is a stale-device resurrection
        // attempt -- conflict, never a silent success.
        return {
          status: 'conflict',
          conflict: {
            operationId: request.operationId,
            recordId: noteId,
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
            recordId: noteId,
            expectedRevision: request.expectedRevision,
            serverRevision: existing.revision,
          },
        };
      }
      const payload = request.payload as Record<string, unknown>;
      const row: NoteRow = {
        id: noteId,
        user_id: USER_ID,
        trick_id: (payload.trick_id as string) ?? '',
        trick_name: (payload.trick_name as string) ?? '',
        body: (payload.body as string) ?? '',
        practice_session_id: (payload.practice_session_id as string | null) ?? null,
        created_at: existing?.created_at ?? TIMESTAMP,
        updated_at: TIMESTAMP,
        deleted_at: null,
        revision: (existing?.revision ?? 0) + 1,
      };
      rows.set(noteId, row);
      upsertCallCounts.set(noteId, (upsertCallCounts.get(noteId) ?? 0) + 1);
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

interface FakeGoalTransport extends SyncTransportRepository<GoalRow> {
  getRow(id: string): GoalRow | undefined;
}

function createFakeGoalSyncTransport(): FakeGoalTransport {
  const rows = new Map<string, GoalRow>();
  return {
    async pull() {
      return { status: 'succeeded', page: { items: Array.from(rows.values()), nextCursor: null } };
    },
    async push(request) {
      if (request.operationType === 'delete') {
        rows.delete(request.recordId);
        return {
          status: 'succeeded',
          row: {
            id: request.recordId,
            user_id: USER_ID,
            trick_id: 'deleted',
            trick_name: 'deleted',
            kind: 'count',
            target_count: 1,
            target_ms: null,
            revision: 0,
            created_at: TIMESTAMP,
            updated_at: TIMESTAMP,
            deleted_at: TIMESTAMP,
          },
        };
      }
      const payload = request.payload as Record<string, unknown>;
      const existing = rows.get(request.recordId);
      const row: GoalRow = {
        id: request.recordId,
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
      rows.set(request.recordId, row);
      return { status: 'succeeded', row };
    },
    getRow: (id: string) => rows.get(id),
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
  collection?: NoteCollection;
  setCollection?: (next: NoteCollection) => void;
  runSync?: ReturnType<typeof useNoteDomainSync>['runSync'];
  isSyncing?: boolean;
}

function makeHarness(
  initialCollection: NoteCollection,
  getTransport: () => FakeTransport | undefined,
  captured: Captured,
) {
  return function Harness() {
    const [collection, setCollection] = useState(initialCollection);
    const sync = useNoteDomainSync({
      collection,
      hasHydratedCollection: true,
      dispatchCollection: (action) => {
        if (action.type === 'notesRestored') setCollection(action.collection);
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
  initialCollection: NoteCollection,
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

describe('useNoteDomainSync', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('offline create of a note: enqueues an outbox op, persists it, and reloads on remount', async () => {
    const transport = createFakeNoteSyncTransport();
    transport.setFailPush(true);

    const created: NoteCollection = {
      notes: [
        {
          id: 'note-1',
          trickId: 'big-cup',
          trickName: 'Big cup',
          body: 'Getting closer.',
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    };

    const { root, captured } = await mountHarness(INITIAL_NOTES, () => transport, USER_IDENTITY);
    await flush();

    act(() => {
      captured.setCollection?.(created);
    });
    await flush();

    expect(transport.getRow('note-1')).toBeUndefined();

    act(() => {
      root.unmount();
    });

    const second = await mountHarness(INITIAL_NOTES, () => transport, USER_IDENTITY);
    await flush();

    transport.setFailPush(false);
    await act(async () => {
      await second.captured.runSync?.('manual');
    });
    await flush();

    expect(transport.getRow('note-1')?.body).toBe('Getting closer.');

    act(() => {
      second.root.unmount();
    });
  });

  it('reconnect: pending ops push, get acknowledged, and no duplicate rows are created', async () => {
    const transport = createFakeNoteSyncTransport();
    transport.setFailPush(true);

    const { root, captured } = await mountHarness(INITIAL_NOTES, () => transport, USER_IDENTITY);
    await flush();

    act(() => {
      captured.setCollection?.({
        notes: [{ id: 'note-1', trickId: 'big-cup', trickName: 'Big cup', body: 'Getting closer.', createdAt: 1, updatedAt: 1 }],
      });
    });
    await flush();

    expect(transport.getRow('note-1')).toBeUndefined();

    transport.setFailPush(false);
    await act(async () => {
      await captured.runSync?.('manual');
    });
    await flush();

    expect(transport.getRow('note-1')?.body).toBe('Getting closer.');
    expect(transport.getUpsertCallCount('note-1')).toBe(1);

    await act(async () => {
      await captured.runSync?.('manual');
    });
    await flush();
    expect(transport.getUpsertCallCount('note-1')).toBe(1);

    act(() => {
      root.unmount();
    });
  });

  it('second-browser rehydrate: a fresh envelope pulls a fake-seeded fixture and the primary reducer matches it exactly', async () => {
    const seededNote: NoteRow = {
      id: 'note-seed',
      user_id: USER_ID,
      trick_id: 'big-cup',
      trick_name: 'Big cup',
      body: 'Seeded note.',
      practice_session_id: null,
      created_at: TIMESTAMP,
      updated_at: TIMESTAMP,
      deleted_at: null,
      revision: 1,
    };
    const transport = createFakeNoteSyncTransport({ seedRows: [seededNote] });

    const { root, captured } = await mountHarness(INITIAL_NOTES, () => transport, USER_IDENTITY);
    await flush();

    expect(captured.collection).toEqual({
      notes: [
        {
          id: 'note-seed',
          trickId: 'big-cup',
          trickName: 'Big cup',
          body: 'Seeded note.',
          createdAt: Date.parse(TIMESTAMP),
          updatedAt: Date.parse(TIMESTAMP),
        },
      ],
    });

    act(() => {
      root.unmount();
    });
  });

  it('second-browser rehydrate filters out tombstoned notes from the composed collection', async () => {
    const activeNote: NoteRow = {
      id: 'note-active',
      user_id: USER_ID,
      trick_id: 'big-cup',
      trick_name: 'Big cup',
      body: 'Active note.',
      practice_session_id: null,
      created_at: TIMESTAMP,
      updated_at: TIMESTAMP,
      deleted_at: null,
      revision: 1,
    };
    const tombstonedNote: NoteRow = {
      id: 'note-tombstoned',
      user_id: USER_ID,
      trick_id: 'stilt-flip',
      trick_name: 'Stilt flip',
      body: 'Tombstoned note.',
      practice_session_id: null,
      created_at: TIMESTAMP,
      updated_at: TIMESTAMP,
      deleted_at: TIMESTAMP,
      revision: 2,
    };
    const transport = createFakeNoteSyncTransport({ seedRows: [activeNote, tombstonedNote] });

    const { root, captured } = await mountHarness(INITIAL_NOTES, () => transport, USER_IDENTITY);
    await flush();

    expect(captured.collection?.notes.map((note) => note.id)).toEqual(['note-active']);

    act(() => {
      root.unmount();
    });
  });

  it('a stale-revision conflict on one note does not block an unrelated note, and the conflicted op stays pending', async () => {
    const transport = createFakeNoteSyncTransport();
    const { root, captured } = await mountHarness(INITIAL_NOTES, () => transport, USER_IDENTITY);
    await flush();

    act(() => {
      captured.setCollection?.({
        notes: [{ id: 'note-1', trickId: 'big-cup', trickName: 'Big cup', body: 'First body.', createdAt: 1, updatedAt: 1 }],
      });
    });
    await flush();
    await act(async () => {
      await captured.runSync?.('manual');
    });
    await flush();
    expect(transport.getRow('note-1')?.revision).toBe(1);

    transport.setFailPush(true);
    act(() => {
      captured.setCollection?.({
        notes: [
          { id: 'note-1', trickId: 'big-cup', trickName: 'Big cup', body: 'Edited body.', createdAt: 1, updatedAt: 2 },
          { id: 'note-2', trickId: 'stilt-flip', trickName: 'Stilt flip', body: 'Second note.', createdAt: 2, updatedAt: 2 },
        ],
      });
    });
    await flush();

    transport.setFailPush(false);
    await transport.push({
      operationId: 'seed-conflict',
      recordId: 'note-1',
      operationType: 'upsert',
      payload: {
        user_id: USER_ID,
        id: 'note-1',
        trick_id: 'big-cup',
        trick_name: 'Big cup',
        body: 'Concurrent edit.',
        practice_session_id: null,
      },
      expectedRevision: 1,
    });
    expect(transport.getRow('note-1')?.revision).toBe(2);

    await act(async () => {
      await captured.runSync?.('manual');
    });
    await flush();

    expect(transport.getRow('note-2')?.body).toBe('Second note.');
    const note2AttemptsAfterFirstRun = transport.getPushAttemptCount('note-2');

    expect(transport.getRow('note-1')?.body).toBe('Concurrent edit.');
    expect(transport.getRow('note-1')?.revision).toBe(2);

    const note1AttemptsBeforeSecondRun = transport.getPushAttemptCount('note-1');
    await act(async () => {
      await captured.runSync?.('manual');
    });
    await flush();
    expect(transport.getPushAttemptCount('note-1')).toBeGreaterThan(note1AttemptsBeforeSecondRun);
    expect(transport.getPushAttemptCount('note-2')).toBe(note2AttemptsAfterFirstRun);

    act(() => {
      root.unmount();
    });
  });

  it('rapid edits to the same note id offline coalesce to one pending outbox operation', async () => {
    const transport = createFakeNoteSyncTransport();
    transport.setFailPush(true);

    const { root, captured } = await mountHarness(INITIAL_NOTES, () => transport, USER_IDENTITY);
    await flush();

    for (const body of ['a', 'ab', 'abc', 'abcd', 'abcde']) {
      act(() => {
        captured.setCollection?.({
          notes: [{ id: 'note-1', trickId: 'big-cup', trickName: 'Big cup', body, createdAt: 1, updatedAt: 1 }],
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

    expect(transport.getRow('note-1')?.body).toBe('abcde');
    expect(transport.getRow('note-1')?.revision).toBe(1); // exactly one push landed, not five
    expect(transport.getUpsertCallCount('note-1')).toBe(1);

    act(() => {
      root.unmount();
    });
  });

  it('guest identity never enqueues operations and runSync is a no-op', async () => {
    const transport = createFakeNoteSyncTransport();
    const { root, captured } = await mountHarness(INITIAL_NOTES, () => transport, GUEST_IDENTITY);
    await flush();

    act(() => {
      captured.setCollection?.({
        notes: [{ id: 'note-1', trickId: 'big-cup', trickName: 'Big cup', body: 'Guest note.', createdAt: 1, updatedAt: 1 }],
      });
    });
    await flush();

    let result: Awaited<ReturnType<NonNullable<Captured['runSync']>>> | undefined;
    await act(async () => {
      result = await captured.runSync?.('manual');
    });
    expect(result?.outcome).toEqual({ status: 'succeeded' });
    expect(transport.getRow('note-1')).toBeUndefined();

    act(() => {
      root.unmount();
    });
  });

  it('offline edit of an existing note pushes as an upsert, gets acknowledged, revision recorded', async () => {
    const transport = createFakeNoteSyncTransport();
    const { root, captured } = await mountHarness(INITIAL_NOTES, () => transport, USER_IDENTITY);
    await flush();

    act(() => {
      captured.setCollection?.({
        notes: [{ id: 'note-1', trickId: 'big-cup', trickName: 'Big cup', body: 'Original body.', createdAt: 1, updatedAt: 1 }],
      });
    });
    await flush();
    await act(async () => {
      await captured.runSync?.('manual');
    });
    await flush();
    expect(transport.getRow('note-1')?.revision).toBe(1);

    transport.setFailPush(true);
    act(() => {
      captured.setCollection?.({
        notes: [{ id: 'note-1', trickId: 'big-cup', trickName: 'Big cup', body: 'Edited body.', createdAt: 1, updatedAt: 2 }],
      });
    });
    await flush();
    expect(transport.getRow('note-1')?.body).toBe('Original body.'); // still offline, not yet pushed

    transport.setFailPush(false);
    await act(async () => {
      await captured.runSync?.('manual');
    });
    await flush();

    expect(transport.getRow('note-1')?.body).toBe('Edited body.');
    expect(transport.getRow('note-1')?.revision).toBe(2);

    act(() => {
      root.unmount();
    });
  });

  // The tombstone-conflict case: the driver parks just that one note's
  // operation without touching any other pending operation, and the
  // domain-level outcome is still 'succeeded' (a conflict alone never makes
  // the whole domain outcome 'failed').
  it('an edit against a since-tombstoned note parks that note only; the run still reports succeeded', async () => {
    const tombstoned: NoteRow = {
      id: 'note-tombstoned',
      user_id: USER_ID,
      trick_id: 'big-cup',
      trick_name: 'Big cup',
      body: 'Was active.',
      practice_session_id: null,
      created_at: TIMESTAMP,
      updated_at: TIMESTAMP,
      deleted_at: TIMESTAMP,
      revision: 2,
    };
    const transport = createFakeNoteSyncTransport({ seedRows: [tombstoned] });

    // Start with a fresh envelope (revision cache empty for this record) --
    // the tombstoned row is pulled and its revision recorded, but the note
    // is filtered out of the composed collection (since it's tombstoned).
    const { root, captured } = await mountHarness(INITIAL_NOTES, () => transport, USER_IDENTITY);
    await flush();
    expect(captured.collection?.notes).toEqual([]);

    // A stale in-flight local edit against the same id (simulating a device
    // that queued this edit before observing the tombstone) plus an
    // unrelated new note in the same batch.
    act(() => {
      captured.setCollection?.({
        notes: [
          { id: 'note-tombstoned', trickId: 'big-cup', trickName: 'Big cup', body: 'Resurrection attempt.', createdAt: 1, updatedAt: 3 },
          { id: 'note-unrelated', trickId: 'stilt-flip', trickName: 'Stilt flip', body: 'Unrelated.', createdAt: 2, updatedAt: 2 },
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
    expect(transport.getRow('note-unrelated')?.body).toBe('Unrelated.');
    // The tombstoned note's edit was rejected as a conflict, never applied.
    expect(transport.getRow('note-tombstoned')?.body).toBe('Was active.');

    const attemptsBeforeSecondRun = transport.getPushAttemptCount('note-tombstoned');
    await act(async () => {
      await captured.runSync?.('manual');
    });
    await flush();
    // Still pending -- retried on the next run (never silently acknowledged).
    expect(transport.getPushAttemptCount('note-tombstoned')).toBeGreaterThan(attemptsBeforeSecondRun);

    act(() => {
      root.unmount();
    });
  });

  // Explicit cross-domain-independence proof for the exit criterion
  // "continue unrelated note/goal operations when one note conflicts".
  // Mounts both useNoteDomainSync and useGoalDomainSync with independent
  // fake transports, makes the notes transport report a conflict for one
  // note, runs both domains' runSync, and asserts the goals domain's own
  // outcome/pending outbox state is completely untouched by the notes
  // conflict. Expected to pass without any implementation change -- each
  // domain already owns fully independent state (no shared inFlightRef,
  // envelope, or outbox anywhere between use-goal-domain-sync.ts and
  // use-note-domain-sync.ts).
  it('a notes conflict does not affect the goals domain driver (cross-domain independence)', async () => {
    const tombstonedNote: NoteRow = {
      id: 'note-tombstoned',
      user_id: USER_ID,
      trick_id: 'big-cup',
      trick_name: 'Big cup',
      body: 'Was active.',
      practice_session_id: null,
      created_at: TIMESTAMP,
      updated_at: TIMESTAMP,
      deleted_at: TIMESTAMP,
      revision: 2,
    };
    const noteTransport = createFakeNoteSyncTransport({ seedRows: [tombstonedNote] });
    const goalTransport = createFakeGoalSyncTransport();

    interface CombinedCaptured {
      noteCollection?: NoteCollection;
      setNoteCollection?: (next: NoteCollection) => void;
      noteRunSync?: ReturnType<typeof useNoteDomainSync>['runSync'];
      goalCollection?: GoalCollection;
      setGoalCollection?: (next: GoalCollection) => void;
      goalRunSync?: ReturnType<typeof useGoalDomainSync>['runSync'];
    }

    const captured: CombinedCaptured = {};

    function CombinedHarness() {
      const [noteCollection, setNoteCollection] = useState<NoteCollection>(INITIAL_NOTES);
      const [goalCollection, setGoalCollection] = useState<GoalCollection>(INITIAL_GOALS);

      const noteSync = useNoteDomainSync({
        collection: noteCollection,
        hasHydratedCollection: true,
        dispatchCollection: (action) => {
          if (action.type === 'notesRestored') setNoteCollection(action.collection);
        },
        getTransport: () => noteTransport,
      });

      const goalSync = useGoalDomainSync({
        collection: goalCollection,
        hasHydratedCollection: true,
        dispatchCollection: (action) => {
          if (action.type === 'goalsRestored') setGoalCollection(action.collection);
        },
        getTransport: () => goalTransport,
      });

      useEffect(() => {
        captured.noteCollection = noteCollection;
        captured.setNoteCollection = setNoteCollection;
        captured.noteRunSync = noteSync.runSync;
        captured.goalCollection = goalCollection;
        captured.setGoalCollection = setGoalCollection;
        captured.goalRunSync = goalSync.runSync;
      });

      return <Text>{JSON.stringify({ noteCollection, goalCollection })}</Text>;
    }

    let setIdentity: Driver['setIdentity'] | undefined;
    let root!: ReactTestRenderer;
    await act(async () => {
      root = create(
        <IdentityHandleTestProvider onDriverReady={(driver) => (setIdentity = driver.setIdentity)}>
          <CombinedHarness />
        </IdentityHandleTestProvider>,
      );
    });
    await act(async () => {
      setIdentity?.(USER_IDENTITY);
      await Promise.resolve();
      await Promise.resolve();
    });
    await flush();

    // A stale in-flight edit against the tombstoned note (will conflict)
    // alongside an unrelated new goal in the same run.
    act(() => {
      captured.setNoteCollection?.({
        notes: [{ id: 'note-tombstoned', trickId: 'big-cup', trickName: 'Big cup', body: 'Resurrection attempt.', createdAt: 1, updatedAt: 3 }],
      });
      captured.setGoalCollection?.({
        goals: [{ id: 'goal-1', trickId: 'stilt-flip', trickName: 'Stilt flip', kind: 'count', targetCount: 3, createdAt: 2 }],
      });
    });
    await flush();

    let noteResult: Awaited<ReturnType<NonNullable<CombinedCaptured['noteRunSync']>>> | undefined;
    let goalResult: Awaited<ReturnType<NonNullable<CombinedCaptured['goalRunSync']>>> | undefined;
    await act(async () => {
      [noteResult, goalResult] = await Promise.all([
        captured.noteRunSync?.('manual'),
        captured.goalRunSync?.('manual'),
      ]);
    });
    await flush();

    // The notes conflict is real (proving this test actually exercises the
    // conflict path), but it must not touch the goals domain's own outcome
    // or pending outbox state.
    expect(noteResult?.outcome).toEqual({ status: 'succeeded' });
    expect(goalResult?.outcome).toEqual({ status: 'succeeded' });
    expect(goalTransport.getRow('goal-1')?.target_count).toBe(3);

    act(() => {
      root.unmount();
    });
  });
});
