import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Text } from "react-native";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

import { AppColors } from "@/constants/theme";
import { ThemeColorPicker } from "@/features/profile/components/theme-color-picker";
import {
  useUserProfile,
  UserProfileProvider,
} from "@/features/profile/state/user-profile-provider";

// ThemeColorPicker (transitively, via user-profile-provider) pulls in AsyncStorage - mocked the
// same way other provider-backed tests in this repo do.
jest.mock("@react-native-async-storage/async-storage", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required by jest hoisting
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

// Several composite layers (styled-components wrappers, forwardRef) can all carry the same
// accessibilityLabel prop as it is forwarded down to the host component. Prefer the instance
// that actually carries the interaction handler being exercised.
function findByLabel(renderer: ReactTestRenderer, label: string) {
  const matches = renderer.root.findAll((node) => node.props.accessibilityLabel === label);
  const interactive = matches.find(
    (node) =>
      typeof node.props.onChangeText === "function" || typeof node.props.onPress === "function",
  );
  return interactive ?? matches[0];
}

// Probe that reads the real provider state so saves can be asserted through the actual
// reducer/provider round trip, not a mock.
function ProfileProbe() {
  const { themeBackgroundColor, themeAccentColor } = useUserProfile();
  return (
    <>
      <Text accessibilityLabel="probe-background">{themeBackgroundColor ?? "unset"}</Text>
      <Text accessibilityLabel="probe-accent">{themeAccentColor ?? "unset"}</Text>
    </>
  );
}

async function mountPicker() {
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(
      <UserProfileProvider>
        <ThemeColorPicker />
        <ProfileProbe />
      </UserProfileProvider>,
    );
  });
  return root;
}

function probeValue(renderer: ReactTestRenderer, label: string) {
  return findByLabel(renderer, label).props.children;
}

describe("ThemeColorPicker", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it("saves a valid, sufficiently-contrasting background color via the profile provider, leaving accent untouched", async () => {
    const root = await mountPicker();

    act(() => findByLabel(root, "Background color hex").props.onChangeText("#f4c94d"));
    act(() => findByLabel(root, "Background color save").props.onPress());

    expect(probeValue(root, "probe-background")).toBe("#f4c94d");
    expect(probeValue(root, "probe-accent")).toBe("unset");

    act(() => root.unmount());
  });

  it("rejects an insufficient-contrast background color with a visible message and does not save it", async () => {
    const root = await mountPicker();

    act(() =>
      findByLabel(root, "Background color hex").props.onChangeText(AppColors.ink),
    );

    const saveButton = findByLabel(root, "Background color save");
    expect(saveButton.props.disabled).toBe(true);
    act(() => saveButton.props.onPress());

    expect(probeValue(root, "probe-background")).toBe("unset");
    expect(
      root.root.findAll(
        (node) =>
          typeof node.props.children === "string" &&
          /too hard to read/i.test(node.props.children),
      ).length,
    ).toBeGreaterThan(0);

    act(() => root.unmount());
  });

  it("saves a valid, sufficiently-contrasting accent color independently of background", async () => {
    const root = await mountPicker();

    act(() => findByLabel(root, "Accent color hex").props.onChangeText("#f4c94d"));
    act(() => findByLabel(root, "Accent color save").props.onPress());

    expect(probeValue(root, "probe-accent")).toBe("#f4c94d");
    expect(probeValue(root, "probe-background")).toBe("unset");

    act(() => root.unmount());
  });

  it("rejects an insufficient-contrast accent color and does not save it", async () => {
    const root = await mountPicker();

    act(() => findByLabel(root, "Accent color hex").props.onChangeText(AppColors.ink));

    const saveButton = findByLabel(root, "Accent color save");
    expect(saveButton.props.disabled).toBe(true);
    act(() => saveButton.props.onPress());

    expect(probeValue(root, "probe-accent")).toBe("unset");

    act(() => root.unmount());
  });

  it("only enables reset once a theme color has been saved", async () => {
    const root = await mountPicker();

    expect(findByLabel(root, "Reset theme colors").props.disabled).toBe(true);

    act(() => findByLabel(root, "Background color hex").props.onChangeText("#f4c94d"));
    act(() => findByLabel(root, "Background color save").props.onPress());

    expect(findByLabel(root, "Reset theme colors").props.disabled).toBe(false);

    act(() => findByLabel(root, "Reset theme colors").props.onPress());

    expect(probeValue(root, "probe-background")).toBe("unset");
    expect(findByLabel(root, "Reset theme colors").props.disabled).toBe(true);

    act(() => root.unmount());
  });
});
