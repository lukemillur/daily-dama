import { Pressable } from "react-native";
import { styled } from "styled-components/native";

import { AppColors } from "@/constants/theme";
import { type ThemePreset } from "@/features/profile/model/theme-presets";

/**
 * Shared swatch-grid rendering for a set of theme presets. Presentational only: callers own
 * selection semantics (via `isPresetSelected`) and what selecting a preset does (via
 * `onSelectPreset`).
 */
export function ThemePresetGrid({
  presets,
  isPresetSelected,
  onSelectPreset,
}: {
  readonly presets: readonly ThemePreset[];
  readonly isPresetSelected?: (preset: ThemePreset) => boolean;
  readonly onSelectPreset: (preset: ThemePreset) => void;
}) {
  return (
    <PresetGrid>
      {presets.map((preset) => (
        <PresetSwatch
          key={preset.id}
          preset={preset}
          isSelected={isPresetSelected?.(preset) ?? false}
          onPress={() => onSelectPreset(preset)}
        />
      ))}
    </PresetGrid>
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
