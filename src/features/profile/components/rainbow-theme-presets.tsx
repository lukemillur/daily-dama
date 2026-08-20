import { styled } from "styled-components/native";

import { BodyText, DisplayTitle, Eyebrow } from "@/components/ui/typography";
import { AppColors } from "@/constants/theme";
import { ThemePresetGrid } from "@/features/profile/components/theme-preset-grid";
import {
  DEFAULT_THEME_PRESET_ID,
  RAINBOW_THEME_PRESETS,
  type ThemePreset,
} from "@/features/profile/model/theme-presets";
import {
  useUserProfile,
  useUserProfileActions,
} from "@/features/profile/state/user-profile-provider";

// Swatch colors match `resolveTheme`'s fallback in `use-resolved-theme.ts` -- purely
// presentational here; selecting this preset clears the stored preference (see
// `DEFAULT_THEME_PRESET_ID` doc) rather than writing these hex values.
const DEFAULT_THEME_PRESET: ThemePreset = {
  id: DEFAULT_THEME_PRESET_ID,
  label: "Default",
  backgroundColor: AppColors.sage,
  accentColor: AppColors.yellow,
};

const PRESETS_WITH_DEFAULT: readonly ThemePreset[] = [DEFAULT_THEME_PRESET, ...RAINBOW_THEME_PRESETS];

/**
 * Rainbow theme presets: one-tap background/accent pairs, visually and structurally distinct
 * from the free-form ThemeColorPicker (not a mode toggle within it). Includes a leading
 * "Default" swatch that resets to the app's built-in theme.
 */
export function RainbowThemePresets() {
  const { themeBackgroundColor, themeAccentColor } = useUserProfile();
  const { setThemeColors, setThemeTextColor } = useUserProfileActions();

  return (
    <>
      <SectionLabel>Quick presets</SectionLabel>
      <Title>Select a preset</Title>
      <Copy>Tap a color to set both background and accent at once.</Copy>
      <ThemePresetGrid
        presets={PRESETS_WITH_DEFAULT}
        isPresetSelected={(preset) =>
          preset.id === DEFAULT_THEME_PRESET_ID
            ? themeBackgroundColor === undefined && themeAccentColor === undefined
            : themeBackgroundColor === preset.backgroundColor &&
              themeAccentColor === preset.accentColor
        }
        onSelectPreset={(preset) => {
          setThemeTextColor(undefined);
          if (preset.id === DEFAULT_THEME_PRESET_ID) {
            setThemeColors(undefined, undefined);
          } else {
            setThemeColors(preset.backgroundColor, preset.accentColor);
          }
        }}
      />
    </>
  );
}

const SectionLabel = styled(Eyebrow)`
  font-size: 11px;
`;
const Title = styled(DisplayTitle)`
  margin-top: 10px;
`;
const Copy = styled(BodyText)`
  max-width: 500px;
  margin-top: 16px;
  color: ${AppColors.textMuted};
`;
