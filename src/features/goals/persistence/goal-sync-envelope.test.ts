import { describe, expect, it, jest } from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required by jest hoisting
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import type { GoalCollection } from '@/features/goals/model/goal';
import {
  createInitialGoalSyncSnapshot,
  goalSyncEnvelopeReducer,
  isGoalSyncSnapshot,
  loadGoalSyncEnvelope,
  saveGoalSyncEnvelope,
  type GoalSyncSnapshot,
} from '@/features/goals/persistence/goal-sync-envelope';
import { createUserIdentity, GUEST_IDENTITY, type Identity } from '@/shared/persistence/identity';
import type { KeyValueStorage } from '@/shared/persistence/storage';
import { createInitialSyncEnvelope } from '@/shared/sync/sync-envelope';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const USER_IDENTITY: Identity = createUserIdentity(USER_ID)!;

const BASE_COLLECTION: GoalCollection = { goals: [] };

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

describe('isGoalSyncSnapshot', () => {
  it('accepts a well-formed snapshot', () => {
    const snapshot: GoalSyncSnapshot = {
      collection: {
        goals: [
          { id: 'goal-1', trickId: 'big-cup', trickName: 'Big cup', kind: 'count', targetCount: 5, createdAt: 1 },
        ],
      },
      goalRevisions: { 'goal-1': 1 },
    };
    expect(isGoalSyncSnapshot(snapshot)).toBe(true);
  });

  it('accepts an empty collection and empty goalRevisions', () => {
    expect(isGoalSyncSnapshot(createInitialGoalSyncSnapshot(BASE_COLLECTION))).toBe(true);
  });

  it('rejects a malformed embedded collection', () => {
    expect(isGoalSyncSnapshot({ collection: { goals: [{ id: 'x' }] }, goalRevisions: {} })).toBe(false);
  });

  it('rejects a goalRevisions value that is not a positive integer', () => {
    expect(isGoalSyncSnapshot({ collection: BASE_COLLECTION, goalRevisions: { 'goal-1': 0 } })).toBe(false);
  });
});

describe('loadGoalSyncEnvelope / saveGoalSyncEnvelope', () => {
  it('round-trips a snapshot through fake storage', async () => {
    const storage = createFakeStorage();
    const initial = createInitialGoalSyncSnapshot(BASE_COLLECTION);
    const envelope = createInitialSyncEnvelope('goals', USER_IDENTITY, {
      ...initial,
      goalRevisions: { 'goal-1': 1 },
    });

    await saveGoalSyncEnvelope(storage, envelope);
    const loaded = await loadGoalSyncEnvelope(storage, USER_IDENTITY, initial);

    expect(loaded.status).toBe('loaded');
    if (loaded.status !== 'loaded') return;
    expect(loaded.value.state.goalRevisions).toEqual({ 'goal-1': 1 });
  });

  it('returns empty with the initial snapshot when nothing is persisted', async () => {
    const storage = createFakeStorage();
    const initial = createInitialGoalSyncSnapshot(BASE_COLLECTION);
    const loaded = await loadGoalSyncEnvelope(storage, GUEST_IDENTITY, initial);
    expect(loaded.status).toBe('empty');
    if (loaded.status !== 'empty') return;
    expect(loaded.value.state).toEqual(initial);
  });
});

describe('goalSyncEnvelopeReducer', () => {
  function makeEnvelope(collection: GoalCollection = BASE_COLLECTION) {
    return createInitialSyncEnvelope('goals', USER_IDENTITY, createInitialGoalSyncSnapshot(collection));
  }

  it('localMutationApplied coalesces a batch of operationInputs onto the outbox atomically', () => {
    const envelope = makeEnvelope();
    const nextCollection: GoalCollection = {
      goals: [{ id: 'goal-1', trickId: 'big-cup', trickName: 'Big cup', kind: 'count', targetCount: 5, createdAt: 1 }],
    };
    const nextSnapshot = createInitialGoalSyncSnapshot(nextCollection);

    const next = goalSyncEnvelopeReducer(envelope, {
      type: 'localMutationApplied',
      identity: USER_IDENTITY,
      now: 1000,
      nextSnapshot,
      operationInputs: [{ domain: 'goals', operationType: 'upsert', recordId: 'goal-1', payload: { id: 'goal-1' } }],
      operationIds: ['op-1'],
    });

    expect(next.state).toEqual(nextSnapshot);
    expect(next.outbox).toHaveLength(1);
    expect(next.outbox[0]).toMatchObject({ operationId: 'op-1', recordId: 'goal-1' });
  });

  it('localMutationApplied is a no-op when identity mismatches', () => {
    const envelope = makeEnvelope();
    const next = goalSyncEnvelopeReducer(envelope, {
      type: 'localMutationApplied',
      identity: GUEST_IDENTITY,
      now: 1000,
      nextSnapshot: createInitialGoalSyncSnapshot(BASE_COLLECTION),
      operationInputs: [{ domain: 'goals', operationType: 'upsert', recordId: 'x', payload: {} }],
      operationIds: ['op-1'],
    });
    expect(next).toBe(envelope);
  });

  it('localMutationApplied is a no-op when operationInputs/operationIds lengths mismatch', () => {
    const envelope = makeEnvelope();
    const next = goalSyncEnvelopeReducer(envelope, {
      type: 'localMutationApplied',
      identity: USER_IDENTITY,
      now: 1000,
      nextSnapshot: createInitialGoalSyncSnapshot(BASE_COLLECTION),
      operationInputs: [{ domain: 'goals', operationType: 'upsert', recordId: 'x', payload: {} }],
      operationIds: [],
    });
    expect(next).toBe(envelope);
  });

  it('operationAcknowledged removes the operation from the outbox', () => {
    let envelope = makeEnvelope();
    envelope = goalSyncEnvelopeReducer(envelope, {
      type: 'localMutationApplied',
      identity: USER_IDENTITY,
      now: 1000,
      nextSnapshot: createInitialGoalSyncSnapshot(BASE_COLLECTION),
      operationInputs: [{ domain: 'goals', operationType: 'upsert', recordId: 'x', payload: {} }],
      operationIds: ['op-1'],
    });
    expect(envelope.outbox).toHaveLength(1);

    envelope = goalSyncEnvelopeReducer(envelope, {
      type: 'operationAcknowledged',
      identity: USER_IDENTITY,
      operationId: 'op-1',
    });
    expect(envelope.outbox).toHaveLength(0);
  });

  it('operationAttemptRecorded is a no-op for an unknown operationId (invalid transition)', () => {
    const envelope = makeEnvelope();
    const next = goalSyncEnvelopeReducer(envelope, {
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
    const nextSnapshot: GoalSyncSnapshot = { collection: BASE_COLLECTION, goalRevisions: { 'goal-1': 2 } };
    const next = goalSyncEnvelopeReducer(envelope, { type: 'revisionRecorded', snapshot: nextSnapshot });
    expect(next.state).toEqual(nextSnapshot);
  });

  it('cursorUpdated updates the cursor and rejects an identity mismatch as a no-op', () => {
    const envelope = makeEnvelope();
    const next = goalSyncEnvelopeReducer(envelope, {
      type: 'cursorUpdated',
      identity: USER_IDENTITY,
      cursor: 'cursor-1',
      updatedAt: 1000,
    });
    expect(next.cursor).toBe('cursor-1');

    const rejected = goalSyncEnvelopeReducer(next, {
      type: 'cursorUpdated',
      identity: GUEST_IDENTITY,
      cursor: 'cursor-2',
      updatedAt: 2000,
    });
    expect(rejected).toBe(next);
  });
});
