import { describe, expect, it, jest } from '@jest/globals';

// The mock is hoisted above these imports by babel-jest, so it runs before use-resolved-theme's
// transitive import of user-profile-provider (and its AsyncStorage import) is ever reached. See
// kentei-rank-auto-promotion.test.tsx for the same pattern and why a require (not an import) is
// used inside the factory.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { AppColors } from '@/constants/theme';
import { RAINBOW_THEME_PRESETS } from '@/features/profile/model/theme-presets';
import { resolveTheme } from '@/features/profile/state/use-resolved-theme';
import { contrastRatio } from '@/shared/color/contrast';

// A muted secondary text role is expected to have lower contrast than the primary text color --
// that's the point of muting it -- but should still clear a reasonable legibility floor against
// the background it's blended toward. This is deliberately below WCAG AA's normal-text minimum
// (4.5, see `contrast.ts`), since `textMuted` is a secondary/decorative role, not primary
// reading text.
const MIN_LEGIBLE_CONTRAST_RATIO = 2.5;

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

  it('derives ink/paperStrong button backgrounds when there is no saved preference', () => {
    const theme = resolveTheme({});

    expect(theme.buttonBackground).toBe(AppColors.ink);
    expect(theme.buttonBackgroundSecondary).toBe(AppColors.paperStrong);
  });

  it('flips to paperStrong/ink button backgrounds for a dark saved custom theme', () => {
    const theme = resolveTheme({
      themeBackgroundColor: '#101418',
      themeAccentColor: '#1a1f24',
    });

    expect(theme.buttonBackground).toBe(AppColors.paperStrong);
    expect(theme.buttonBackgroundSecondary).toBe(AppColors.ink);
  });

  it.each(RAINBOW_THEME_PRESETS.map((preset) => [preset.label, preset] as const))(
    'derives ink/paperStrong button backgrounds for the %s preset',
    (_label, preset) => {
      const theme = resolveTheme({
        themeBackgroundColor: preset.backgroundColor,
        themeAccentColor: preset.accentColor,
      });

      expect(theme.buttonBackground).toBe(AppColors.ink);
      expect(theme.buttonBackgroundSecondary).toBe(AppColors.paperStrong);
    },
  );
});

describe('resolveTheme textMuted', () => {
  it('derives a textMuted distinct from text and legibly blended toward background for the default theme', () => {
    const theme = resolveTheme({});

    expect(theme.textMuted).not.toBe(theme.text);
    expect(theme.textMuted).not.toBe(theme.background);
    expect(contrastRatio(theme.textMuted, theme.background)).toBeGreaterThanOrEqual(
      MIN_LEGIBLE_CONTRAST_RATIO,
    );
    // Muted text is blended toward background, so it should read with less contrast than the
    // primary text color, but not collapse all the way to zero separation.
    expect(contrastRatio(theme.textMuted, theme.background)).toBeLessThan(
      contrastRatio(theme.text, theme.background) ?? 0,
    );
  });

  it('derives a textMuted distinct from text and legibly blended toward background for a custom background/accent/text combination', () => {
    const theme = resolveTheme({
      themeBackgroundColor: '#101418',
      themeAccentColor: '#1a1f24',
      themeTextColor: '#ff00ff',
    });

    expect(theme.textMuted).not.toBe(theme.text);
    expect(theme.textMuted).not.toBe(theme.background);
    expect(contrastRatio(theme.textMuted, theme.background)).toBeGreaterThanOrEqual(
      MIN_LEGIBLE_CONTRAST_RATIO,
    );
    expect(contrastRatio(theme.textMuted, theme.background)).toBeLessThan(
      contrastRatio(theme.text, theme.background) ?? 0,
    );
  });

  it.each(RAINBOW_THEME_PRESETS.map((preset) => [preset.label, preset] as const))(
    'derives a textMuted distinct from text and legibly blended toward background for the %s preset',
    (_label, preset) => {
      const theme = resolveTheme({
        themeBackgroundColor: preset.backgroundColor,
        themeAccentColor: preset.accentColor,
      });

      expect(theme.textMuted).not.toBe(theme.text);
      expect(theme.textMuted).not.toBe(theme.background);
      expect(contrastRatio(theme.textMuted, theme.background)).toBeGreaterThanOrEqual(
        MIN_LEGIBLE_CONTRAST_RATIO,
      );
      expect(contrastRatio(theme.textMuted, theme.background)).toBeLessThan(
        contrastRatio(theme.text, theme.background) ?? 0,
      );
    },
  );
});
