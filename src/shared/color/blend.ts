/**
 * Linear RGB color blending. Generic, not profile-specific -- anything that needs to mix two
 * hex colors (e.g. deriving a secondary text tone from a primary color) can reuse this.
 */

import { hexToRgb } from '@/shared/color/contrast';

function channelToHex(channel: number): string {
  return Math.round(channel).toString(16).padStart(2, '0');
}

/**
 * Blends `hexA` and `hexB` in linear RGB space, weighted `ratio` toward `hexA` (e.g. `ratio =
 * 0.65` returns a color 65% of the way from `hexB` to `hexA`). Falls back to `hexA` unchanged if
 * either input isn't a parseable `#rrggbb` hex color.
 */
export function blendHexColors(hexA: string, hexB: string, ratio: number): string {
  const rgbA = hexToRgb(hexA);
  const rgbB = hexToRgb(hexB);
  if (!rgbA || !rgbB) return hexA;

  const r = rgbA.r * ratio + rgbB.r * (1 - ratio);
  const g = rgbA.g * ratio + rgbB.g * (1 - ratio);
  const b = rgbA.b * ratio + rgbB.b * (1 - ratio);

  return `#${channelToHex(r)}${channelToHex(g)}${channelToHex(b)}`;
}
