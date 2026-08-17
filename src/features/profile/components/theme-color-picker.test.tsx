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
import { hsvToHex } from "@/shared/color/hsv";

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
      typeof node.props.onChangeText === "function" ||
      typeof node.props.onPress === "function" ||
      typeof node.props.onResponderGrant === "function" ||
      typeof node.props.onResponderMove === "function",
  );
  return interactive ?? matches[0];
}

// Probe that reads the real provider state so saves can be asserted through the actual
// reducer/provider round trip, not a mock.
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

// The saturation/lightness puck is an unlabeled absolutely-positioned View with both `left` and
// `top` in its style (the hue puck only ever has `left`), nested under the "... saturation and
// lightness" responder View found via findByLabel.
function findSvPuckStyle(renderer: ReactTestRenderer, svSquareLabel: string) {
  const svSquare = findByLabel(renderer, svSquareLabel);
  const puck = svSquare
    .findAll(
      (node) =>
        typeof node.props.style === "object" &&
        node.props.style !== null &&
        typeof node.props.style.left === "number" &&
        typeof node.props.style.top === "number",
    )
    .find((node) => node !== svSquare);
  if (!puck) throw new Error("Could not find saturation/lightness puck");
  return puck.props.style as { left: number; top: number };
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

  it("saves a background color even with insufficient contrast, without a blocking message", async () => {
    const root = await mountPicker();

    act(() =>
      findByLabel(root, "Background color hex").props.onChangeText(AppColors.ink),
    );

    const saveButton = findByLabel(root, "Background color save");
    expect(saveButton.props.disabled).toBe(false);
    act(() => saveButton.props.onPress());

    expect(probeValue(root, "probe-background")).toBe(AppColors.ink);
    expect(
      root.root.findAll(
        (node) =>
          typeof node.props.children === "string" &&
          /too hard to read/i.test(node.props.children),
      ).length,
    ).toBe(0);

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

  it("saves an accent color even with insufficient contrast, without a blocking message", async () => {
    const root = await mountPicker();

    act(() => findByLabel(root, "Accent color hex").props.onChangeText(AppColors.ink));

    const saveButton = findByLabel(root, "Accent color save");
    expect(saveButton.props.disabled).toBe(false);
    act(() => saveButton.props.onPress());

    expect(probeValue(root, "probe-accent")).toBe(AppColors.ink);
    expect(
      root.root.findAll(
        (node) =>
          typeof node.props.children === "string" &&
          /too hard to read/i.test(node.props.children),
      ).length,
    ).toBe(0);

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

  it("saves a text color via the profile provider, independently of background and accent", async () => {
    const root = await mountPicker();

    act(() => findByLabel(root, "Text color hex").props.onChangeText("#112233"));
    act(() => findByLabel(root, "Text color save").props.onPress());

    expect(probeValue(root, "probe-text")).toBe("#112233");
    expect(probeValue(root, "probe-background")).toBe("unset");
    expect(probeValue(root, "probe-accent")).toBe("unset");

    act(() => root.unmount());
  });

  it("only enables text color reset once a text color has been saved, and clears only the text color", async () => {
    const root = await mountPicker();

    expect(findByLabel(root, "Reset text color").props.disabled).toBe(true);

    act(() => findByLabel(root, "Text color hex").props.onChangeText("#112233"));
    act(() => findByLabel(root, "Text color save").props.onPress());

    expect(findByLabel(root, "Reset text color").props.disabled).toBe(false);

    act(() => findByLabel(root, "Reset text color").props.onPress());

    expect(probeValue(root, "probe-text")).toBe("unset");
    expect(findByLabel(root, "Reset text color").props.disabled).toBe(true);

    act(() => root.unmount());
  });

  it("saves a background color picked via the visual spectrum picker", async () => {
    const root = await mountPicker();

    const svSquare = findByLabel(root, "Background color saturation and lightness");
    act(() => svSquare.props.onResponderGrant({ nativeEvent: { locationX: 200, locationY: 0 } }));
    const hueBar = findByLabel(root, "Background color hue");
    act(() => hueBar.props.onResponderGrant({ nativeEvent: { locationX: 100 } }));

    act(() => findByLabel(root, "Background color save").props.onPress());

    const expectedHex = hsvToHex(180, 1, 1);
    expect(probeValue(root, "probe-background")).toBe(expectedHex);

    act(() => root.unmount());
  });

  it("saves an accent color picked via the visual spectrum picker", async () => {
    const root = await mountPicker();

    const svSquare = findByLabel(root, "Accent color saturation and lightness");
    act(() => svSquare.props.onResponderGrant({ nativeEvent: { locationX: 200, locationY: 0 } }));
    const hueBar = findByLabel(root, "Accent color hue");
    act(() => hueBar.props.onResponderGrant({ nativeEvent: { locationX: 100 } }));

    act(() => findByLabel(root, "Accent color save").props.onPress());

    const expectedHex = hsvToHex(180, 1, 1);
    expect(probeValue(root, "probe-accent")).toBe(expectedHex);

    act(() => root.unmount());
  });

  it("moves the puck live as a complete, valid hex is typed, without waiting for Save", async () => {
    const root = await mountPicker();

    const before = findSvPuckStyle(root, "Background color saturation and lightness");

    act(() => findByLabel(root, "Background color hex").props.onChangeText("#00ff00"));

    const after = findSvPuckStyle(root, "Background color saturation and lightness");
    expect(after).not.toEqual(before);

    // Not saved yet - the profile provider is untouched.
    expect(probeValue(root, "probe-background")).toBe("unset");

    act(() => root.unmount());
  });

  it("does not move the puck or throw while typing an incomplete/invalid hex", async () => {
    const root = await mountPicker();

    const before = findSvPuckStyle(root, "Background color saturation and lightness");

    expect(() =>
      act(() => findByLabel(root, "Background color hex").props.onChangeText("#12")),
    ).not.toThrow();

    const after = findSvPuckStyle(root, "Background color saturation and lightness");
    expect(after).toEqual(before);

    act(() => root.unmount());
  });

  it("saves a text color picked via the visual spectrum picker", async () => {
    const root = await mountPicker();

    const svSquare = findByLabel(root, "Text color saturation and lightness");
    act(() => svSquare.props.onResponderGrant({ nativeEvent: { locationX: 200, locationY: 0 } }));
    const hueBar = findByLabel(root, "Text color hue");
    act(() => hueBar.props.onResponderGrant({ nativeEvent: { locationX: 100 } }));

    act(() => findByLabel(root, "Text color save").props.onPress());

    const expectedHex = hsvToHex(180, 1, 1);
    expect(probeValue(root, "probe-text")).toBe(expectedHex);

    act(() => root.unmount());
  });
});
