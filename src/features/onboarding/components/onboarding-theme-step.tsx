import { styled } from "styled-components/native";

import { Button } from "@/components/ui/button";
import { BodyText, DisplayTitle, Eyebrow } from "@/components/ui/typography";
import { AppColors } from "@/constants/theme";
import { ThemePresetGrid } from "@/features/profile/components/theme-preset-grid";
import { RAINBOW_THEME_PRESETS, type ThemePreset } from "@/features/profile/model/theme-presets";

export function OnboardingThemeStep({
  selectedPresetId,
  onSelectPreset,
  onFinish,
  onSkip,
}: {
  readonly selectedPresetId?: string;
  readonly onSelectPreset: (preset: ThemePreset) => void;
  readonly onFinish: () => void;
  readonly onSkip: () => void;
}) {
  return (
    <Content>
      <Eyebrow>Last step</Eyebrow>
      <Title>Set your{"\n"}vibe.</Title>
      <Copy>Select a theme that matches your setup.</Copy>
      <ThemePresetGrid
        presets={RAINBOW_THEME_PRESETS}
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
      <SkipButton
        accessibilityLabel="Skip theme selection"
        variant="secondary"
        onPress={onSkip}>
        Skip for now
      </SkipButton>
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
const SkipButton = styled(Button)`
  align-self: flex-start;
  margin-top: 14px;
`;
