import { describe, expect, it, jest } from '@jest/globals';

import {
  deserializeUserProfile,
  loadUserProfile,
  saveUserProfile,
  serializeUserProfile,
  USER_PROFILE_SCHEMA_VERSION,
  USER_PROFILE_STORAGE_KEY,
} from '@/features/profile/persistence/user-profile-persistence';
import type { KeyValueStorage } from '@/shared/persistence/storage';

const COMPLETE_PROFILE = {
  hasCompletedOnboarding: true,
  kenteiRank: 4,
  selectedTrickIds: ['big-cup', 'airplane'],
} as const;

function createStorage(serialized: string | null = null): KeyValueStorage {
  return {
    getItem: jest.fn(async () => serialized),
    setItem: jest.fn(async () => undefined),
  };
}

describe('user profile persistence', () => {
  it('serializes a versioned document and restores the profile', () => {
    const serialized = serializeUserProfile(COMPLETE_PROFILE);

    expect(JSON.parse(serialized)).toEqual({
      version: USER_PROFILE_SCHEMA_VERSION,
      profile: COMPLETE_PROFILE,
    });
    expect(deserializeUserProfile(serialized)).toEqual(COMPLETE_PROFILE);
  });

  it('loads a valid persisted profile', async () => {
    const result = await loadUserProfile(createStorage(serializeUserProfile(COMPLETE_PROFILE)));

    expect(result).toEqual({ status: 'loaded', value: COMPLETE_PROFILE });
  });

  it('uses the initial profile when storage is empty', async () => {
    const result = await loadUserProfile(createStorage());

    expect(result).toEqual({
      status: 'empty',
      value: { hasCompletedOnboarding: false, selectedTrickIds: [] },
    });
  });

  it.each([
    'not-json',
    JSON.stringify({ version: USER_PROFILE_SCHEMA_VERSION + 1, profile: COMPLETE_PROFILE }),
    JSON.stringify({ version: USER_PROFILE_SCHEMA_VERSION, profile: { selectedTrickIds: [] } }),
    JSON.stringify({
      version: USER_PROFILE_SCHEMA_VERSION,
      profile: { ...COMPLETE_PROFILE, kenteiRank: 99 },
    }),
  ])('recovers safely from malformed or unsupported data', async (serialized) => {
    const result = await loadUserProfile(createStorage(serialized));

    expect(result.status).toBe('recovered');
    expect(result.value).toEqual({ hasCompletedOnboarding: false, selectedTrickIds: [] });
  });

  it('recovers safely when storage cannot be read', async () => {
    const error = new Error('read failed');
    const storage: KeyValueStorage = {
      getItem: jest.fn(async () => Promise.reject(error)),
      setItem: jest.fn(async () => undefined),
    };

    await expect(loadUserProfile(storage)).resolves.toEqual({
      status: 'recovered',
      value: { hasCompletedOnboarding: false, selectedTrickIds: [] },
      error,
    });
  });

  it('reports write failures without throwing', async () => {
    const error = new Error('write failed');
    const storage: KeyValueStorage = {
      getItem: jest.fn(async () => null),
      setItem: jest.fn(async () => Promise.reject(error)),
    };

    await expect(saveUserProfile(storage, COMPLETE_PROFILE)).resolves.toEqual({
      status: 'failed',
      error,
    });
  });

  it('writes the versioned document under the stable storage key', async () => {
    const storage = createStorage();

    await expect(saveUserProfile(storage, COMPLETE_PROFILE)).resolves.toEqual({ status: 'saved' });
    expect(storage.setItem).toHaveBeenCalledWith(
      USER_PROFILE_STORAGE_KEY,
      serializeUserProfile(COMPLETE_PROFILE),
    );
  });
});
