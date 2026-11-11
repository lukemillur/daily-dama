import { AppColors } from '@/constants/theme';
import { useUserProfile } from '@/features/profile/state/user-profile-provider';
import { blendHexColors } from '@/shared/color/blend';
import { WCAG_AA_MIN_CONTRAST_RATIO, contrastRatio } from '@/shared/color/contrast';

export interface ResolvedTheme {
  readonly background: string;
  readonly accent: string;
  readonly text: string;
  readonly textMuted: string;
  readonly buttonBackground: string;
  readonly buttonBackgroundSecondary: string;
  /** Label/value color for `buttonBackground` surfaces (primary Button, Laced control). */
  readonly onButton: string;
  /** Label color for `buttonBackgroundSecondary` surfaces. */
  readonly onButtonSecondary: string;
  /** Label/value color for fixed `AppColors.ink` surfaces (Stats values, selected Sesh choices). */
  readonly onInk: string;
  /** Primary text color for `accent`-filled surfaces (Home hero, celebration banners, accent actions). */
  readonly onAccent: string;
  /** Secondary copy color for `accent`-filled surfaces; same contrast floor, lighter weight. */
  readonly onAccentMuted: string;
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
 * rainbow presets (verified in use-resolved-theme.test.ts).
 */
export function deriveMutedTextColor(text: string, background: string): string {
  return blendHexColors(text, background, 0.65);
}

/**
 * Returns `preferred` when it already meets `minRatio` against the actual control `surface`, so a
 * legible decorative color (e.g. the accent) is kept. Otherwise falls back to whichever of cream
 * or ink contrasts more with the surface, or pure black/white when neither reaches `minRatio`. Invalid hex input falls back the same way.
 */
export function deriveReadableForeground(
  surface: string,
  preferred: string,
  minRatio: number = WCAG_AA_MIN_CONTRAST_RATIO,
): string {
  const preferredRatio = contrastRatio(preferred, surface);
  if (preferredRatio !== undefined && preferredRatio >= minRatio) {
    return preferred;
  }
  const creamRatio = contrastRatio(AppColors.cream, surface) ?? 0;
  const inkRatio = contrastRatio(AppColors.ink, surface) ?? 0;
  const brand = creamRatio >= inkRatio ? AppColors.cream : AppColors.ink;
  if (Math.max(creamRatio, inkRatio) >= minRatio || creamRatio + inkRatio === 0) return brand;
  // Mid-luminance surfaces (e.g. the orange and green presets) sit between cream and ink, so
  // neither brand neutral reaches the floor; pure black or white always does (>= 4.58:1).
  const blackRatio = contrastRatio('#000000', surface) ?? 0;
  const whiteRatio = contrastRatio('#ffffff', surface) ?? 0;
  return blackRatio >= whiteRatio ? '#000000' : '#ffffff';
}

/**
 * Secondary copy color for a filled `surface`: tries progressively stronger blends of
 * `foreground` toward the surface (80% then 90% foreground) so hierarchy survives where it can,
 * and returns the first that reaches `minRatio` against the surface, else `foreground` itself.
 * Unlike `deriveMutedTextColor` this blends toward the surface the text sits on, not the page.
 */
export function deriveMutedOnSurface(
  foreground: string,
  surface: string,
  minRatio: number = WCAG_AA_MIN_CONTRAST_RATIO,
): string {
  for (const weight of [0.8, 0.9]) {
    const candidate = blendHexColors(foreground, surface, weight);
    if ((contrastRatio(candidate, surface) ?? 0) >= minRatio) return candidate;
  }
  return foreground;
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

  const onAccent = deriveReadableForeground(accent, text);

  return {
    background,
    accent,
    text,
    textMuted,
    buttonBackground,
    buttonBackgroundSecondary,
    onButton: deriveReadableForeground(buttonBackground, accent),
    onButtonSecondary: deriveReadableForeground(buttonBackgroundSecondary, text),
    onInk: deriveReadableForeground(AppColors.ink, accent),
    onAccent,
    onAccentMuted: deriveMutedOnSurface(onAccent, accent),
  };
}

export function useResolvedTheme(): ResolvedTheme {
  return resolveTheme(useUserProfile());
}
