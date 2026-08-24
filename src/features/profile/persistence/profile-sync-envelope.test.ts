import { describe, expect, it, jest } from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required by jest hoisting
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import type { UserProfile } from '@/features/profile/model/user-profile';
import {
  createInitialProfileSyncSnapshot,
  isProfileSyncSnapshot,
  loadProfileSyncEnvelope,
  profileSyncEnvelopeReducer,
  saveProfileSyncEnvelope,
  type ProfileSyncSnapshot,
} from '@/features/profile/persistence/profile-sync-envelope';
import { createUserIdentity, GUEST_IDENTITY, type Identity } from '@/shared/persistence/identity';
import type { KeyValueStorage } from '@/shared/persistence/storage';
import { createInitialSyncEnvelope } from '@/shared/sync/sync-envelope';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const USER_IDENTITY: Identity = createUserIdentity(USER_ID)!;

const BASE_PROFILE: UserProfile = { hasCompletedOnboarding: false, selectedTrickIds: [] };

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

describe('isProfileSyncSnapshot', () => {
  it('accepts a well-formed snapshot', () => {
    const snapshot: ProfileSyncSnapshot = {
      profile: BASE_PROFILE,
      profileRevision: 3,
      trickStateRevisions: { 'trick-1': 1 },
    };
    expect(isProfileSyncSnapshot(snapshot)).toBe(true);
  });

  it('accepts a null profileRevision and empty trickStateRevisions', () => {
    expect(isProfileSyncSnapshot(createInitialProfileSyncSnapshot(BASE_PROFILE))).toBe(true);
  });

  it('rejects a malformed embedded profile', () => {
    expect(
      isProfileSyncSnapshot({ profile: { hasCompletedOnboarding: 'nope' }, profileRevision: null, trickStateRevisions: {} }),
    ).toBe(false);
  });

  it('rejects a non-integer profileRevision', () => {
    expect(isProfileSyncSnapshot({ profile: BASE_PROFILE, profileRevision: 1.5, trickStateRevisions: {} })).toBe(false);
  });

  it('rejects a trickStateRevisions value that is not a positive integer', () => {
    expect(
      isProfileSyncSnapshot({ profile: BASE_PROFILE, profileRevision: null, trickStateRevisions: { 'trick-1': 0 } }),
    ).toBe(false);
  });
});

describe('loadProfileSyncEnvelope / saveProfileSyncEnvelope', () => {
  it('round-trips a snapshot through fake storage', async () => {
    const storage = createFakeStorage();
    const initial = createInitialProfileSyncSnapshot(BASE_PROFILE);
    const envelope = createInitialSyncEnvelope('profile', USER_IDENTITY, {
      ...initial,
      profileRevision: 2,
      trickStateRevisions: { 'trick-1': 1 },
    });

    await saveProfileSyncEnvelope(storage, envelope);
    const loaded = await loadProfileSyncEnvelope(storage, USER_IDENTITY, initial);

    expect(loaded.status).toBe('loaded');
    if (loaded.status !== 'loaded') return;
    expect(loaded.value.state.profileRevision).toBe(2);
    expect(loaded.value.state.trickStateRevisions).toEqual({ 'trick-1': 1 });
  });

  it('returns empty with the initial snapshot when nothing is persisted', async () => {
    const storage = createFakeStorage();
    const initial = createInitialProfileSyncSnapshot(BASE_PROFILE);
    const loaded = await loadProfileSyncEnvelope(storage, GUEST_IDENTITY, initial);
    expect(loaded.status).toBe('empty');
    if (loaded.status !== 'empty') return;
    expect(loaded.value.state).toEqual(initial);
  });
});

describe('profileSyncEnvelopeReducer', () => {
  function makeEnvelope(profile: UserProfile = BASE_PROFILE) {
    return createInitialSyncEnvelope('profile', USER_IDENTITY, createInitialProfileSyncSnapshot(profile));
  }

  it('localMutationApplied coalesces a batch of operationInputs onto the outbox atomically', () => {
    const envelope = makeEnvelope();
    const nextProfile: UserProfile = { ...BASE_PROFILE, selectedTrickIds: ['trick-1'] };
    const nextSnapshot = createInitialProfileSyncSnapshot(nextProfile);

    const next = profileSyncEnvelopeReducer(envelope, {
      type: 'localMutationApplied',
      identity: USER_IDENTITY,
      now: 1000,
      nextSnapshot,
      operationInputs: [
        { domain: 'profile', operationType: 'upsert', recordId: 'trick-1', payload: { trick_id: 'trick-1' } },
      ],
      operationIds: ['op-1'],
    });

    expect(next.state).toEqual(nextSnapshot);
    expect(next.outbox).toHaveLength(1);
    expect(next.outbox[0]).toMatchObject({ operationId: 'op-1', recordId: 'trick-1' });
  });

  it('localMutationApplied is a no-op when identity mismatches', () => {
    const envelope = makeEnvelope();
    const next = profileSyncEnvelopeReducer(envelope, {
      type: 'localMutationApplied',
      identity: GUEST_IDENTITY,
      now: 1000,
      nextSnapshot: createInitialProfileSyncSnapshot(BASE_PROFILE),
      operationInputs: [{ domain: 'profile', operationType: 'upsert', recordId: 'x', payload: {} }],
      operationIds: ['op-1'],
    });
    expect(next).toBe(envelope);
  });

  it('localMutationApplied is a no-op when operationInputs/operationIds lengths mismatch', () => {
    const envelope = makeEnvelope();
    const next = profileSyncEnvelopeReducer(envelope, {
      type: 'localMutationApplied',
      identity: USER_IDENTITY,
      now: 1000,
      nextSnapshot: createInitialProfileSyncSnapshot(BASE_PROFILE),
      operationInputs: [{ domain: 'profile', operationType: 'upsert', recordId: 'x', payload: {} }],
      operationIds: [],
    });
    expect(next).toBe(envelope);
  });

  it('operationAcknowledged removes the operation from the outbox', () => {
    let envelope = makeEnvelope();
    envelope = profileSyncEnvelopeReducer(envelope, {
      type: 'localMutationApplied',
      identity: USER_IDENTITY,
      now: 1000,
      nextSnapshot: createInitialProfileSyncSnapshot(BASE_PROFILE),
      operationInputs: [{ domain: 'profile', operationType: 'upsert', recordId: 'x', payload: {} }],
      operationIds: ['op-1'],
    });
    expect(envelope.outbox).toHaveLength(1);

    envelope = profileSyncEnvelopeReducer(envelope, {
      type: 'operationAcknowledged',
      identity: USER_IDENTITY,
      operationId: 'op-1',
    });
    expect(envelope.outbox).toHaveLength(0);
  });

  it('operationAttemptRecorded is a no-op for an unknown operationId (invalid transition)', () => {
    const envelope = makeEnvelope();
    const next = profileSyncEnvelopeReducer(envelope, {
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
    const nextSnapshot: ProfileSyncSnapshot = {
      profile: BASE_PROFILE,
      profileRevision: 7,
      trickStateRevisions: { 'trick-1': 2 },
    };
    const next = profileSyncEnvelopeReducer(envelope, { type: 'revisionRecorded', snapshot: nextSnapshot });
    expect(next.state).toEqual(nextSnapshot);
  });

  it('cursorUpdated updates the cursor and rejects an identity mismatch as a no-op', () => {
    const envelope = makeEnvelope();
    const next = profileSyncEnvelopeReducer(envelope, {
      type: 'cursorUpdated',
      identity: USER_IDENTITY,
      cursor: 'cursor-1',
      updatedAt: 1000,
    });
    expect(next.cursor).toBe('cursor-1');

    const rejected = profileSyncEnvelopeReducer(next, {
      type: 'cursorUpdated',
      identity: GUEST_IDENTITY,
      cursor: 'cursor-2',
      updatedAt: 2000,
    });
    expect(rejected).toBe(next);
  });
});
