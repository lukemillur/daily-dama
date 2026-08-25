import { styled } from "styled-components/native";

import { Button } from "@/components/ui/button";
import { BodyText, DisplayTitle, Eyebrow } from "@/components/ui/typography";
import { AppColors } from "@/constants/theme";
import { ThemePresetGrid } from "@/features/profile/components/theme-preset-grid";
import {
  DEFAULT_THEME_PRESET,
  RAINBOW_THEME_PRESETS,
  type ThemePreset,
} from "@/features/profile/model/theme-presets";

const PRESETS_WITH_DEFAULT: readonly ThemePreset[] = [DEFAULT_THEME_PRESET, ...RAINBOW_THEME_PRESETS];

export function OnboardingThemeStep({
  selectedPresetId,
  onSelectPreset,
  onFinish,
}: {
  readonly selectedPresetId?: string;
  readonly onSelectPreset: (preset: ThemePreset) => void;
  readonly onFinish: () => void;
}) {
  return (
    <Content>
      <Eyebrow>Last step</Eyebrow>
      <Title>Set your{"\n"}vibe.</Title>
      <Copy>Select a theme that matches your setup.</Copy>
      <ThemePresetGrid
        presets={PRESETS_WITH_DEFAULT}
        isPresetSelected={
          selectedPresetId === undefined
            ? undefined
            : (preset) => preset.id === selectedPresetId
        }
        onSelectPreset={onSelectPreset}
      />
      <FinishButton accessibilityLabel="Finish onboarding" onPress={onFinish}>
        Finish onboarding
      </FinishButton>
    </Content>
  );
}

const Content = styled.View`
  width: 100%;
  max-width: 620px;
  flex: 1;
  align-self: center;
  justify-content: center;
  padding: 40px 22px 130px;
`;
const Title = styled(DisplayTitle)`
  margin-top: 10px;
`;
const Copy = styled(BodyText)`
  max-width: 480px;
  margin-top: 18px;
  color: ${AppColors.textMuted};
`;
const FinishButton = styled(Button).attrs({ fill: true })`
  margin-top: 30px;
  min-height: 54px;
`;
