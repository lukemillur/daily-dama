import { AppColors } from '@/constants/theme';
import { useUserProfile } from '@/features/profile/state/user-profile-provider';
import { contrastRatio } from '@/shared/color/contrast';

export interface ResolvedTheme {
  readonly background: string;
  readonly accent: string;
  readonly text: string;
}

interface ThemeColorPreferences {
  readonly themeBackgroundColor?: string;
  readonly themeAccentColor?: string;
  readonly themeTextColor?: string;
}

/**
 * Picks whichever fixed text color (ink or cream) is more readable against both the resolved
 * background and the resolved accent, since text can sit on either surface (e.g. buttons/badges
 * use the accent color). Uses the minimum of the two contrast ratios per candidate so the choice
 * stays readable on whichever surface is worse, rather than optimizing for background alone.
 */
export function deriveAutomaticTextColor(background: string, accent: string): string {
  const inkScore = Math.min(
    contrastRatio(AppColors.ink, background) ?? 0,
    contrastRatio(AppColors.ink, accent) ?? 0,
  );
  const creamScore = Math.min(
    contrastRatio(AppColors.cream, background) ?? 0,
    contrastRatio(AppColors.cream, accent) ?? 0,
  );

  return creamScore > inkScore ? AppColors.cream : AppColors.ink;
}

/**
 * Resolves the app's decorative background/accent/text colors from the user's saved theme
 * preferences, falling back to the fixed prototype palette when a field is unset. Theme fields
 * can only be set post-onboarding (Profile is onboarding-gated), so all fields are always
 * `undefined` for the entire lifetime of the onboarding flow and this resolves to the fixed
 * `AppColors` values there. `text` uses the user's custom `themeTextColor` when set, otherwise a
 * value automatically derived from the resolved background/accent (see
 * `deriveAutomaticTextColor`).
 */
export function resolveTheme(preferences: ThemeColorPreferences): ResolvedTheme {
  const background = preferences.themeBackgroundColor ?? AppColors.sage;
  const accent = preferences.themeAccentColor ?? AppColors.yellow;
  const text = preferences.themeTextColor ?? deriveAutomaticTextColor(background, accent);

  return { background, accent, text };
}

export function useResolvedTheme(): ResolvedTheme {
  return resolveTheme(useUserProfile());
}
