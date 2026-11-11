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
import {
  deriveMutedOnSurface,
  deriveReadableForeground,
  resolveTheme,
} from '@/features/profile/state/use-resolved-theme';
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

describe('themed control foregrounds', () => {
  const cases: readonly (readonly [string, Parameters<typeof resolveTheme>[0]])[] = [
    ['default', {}],
    ['dark custom pair', { themeBackgroundColor: '#101418', themeAccentColor: '#1a1f24' }],
    ['low-contrast text override', { themeTextColor: '#ff00ff' }],
    ...RAINBOW_THEME_PRESETS.map(
      (preset) =>
        [
          `preset ${preset.id}`,
          { themeBackgroundColor: preset.backgroundColor, themeAccentColor: preset.accentColor },
        ] as const,
    ),
  ];

  it.each(cases)('keeps every control foreground at 4.5:1 or better: %s', (_name, preferences) => {
    const theme = resolveTheme(preferences);

    expect(contrastRatio(theme.onButton, theme.buttonBackground)).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(theme.onButtonSecondary, theme.buttonBackgroundSecondary),
    ).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(theme.onInk, AppColors.ink)).toBeGreaterThanOrEqual(4.5);
    expect(theme.accent).toBe(preferences.themeAccentColor ?? AppColors.yellow);
  });

  it('characterizes the blue preset, where the raw accent fails on the ink surface', () => {
    const blue = RAINBOW_THEME_PRESETS.find((preset) => preset.id === 'blue');
    const theme = resolveTheme({
      themeBackgroundColor: blue?.backgroundColor,
      themeAccentColor: blue?.accentColor,
    });

    expect(contrastRatio(theme.accent, AppColors.ink)).toBeLessThan(4.5);
    expect(theme.onInk).not.toBe(theme.accent);
  });

  it('keeps the decorative accent when it is already legible', () => {
    const theme = resolveTheme({});

    expect(theme.onButton).toBe(theme.accent);
    expect(theme.onInk).toBe(theme.accent);
  });
});

describe('deriveReadableForeground', () => {
  it('passes through a legible preferred color', () => {
    expect(deriveReadableForeground('#000000', '#ffffff')).toBe('#ffffff');
  });

  it('falls back to the higher-contrast neutral', () => {
    expect(deriveReadableForeground('#000000', '#111111')).toBe(AppColors.cream);
    expect(deriveReadableForeground('#ffffff', '#eeeeee')).toBe(AppColors.ink);
  });

  it('falls back without throwing on invalid hex', () => {
    expect(() => deriveReadableForeground('#000000', 'nope')).not.toThrow();
  });
});

describe('accent surface foregrounds', () => {
  const cases: readonly (readonly [string, Parameters<typeof resolveTheme>[0]])[] = [
    ['default', {}],
    ['light custom', { themeBackgroundColor: '#f5f5f0', themeAccentColor: '#ffe066' }],
    ['dark custom', { themeBackgroundColor: '#101418', themeAccentColor: '#1a1f24' }],
    ['mid custom', { themeBackgroundColor: '#8899aa', themeAccentColor: '#808080' }],
    ['custom text failing on accent', { themeTextColor: '#ff00ff' }],
    ['custom text passing on accent', { themeTextColor: '#111111' }],
    ...RAINBOW_THEME_PRESETS.map(
      (preset) =>
        [
          `preset ${preset.id}`,
          { themeBackgroundColor: preset.backgroundColor, themeAccentColor: preset.accentColor },
        ] as const,
    ),
  ];

  it.each(cases)('keeps primary and secondary copy at 4.5:1 on the accent: %s', (_n, prefs) => {
    const theme = resolveTheme(prefs);

    expect(contrastRatio(theme.onAccent, theme.accent)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(theme.onAccentMuted, theme.accent)).toBeGreaterThanOrEqual(4.5);
    expect(theme.accent).toBe(prefs.themeAccentColor ?? AppColors.yellow);
  });

  it('keeps the page text and hierarchy on the default theme', () => {
    const theme = resolveTheme({});

    expect(theme.onAccent).toBe(theme.text);
    expect(theme.onAccentMuted).not.toBe(theme.onAccent);
  });

  it('returns a custom text color verbatim when it already reads on the accent', () => {
    expect(resolveTheme({ themeTextColor: '#111111' }).onAccent).toBe('#111111');
  });

  it('replaces page text that fails on the accent (red preset)', () => {
    const red = RAINBOW_THEME_PRESETS.find((preset) => preset.id === 'red');
    const theme = resolveTheme({
      themeBackgroundColor: red?.backgroundColor,
      themeAccentColor: red?.accentColor,
    });

    expect(contrastRatio(theme.text, theme.accent)).toBeLessThan(4.5);
    expect(theme.onAccent).not.toBe(theme.text);
  });

  it('deriveMutedOnSurface falls back to the foreground when no blend reaches the target', () => {
    expect(deriveMutedOnSurface('#ffffff', '#000000')).not.toBe('#ffffff');
    expect(deriveMutedOnSurface('#777777', '#808080', 7)).toBe('#777777');
  });
});
