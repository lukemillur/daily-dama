import { describe, expect, it, jest } from "@jest/globals";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

import { ColorSpectrumPicker } from "@/features/profile/components/color-spectrum-picker";
import { hexToHsv, hsvToHex } from "@/shared/color/hsv";

function findByLabel(renderer: ReactTestRenderer, label: string) {
  const matches = renderer.root.findAll((node) => node.props.accessibilityLabel === label);
  return matches.find(
    (node) =>
      typeof node.props.onResponderGrant === "function" ||
      typeof node.props.onResponderMove === "function",
  );
}

function fireResponder(node: ReturnType<typeof findByLabel>, locationX: number, locationY = 0) {
  act(() => {
    node!.props.onResponderGrant({ nativeEvent: { locationX, locationY } });
  });
}

describe("ColorSpectrumPicker", () => {
  it("reports the top-left corner of the SV square (white, hue-agnostic) via onChange", async () => {
    const onChange = jest.fn();
    let root!: ReactTestRenderer;
    await act(async () => {
      root = create(
        <ColorSpectrumPicker
          accessibilityLabelPrefix="Background color"
          persistedHex="#ff0000"
          onChange={onChange}
        />,
      );
    });

    const svSquare = findByLabel(root, "Background color saturation and lightness");
    expect(svSquare).toBeDefined();
    fireResponder(svSquare, 0, 0);

    expect(onChange).toHaveBeenCalledWith(hsvToHex(0, 0, 1));

    act(() => root.unmount());
  });

  it("reports the bottom-right corner of the SV square (pure hue at full saturation/zero value) via onChange", async () => {
    const onChange = jest.fn();
    let root!: ReactTestRenderer;
    await act(async () => {
      root = create(
        <ColorSpectrumPicker
          accessibilityLabelPrefix="Accent color"
          persistedHex="#ff0000"
          onChange={onChange}
        />,
      );
    });

    const svSquare = findByLabel(root, "Accent color saturation and lightness");
    fireResponder(svSquare, 200, 200);

    expect(onChange).toHaveBeenCalledWith(hsvToHex(0, 1, 0));

    act(() => root.unmount());
  });

  it("reports the far right of the hue bar (hue wraps back to red) via onChange", async () => {
    const onChange = jest.fn();
    let root!: ReactTestRenderer;
    await act(async () => {
      root = create(
        <ColorSpectrumPicker accessibilityLabelPrefix="Text color" persistedHex="#4477aa" onChange={onChange} />,
      );
    });

    const hueBar = findByLabel(root, "Text color hue");
    fireResponder(hueBar, 200);

    const { s, v } = hexToHsv("#4477aa")!;
    expect(onChange).toHaveBeenCalledWith(hsvToHex(360, s, v));

    act(() => root.unmount());
  });

  it("resyncs hue/sat/val (and thus the pure-hue gradient stop) when persistedHex changes, without a fresh onChange call", async () => {
    const onChange = jest.fn();
    let root!: ReactTestRenderer;
    await act(async () => {
      root = create(
        <ColorSpectrumPicker accessibilityLabelPrefix="Background color" persistedHex="#ff0000" onChange={onChange} />,
      );
    });

    onChange.mockClear();

    await act(async () => {
      root.update(
        <ColorSpectrumPicker accessibilityLabelPrefix="Background color" persistedHex="#00ff00" onChange={onChange} />,
      );
    });

    expect(onChange).not.toHaveBeenCalled();

    // Dragging the SV square top-left after resync should now report white derived from the new
    // hue (still white, since sat=0 at x=0 is hue-independent) - the meaningful check is that a
    // full-saturation click at the far right reflects the new (green) hue, not the stale red one.
    const svSquare = findByLabel(root, "Background color saturation and lightness");
    fireResponder(svSquare, 200, 0);
    expect(onChange).toHaveBeenCalledWith(hsvToHex(120, 1, 1));

    act(() => root.unmount());
  });

  it.each([
    ["saturation and lightness square", "Background color saturation and lightness"],
    ["hue strip", "Background color hue"],
  ])("refuses responder termination on the %s so the page cannot take over a drag", async (_name, label) => {
    let root!: ReactTestRenderer;
    await act(async () => {
      root = create(
        <ColorSpectrumPicker
          accessibilityLabelPrefix="Background color"
          persistedHex="#ff0000"
          onChange={jest.fn()}
        />,
      );
    });

    const responder = findByLabel(root, label);
    expect(responder).toBeDefined();
    expect(typeof responder!.props.onResponderTerminationRequest).toBe("function");
    expect(responder!.props.onResponderTerminationRequest()).toBe(false);

    act(() => root.unmount());
  });

  it("reports drag start on grant and drag end on release or terminate so the page can stop scrolling", async () => {
    const onDragStateChange = jest.fn();
    let root!: ReactTestRenderer;
    await act(async () => {
      root = create(
        <ColorSpectrumPicker
          accessibilityLabelPrefix="Background color"
          persistedHex="#ff0000"
          onChange={jest.fn()}
          onDragStateChange={onDragStateChange}
        />,
      );
    });

    const svSquare = findByLabel(root, "Background color saturation and lightness");
    const hueBar = findByLabel(root, "Background color hue");
    fireResponder(svSquare, 10, 10);
    expect(onDragStateChange).toHaveBeenLastCalledWith(true);
    act(() => svSquare!.props.onResponderRelease());
    expect(onDragStateChange).toHaveBeenLastCalledWith(false);

    fireResponder(hueBar, 10);
    expect(onDragStateChange).toHaveBeenLastCalledWith(true);
    act(() => hueBar!.props.onResponderTerminate());
    expect(onDragStateChange).toHaveBeenLastCalledWith(false);
    expect(onDragStateChange).toHaveBeenCalledTimes(4);

    act(() => root.unmount());
  });
});
