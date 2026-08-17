import { describe, expect, it, jest } from '@jest/globals';

// The mock is hoisted above these imports by babel-jest, so it runs before
// readCachedThemeBackgroundColor's transitive import of use-resolved-theme ->
// user-profile-provider (and its AsyncStorage import) is ever reached. See
// use-resolved-theme.test.ts for the same pattern.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { readCachedThemeBackgroundColor } from './read-cached-theme-background';

const DEFAULT_BACKGROUND = '#dfe8ca';

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
});
