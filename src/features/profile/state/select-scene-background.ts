import { AppColors } from '@/constants/theme';

import type { ResolvedTheme } from './use-resolved-theme';

interface SceneBackgroundProfile {
  readonly hasCompletedOnboarding: boolean;
  readonly themeBackgroundColor?: string;
}

/**
 * The color painted behind Home. Before onboarding completes, Home paints the saved onboarding
 * background (or yellow) rather than the resolved theme background; the status bar uses the same
 * rule so its icons match what is visible.
 */
export function selectHomeSceneBackground(
  profile: SceneBackgroundProfile,
  theme: Pick<ResolvedTheme, 'background'>,
): string {
  return profile.hasCompletedOnboarding
    ? theme.background
    : (profile.themeBackgroundColor ?? AppColors.yellow);
}
