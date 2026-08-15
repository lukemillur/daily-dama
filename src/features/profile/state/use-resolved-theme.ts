import { AppColors } from '@/constants/theme';
import { useUserProfile } from '@/features/profile/state/user-profile-provider';

export interface ResolvedTheme {
  readonly background: string;
  readonly accent: string;
}

/**
 * Resolves the app's decorative background/accent colors from the user's saved theme
 * preferences, falling back to the fixed prototype palette when a field is unset. Theme fields
 * can only be set post-onboarding (Profile is onboarding-gated), so both fields are always
 * `undefined` for the entire lifetime of the onboarding flow and this resolves to the fixed
 * `AppColors` values there.
 */
export function useResolvedTheme(): ResolvedTheme {
  const profile = useUserProfile();
  return {
    background: profile.themeBackgroundColor ?? AppColors.sage,
    accent: profile.themeAccentColor ?? AppColors.yellow,
  };
}
