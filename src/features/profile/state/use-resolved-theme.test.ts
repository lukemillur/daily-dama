import { describe, expect, it, jest } from '@jest/globals';

// The mock is hoisted above these imports by babel-jest, so it runs before use-resolved-theme's
// transitive import of user-profile-provider (and its AsyncStorage import) is ever reached. See
// kentei-rank-auto-promotion.test.tsx for the same pattern and why a require (not an import) is
// used inside the factory.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { AppColors } from '@/constants/theme';
import { resolveTheme } from '@/features/profile/state/use-resolved-theme';

describe('resolveTheme', () => {
  it('returns the custom theme text color verbatim when set', () => {
    const theme = resolveTheme({
      themeBackgroundColor: '#101418',
      themeAccentColor: '#1a1f24',
      themeTextColor: '#ff00ff',
    });

    expect(theme.text).toBe('#ff00ff');
  });

  it('falls back to the fixed background/accent palette when unset', () => {
    const theme = resolveTheme({});

    expect(theme.background).toBe(AppColors.sage);
    expect(theme.accent).toBe(AppColors.yellow);
  });

  it('derives ink as the automatic text color for the default light background/accent pair', () => {
    const theme = resolveTheme({});

    expect(theme.text).toBe(AppColors.ink);
  });

  it('derives cream as the automatic text color for a dark background/accent pair', () => {
    const theme = resolveTheme({
      themeBackgroundColor: '#101418',
      themeAccentColor: '#1a1f24',
    });

    expect(theme.text).toBe(AppColors.cream);
  });
});
