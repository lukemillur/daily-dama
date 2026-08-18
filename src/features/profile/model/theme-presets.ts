/**
 * Pre-configured rainbow theme presets. Each preset pairs a background and accent color; hex
 * values are a design choice (visually distinct, readable pairs), not derived from anything else.
 */
export interface ThemePreset {
  readonly id: string;
  readonly label: string;
  readonly backgroundColor: string;
  readonly accentColor: string;
}

export const RAINBOW_THEME_PRESETS: readonly ThemePreset[] = [
  { id: "red", label: "Red", backgroundColor: "#fbdcd6", accentColor: "#c0392b" },
  { id: "orange", label: "Orange", backgroundColor: "#fde3c8", accentColor: "#d9711a" },
  { id: "yellow", label: "Yellow", backgroundColor: "#fbf0bd", accentColor: "#c99a12" },
  { id: "green", label: "Green", backgroundColor: "#dcefd9", accentColor: "#2f8f4e" },
  { id: "blue", label: "Blue", backgroundColor: "#d8e8f7", accentColor: "#1f6fb2" },
  { id: "indigo", label: "Indigo", backgroundColor: "#e0dcf5", accentColor: "#4b3f9e" },
  { id: "violet", label: "Violet", backgroundColor: "#f3d9f0", accentColor: "#8e2f8e" },
];
