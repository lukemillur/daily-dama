import { describe, expect, it } from '@jest/globals';

import { INITIAL_GUEST_IMPORT_STATE, type GuestImportState } from '@/features/guest-import/model/guest-import';
import {
  deserializeGuestImportState,
  GUEST_IMPORT_SCHEMA_VERSION,
  GUEST_IMPORT_STORAGE_KEY,
  isGuestImportState,
  loadGuestImportState,
  saveGuestImportState,
  serializeGuestImportState,
} from '@/features/guest-import/persistence/guest-import-persistence';
import { SYNC_DOMAINS } from '@/shared/sync/domain';
import type { KeyValueStorage } from '@/shared/persistence/storage';

function createMemoryStorage(seed: Record<string, string> = { }): KeyValueStorage {
  const store = new Map<string, string>(Object.entries(seed));
  return {
    getItem: async (key) => store.get(key) ?? null,
    setItem: async (key, value) => {
      store.set(key, value);
    },
  };
}

function fullState(status: GuestImportState['status']): GuestImportState {
  const inventory: Record<string, { local: number; cloud: number }> = { };
  const domainOutcomes: Record<string, { status: string; errorMessage: string | undefined }> = { };
  SYNC_DOMAINS.forEach((domain, index) => {
    inventory[domain] = { local: index, cloud: index + 1 };
    domainOutcomes[domain] = {
      status: index % 2 === 0 ? 'succeeded' : 'failed',
      errorMessage: index % 2 === 0 ? undefined : 'boom',
    };
  });

  return {
    status,
    importId: 'guest-import-abc',
    ownerIdentityNamespace: 'user:11111111-1111-1111-1111-111111111111',
    inventory: inventory as unknown as GuestImportState['inventory'],
    targetKind: 'existing',
    domainOutcomes: domainOutcomes as unknown as GuestImportState['domainOutcomes'],
    profileChoice: 'cloud',
    conflictResolutions: [
      { domain: 'goals', recordId: 'goal-1', choice: 'cloud' },
      { domain: 'notes', recordId: 'note-1', choice: 'guest' },
    ],
    conflicts: [
      { domain: 'goals', recordId: 'goal-1', guestSnapshot: { id: 'goal-1' }, cloudSnapshot: { id: 'goal-1' }, cloudRevision: 2 },
      { domain: 'notes', recordId: 'note-1', guestSnapshot: { id: 'note-1' }, cloudSnapshot: { id: 'note-1' }, cloudRevision: null },
    ],
    deduplications: [{ domain: 'customTricks', recordId: 'trick-1' }],
    profileComparison: { guest: { hasCompletedOnboarding: true }, cloud: null },
    errorMessage: undefined,
    startedAt: 1000,
    updatedAt: 2000,
  };
}

const STATUSES: readonly GuestImportState['status'][] = [
  'idle',
  'inventorying',
  'awaitingConfirmation',
  'uploading',
  'awaitingProfileChoice',
  'conflicts',
  'completed',
  'cancelled',
];

describe('guest-import-persistence', () => {
  it.each(STATUSES)('round-trips a fully-populated state through status %s', (status) => {
    const state = fullState(status);
    const serialized = serializeGuestImportState(state);
    const deserialized = deserializeGuestImportState(serialized);
    expect(deserialized).toEqual(state);
  });

  it('round-trips INITIAL_GUEST_IMPORT_STATE', () => {
    const serialized = serializeGuestImportState(INITIAL_GUEST_IMPORT_STATE);
    expect(deserializeGuestImportState(serialized)).toEqual(INITIAL_GUEST_IMPORT_STATE);
  });

  it('rejects malformed shapes field-by-field', () => {
    const base = fullState('uploading');
    expect(isGuestImportState({ ...base, status: 'not-a-status' })).toBe(false);
    expect(isGuestImportState({ ...base, importId: 42 })).toBe(false);
    expect(isGuestImportState({ ...base, ownerIdentityNamespace: 42 })).toBe(false);
    expect(isGuestImportState({ ...base, inventory: { profile: { local: -1, cloud: 0 } } })).toBe(false);
    expect(isGuestImportState({ ...base, targetKind: 'sideways' })).toBe(false);
    expect(
      isGuestImportState({ ...base, domainOutcomes: { profile: { status: 'not-a-status', errorMessage: undefined } } }),
    ).toBe(false);
    expect(isGuestImportState({ ...base, profileChoice: 'both' })).toBe(false);
    expect(isGuestImportState({ ...base, conflicts: [{ domain: 'not-a-domain', recordId: 'x' }] })).toBe(false);
    expect(isGuestImportState({ ...base, errorMessage: 42 })).toBe(false);
    expect(isGuestImportState({ ...base, startedAt: 'not-a-number' })).toBe(false);
    expect(isGuestImportState({ ...base, updatedAt: 'not-a-number' })).toBe(false);
    expect(isGuestImportState(null)).toBe(false);
    expect(isGuestImportState('a string')).toBe(false);
  });

  it('rejects a wrong schema version', () => {
    const wrapped = JSON.stringify({ version: GUEST_IMPORT_SCHEMA_VERSION + 1, state: fullState('completed') });
    expect(deserializeGuestImportState(wrapped)).toBeUndefined();
  });

  it('rejects unparsable JSON', () => {
    expect(deserializeGuestImportState('not json {')).toBeUndefined();
  });

  it('loadGuestImportState returns empty for a missing key and recovered for malformed data', async () => {
    const emptyStorage = createMemoryStorage();
    const emptyResult = await loadGuestImportState(emptyStorage);
    expect(emptyResult).toEqual({ status: 'empty', value: INITIAL_GUEST_IMPORT_STATE });

    const malformedStorage = createMemoryStorage({ [GUEST_IMPORT_STORAGE_KEY]: 'not json' });
    const recoveredResult = await loadGuestImportState(malformedStorage);
    expect(recoveredResult.status).toBe('recovered');
    expect(recoveredResult.value).toEqual(INITIAL_GUEST_IMPORT_STATE);
  });

  it('saveGuestImportState then loadGuestImportState round-trips through a real storage-shaped fake', async () => {
    const storage = createMemoryStorage();
    const state = fullState('awaitingConfirmation');
    const saveResult = await saveGuestImportState(storage, state);
    expect(saveResult).toEqual({ status: 'saved' });

    const loadResult = await loadGuestImportState(storage);
    expect(loadResult).toEqual({ status: 'loaded', value: state });
  });

  it('loadGuestImportState recovers when storage throws', async () => {
    const throwingStorage: KeyValueStorage = {
      getItem: async () => {
        throw new Error('boom');
      },
      setItem: async () => { },
    };
    const result = await loadGuestImportState(throwingStorage);
    expect(result.status).toBe('recovered');
    expect(result.value).toEqual(INITIAL_GUEST_IMPORT_STATE);
  });
});
