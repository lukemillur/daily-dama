import { describe, expect, it, jest } from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required by jest hoisting
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import type { NoteCollection } from '@/features/notes/model/note';
import {
  createInitialNoteSyncSnapshot,
  isNoteSyncSnapshot,
  loadNoteSyncEnvelope,
  noteSyncEnvelopeReducer,
  saveNoteSyncEnvelope,
  type NoteSyncSnapshot,
} from '@/features/notes/persistence/note-sync-envelope';
import { createUserIdentity, GUEST_IDENTITY, type Identity } from '@/shared/persistence/identity';
import type { KeyValueStorage } from '@/shared/persistence/storage';
import { createInitialSyncEnvelope } from '@/shared/sync/sync-envelope';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const USER_IDENTITY: Identity = createUserIdentity(USER_ID)!;

const BASE_COLLECTION: NoteCollection = { notes: [] };

function createFakeStorage(): KeyValueStorage & { readonly store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    getItem: async (key) => store.get(key) ?? null,
    setItem: async (key, value) => {
      store.set(key, value);
    },
  };
}

describe('isNoteSyncSnapshot', () => {
  it('accepts a well-formed snapshot', () => {
    const snapshot: NoteSyncSnapshot = {
      collection: {
        notes: [
          {
            id: 'note-1',
            trickId: 'big-cup',
            trickName: 'Big cup',
            body: 'Keep elbow tucked in',
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      },
      noteRevisions: { 'note-1': 1 },
    };
    expect(isNoteSyncSnapshot(snapshot)).toBe(true);
  });

  it('accepts an empty collection and empty noteRevisions', () => {
    expect(isNoteSyncSnapshot(createInitialNoteSyncSnapshot(BASE_COLLECTION))).toBe(true);
  });

  it('rejects a malformed embedded collection', () => {
    expect(isNoteSyncSnapshot({ collection: { notes: [{ id: 'x' }] }, noteRevisions: {} })).toBe(false);
  });

  it('rejects a noteRevisions value that is not a positive integer', () => {
    expect(isNoteSyncSnapshot({ collection: BASE_COLLECTION, noteRevisions: { 'note-1': 0 } })).toBe(false);
  });
});

describe('loadNoteSyncEnvelope / saveNoteSyncEnvelope', () => {
  it('round-trips a snapshot through fake storage', async () => {
    const storage = createFakeStorage();
    const initial = createInitialNoteSyncSnapshot(BASE_COLLECTION);
    const envelope = createInitialSyncEnvelope('notes', USER_IDENTITY, {
      ...initial,
      noteRevisions: { 'note-1': 1 },
    });

    await saveNoteSyncEnvelope(storage, envelope);
    const loaded = await loadNoteSyncEnvelope(storage, USER_IDENTITY, initial);

    expect(loaded.status).toBe('loaded');
    if (loaded.status !== 'loaded') return;
    expect(loaded.value.state.noteRevisions).toEqual({ 'note-1': 1 });
  });

  it('returns empty with the initial snapshot when nothing is persisted', async () => {
    const storage = createFakeStorage();
    const initial = createInitialNoteSyncSnapshot(BASE_COLLECTION);
    const loaded = await loadNoteSyncEnvelope(storage, GUEST_IDENTITY, initial);
    expect(loaded.status).toBe('empty');
    if (loaded.status !== 'empty') return;
    expect(loaded.value.state).toEqual(initial);
  });
});

describe('noteSyncEnvelopeReducer', () => {
  function makeEnvelope(collection: NoteCollection = BASE_COLLECTION) {
    return createInitialSyncEnvelope('notes', USER_IDENTITY, createInitialNoteSyncSnapshot(collection));
  }

  it('localMutationApplied coalesces a batch of operationInputs onto the outbox atomically', () => {
    const envelope = makeEnvelope();
    const nextCollection: NoteCollection = {
      notes: [
        {
          id: 'note-1',
          trickId: 'big-cup',
          trickName: 'Big cup',
          body: 'Keep elbow tucked in',
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    };
    const nextSnapshot = createInitialNoteSyncSnapshot(nextCollection);

    const next = noteSyncEnvelopeReducer(envelope, {
      type: 'localMutationApplied',
      identity: USER_IDENTITY,
      now: 1000,
      nextSnapshot,
      operationInputs: [{ domain: 'notes', operationType: 'upsert', recordId: 'note-1', payload: { id: 'note-1' } }],
      operationIds: ['op-1'],
    });

    expect(next.state).toEqual(nextSnapshot);
    expect(next.outbox).toHaveLength(1);
    expect(next.outbox[0]).toMatchObject({ operationId: 'op-1', recordId: 'note-1' });
  });

  it('localMutationApplied is a no-op when identity mismatches', () => {
    const envelope = makeEnvelope();
    const next = noteSyncEnvelopeReducer(envelope, {
      type: 'localMutationApplied',
      identity: GUEST_IDENTITY,
      now: 1000,
      nextSnapshot: createInitialNoteSyncSnapshot(BASE_COLLECTION),
      operationInputs: [{ domain: 'notes', operationType: 'upsert', recordId: 'x', payload: {} }],
      operationIds: ['op-1'],
    });
    expect(next).toBe(envelope);
  });

  it('localMutationApplied is a no-op when operationInputs/operationIds lengths mismatch', () => {
    const envelope = makeEnvelope();
    const next = noteSyncEnvelopeReducer(envelope, {
      type: 'localMutationApplied',
      identity: USER_IDENTITY,
      now: 1000,
      nextSnapshot: createInitialNoteSyncSnapshot(BASE_COLLECTION),
      operationInputs: [{ domain: 'notes', operationType: 'upsert', recordId: 'x', payload: {} }],
      operationIds: [],
    });
    expect(next).toBe(envelope);
  });

  it('operationAcknowledged removes the operation from the outbox', () => {
    let envelope = makeEnvelope();
    envelope = noteSyncEnvelopeReducer(envelope, {
      type: 'localMutationApplied',
      identity: USER_IDENTITY,
      now: 1000,
      nextSnapshot: createInitialNoteSyncSnapshot(BASE_COLLECTION),
      operationInputs: [{ domain: 'notes', operationType: 'upsert', recordId: 'x', payload: {} }],
      operationIds: ['op-1'],
    });
    expect(envelope.outbox).toHaveLength(1);

    envelope = noteSyncEnvelopeReducer(envelope, {
      type: 'operationAcknowledged',
      identity: USER_IDENTITY,
      operationId: 'op-1',
    });
    expect(envelope.outbox).toHaveLength(0);
  });

  it('operationAttemptRecorded is a no-op for an unknown operationId (invalid transition)', () => {
    const envelope = makeEnvelope();
    const next = noteSyncEnvelopeReducer(envelope, {
      type: 'operationAttemptRecorded',
      identity: USER_IDENTITY,
      operationId: 'op-unknown',
      attemptedAt: 1000,
      errorMessage: 'boom',
    });
    expect(next).toBe(envelope);
  });

  it('revisionRecorded replaces the snapshot wholesale', () => {
    const envelope = makeEnvelope();
    const nextSnapshot: NoteSyncSnapshot = { collection: BASE_COLLECTION, noteRevisions: { 'note-1': 2 } };
    const next = noteSyncEnvelopeReducer(envelope, { type: 'revisionRecorded', snapshot: nextSnapshot });
    expect(next.state).toEqual(nextSnapshot);
  });

  it('cursorUpdated updates the cursor and rejects an identity mismatch as a no-op', () => {
    const envelope = makeEnvelope();
    const next = noteSyncEnvelopeReducer(envelope, {
      type: 'cursorUpdated',
      identity: USER_IDENTITY,
      cursor: 'cursor-1',
      updatedAt: 1000,
    });
    expect(next.cursor).toBe('cursor-1');

    const rejected = noteSyncEnvelopeReducer(next, {
      type: 'cursorUpdated',
      identity: GUEST_IDENTITY,
      cursor: 'cursor-2',
      updatedAt: 2000,
    });
    expect(rejected).toBe(next);
  });
});
