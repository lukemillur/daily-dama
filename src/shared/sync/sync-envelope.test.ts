import { describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required by jest hoisting
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import {
  acknowledgeOutboxOperation,
  applyLocalMutation,
  createInitialSyncEnvelope,
  deserializeSyncEnvelope,
  loadSyncEnvelope,
  recordOutboxOperationAttempt,
  saveSyncEnvelope,
  serializeSyncEnvelope,
  updateSyncCursor,
  type SyncEnvelope,
  type SyncEnvelopeCodec,
} from '@/shared/sync/sync-envelope';
import { GUEST_IDENTITY, identityNamespace, type Identity } from '@/shared/persistence/identity';
import type { KeyValueStorage } from '@/shared/persistence/storage';
import { createWriteQueue } from '@/shared/persistence/storage';

interface FixtureState {
  readonly items: readonly string[];
}

const fixtureCodec: SyncEnvelopeCodec<FixtureState> = {
  isState: (value): value is FixtureState =>
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as { items?: unknown }).items) &&
    (value as { items: unknown[] }).items.every((item) => typeof item === 'string'),
};

const USER_A_ID = '11111111-1111-1111-1111-111111111111';
const USER_B_ID = '22222222-2222-2222-2222-222222222222';
const USER_A_IDENTITY: Identity = { kind: 'user', userId: USER_A_ID };
const USER_B_IDENTITY: Identity = { kind: 'user', userId: USER_B_ID };

const INITIAL_STATE: FixtureState = { items: [] };

function createFakeStorage(): KeyValueStorage & { readonly store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    getItem: jest.fn(async (key: string) => store.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
  };
}

function operationInput(recordId: string, payload: Record<string, unknown> | null = { name: recordId }) {
  return { domain: 'goals' as const, operationType: 'upsert' as const, recordId, payload };
}

describe('SyncEnvelope atomic pairing', () => {
  it('persists a state change and its operation in a single write', async () => {
    const storage = createFakeStorage();
    const envelope = createInitialSyncEnvelope('goals', GUEST_IDENTITY, INITIAL_STATE);

    const result = applyLocalMutation(
      envelope,
      GUEST_IDENTITY,
      { items: ['goal-1'] },
      operationInput('goal-1'),
      1000,
    );
    expect(result.status).toBe('applied');
    if (result.status !== 'applied') return;

    const saveResult = await saveSyncEnvelope(storage, 'sync:goals', result.envelope);
    expect(saveResult.status).toBe('saved');
    expect(storage.setItem).toHaveBeenCalledTimes(1);

    const persisted = JSON.parse(storage.store.get('sync:goals')!) as SyncEnvelope<FixtureState>;
    expect(persisted.state).toEqual({ items: ['goal-1'] });
    expect(persisted.outbox).toHaveLength(1);
    expect(persisted.outbox[0].recordId).toBe('goal-1');
  });
});

describe('SyncEnvelope reload', () => {
  it('round-trips state, outbox, and cursor through real AsyncStorage', async () => {
    const key = 'sync:goals:reload';
    const writerStorage: KeyValueStorage = {
      getItem: (k) => AsyncStorage.getItem(k),
      setItem: (k, v) => AsyncStorage.setItem(k, v),
    };

    const envelope = createInitialSyncEnvelope('goals', GUEST_IDENTITY, INITIAL_STATE);
    const mutated = applyLocalMutation(
      envelope,
      GUEST_IDENTITY,
      { items: ['goal-1'] },
      operationInput('goal-1'),
      1000,
    );
    expect(mutated.status).toBe('applied');
    if (mutated.status !== 'applied') return;

    const withCursor = updateSyncCursor(mutated.envelope, GUEST_IDENTITY, 'cursor-abc', 2000);
    expect(withCursor.status).toBe('applied');
    if (withCursor.status !== 'applied') return;

    await saveSyncEnvelope(writerStorage, key, withCursor.envelope);

    const readerStorage: KeyValueStorage = {
      getItem: (k) => AsyncStorage.getItem(k),
      setItem: (k, v) => AsyncStorage.setItem(k, v),
    };
    const loaded = await loadSyncEnvelope(
      readerStorage,
      key,
      'goals',
      fixtureCodec,
      GUEST_IDENTITY,
      INITIAL_STATE,
    );

    expect(loaded.status).toBe('loaded');
    if (loaded.status !== 'loaded') return;
    expect(loaded.value.state).toEqual({ items: ['goal-1'] });
    expect(loaded.value.outbox).toHaveLength(1);
    expect(loaded.value.cursor).toBe('cursor-abc');
  });
});

describe('SyncEnvelope operation identity across retries', () => {
  it('keeps operationId stable while attemptCount and attempt fields update', () => {
    const envelope = createInitialSyncEnvelope('goals', GUEST_IDENTITY, INITIAL_STATE);
    const applied = applyLocalMutation(
      envelope,
      GUEST_IDENTITY,
      { items: ['goal-1'] },
      operationInput('goal-1'),
      1000,
      'op-fixed',
    );
    expect(applied.status).toBe('applied');
    if (applied.status !== 'applied') return;

    const firstAttempt = recordOutboxOperationAttempt(
      applied.envelope,
      GUEST_IDENTITY,
      'op-fixed',
      1100,
      'network error',
    );
    expect(firstAttempt.status).toBe('applied');
    if (firstAttempt.status !== 'applied') return;
    expect(firstAttempt.envelope.outbox[0]).toMatchObject({
      operationId: 'op-fixed',
      attemptCount: 1,
      lastAttemptedAt: 1100,
      lastErrorMessage: 'network error',
    });

    const secondAttempt = recordOutboxOperationAttempt(
      firstAttempt.envelope,
      GUEST_IDENTITY,
      'op-fixed',
      1200,
      null,
    );
    expect(secondAttempt.status).toBe('applied');
    if (secondAttempt.status !== 'applied') return;
    expect(secondAttempt.envelope.outbox[0]).toMatchObject({
      operationId: 'op-fixed',
      attemptCount: 2,
      lastAttemptedAt: 1200,
      lastErrorMessage: null,
    });
  });
});

describe('SyncEnvelope FIFO order', () => {
  it('preserves insertion order through mutation, serialization, ack, and attempts', async () => {
    let envelope = createInitialSyncEnvelope('goals', GUEST_IDENTITY, INITIAL_STATE);

    for (const recordId of ['goal-1', 'goal-2', 'goal-3']) {
      const result = applyLocalMutation(
        envelope,
        GUEST_IDENTITY,
        { items: [...envelope.state.items, recordId] },
        operationInput(recordId),
        1000,
        `op-${recordId}`,
      );
      expect(result.status).toBe('applied');
      if (result.status !== 'applied') return;
      envelope = result.envelope;
    }

    expect(envelope.outbox.map((op) => op.recordId)).toEqual(['goal-1', 'goal-2', 'goal-3']);

    const serialized = serializeSyncEnvelope(envelope);
    const deserialized = deserializeSyncEnvelope(serialized, 'goals', fixtureCodec);
    expect(deserialized?.outbox.map((op) => op.recordId)).toEqual(['goal-1', 'goal-2', 'goal-3']);

    const acked = acknowledgeOutboxOperation(envelope, GUEST_IDENTITY, 'op-goal-2');
    expect(acked.status).toBe('applied');
    if (acked.status !== 'applied') return;
    expect(acked.envelope.outbox.map((op) => op.recordId)).toEqual(['goal-1', 'goal-3']);

    const attempted = recordOutboxOperationAttempt(acked.envelope, GUEST_IDENTITY, 'op-goal-1', 1500, null);
    expect(attempted.status).toBe('applied');
    if (attempted.status !== 'applied') return;
    expect(attempted.envelope.outbox.map((op) => op.recordId)).toEqual(['goal-1', 'goal-3']);
    expect(attempted.envelope.outbox[0].attemptCount).toBe(1);
  });

  it('composes with createWriteQueue so a later save always wins', async () => {
    const persisted: SyncEnvelope<FixtureState>[] = [];
    const releases: (() => void)[] = [];
    const write = (envelope: SyncEnvelope<FixtureState>) =>
      new Promise<void>((resolve) => {
        releases.push(() => {
          persisted.push(envelope);
          resolve();
        });
      });
    const queue = createWriteQueue<SyncEnvelope<FixtureState>>(write);

    let envelope = createInitialSyncEnvelope('goals', GUEST_IDENTITY, INITIAL_STATE);
    const withA = applyLocalMutation(
      envelope,
      GUEST_IDENTITY,
      { items: ['goal-a'] },
      operationInput('goal-a'),
      1000,
      'op-a',
    );
    expect(withA.status).toBe('applied');
    if (withA.status !== 'applied') return;
    envelope = withA.envelope;

    const firstSave = queue(envelope);

    const withB = applyLocalMutation(
      envelope,
      GUEST_IDENTITY,
      { items: ['goal-a', 'goal-b'] },
      operationInput('goal-b'),
      1100,
      'op-b',
    );
    expect(withB.status).toBe('applied');
    if (withB.status !== 'applied') return;

    const secondSave = queue(withB.envelope);

    await Promise.resolve();
    expect(releases).toHaveLength(1);
    releases[0]();
    await firstSave;
    await Promise.resolve();
    expect(releases).toHaveLength(2);
    releases[1]();
    await secondSave;

    expect(persisted).toHaveLength(2);
    const final = persisted[persisted.length - 1];
    expect(final.outbox.map((op) => op.recordId)).toEqual(['goal-a', 'goal-b']);
  });
});

describe('SyncEnvelope malformed rejection', () => {
  const validEnvelope = createInitialSyncEnvelope('goals', GUEST_IDENTITY, INITIAL_STATE);
  const validWithOperation = applyLocalMutation(
    validEnvelope,
    GUEST_IDENTITY,
    { items: ['goal-1'] },
    operationInput('goal-1'),
    1000,
    'op-1',
  );
  if (validWithOperation.status !== 'applied') throw new Error('fixture setup failed');
  const baseEnvelope = validWithOperation.envelope;

  const malformedCases: Array<[string, unknown]> = [
    ['wrong version', { ...baseEnvelope, version: 2 }],
    ['wrong domain', { ...baseEnvelope, domain: 'notes' }],
    ['non-string identityNamespace', { ...baseEnvelope, identityNamespace: 42 }],
    ['state failing the codec', { ...baseEnvelope, state: { items: [1, 2, 3] } }],
    ['non-array outbox', { ...baseEnvelope, outbox: {} }],
    [
      'malformed operation inside outbox',
      { ...baseEnvelope, outbox: [{ ...baseEnvelope.outbox[0], operationId: '' }] },
    ],
    [
      'operation domain mismatching envelope domain',
      { ...baseEnvelope, outbox: [{ ...baseEnvelope.outbox[0], domain: 'notes' }] },
    ],
    [
      'duplicate operationId',
      { ...baseEnvelope, outbox: [baseEnvelope.outbox[0], baseEnvelope.outbox[0]] },
    ],
    ['non-string non-null cursor', { ...baseEnvelope, cursor: 123 }],
  ];

  it.each(malformedCases)('deserializeSyncEnvelope rejects: %s', (_label, malformed) => {
    const serialized = JSON.stringify(malformed);
    expect(deserializeSyncEnvelope(serialized, 'goals', fixtureCodec)).toBeUndefined();
  });

  it('deserializeSyncEnvelope rejects unparseable JSON', () => {
    expect(deserializeSyncEnvelope('{not json', 'goals', fixtureCodec)).toBeUndefined();
  });

  it.each(malformedCases)('loadSyncEnvelope recovers rather than loads: %s', async (_label, malformed) => {
    const storage = createFakeStorage();
    storage.store.set('sync:goals', JSON.stringify(malformed));

    const loaded = await loadSyncEnvelope(
      storage,
      'sync:goals',
      'goals',
      fixtureCodec,
      GUEST_IDENTITY,
      INITIAL_STATE,
    );
    expect(loaded.status).toBe('recovered');
    if (loaded.status !== 'recovered') return;
    expect(loaded.value.state).toEqual(INITIAL_STATE);
  });

  it('loadSyncEnvelope recovers on unparseable JSON', async () => {
    const storage = createFakeStorage();
    storage.store.set('sync:goals', '{not json');

    const loaded = await loadSyncEnvelope(
      storage,
      'sync:goals',
      'goals',
      fixtureCodec,
      GUEST_IDENTITY,
      INITIAL_STATE,
    );
    expect(loaded.status).toBe('recovered');
  });
});

describe('SyncEnvelope identity isolation on load', () => {
  it('cannot be loaded under another identity: userA vs userB', async () => {
    const storage = createFakeStorage();
    const envelopeA = createInitialSyncEnvelope('goals', USER_A_IDENTITY, { items: ['a-only'] });
    storage.store.set('sync:goals', serializeSyncEnvelope(envelopeA));

    const loaded = await loadSyncEnvelope(
      storage,
      'sync:goals',
      'goals',
      fixtureCodec,
      USER_B_IDENTITY,
      INITIAL_STATE,
    );
    expect(loaded.status).toBe('recovered');
    if (loaded.status !== 'recovered') return;
    expect(loaded.value.state).toEqual(INITIAL_STATE);
    expect(loaded.value.identityNamespace).toBe(identityNamespace(USER_B_IDENTITY));
  });

  it('cannot be loaded under another identity: guest vs user', async () => {
    const storage = createFakeStorage();
    const envelopeGuest = createInitialSyncEnvelope('goals', GUEST_IDENTITY, { items: ['guest-only'] });
    storage.store.set('sync:goals', serializeSyncEnvelope(envelopeGuest));

    const loaded = await loadSyncEnvelope(
      storage,
      'sync:goals',
      'goals',
      fixtureCodec,
      USER_A_IDENTITY,
      INITIAL_STATE,
    );
    expect(loaded.status).toBe('recovered');
    if (loaded.status !== 'recovered') return;
    expect(loaded.value.state).toEqual(INITIAL_STATE);
  });

  it('cannot be loaded under another identity: user vs guest', async () => {
    const storage = createFakeStorage();
    const envelopeUser = createInitialSyncEnvelope('goals', USER_A_IDENTITY, { items: ['user-only'] });
    storage.store.set('sync:goals', serializeSyncEnvelope(envelopeUser));

    const loaded = await loadSyncEnvelope(
      storage,
      'sync:goals',
      'goals',
      fixtureCodec,
      GUEST_IDENTITY,
      INITIAL_STATE,
    );
    expect(loaded.status).toBe('recovered');
    if (loaded.status !== 'recovered') return;
    expect(loaded.value.state).toEqual(INITIAL_STATE);
  });
});

describe('SyncEnvelope identity isolation on mutation', () => {
  it('rejects acknowledge, attempt, mutation, and cursor updates from another identity as no-ops', () => {
    const envelopeA = createInitialSyncEnvelope('goals', USER_A_IDENTITY, INITIAL_STATE);
    const withOperation = applyLocalMutation(
      envelopeA,
      USER_A_IDENTITY,
      { items: ['goal-1'] },
      operationInput('goal-1'),
      1000,
      'op-1',
    );
    expect(withOperation.status).toBe('applied');
    if (withOperation.status !== 'applied') return;
    const envelope = withOperation.envelope;

    const ackResult = acknowledgeOutboxOperation(envelope, USER_B_IDENTITY, 'op-1');
    expect(ackResult).toEqual({ status: 'rejected', reason: 'identityMismatch' });
    expect(envelope.outbox).toHaveLength(1); // true no-op, not a partial removal

    const attemptResult = recordOutboxOperationAttempt(envelope, USER_B_IDENTITY, 'op-1', 2000, 'err');
    expect(attemptResult).toEqual({ status: 'rejected', reason: 'identityMismatch' });

    const mutationResult = applyLocalMutation(
      envelope,
      USER_B_IDENTITY,
      { items: ['goal-1', 'goal-2'] },
      operationInput('goal-2'),
      2000,
    );
    expect(mutationResult).toEqual({ status: 'rejected', reason: 'identityMismatch' });

    const cursorResult = updateSyncCursor(envelope, USER_B_IDENTITY, 'cursor-x', 2000);
    expect(cursorResult).toEqual({ status: 'rejected', reason: 'identityMismatch' });
  });
});

describe('SyncEnvelope domain mismatch on mutation', () => {
  it('rejects applyLocalMutation when the operation targets a different domain', () => {
    const envelope = createInitialSyncEnvelope('goals', GUEST_IDENTITY, INITIAL_STATE);
    const result = applyLocalMutation(
      envelope,
      GUEST_IDENTITY,
      { items: ['x'] },
      { domain: 'notes', operationType: 'upsert', recordId: 'note-1', payload: { body: 'x' } },
      1000,
    );
    expect(result).toEqual({ status: 'rejected', reason: 'domainMismatch' });
  });
});
