import { describe, expect, it } from '@jest/globals';

import {
  contrastRatio,
  hexToRgb,
  meetsMinimumContrast,
  WCAG_AA_MIN_CONTRAST_RATIO,
} from '@/shared/color/contrast';

describe('hexToRgb', () => {
  it('parses a 6-digit hex color', () => {
    expect(hexToRgb('#ffffff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(hexToRgb('#18382e')).toEqual({ r: 24, g: 56, b: 46 });
  });

  it('rejects anything that is not a 6-digit hex color', () => {
    expect(hexToRgb('#fff')).toBeUndefined();
    expect(hexToRgb('18382e')).toBeUndefined();
    expect(hexToRgb('#gggggg')).toBeUndefined();
    expect(hexToRgb('')).toBeUndefined();
  });
});

describe('contrastRatio', () => {
  it('is 21:1 for pure black against pure white', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
  });

  it('is 1:1 for a color against itself', () => {
    expect(contrastRatio('#4477aa', '#4477aa')).toBeCloseTo(1, 5);
  });

  it('is order independent', () => {
    expect(contrastRatio('#000000', '#ffffff')).toEqual(contrastRatio('#ffffff', '#000000'));
  });

  it('matches the widely-cited WCAG boundary gray', () => {
    expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.54, 1);
  });

  it('returns undefined when either color is invalid', () => {
    expect(contrastRatio('not-a-color', '#ffffff')).toBeUndefined();
    expect(contrastRatio('#ffffff', 'not-a-color')).toBeUndefined();
  });
});

describe('meetsMinimumContrast', () => {
  it('passes at the default WCAG AA threshold for a high-contrast pair', () => {
    expect(meetsMinimumContrast('#000000', '#ffffff')).toBe(true);
  });

  it('fails for a low-contrast pair', () => {
    expect(meetsMinimumContrast('#18382e', '#274137')).toBe(false);
  });

  it('respects a custom minimum ratio', () => {
    expect(meetsMinimumContrast('#767676', '#ffffff', WCAG_AA_MIN_CONTRAST_RATIO)).toBe(true);
    expect(meetsMinimumContrast('#767676', '#ffffff', 10)).toBe(false);
  });
});
