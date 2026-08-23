import { describe, expect, it, jest } from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required by jest hoisting
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import type { PracticeHistory } from '@/features/stats/model/practice-history';
import {
  createInitialPracticeHistorySyncSnapshot,
  isPracticeHistorySyncSnapshot,
  loadPracticeHistorySyncEnvelope,
  practiceHistorySyncEnvelopeReducer,
  savePracticeHistorySyncEnvelope,
  type PracticeHistorySyncSnapshot,
} from '@/features/stats/persistence/practice-history-sync-envelope';
import { createUserIdentity, GUEST_IDENTITY, type Identity } from '@/shared/persistence/identity';
import type { KeyValueStorage } from '@/shared/persistence/storage';
import { createInitialSyncEnvelope } from '@/shared/sync/sync-envelope';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const USER_IDENTITY: Identity = createUserIdentity(USER_ID)!;

const BASE_HISTORY: PracticeHistory = { sessions: [] };

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

describe('isPracticeHistorySyncSnapshot', () => {
  it('accepts a well-formed snapshot', () => {
    const snapshot: PracticeHistorySyncSnapshot = {
      history: {
        sessions: [
          {
            id: 'session-1',
            trickId: 'lighthouse',
            trickName: 'Lighthouse',
            startedAt: 1_000,
            completedAt: 5_000,
            durationMs: 4_000,
            laceCount: 2,
          },
        ],
      },
    };
    expect(isPracticeHistorySyncSnapshot(snapshot)).toBe(true);
  });

  it('accepts an empty history', () => {
    expect(isPracticeHistorySyncSnapshot(createInitialPracticeHistorySyncSnapshot(BASE_HISTORY))).toBe(true);
  });

  it('rejects a malformed embedded history', () => {
    expect(isPracticeHistorySyncSnapshot({ history: { sessions: [{ id: 'partial' }] } })).toBe(false);
  });

  it('rejects a non-record value', () => {
    expect(isPracticeHistorySyncSnapshot(null)).toBe(false);
    expect(isPracticeHistorySyncSnapshot('nope')).toBe(false);
  });
});

describe('loadPracticeHistorySyncEnvelope / savePracticeHistorySyncEnvelope', () => {
  it('round-trips a snapshot through fake storage', async () => {
    const storage = createFakeStorage();
    const initial = createInitialPracticeHistorySyncSnapshot(BASE_HISTORY);
    const populatedHistory: PracticeHistory = {
      sessions: [
        {
          id: 'session-1',
          trickId: 'lighthouse',
          trickName: 'Lighthouse',
          startedAt: 1_000,
          completedAt: 5_000,
          durationMs: 4_000,
          laceCount: 2,
        },
      ],
    };
    const envelope = createInitialSyncEnvelope('practiceHistory', USER_IDENTITY, { history: populatedHistory });

    await savePracticeHistorySyncEnvelope(storage, envelope);
    const loaded = await loadPracticeHistorySyncEnvelope(storage, USER_IDENTITY, initial);

    expect(loaded.status).toBe('loaded');
    if (loaded.status !== 'loaded') return;
    expect(loaded.value.state.history).toEqual(populatedHistory);
  });

  it('returns empty with the initial snapshot when nothing is persisted', async () => {
    const storage = createFakeStorage();
    const initial = createInitialPracticeHistorySyncSnapshot(BASE_HISTORY);
    const loaded = await loadPracticeHistorySyncEnvelope(storage, GUEST_IDENTITY, initial);
    expect(loaded.status).toBe('empty');
    if (loaded.status !== 'empty') return;
    expect(loaded.value.state).toEqual(initial);
  });
});

describe('practiceHistorySyncEnvelopeReducer', () => {
  function makeEnvelope(history: PracticeHistory = BASE_HISTORY) {
    return createInitialSyncEnvelope('practiceHistory', USER_IDENTITY, createInitialPracticeHistorySyncSnapshot(history));
  }

  it('localMutationApplied coalesces a batch of operationInputs onto the outbox atomically', () => {
    const envelope = makeEnvelope();
    const nextHistory: PracticeHistory = {
      sessions: [
        {
          id: 'session-1',
          trickId: 'lighthouse',
          trickName: 'Lighthouse',
          startedAt: 1_000,
          completedAt: 5_000,
          durationMs: 4_000,
          laceCount: 2,
        },
      ],
    };
    const nextSnapshot = createInitialPracticeHistorySyncSnapshot(nextHistory);

    const next = practiceHistorySyncEnvelopeReducer(envelope, {
      type: 'localMutationApplied',
      identity: USER_IDENTITY,
      now: 1000,
      nextSnapshot,
      operationInputs: [
        { domain: 'practiceHistory', operationType: 'upsert', recordId: 'session-1', payload: { id: 'session-1' } },
      ],
      operationIds: ['op-1'],
    });

    expect(next.state).toEqual(nextSnapshot);
    expect(next.outbox).toHaveLength(1);
    expect(next.outbox[0]).toMatchObject({ operationId: 'op-1', recordId: 'session-1' });
  });

  it('localMutationApplied is a no-op when identity mismatches', () => {
    const envelope = makeEnvelope();
    const next = practiceHistorySyncEnvelopeReducer(envelope, {
      type: 'localMutationApplied',
      identity: GUEST_IDENTITY,
      now: 1000,
      nextSnapshot: createInitialPracticeHistorySyncSnapshot(BASE_HISTORY),
      operationInputs: [{ domain: 'practiceHistory', operationType: 'upsert', recordId: 'x', payload: {} }],
      operationIds: ['op-1'],
    });
    expect(next).toBe(envelope);
  });

  it('localMutationApplied is a no-op when operationInputs/operationIds lengths mismatch', () => {
    const envelope = makeEnvelope();
    const next = practiceHistorySyncEnvelopeReducer(envelope, {
      type: 'localMutationApplied',
      identity: USER_IDENTITY,
      now: 1000,
      nextSnapshot: createInitialPracticeHistorySyncSnapshot(BASE_HISTORY),
      operationInputs: [{ domain: 'practiceHistory', operationType: 'upsert', recordId: 'x', payload: {} }],
      operationIds: [],
    });
    expect(next).toBe(envelope);
  });

  it('operationAcknowledged removes the operation from the outbox', () => {
    let envelope = makeEnvelope();
    envelope = practiceHistorySyncEnvelopeReducer(envelope, {
      type: 'localMutationApplied',
      identity: USER_IDENTITY,
      now: 1000,
      nextSnapshot: createInitialPracticeHistorySyncSnapshot(BASE_HISTORY),
      operationInputs: [{ domain: 'practiceHistory', operationType: 'upsert', recordId: 'x', payload: {} }],
      operationIds: ['op-1'],
    });
    expect(envelope.outbox).toHaveLength(1);

    envelope = practiceHistorySyncEnvelopeReducer(envelope, {
      type: 'operationAcknowledged',
      identity: USER_IDENTITY,
      operationId: 'op-1',
    });
    expect(envelope.outbox).toHaveLength(0);
  });

  it('operationAttemptRecorded is a no-op for an unknown operationId (invalid transition)', () => {
    const envelope = makeEnvelope();
    const next = practiceHistorySyncEnvelopeReducer(envelope, {
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
    const nextSnapshot: PracticeHistorySyncSnapshot = { history: BASE_HISTORY };
    const next = practiceHistorySyncEnvelopeReducer(envelope, { type: 'revisionRecorded', snapshot: nextSnapshot });
    expect(next.state).toEqual(nextSnapshot);
  });

  it('cursorUpdated updates the cursor and rejects an identity mismatch as a no-op', () => {
    const envelope = makeEnvelope();
    const next = practiceHistorySyncEnvelopeReducer(envelope, {
      type: 'cursorUpdated',
      identity: USER_IDENTITY,
      cursor: 'cursor-1',
      updatedAt: 1000,
    });
    expect(next.cursor).toBe('cursor-1');

    const rejected = practiceHistorySyncEnvelopeReducer(next, {
      type: 'cursorUpdated',
      identity: GUEST_IDENTITY,
      cursor: 'cursor-2',
      updatedAt: 2000,
    });
    expect(rejected).toBe(next);
  });
});
