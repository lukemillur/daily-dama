import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Text } from "react-native";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

import { RainbowThemePresets } from "@/features/profile/components/rainbow-theme-presets";
import { RAINBOW_THEME_PRESETS } from "@/features/profile/model/theme-presets";
import {
  useUserProfile,
  UserProfileProvider,
} from "@/features/profile/state/user-profile-provider";

jest.mock("@react-native-async-storage/async-storage", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required by jest hoisting
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

function findByLabel(renderer: ReactTestRenderer, label: string) {
  const matches = renderer.root.findAll((node) => node.props.accessibilityLabel === label);
  const interactive = matches.find((node) => typeof node.props.onPress === "function");
  return interactive ?? matches[0];
}

function ProfileProbe() {
  const { themeBackgroundColor, themeAccentColor } = useUserProfile();
  return (
    <>
      <Text accessibilityLabel="probe-background">{themeBackgroundColor ?? "unset"}</Text>
      <Text accessibilityLabel="probe-accent">{themeAccentColor ?? "unset"}</Text>
    </>
  );
}

async function mountPresets() {
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(
      <UserProfileProvider>
        <RainbowThemePresets />
        <ProfileProbe />
      </UserProfileProvider>,
    );
  });
  return root;
}

function probeValue(renderer: ReactTestRenderer, label: string) {
  return findByLabel(renderer, label).props.children;
}

describe("RainbowThemePresets", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it.each(RAINBOW_THEME_PRESETS)(
    "selecting the $label preset calls setThemeColors with its background/accent and persists via the profile provider",
    async (preset) => {
      const root = await mountPresets();

      act(() => findByLabel(root, preset.label + " theme preset").props.onPress());

      expect(probeValue(root, "probe-background")).toBe(preset.backgroundColor);
      expect(probeValue(root, "probe-accent")).toBe(preset.accentColor);

      act(() => root.unmount());
    },
  );

  it("persists the selected preset across a remount, proving it round-tripped through storage", async () => {
    const preset = RAINBOW_THEME_PRESETS[3];
    const root = await mountPresets();

    act(() => findByLabel(root, preset.label + " theme preset").props.onPress());
    await act(async () => {
      await Promise.resolve();
    });
    act(() => root.unmount());

    const reopened = await mountPresets();
    expect(probeValue(reopened, "probe-background")).toBe(preset.backgroundColor);
    expect(probeValue(reopened, "probe-accent")).toBe(preset.accentColor);

    act(() => reopened.unmount());
  });

  it("renders as a component distinct from ThemeColorPicker (no shared mode-toggle affordance)", async () => {
    const root = await mountPresets();

    // No hex-entry affordances from ThemeColorPicker should appear in this component's tree.
    const hexInputs = root.root.findAll(
      (node) => node.props.accessibilityLabel === "Background color hex",
    );
    expect(hexInputs.length).toBe(0);

    act(() => root.unmount());
  });
});
