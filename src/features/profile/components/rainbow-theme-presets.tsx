import { Pressable } from "react-native";
import { styled } from "styled-components/native";

import { BodyText, DisplayTitle, Eyebrow } from "@/components/ui/typography";
import { AppColors } from "@/constants/theme";
import { RAINBOW_THEME_PRESETS, type ThemePreset } from "@/features/profile/model/theme-presets";
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
      <Title>Or grab{"\n"}a rainbow.</Title>
      <Copy>Tap a color to set both background and accent at once.</Copy>
      <PresetGrid>
        {RAINBOW_THEME_PRESETS.map((preset) => (
          <PresetSwatch
            key={preset.id}
            preset={preset}
            isSelected={
              themeBackgroundColor === preset.backgroundColor &&
              themeAccentColor === preset.accentColor
            }
            onPress={() => setThemeColors(preset.backgroundColor, preset.accentColor)}
          />
        ))}
      </PresetGrid>
    </>
  );
}

function PresetSwatch({
  isSelected,
  onPress,
  preset,
}: {
  readonly isSelected: boolean;
  readonly onPress: () => void;
  readonly preset: ThemePreset;
}) {
  return (
    <SwatchButton
      accessibilityLabel={preset.label + " theme preset"}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      onPress={onPress}
    >
      <SwatchHalves>
        <SwatchHalf $hex={preset.backgroundColor} />
        <SwatchHalf $hex={preset.accentColor} />
      </SwatchHalves>
      <SwatchLabel $isSelected={isSelected}>{preset.label}</SwatchLabel>
    </SwatchButton>
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
const PresetGrid = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: 14px;
  margin-top: 22px;
`;
const SwatchButton = styled(Pressable)`
  align-items: center;
  width: 74px;
`;
const SwatchHalves = styled.View`
  flex-direction: row;
  width: 64px;
  height: 64px;
  border: 2px solid ${AppColors.ink};
  overflow: hidden;
`;
const SwatchHalf = styled.View<{ readonly $hex: string }>`
  flex: 1;
  height: 100%;
  background-color: ${({ $hex }) => $hex};
`;
const SwatchLabel = styled.Text<{ readonly $isSelected: boolean }>`
  margin-top: 8px;
  color: ${AppColors.ink};
  font-size: 11px;
  font-weight: 900;
  text-transform: uppercase;
  text-decoration-line: ${({ $isSelected }) => ($isSelected ? "underline" : "none")};
`;
