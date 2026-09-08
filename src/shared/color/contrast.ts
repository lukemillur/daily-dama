/**
 * WCAG relative-luminance/contrast utilities. Generic, not profile-specific — anything picking
 * free-form colors against a fixed reference color can reuse this.
 */

export const WCAG_AA_MIN_CONTRAST_RATIO = 4.5;

interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export function hexToRgb(hex: string): Rgb | undefined {
  const match = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!match) return undefined;

  const value = match[1];
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

function linearizeChannel(channel: number): number {
  const normalized = channel / 255;
  return normalized <= 0.03928
    ? normalized / 12.92
    : Math.pow((normalized + 0.055) / 1.055, 2.4);
}

function relativeLuminance({ r, g, b }: Rgb): number {
  return (
    0.2126 * linearizeChannel(r) + 0.7152 * linearizeChannel(g) + 0.0722 * linearizeChannel(b)
  );
}

export function contrastRatio(hexA: string, hexB: string): number | undefined {
  const rgbA = hexToRgb(hexA);
  const rgbB = hexToRgb(hexB);
  if (!rgbA || !rgbB) return undefined;

  const luminanceA = relativeLuminance(rgbA);
  const luminanceB = relativeLuminance(rgbB);
  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);

  return (lighter + 0.05) / (darker + 0.05);
}

export function meetsMinimumContrast(
  hexA: string,
  hexB: string,
  minimumRatio: number = WCAG_AA_MIN_CONTRAST_RATIO,
): boolean {
  const ratio = contrastRatio(hexA, hexB);
  return ratio !== undefined && ratio >= minimumRatio;
}
