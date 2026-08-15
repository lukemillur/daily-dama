import { useState } from "react";
import { TextInput } from "react-native";
import { styled } from "styled-components/native";

import { Button } from "@/components/ui/button";
import { BodyText, DisplayTitle, Eyebrow } from "@/components/ui/typography";
import { AppColors } from "@/constants/theme";
import { isValidThemeHexColor } from "@/features/profile/model/user-profile";
import {
  useUserProfile,
  useUserProfileActions,
} from "@/features/profile/state/user-profile-provider";
import {
  contrastRatio,
  meetsMinimumContrast,
  WCAG_AA_MIN_CONTRAST_RATIO,
} from "@/shared/color/contrast";

export function ThemeColorPicker() {
  const { themeBackgroundColor, themeAccentColor } = useUserProfile();
  const { setThemeColors } = useUserProfileActions();

  const hasCustomColors = themeBackgroundColor !== undefined || themeAccentColor !== undefined;

  return (
    <>
      <SectionLabel>App theme</SectionLabel>
      <Title>Make it{"\n"}yours.</Title>
      <Copy>
        Pick a background and accent color. Each must stay easy to read against the app&apos;s text
        color.
      </Copy>
      <ColorField
        accessibilityLabel="Background color hex"
        label="Background color"
        persistedValue={themeBackgroundColor}
        onSave={(hex) => setThemeColors(hex, themeAccentColor)}
      />
      <ColorField
        accessibilityLabel="Accent color hex"
        label="Accent color"
        persistedValue={themeAccentColor}
        onSave={(hex) => setThemeColors(themeBackgroundColor, hex)}
      />
      <ResetButton
        accessibilityLabel="Reset theme colors"
        disabled={!hasCustomColors}
        onPress={() => setThemeColors(undefined, undefined)}
      >
        Reset to default
      </ResetButton>
    </>
  );
}

function ColorField({
  accessibilityLabel,
  label,
  onSave,
  persistedValue,
}: {
  readonly accessibilityLabel: string;
  readonly label: string;
  readonly onSave: (hex: string) => void;
  readonly persistedValue?: string;
}) {
  const [hexText, setHexText] = useState(persistedValue ?? "");
  const isValidHex = isValidThemeHexColor(hexText);
  const ratio = isValidHex ? contrastRatio(hexText, AppColors.ink) : undefined;
  const hasSufficientContrast = isValidHex && meetsMinimumContrast(hexText, AppColors.ink);
  const isDirty = isValidHex && hexText !== (persistedValue ?? "");
  const canSave = isDirty && hasSufficientContrast;
  const ratioLabel = ratio === undefined ? "unknown" : ratio.toFixed(1);

  let hint: string;
  if (!isValidHex) {
    hint = "Enter a 6-digit hex color, e.g. #4477aa.";
  } else if (!hasSufficientContrast) {
    hint =
      "Too hard to read against the app's text color. Pick something darker or lighter. Contrast vs. text: " +
      ratioLabel +
      ":1, need at least " +
      WCAG_AA_MIN_CONTRAST_RATIO +
      ":1.";
  } else {
    hint = "Contrast vs. text: " + ratioLabel + ":1. Easy to read.";
  }

  return (
    <ColorFieldWrapper>
      <FieldLabel>{label}</FieldLabel>
      <FieldRow>
        <Swatch $hex={isValidHex ? hexText : undefined} />
        <HexInput
          accessibilityLabel={accessibilityLabel}
          autoCapitalize="none"
          maxLength={7}
          onChangeText={setHexText}
          placeholder="#4477aa"
          selectTextOnFocus
          value={hexText}
        />
      </FieldRow>
      <FieldHint $invalid={!isValidHex || !hasSufficientContrast}>{hint}</FieldHint>
      <SaveButton
        accessibilityLabel={label + " save"}
        disabled={!canSave}
        onPress={() => canSave && onSave(hexText)}
      >
        Save
      </SaveButton>
    </ColorFieldWrapper>
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
const ColorFieldWrapper = styled.View`
  margin-top: 22px;
`;
const FieldLabel = styled.Text`
  color: ${AppColors.ink};
  font-size: 12px;
  font-weight: 900;
  margin-bottom: 6px;
  text-transform: uppercase;
`;
const FieldRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 10px;
`;
const Swatch = styled.View<{ readonly $hex?: string }>`
  width: 40px;
  height: 40px;
  border: 2px solid ${AppColors.ink};
  background-color: ${({ $hex }) => $hex ?? AppColors.paperStrong};
`;
const HexInput = styled(TextInput)`
  height: 54px;
  width: 140px;
  background-color: ${AppColors.paper};
  border: 2px solid ${AppColors.ink};
  color: ${AppColors.ink};
  font-size: 18px;
  font-weight: 900;
  padding: 8px 12px;
`;
const FieldHint = styled.Text<{ readonly $invalid: boolean }>`
  color: ${({ $invalid }) => ($invalid ? AppColors.red : AppColors.textMuted)};
  font-size: 12px;
  font-weight: 700;
  margin-top: 7px;
  max-width: 420px;
`;
const SaveButton = styled(Button).attrs({ size: "medium" })`
  align-self: flex-start;
  margin-top: 14px;
`;
const ResetButton = styled(Button).attrs({ size: "medium", variant: "secondary" })`
  align-self: flex-start;
  margin-top: 26px;
`;
