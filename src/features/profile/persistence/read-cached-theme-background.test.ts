import { describe, expect, it, jest } from '@jest/globals';

// The mock is hoisted above these imports by babel-jest, so it runs before
// readCachedThemeBackgroundColor's transitive import of use-resolved-theme ->
// user-profile-provider (and its AsyncStorage import) is ever reached. See
// use-resolved-theme.test.ts for the same pattern.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { GUEST_IDENTITY } from '@/shared/persistence/identity';
import { physicalKey } from '@/shared/persistence/scoped-storage';

import { readCachedThemeBackgroundColor } from './read-cached-theme-background';
import { USER_PROFILE_STORAGE_KEY } from './user-profile-persistence';

const DEFAULT_BACKGROUND = '#dfe8ca';

const GUEST_SCOPED_KEY = physicalKey(GUEST_IDENTITY, USER_PROFILE_STORAGE_KEY);

function validDocument(themeBackgroundColor?: string): string {
  return JSON.stringify({
    version: 1,
    profile: {
      hasCompletedOnboarding: false,
      selectedTrickIds: [],
      ...(themeBackgroundColor ? { themeBackgroundColor } : {}),
    },
  });
}

describe('readCachedThemeBackgroundColor', () => {
  it('returns the default background when no value is cached', () => {
    expect(readCachedThemeBackgroundColor(() => null)).toBe(DEFAULT_BACKGROUND);
  });

  it('returns the saved custom background color when present', () => {
    const getItem = () => validDocument('#ff00ff');
    expect(readCachedThemeBackgroundColor(getItem)).toBe('#ff00ff');
  });

  it('returns the default background when the saved profile has no custom color', () => {
    const getItem = () => validDocument();
    expect(readCachedThemeBackgroundColor(getItem)).toBe(DEFAULT_BACKGROUND);
  });

  it('returns the default background for malformed JSON', () => {
    const getItem = () => 'not json';
    expect(readCachedThemeBackgroundColor(getItem)).toBe(DEFAULT_BACKGROUND);
  });

  it('returns the default background for the wrong document version', () => {
    const getItem = () => JSON.stringify({ version: 2, profile: {} });
    expect(readCachedThemeBackgroundColor(getItem)).toBe(DEFAULT_BACKGROUND);
  });

  it('returns the default background when getItem throws', () => {
    const getItem = (): string | null => {
      throw new Error('blocked');
    };
    expect(readCachedThemeBackgroundColor(getItem)).toBe(DEFAULT_BACKGROUND);
  });

  it('falls back to the legacy bare key when the guest-scoped key is empty', () => {
    const store: Record<string, string> = {
      [USER_PROFILE_STORAGE_KEY]: validDocument('#123456'),
    };
    expect(readCachedThemeBackgroundColor((key) => store[key] ?? null)).toBe('#123456');
  });

  it('prefers the guest-scoped key over the legacy bare key when both exist', () => {
    const store: Record<string, string> = {
      [GUEST_SCOPED_KEY]: validDocument('#abcdef'),
      [USER_PROFILE_STORAGE_KEY]: validDocument('#111111'),
    };
    expect(readCachedThemeBackgroundColor((key) => store[key] ?? null)).toBe('#abcdef');
  });

  it('reads a fresh guest identity from the guest-scoped key even when a stale bare-key snapshot has a custom color', () => {
    const store: Record<string, string> = {
      [GUEST_SCOPED_KEY]: validDocument(),
      [USER_PROFILE_STORAGE_KEY]: validDocument('#ff00ff'),
    };
    expect(readCachedThemeBackgroundColor((key) => store[key] ?? null)).toBe(DEFAULT_BACKGROUND);
  });
});
