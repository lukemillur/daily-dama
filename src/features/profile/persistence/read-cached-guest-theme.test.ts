import { describe, expect, it, jest } from '@jest/globals';

import { USER_PROFILE_STORAGE_KEY } from './user-profile-persistence';
import { GUEST_IDENTITY } from '@/shared/persistence/identity';
import { physicalKey } from '@/shared/persistence/scoped-storage';

// The mock is hoisted above this import by babel-jest, so it runs before
// readCachedGuestTheme's transitive import of use-resolved-theme ->
// user-profile-provider (and its AsyncStorage import) is ever reached. See
// read-cached-theme-background.test.ts for the same pattern.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { readCachedGuestTheme } from './read-cached-guest-theme';

const GUEST_SCOPED_KEY = physicalKey(GUEST_IDENTITY, USER_PROFILE_STORAGE_KEY);

const DEFAULT_THEME = {
  background: '#dfe8ca',
  accent: '#f4c94d',
};

function validDocument(overrides: {
  themeBackgroundColor?: string;
  themeAccentColor?: string;
  themeTextColor?: string;
}): string {
  return JSON.stringify({
    version: 1,
    profile: {
      hasCompletedOnboarding: false,
      selectedTrickIds: [],
      ...overrides,
    },
  });
}

describe('readCachedGuestTheme', () => {
  it('returns the default theme when no value is cached', () => {
    const theme = readCachedGuestTheme(() => null);
    expect(theme.background).toBe(DEFAULT_THEME.background);
    expect(theme.accent).toBe(DEFAULT_THEME.accent);
  });

  it('returns the saved background/accent/text from the guest-scoped key', () => {
    const store: Record<string, string> = {
      [GUEST_SCOPED_KEY]: validDocument({
        themeBackgroundColor: '#ff00ff',
        themeAccentColor: '#00ffff',
        themeTextColor: '#111111',
      }),
    };
    const theme = readCachedGuestTheme((key) => store[key] ?? null);
    expect(theme.background).toBe('#ff00ff');
    expect(theme.accent).toBe('#00ffff');
    expect(theme.text).toBe('#111111');
  });

  it('falls back to the legacy bare key when the guest-scoped key is empty', () => {
    const store: Record<string, string> = {
      [USER_PROFILE_STORAGE_KEY]: validDocument({ themeBackgroundColor: '#123456' }),
    };
    const theme = readCachedGuestTheme((key) => store[key] ?? null);
    expect(theme.background).toBe('#123456');
  });

  it('prefers the guest-scoped key over the legacy bare key when both exist', () => {
    const store: Record<string, string> = {
      [GUEST_SCOPED_KEY]: validDocument({ themeBackgroundColor: '#abcdef' }),
      [USER_PROFILE_STORAGE_KEY]: validDocument({ themeBackgroundColor: '#111111' }),
    };
    const theme = readCachedGuestTheme((key) => store[key] ?? null);
    expect(theme.background).toBe('#abcdef');
  });

  it('returns the default theme when the saved profile has no custom colors', () => {
    const store: Record<string, string> = { [GUEST_SCOPED_KEY]: validDocument({}) };
    const theme = readCachedGuestTheme((key) => store[key] ?? null);
    expect(theme.background).toBe(DEFAULT_THEME.background);
    expect(theme.accent).toBe(DEFAULT_THEME.accent);
  });

  it('returns the default theme for malformed JSON', () => {
    const store: Record<string, string> = { [GUEST_SCOPED_KEY]: 'not json' };
    const theme = readCachedGuestTheme((key) => store[key] ?? null);
    expect(theme.background).toBe(DEFAULT_THEME.background);
  });

  it('returns the default theme for the wrong document version', () => {
    const store: Record<string, string> = {
      [GUEST_SCOPED_KEY]: JSON.stringify({ version: 2, profile: {} }),
    };
    const theme = readCachedGuestTheme((key) => store[key] ?? null);
    expect(theme.background).toBe(DEFAULT_THEME.background);
  });

  it('returns the default theme when getItem throws', () => {
    const getItem = (): string | null => {
      throw new Error('blocked');
    };
    const theme = readCachedGuestTheme(getItem);
    expect(theme.background).toBe(DEFAULT_THEME.background);
  });
});
