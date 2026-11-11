import { AppColors } from '@/constants/theme';

import { contrastRatio } from './contrast';

export type StatusBarIconStyle = 'light' | 'dark';

/**
 * Picks the system status-bar icon style for a page background. Follows expo-status-bar's naming:
 * `'dark'` means dark icons (for pale backgrounds), `'light'` means light icons. Chooses whichever
 * of black/white contrasts more with the background. An unparseable background is treated as the
 * default theme background (sage), because that is what the app paints when no color resolves.
 */
export function deriveStatusBarStyle(background: string): StatusBarIconStyle {
  const resolved = contrastRatio('#000000', background) !== undefined ? background : AppColors.sage;
  const againstBlack = contrastRatio('#000000', resolved) ?? 0;
  const againstWhite = contrastRatio('#ffffff', resolved) ?? 0;
  return againstBlack >= againstWhite ? 'dark' : 'light';
}
