import { styled } from "styled-components/native";

import { BodyText, DisplayTitle, Eyebrow } from "@/components/ui/typography";
import { AppColors } from "@/constants/theme";
import { ThemePresetGrid } from "@/features/profile/components/theme-preset-grid";
import { RAINBOW_THEME_PRESETS } from "@/features/profile/model/theme-presets";
import {
  useUserProfile,
  useUserProfileActions,
} from "@/features/profile/state/user-profile-provider";

/**
 * Rainbow theme presets: one-tap background/accent pairs, visually and structurally distinct
 * from the free-form ThemeColorPicker (not a mode toggle within it).
 */
export function RainbowThemePresets() {
  const { themeBackgroundColor, themeAccentColor } = useUserProfile();
  const { setThemeColors } = useUserProfileActions();

  return (
    <>
      <SectionLabel>Quick presets</SectionLabel>
      <Title>Select a preset</Title>
      <Copy>Tap a color to set both background and accent at once.</Copy>
      <ThemePresetGrid
        presets={RAINBOW_THEME_PRESETS}
        isPresetSelected={(preset) =>
          themeBackgroundColor === preset.backgroundColor && themeAccentColor === preset.accentColor
        }
        onSelectPreset={(preset) => setThemeColors(preset.backgroundColor, preset.accentColor)}
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
