import { AppColors } from '@/constants/theme';
import { useUserProfile } from '@/features/profile/state/user-profile-provider';
import { blendHexColors } from '@/shared/color/blend';
import { contrastRatio } from '@/shared/color/contrast';

export interface ResolvedTheme {
  readonly background: string;
  readonly accent: string;
  readonly text: string;
  readonly textMuted: string;
  readonly buttonBackground: string;
  readonly buttonBackgroundSecondary: string;
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
 * Picks whichever fixed neutral pair (ink/paperStrong) gives the primary button surface better
 * contrast against the resolved page `background`, then assigns the other neutral to the
 * secondary button. Unlike `deriveAutomaticTextColor`, this only contrasts against `background`
 * and deliberately ignores `accent` -- a button's own background surface always sits on top of
 * the page background in the current UI, never on top of the accent color, so there's no second
 * surface to average against here.
 */
export function deriveAutomaticButtonBackgrounds(background: string): {
  buttonBackground: string;
  buttonBackgroundSecondary: string;
} {
  const inkContrast = contrastRatio(AppColors.ink, background) ?? 0;
  const paperContrast = contrastRatio(AppColors.paperStrong, background) ?? 0;

  return inkContrast >= paperContrast
    ? { buttonBackground: AppColors.ink, buttonBackgroundSecondary: AppColors.paperStrong }
    : { buttonBackground: AppColors.paperStrong, buttonBackgroundSecondary: AppColors.ink };
}

/**
 * Derives a secondary/muted text color by blending the resolved primary `text` color partway
 * toward the resolved `background`, so every themed text role isn't the exact same flat color.
 * Works uniformly regardless of whether `text` came from automatic derivation, a preset, or the
 * user's explicit `themeTextColor` override, since it only operates on the two already-resolved
 * colors. Weighted 65% text / 35% background -- enough separation to read as a distinct
 * secondary tone while staying legible against `background` across the default theme and all
 * T087 rainbow presets (verified in use-resolved-theme.test.ts).
 */
export function deriveMutedTextColor(text: string, background: string): string {
  return blendHexColors(text, background, 0.65);
}

/**
 * Resolves the app's decorative background/accent/text colors from the user's saved theme
 * preferences, falling back to the fixed prototype palette when a field is unset. Theme fields
 * can only be set post-onboarding (Profile is onboarding-gated), so all fields are always
 * `undefined` for the entire lifetime of the onboarding flow and this resolves to the fixed
 * `AppColors` values there. `text` uses the user's custom `themeTextColor` when set, otherwise a
 * value automatically derived from the resolved background/accent (see
 * `deriveAutomaticTextColor`). `buttonBackground`/`buttonBackgroundSecondary` are always derived
 * from the resolved background (see `deriveAutomaticButtonBackgrounds`) -- there is no
 * user-settable preference for button colors.
 */
export function resolveTheme(preferences: ThemeColorPreferences): ResolvedTheme {
  const background = preferences.themeBackgroundColor ?? AppColors.sage;
  const accent = preferences.themeAccentColor ?? AppColors.yellow;
  const text = preferences.themeTextColor ?? deriveAutomaticTextColor(background, accent);
  const textMuted = deriveMutedTextColor(text, background);
  const { buttonBackground, buttonBackgroundSecondary } =
    deriveAutomaticButtonBackgrounds(background);

  return { background, accent, text, textMuted, buttonBackground, buttonBackgroundSecondary };
}

export function useResolvedTheme(): ResolvedTheme {
  return resolveTheme(useUserProfile());
}
