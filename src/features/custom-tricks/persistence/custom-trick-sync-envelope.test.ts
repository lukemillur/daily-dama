import { describe, expect, it, jest } from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required by jest hoisting
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import type { CustomTrickCollection } from '@/features/custom-tricks/model/custom-trick';
import {
  createInitialCustomTrickSyncSnapshot,
  customTrickSyncEnvelopeReducer,
  isCustomTrickSyncSnapshot,
  loadCustomTrickSyncEnvelope,
  saveCustomTrickSyncEnvelope,
  type CustomTrickSyncSnapshot,
} from '@/features/custom-tricks/persistence/custom-trick-sync-envelope';
import { createUserIdentity, GUEST_IDENTITY, type Identity } from '@/shared/persistence/identity';
import type { KeyValueStorage } from '@/shared/persistence/storage';
import { createInitialSyncEnvelope } from '@/shared/sync/sync-envelope';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const USER_IDENTITY: Identity = createUserIdentity(USER_ID)!;

const BASE_COLLECTION: CustomTrickCollection = { tricks: [] };

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

describe('isCustomTrickSyncSnapshot', () => {
  it('accepts a well-formed snapshot', () => {
    const snapshot: CustomTrickSyncSnapshot = {
      collection: { tricks: [{ id: 'custom-1', kind: 'standalone', name: 'Around the World' }] },
      trickRevisions: { 'custom-1': 1 },
    };
    expect(isCustomTrickSyncSnapshot(snapshot)).toBe(true);
  });

  it('accepts an empty collection and empty trickRevisions', () => {
    expect(isCustomTrickSyncSnapshot(createInitialCustomTrickSyncSnapshot(BASE_COLLECTION))).toBe(true);
  });

  it('rejects a malformed embedded collection', () => {
    expect(
      isCustomTrickSyncSnapshot({ collection: { tricks: [{ id: 'x' }] }, trickRevisions: {} }),
    ).toBe(false);
  });

  it('rejects a trickRevisions value that is not a positive integer', () => {
    expect(
      isCustomTrickSyncSnapshot({ collection: BASE_COLLECTION, trickRevisions: { 'custom-1': 0 } }),
    ).toBe(false);
  });
});

describe('loadCustomTrickSyncEnvelope / saveCustomTrickSyncEnvelope', () => {
  it('round-trips a snapshot through fake storage', async () => {
    const storage = createFakeStorage();
    const initial = createInitialCustomTrickSyncSnapshot(BASE_COLLECTION);
    const envelope = createInitialSyncEnvelope('customTricks', USER_IDENTITY, {
      ...initial,
      trickRevisions: { 'custom-1': 1 },
    });

    await saveCustomTrickSyncEnvelope(storage, envelope);
    const loaded = await loadCustomTrickSyncEnvelope(storage, USER_IDENTITY, initial);

    expect(loaded.status).toBe('loaded');
    if (loaded.status !== 'loaded') return;
    expect(loaded.value.state.trickRevisions).toEqual({ 'custom-1': 1 });
  });

  it('returns empty with the initial snapshot when nothing is persisted', async () => {
    const storage = createFakeStorage();
    const initial = createInitialCustomTrickSyncSnapshot(BASE_COLLECTION);
    const loaded = await loadCustomTrickSyncEnvelope(storage, GUEST_IDENTITY, initial);
    expect(loaded.status).toBe('empty');
    if (loaded.status !== 'empty') return;
    expect(loaded.value.state).toEqual(initial);
  });
});

describe('customTrickSyncEnvelopeReducer', () => {
  function makeEnvelope(collection: CustomTrickCollection = BASE_COLLECTION) {
    return createInitialSyncEnvelope('customTricks', USER_IDENTITY, createInitialCustomTrickSyncSnapshot(collection));
  }

  it('localMutationApplied coalesces a batch of operationInputs onto the outbox atomically', () => {
    const envelope = makeEnvelope();
    const nextCollection: CustomTrickCollection = {
      tricks: [{ id: 'custom-1', kind: 'standalone', name: 'Around the World' }],
    };
    const nextSnapshot = createInitialCustomTrickSyncSnapshot(nextCollection);

    const next = customTrickSyncEnvelopeReducer(envelope, {
      type: 'localMutationApplied',
      identity: USER_IDENTITY,
      now: 1000,
      nextSnapshot,
      operationInputs: [
        { domain: 'customTricks', operationType: 'upsert', recordId: 'custom-1', payload: { id: 'custom-1' } },
      ],
      operationIds: ['op-1'],
    });

    expect(next.state).toEqual(nextSnapshot);
    expect(next.outbox).toHaveLength(1);
    expect(next.outbox[0]).toMatchObject({ operationId: 'op-1', recordId: 'custom-1' });
  });

  it('localMutationApplied is a no-op when identity mismatches', () => {
    const envelope = makeEnvelope();
    const next = customTrickSyncEnvelopeReducer(envelope, {
      type: 'localMutationApplied',
      identity: GUEST_IDENTITY,
      now: 1000,
      nextSnapshot: createInitialCustomTrickSyncSnapshot(BASE_COLLECTION),
      operationInputs: [{ domain: 'customTricks', operationType: 'upsert', recordId: 'x', payload: {} }],
      operationIds: ['op-1'],
    });
    expect(next).toBe(envelope);
  });

  it('localMutationApplied is a no-op when operationInputs/operationIds lengths mismatch', () => {
    const envelope = makeEnvelope();
    const next = customTrickSyncEnvelopeReducer(envelope, {
      type: 'localMutationApplied',
      identity: USER_IDENTITY,
      now: 1000,
      nextSnapshot: createInitialCustomTrickSyncSnapshot(BASE_COLLECTION),
      operationInputs: [{ domain: 'customTricks', operationType: 'upsert', recordId: 'x', payload: {} }],
      operationIds: [],
    });
    expect(next).toBe(envelope);
  });

  it('operationAcknowledged removes the operation from the outbox', () => {
    let envelope = makeEnvelope();
    envelope = customTrickSyncEnvelopeReducer(envelope, {
      type: 'localMutationApplied',
      identity: USER_IDENTITY,
      now: 1000,
      nextSnapshot: createInitialCustomTrickSyncSnapshot(BASE_COLLECTION),
      operationInputs: [{ domain: 'customTricks', operationType: 'upsert', recordId: 'x', payload: {} }],
      operationIds: ['op-1'],
    });
    expect(envelope.outbox).toHaveLength(1);

    envelope = customTrickSyncEnvelopeReducer(envelope, {
      type: 'operationAcknowledged',
      identity: USER_IDENTITY,
      operationId: 'op-1',
    });
    expect(envelope.outbox).toHaveLength(0);
  });

  it('operationAttemptRecorded is a no-op for an unknown operationId (invalid transition)', () => {
    const envelope = makeEnvelope();
    const next = customTrickSyncEnvelopeReducer(envelope, {
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
    const nextSnapshot: CustomTrickSyncSnapshot = {
      collection: BASE_COLLECTION,
      trickRevisions: { 'custom-1': 2 },
    };
    const next = customTrickSyncEnvelopeReducer(envelope, { type: 'revisionRecorded', snapshot: nextSnapshot });
    expect(next.state).toEqual(nextSnapshot);
  });

  it('cursorUpdated updates the cursor and rejects an identity mismatch as a no-op', () => {
    const envelope = makeEnvelope();
    const next = customTrickSyncEnvelopeReducer(envelope, {
      type: 'cursorUpdated',
      identity: USER_IDENTITY,
      cursor: 'cursor-1',
      updatedAt: 1000,
    });
    expect(next.cursor).toBe('cursor-1');

    const rejected = customTrickSyncEnvelopeReducer(next, {
      type: 'cursorUpdated',
      identity: GUEST_IDENTITY,
      cursor: 'cursor-2',
      updatedAt: 2000,
    });
    expect(rejected).toBe(next);
  });
});
