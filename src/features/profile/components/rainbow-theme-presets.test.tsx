import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Text } from "react-native";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

import { RainbowThemePresets } from "@/features/profile/components/rainbow-theme-presets";
import { RAINBOW_THEME_PRESETS } from "@/features/profile/model/theme-presets";
import {
  useUserProfile,
  useUserProfileActions,
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

function findSwatch(renderer: ReactTestRenderer, label: string) {
  return renderer.root.findAll(
    (node) =>
      node.props.accessibilityLabel === label && node.props.accessibilityState !== undefined,
  )[0];
}

function ProfileProbe() {
  const { themeBackgroundColor, themeAccentColor, themeTextColor } = useUserProfile();
  return (
    <>
      <Text accessibilityLabel="probe-background">{themeBackgroundColor ?? "unset"}</Text>
      <Text accessibilityLabel="probe-accent">{themeAccentColor ?? "unset"}</Text>
      <Text accessibilityLabel="probe-text">{themeTextColor ?? "unset"}</Text>
    </>
  );
}

function TextColorSetter() {
  const { setThemeTextColor } = useUserProfileActions();
  return (
    <Text accessibilityLabel="set-text-color" onPress={() => setThemeTextColor("#abcdef")}>
      Set text color
    </Text>
  );
}

async function mountPresets() {
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(
      <UserProfileProvider>
        <RainbowThemePresets />
        <ProfileProbe />
        <TextColorSetter />
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

  it("clears a previously saved custom text color when a preset is selected", async () => {
    const preset = RAINBOW_THEME_PRESETS[0];
    const root = await mountPresets();

    act(() => findByLabel(root, "set-text-color").props.onPress());
    expect(probeValue(root, "probe-text")).toBe("#abcdef");

    act(() => findByLabel(root, preset.label + " theme preset").props.onPress());
    await act(async () => {
      await Promise.resolve();
    });

    expect(probeValue(root, "probe-text")).toBe("unset");
    expect(probeValue(root, "probe-background")).toBe(preset.backgroundColor);

    act(() => root.unmount());

    const reopened = await mountPresets();
    expect(probeValue(reopened, "probe-text")).toBe("unset");
    act(() => reopened.unmount());
  });

  it("renders as a component distinct from ThemeColorPicker (no shared mode-toggle affordance)", async () => {
    const root = await mountPresets();

    const hexInputs = root.root.findAll(
      (node) => node.props.accessibilityLabel === "Background color hex",
    );
    expect(hexInputs.length).toBe(0);

    act(() => root.unmount());
  });

  it("renders a Default preset in the quick-preset grid", async () => {
    const root = await mountPresets();
    expect(findByLabel(root, "Default theme preset")).toBeDefined();
    act(() => root.unmount());
  });

  it("shows the Default preset as selected on first load, before any preset has ever been chosen", async () => {
    const root = await mountPresets();
    const defaultSwatch = findSwatch(root, "Default theme preset");
    expect(defaultSwatch.props.accessibilityState).toEqual({ selected: true });
    act(() => root.unmount());
  });

  it("selecting the Default preset calls setThemeColors(undefined, undefined), clearing custom background/accent", async () => {
    const preset = RAINBOW_THEME_PRESETS[0];
    const root = await mountPresets();

    act(() => findByLabel(root, preset.label + " theme preset").props.onPress());
    await act(async () => {
      await Promise.resolve();
    });
    expect(probeValue(root, "probe-background")).toBe(preset.backgroundColor);
    expect(probeValue(root, "probe-accent")).toBe(preset.accentColor);

    act(() => findByLabel(root, "Default theme preset").props.onPress());
    await act(async () => {
      await Promise.resolve();
    });

    expect(probeValue(root, "probe-background")).toBe("unset");
    expect(probeValue(root, "probe-accent")).toBe("unset");

    const defaultSwatch = findSwatch(root, "Default theme preset");
    expect(defaultSwatch.props.accessibilityState).toEqual({ selected: true });

    act(() => root.unmount());
  });
});
