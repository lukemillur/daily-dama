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

  it('round-trips a profile with a cached last sesh', () => {
    const profileWithLastSesh = {
      ...COMPLETE_PROFILE,
      lastSesh: { trickId: 'big-cup', plan: { kind: 'timed', durationMinutes: 5 } },
    } as const;

    const serialized = serializeUserProfile(profileWithLastSesh);

    expect(deserializeUserProfile(serialized)).toEqual(profileWithLastSesh);
  });

  it('round-trips an open-ended cached last sesh', () => {
    const profileWithLastSesh = {
      ...COMPLETE_PROFILE,
      lastSesh: { trickId: 'airplane', plan: { kind: 'openEnded' } },
    } as const;

    const serialized = serializeUserProfile(profileWithLastSesh);

    expect(deserializeUserProfile(serialized)).toEqual(profileWithLastSesh);
  });

  it('round-trips an open-ended cached last sesh with a target', () => {
    const profileWithLastSesh = {
      ...COMPLETE_PROFILE,
      lastSesh: { trickId: 'airplane', plan: { kind: 'openEnded', targetLandingCount: 10 } },
    } as const;

    const serialized = serializeUserProfile(profileWithLastSesh);

    expect(deserializeUserProfile(serialized)).toEqual(profileWithLastSesh);
  });

  it('round-trips a profile with a custom streak threshold', () => {
    const profileWithThreshold = { ...COMPLETE_PROFILE, streakThresholdMs: 300_000 } as const;

    const serialized = serializeUserProfile(profileWithThreshold);

    expect(deserializeUserProfile(serialized)).toEqual(profileWithThreshold);
  });

  it('round-trips a profile with manually unlocked tricks', () => {
    const profileWithManualUnlocks = {
      ...COMPLETE_PROFILE,
      manuallyUnlockedTrickIds: ['big-cup', 'custom-trick'],
    } as const;

    const serialized = serializeUserProfile(profileWithManualUnlocks);

    expect(deserializeUserProfile(serialized)).toEqual(profileWithManualUnlocks);
  });

  it('round-trips a profile with both theme colors set', () => {
    const profileWithThemeColors = {
      ...COMPLETE_PROFILE,
      themeBackgroundColor: '#ABCDEF',
      themeAccentColor: '#123456',
    } as const;

    const serialized = serializeUserProfile(profileWithThemeColors);

    expect(deserializeUserProfile(serialized)).toEqual(profileWithThemeColors);
  });

  it('defaults theme colors to undefined when unset', () => {
    const serialized = serializeUserProfile(COMPLETE_PROFILE);

    const result = deserializeUserProfile(serialized);

    expect(result?.themeBackgroundColor).toBeUndefined();
    expect(result?.themeAccentColor).toBeUndefined();
  });

  it.each(['not-a-color', '#fff', '#1234567', '#gggggg', ''])(
    'rejects a malformed themeBackgroundColor: %p',
    (themeBackgroundColor) => {
      const serialized = JSON.stringify({
        version: USER_PROFILE_SCHEMA_VERSION,
        profile: { ...COMPLETE_PROFILE, themeBackgroundColor },
      });

      expect(deserializeUserProfile(serialized)).toBeUndefined();
    },
  );

  it.each(['not-a-color', '#fff', '#1234567', '#gggggg', ''])(
    'rejects a malformed themeAccentColor: %p',
    (themeAccentColor) => {
      const serialized = JSON.stringify({
        version: USER_PROFILE_SCHEMA_VERSION,
        profile: { ...COMPLETE_PROFILE, themeAccentColor },
      });

      expect(deserializeUserProfile(serialized)).toBeUndefined();
    },
  );

  it('loads a valid persisted profile with theme colors through the full hydration path', async () => {
    const profileWithThemeColors = {
      ...COMPLETE_PROFILE,
      themeBackgroundColor: '#abcdef',
      themeAccentColor: '#123456',
    } as const;

    const result = await loadUserProfile(
      createStorage(serializeUserProfile(profileWithThemeColors)),
    );

    expect(result).toEqual({ status: 'loaded', value: profileWithThemeColors });
  });

  it('round-trips a profile with theme colors and a custom theme text color', () => {
    const profileWithThemeColors = {
      ...COMPLETE_PROFILE,
      themeBackgroundColor: '#ABCDEF',
      themeAccentColor: '#123456',
      themeTextColor: '#654321',
    } as const;

    const serialized = serializeUserProfile(profileWithThemeColors);

    expect(deserializeUserProfile(serialized)).toEqual(profileWithThemeColors);
  });

  it('defaults themeTextColor to undefined when unset', () => {
    const serialized = serializeUserProfile(COMPLETE_PROFILE);

    const result = deserializeUserProfile(serialized);

    expect(result?.themeTextColor).toBeUndefined();
  });

  it.each(['not-a-color', '#fff', '#1234567', '#gggggg', ''])(
    'rejects a malformed themeTextColor: %p',
    (themeTextColor) => {
      const serialized = JSON.stringify({
        version: USER_PROFILE_SCHEMA_VERSION,
        profile: { ...COMPLETE_PROFILE, themeTextColor },
      });

      expect(deserializeUserProfile(serialized)).toBeUndefined();
    },
  );

  it('loads a valid persisted profile with a theme text color through the full hydration path', async () => {
    const profileWithThemeTextColor = {
      ...COMPLETE_PROFILE,
      themeBackgroundColor: '#abcdef',
      themeAccentColor: '#123456',
      themeTextColor: '#654321',
    } as const;

    const result = await loadUserProfile(
      createStorage(serializeUserProfile(profileWithThemeTextColor)),
    );

    expect(result).toEqual({ status: 'loaded', value: profileWithThemeTextColor });
  });

  it.each([0, 'not-an-array', ['big-cup', 'big-cup'], ['big-cup', ''], [1, 2]])(
    'rejects a malformed manuallyUnlockedTrickIds: %p',
    (manuallyUnlockedTrickIds) => {
      const serialized = JSON.stringify({
        version: USER_PROFILE_SCHEMA_VERSION,
        profile: { ...COMPLETE_PROFILE, manuallyUnlockedTrickIds },
      });

      expect(deserializeUserProfile(serialized)).toBeUndefined();
    },
  );

  it.each([0, -60_000, 61 * 60_000, 90_000, 1.5 * 60_000, '60000'])(
    'rejects a malformed streak threshold: %p',
    (streakThresholdMs) => {
      const serialized = JSON.stringify({
        version: USER_PROFILE_SCHEMA_VERSION,
        profile: { ...COMPLETE_PROFILE, streakThresholdMs },
      });

      expect(deserializeUserProfile(serialized)).toBeUndefined();
    },
  );

  it('still loads an older document with no cached last sesh', async () => {
    const result = await loadUserProfile(createStorage(serializeUserProfile(COMPLETE_PROFILE)));

    expect(result).toEqual({ status: 'loaded', value: COMPLETE_PROFILE });
  });

  it.each([
    { trickId: 'big-cup', plan: { kind: 'timed', durationMinutes: 0 } },
    { trickId: 'big-cup', plan: { kind: 'timed', durationMinutes: 61 } },
    { trickId: 'big-cup', plan: { kind: 'unknown' } },
    { trickId: '', plan: { kind: 'openEnded' } },
    { trickId: 'big-cup', plan: { kind: 'openEnded', targetLandingCount: 0 } },
    { trickId: 'big-cup', plan: { kind: 'openEnded', targetLandingCount: 1000 } },
    { trickId: 'big-cup', plan: { kind: 'openEnded', targetLandingCount: 5, extra: true } },
  ])('rejects a malformed cached last sesh', (lastSesh) => {
    const serialized = JSON.stringify({
      version: USER_PROFILE_SCHEMA_VERSION,
      profile: { ...COMPLETE_PROFILE, lastSesh },
    });

    expect(deserializeUserProfile(serialized)).toBeUndefined();
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
