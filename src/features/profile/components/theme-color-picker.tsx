import { useState } from "react";
import { styled } from "styled-components/native";

import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { BodyText, DisplayTitle, Eyebrow } from "@/components/ui/typography";
import { AppColors } from "@/constants/theme";
import { ColorSpectrumPicker } from "@/features/profile/components/color-spectrum-picker";
import { isValidThemeHexColor } from "@/features/profile/model/user-profile";
import { useResolvedTheme } from "@/features/profile/state/use-resolved-theme";
import {
  useUserProfile,
  useUserProfileActions,
} from "@/features/profile/state/user-profile-provider";
import { contrastRatio, WCAG_AA_MIN_CONTRAST_RATIO } from "@/shared/color/contrast";

export function ThemeColorPicker() {
  const { themeBackgroundColor, themeAccentColor, themeTextColor } = useUserProfile();
  const { setThemeColors, setThemeTextColor } = useUserProfileActions();
  const resolvedTheme = useResolvedTheme();

  const hasCustomColors = themeBackgroundColor !== undefined || themeAccentColor !== undefined;

  return (
    <>
      <SectionLabel>App theme</SectionLabel>
      <Title>Or, make it yours</Title>
      <Copy>
        Pick a background, accent, and text color to make the app your own.
      </Copy>
      <ColorField
        accessibilityLabel="Background color hex"
        fallbackColor={resolvedTheme.background}
        label="Background color"
        persistedValue={themeBackgroundColor}
        referenceColor={AppColors.ink}
        onSave={(hex) => setThemeColors(hex, themeAccentColor)}
      />
      <ColorField
        accessibilityLabel="Accent color hex"
        fallbackColor={resolvedTheme.accent}
        label="Accent color"
        persistedValue={themeAccentColor}
        referenceColor={AppColors.ink}
        onSave={(hex) => setThemeColors(themeBackgroundColor, hex)}
      />
      <ResetButton
        accessibilityLabel="Reset theme colors"
        disabled={!hasCustomColors}
        onPress={() => setThemeColors(undefined, undefined)}
      >
        Reset background & accent
      </ResetButton>
      <ColorField
        accessibilityLabel="Text color hex"
        fallbackColor={resolvedTheme.text}
        label="Text color"
        persistedValue={themeTextColor}
        referenceColor={themeBackgroundColor ?? AppColors.sage}
        onSave={(hex) => setThemeTextColor(hex)}
      />
      <ResetButton
        accessibilityLabel="Reset text color"
        disabled={themeTextColor === undefined}
        onPress={() => setThemeTextColor(undefined)}
      >
        Reset text color
      </ResetButton>
    </>
  );
}

function ColorField({
  accessibilityLabel,
  fallbackColor,
  label,
  onSave,
  persistedValue,
  referenceColor,
}: {
  readonly accessibilityLabel: string;
  /**
   * The app's current resolved color for this field (from `useResolvedTheme()`), used to seed
   * `hexText` and to compute dirtiness when there is no saved preference yet, so the field shows
   * the real current color instead of a blank input before any save.
   */
  readonly fallbackColor: string;
  readonly label: string;
  readonly onSave: (hex: string) => void;
  readonly persistedValue?: string;
  readonly referenceColor: string;
}) {
  const [hexText, setHexText] = useState(persistedValue ?? fallbackColor);

  // Resync only when persistedValue changes to a new *defined* value (e.g. after a preset
  // applies via setThemeColors), not on every render - same guarded-setState-during-render
  // pattern ColorSpectrumPicker uses for its own persistedHex resync. Guarding on the actual
  // transition (rather than an effect that would fire post-commit) avoids clobbering
  // in-progress typing from unrelated rerenders, since it only reacts when persistedValue itself
  // changes for this field.
  const [lastPersistedValue, setLastPersistedValue] = useState(persistedValue);
  if (persistedValue !== lastPersistedValue) {
    setLastPersistedValue(persistedValue);
    if (persistedValue !== undefined) {
      setHexText(persistedValue);
    }
  }

  const isValidHex = isValidThemeHexColor(hexText);
  const ratio = isValidHex ? contrastRatio(hexText, referenceColor) : undefined;
  // Compares against the raw persisted value (not the fallback default) so Save stays enabled
  // whenever there is no saved preference yet, even if the typed hex happens to match the
  // resolved default -- explicitly saving that value is still a meaningful action.
  const isDirty = isValidHex && hexText !== persistedValue;
  const canSave = isDirty;
  const ratioLabel = ratio === undefined ? "unknown" : ratio.toFixed(1);

  const contrastHint =
    "Contrast vs. text: " + ratioLabel + ":1. Recommended: " + WCAG_AA_MIN_CONTRAST_RATIO + ":1+.";

  return (
    <ColorFieldWrapper>
      <FieldLabel>{label}</FieldLabel>
      <ColorSpectrumPicker
        accessibilityLabelPrefix={label}
        liveHex={isValidHex ? hexText : undefined}
        persistedHex={persistedValue ?? fallbackColor}
        onChange={setHexText}
      />
      <HexFieldWrapper>
        <TextField
          accessibilityLabel={accessibilityLabel}
          autoCapitalize="none"
          error={isValidHex ? undefined : "Enter a 6-digit hex color, e.g. #4477aa."}
          hint={isValidHex ? contrastHint : undefined}
          label="Hex"
          maxLength={7}
          onChangeText={setHexText}
          placeholder="#4477aa"
          rightAccessory={<Swatch $hex={isValidHex ? hexText : undefined} />}
          selectTextOnFocus
          value={hexText}
        />
      </HexFieldWrapper>
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
const HexFieldWrapper = styled.View`
  max-width: 260px;
`;
const Swatch = styled.View<{ readonly $hex?: string }>`
  width: 32px;
  height: 32px;
  margin-right: 14px;
  border: 2px solid ${AppColors.ink};
  background-color: ${({ $hex }) => $hex ?? AppColors.paperStrong};
`;
const SaveButton = styled(Button).attrs({ size: "medium" })`
  align-self: flex-start;
  margin-top: 14px;
`;
const ResetButton = styled(Button).attrs({ size: "medium", variant: "secondary" })`
  align-self: flex-start;
  margin-top: 26px;
`;
