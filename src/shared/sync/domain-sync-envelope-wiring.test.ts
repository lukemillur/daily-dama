import { describe, expect, it, jest } from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required by jest hoisting
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import {
  createInitialCustomTrickSyncSnapshot,
  isCustomTrickSyncSnapshot,
  loadCustomTrickSyncEnvelope,
  saveCustomTrickSyncEnvelope,
  type CustomTrickSyncSnapshot,
} from '@/features/custom-tricks/persistence/custom-trick-sync-envelope';
import {
  createInitialGoalSyncSnapshot,
  isGoalSyncSnapshot,
  loadGoalSyncEnvelope,
  saveGoalSyncEnvelope,
  type GoalSyncSnapshot,
} from '@/features/goals/persistence/goal-sync-envelope';
import {
  createInitialNoteSyncSnapshot,
  isNoteSyncSnapshot,
  loadNoteSyncEnvelope,
  saveNoteSyncEnvelope,
  type NoteSyncSnapshot,
} from '@/features/notes/persistence/note-sync-envelope';
import {
  createInitialProfileSyncSnapshot,
  isProfileSyncSnapshot,
  loadProfileSyncEnvelope,
  saveProfileSyncEnvelope,
  type ProfileSyncSnapshot,
} from '@/features/profile/persistence/profile-sync-envelope';
import {
  createInitialPracticeHistorySyncSnapshot,
  isPracticeHistorySyncSnapshot,
  loadPracticeHistorySyncEnvelope,
  savePracticeHistorySyncEnvelope,
  type PracticeHistorySyncSnapshot,
} from '@/features/stats/persistence/practice-history-sync-envelope';
import { createUserIdentity } from '@/shared/persistence/identity';
import type { KeyValueStorage, PersistenceLoadResult } from '@/shared/persistence/storage';
import { createInitialSyncEnvelope, type SyncEnvelope } from '@/shared/sync/sync-envelope';

const USER_IDENTITY = createUserIdentity('11111111-1111-1111-1111-111111111111')!;

function createFakeStorage(): KeyValueStorage {
  const store = new Map<string, string>();
  return {
    getItem: async (key) => store.get(key) ?? null,
    setItem: async (key, value) => {
      store.set(key, value);
    },
  };
}

async function expectDomainWrapperRoundTrip<State>(
  envelope: SyncEnvelope<State>,
  save: (storage: KeyValueStorage, value: SyncEnvelope<State>) => Promise<unknown>,
  load: (storage: KeyValueStorage) => Promise<PersistenceLoadResult<SyncEnvelope<State>>>,
) {
  const storage = createFakeStorage();
  await save(storage, envelope);
  const loaded = await load(storage);
  expect(loaded.status).toBe('loaded');
  if (loaded.status === 'loaded') expect(loaded.value).toEqual(envelope);
}

describe('domain sync snapshot validators', () => {
  it('validates custom-trick collection and positive revisions', () => {
    const valid: CustomTrickSyncSnapshot = {
      collection: { tricks: [{ id: 'custom-1', kind: 'standalone', name: 'Around the World', updatedAt: 1 }] },
      trickRevisions: { 'custom-1': 1 },
    };
    expect(isCustomTrickSyncSnapshot(valid)).toBe(true);
    expect(isCustomTrickSyncSnapshot(createInitialCustomTrickSyncSnapshot({ tricks: [] }))).toBe(true);
    expect(isCustomTrickSyncSnapshot({ collection: { tricks: [{ id: 'x' }] }, trickRevisions: {} })).toBe(false);
    expect(isCustomTrickSyncSnapshot({ collection: { tricks: [] }, trickRevisions: { x: 0 } })).toBe(false);
  });

  it('validates goal collection and positive revisions', () => {
    const valid: GoalSyncSnapshot = {
      collection: {
        goals: [{ id: 'goal-1', trickId: 'big-cup', trickName: 'Big cup', kind: 'count', targetCount: 5, createdAt: 1, updatedAt: 1 }],
      },
      goalRevisions: { 'goal-1': 1 },
    };
    expect(isGoalSyncSnapshot(valid)).toBe(true);
    expect(isGoalSyncSnapshot(createInitialGoalSyncSnapshot({ goals: [] }))).toBe(true);
    expect(isGoalSyncSnapshot({ collection: { goals: [{ id: 'x' }] }, goalRevisions: {} })).toBe(false);
    expect(isGoalSyncSnapshot({ collection: { goals: [] }, goalRevisions: { x: 0 } })).toBe(false);
  });

  it('validates note collection and positive revisions', () => {
    const valid: NoteSyncSnapshot = {
      collection: {
        notes: [{ id: 'note-1', trickId: 'big-cup', trickName: 'Big cup', body: 'Relax', createdAt: 1, updatedAt: 1 }],
      },
      noteRevisions: { 'note-1': 1 },
    };
    expect(isNoteSyncSnapshot(valid)).toBe(true);
    expect(isNoteSyncSnapshot(createInitialNoteSyncSnapshot({ notes: [] }))).toBe(true);
    expect(isNoteSyncSnapshot({ collection: { notes: [{ id: 'x' }] }, noteRevisions: {} })).toBe(false);
    expect(isNoteSyncSnapshot({ collection: { notes: [] }, noteRevisions: { x: 0 } })).toBe(false);
  });

  it('validates profile state and both revision shapes', () => {
    const baseProfile = { hasCompletedOnboarding: false, selectedTrickIds: [] };
    const valid: ProfileSyncSnapshot = {
      profile: baseProfile,
      profileRevision: 3,
      trickStateRevisions: { 'trick-1': 1 },
    };
    expect(isProfileSyncSnapshot(valid)).toBe(true);
    expect(isProfileSyncSnapshot(createInitialProfileSyncSnapshot(baseProfile))).toBe(true);
    expect(isProfileSyncSnapshot({ profile: {}, profileRevision: null, trickStateRevisions: {} })).toBe(false);
    expect(isProfileSyncSnapshot({ profile: baseProfile, profileRevision: 1.5, trickStateRevisions: {} })).toBe(false);
    expect(isProfileSyncSnapshot({ profile: baseProfile, profileRevision: null, trickStateRevisions: { x: 0 } })).toBe(false);
  });

  it('validates immutable practice-history state', () => {
    const valid: PracticeHistorySyncSnapshot = {
      history: {
        sessions: [{ id: 'session-1', trickId: 'lighthouse', trickName: 'Lighthouse', startedAt: 1, completedAt: 5, durationMs: 4, laceCount: 2 }],
      },
    };
    expect(isPracticeHistorySyncSnapshot(valid)).toBe(true);
    expect(isPracticeHistorySyncSnapshot(createInitialPracticeHistorySyncSnapshot({ sessions: [] }))).toBe(true);
    expect(isPracticeHistorySyncSnapshot({ history: { sessions: [{ id: 'partial' }] } })).toBe(false);
    expect(isPracticeHistorySyncSnapshot(null)).toBe(false);
  });
});

describe('domain sync persistence wrappers', () => {
  it('round-trips custom-trick envelopes through the domain key and codec', async () => {
    const state: CustomTrickSyncSnapshot = { collection: { tricks: [] }, trickRevisions: { x: 1 } };
    const envelope = createInitialSyncEnvelope('customTricks', USER_IDENTITY, state);
    await expectDomainWrapperRoundTrip(envelope, saveCustomTrickSyncEnvelope, (storage) =>
      loadCustomTrickSyncEnvelope(storage, USER_IDENTITY, createInitialCustomTrickSyncSnapshot({ tricks: [] })),
    );
  });

  it('round-trips goal envelopes through the domain key and codec', async () => {
    const state: GoalSyncSnapshot = { collection: { goals: [] }, goalRevisions: { x: 1 } };
    const envelope = createInitialSyncEnvelope('goals', USER_IDENTITY, state);
    await expectDomainWrapperRoundTrip(envelope, saveGoalSyncEnvelope, (storage) =>
      loadGoalSyncEnvelope(storage, USER_IDENTITY, createInitialGoalSyncSnapshot({ goals: [] })),
    );
  });

  it('round-trips note envelopes through the domain key and codec', async () => {
    const state: NoteSyncSnapshot = { collection: { notes: [] }, noteRevisions: { x: 1 } };
    const envelope = createInitialSyncEnvelope('notes', USER_IDENTITY, state);
    await expectDomainWrapperRoundTrip(envelope, saveNoteSyncEnvelope, (storage) =>
      loadNoteSyncEnvelope(storage, USER_IDENTITY, createInitialNoteSyncSnapshot({ notes: [] })),
    );
  });

  it('round-trips profile envelopes through the domain key and codec', async () => {
    const profile = { hasCompletedOnboarding: false, selectedTrickIds: [] };
    const state: ProfileSyncSnapshot = { profile, profileRevision: 2, trickStateRevisions: { x: 1 } };
    const envelope = createInitialSyncEnvelope('profile', USER_IDENTITY, state);
    await expectDomainWrapperRoundTrip(envelope, saveProfileSyncEnvelope, (storage) =>
      loadProfileSyncEnvelope(storage, USER_IDENTITY, createInitialProfileSyncSnapshot(profile)),
    );
  });

  it('round-trips practice-history envelopes through the domain key and codec', async () => {
    const state: PracticeHistorySyncSnapshot = { history: { sessions: [] } };
    const envelope = createInitialSyncEnvelope('practiceHistory', USER_IDENTITY, state);
    await expectDomainWrapperRoundTrip(envelope, savePracticeHistorySyncEnvelope, (storage) =>
      loadPracticeHistorySyncEnvelope(storage, USER_IDENTITY, createInitialPracticeHistorySyncSnapshot({ sessions: [] })),
    );
  });
});
