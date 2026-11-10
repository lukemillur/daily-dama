import { describe, expect, it } from '@jest/globals';

import { AppColors } from '@/constants/theme';
import { RAINBOW_THEME_PRESETS } from '@/features/profile/model/theme-presets';
import { contrastRatio } from '@/shared/color/contrast';
import { deriveStatusBarStyle } from '@/shared/color/status-bar-style';

const SYSTEM_ICON_MIN_CONTRAST = 3;

describe('deriveStatusBarStyle', () => {
  it('uses dark icons on the pale Red preset', () => {
    const red = RAINBOW_THEME_PRESETS.find((preset) => preset.id === 'red')!;
    expect(deriveStatusBarStyle(red.backgroundColor)).toBe('dark');
  });

  it('uses dark icons on the default sage background', () => {
    expect(deriveStatusBarStyle(AppColors.sage)).toBe('dark');
  });

  it('uses light icons on a dark custom background', () => {
    expect(deriveStatusBarStyle('#101820')).toBe('light');
  });

  it('handles the extremes', () => {
    expect(deriveStatusBarStyle('#ffffff')).toBe('dark');
    expect(deriveStatusBarStyle('#000000')).toBe('light');
  });

  it('falls back to the default background decision for invalid hex', () => {
    expect(deriveStatusBarStyle('not-a-color')).toBe('dark');
    expect(deriveStatusBarStyle('#fff')).toBe('dark');
  });

  it.each(RAINBOW_THEME_PRESETS.map((preset) => [preset.label, preset.backgroundColor] as const))(
    'gives the %s preset icons at least 3:1 contrast',
    (_label, background) => {
      const icon = deriveStatusBarStyle(background) === 'dark' ? '#000000' : '#ffffff';
      expect(contrastRatio(icon, background)).toBeGreaterThanOrEqual(SYSTEM_ICON_MIN_CONTRAST);
    },
  );
});
