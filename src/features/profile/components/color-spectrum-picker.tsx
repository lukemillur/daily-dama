import { useId, useMemo, useState } from "react";
import { View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { styled } from "styled-components/native";

import { AppColors } from "@/constants/theme";
import { hexToHsv, hsvToHex } from "@/shared/color/hsv";

// Placeholder seed color, matches the hex TextInput's own placeholder in theme-color-picker.tsx
// so the picker's initial puck position and the hint text agree.
const DEFAULT_SEED_HEX = "#4477aa";

const SV_SIZE = 200;
const HUE_SIZE = 200;
const HUE_BAR_HEIGHT = 24;
const PUCK_SIZE = 14;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function ColorSpectrumPicker({
  accessibilityLabelPrefix,
  liveHex,
  onChange,
  persistedHex,
}: {
  readonly accessibilityLabelPrefix: string;
  /**
   * A validated, complete hex string reflecting the sibling TextInput's current typed value
   * (undefined while it's empty/incomplete/invalid). Distinct from `persistedHex`: this drives
   * the puck live as the user types, without waiting for Save.
   */
  readonly liveHex?: string;
  readonly onChange: (hex: string) => void;
  readonly persistedHex?: string;
}) {
  const rawId = useId();
  const idPrefix = rawId.replace(/[^a-zA-Z0-9]/g, "");
  const satGradientId = "sat-gradient-" + idPrefix;
  const valGradientId = "val-gradient-" + idPrefix;
  const hueGradientId = "hue-gradient-" + idPrefix;

  const seedHsv = useMemo(
    () => hexToHsv(persistedHex) ?? hexToHsv(DEFAULT_SEED_HEX)!,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally only re-seeds on mount
    [],
  );
  const [hue, setHue] = useState(seedHsv.h);
  const [sat, setSat] = useState(seedHsv.s);
  const [val, setVal] = useState(seedHsv.v);

  // Resync only when persistedHex changes (i.e. after a Save/Reset commits upstream), not on
  // every keystroke in the sibling hex TextInput - see plan for why keying off live hexText
  // would tear down the drag handlers mid-drag. This follows React's documented "adjusting state
  // when a prop changes" pattern (a guarded setState during render, not inside a useEffect) so it
  // resyncs in the same commit instead of triggering an extra cascading render.
  const [lastPersistedHex, setLastPersistedHex] = useState(persistedHex);
  if (persistedHex !== lastPersistedHex) {
    setLastPersistedHex(persistedHex);
    const nextHsv = hexToHsv(persistedHex);
    if (nextHsv) {
      setHue(nextHsv.h);
      setSat(nextHsv.s);
      setVal(nextHsv.v);
    }
  }

  // Same guarded-setState-during-render pattern as the persistedHex resync above, but for live
  // typed hex text. Only re-derives hue/sat/val when liveHex differs from what this picker's own
  // hue/sat/val state would already produce - that keeps typing in sync with the puck while
  // *not* reacting to the picker's own onChange(hsvToHex(...)) calls during an active drag, which
  // would otherwise round-trip through hex and introduce drift/jitter mid-gesture.
  const [lastLiveHex, setLastLiveHex] = useState(liveHex);
  if (liveHex !== lastLiveHex) {
    setLastLiveHex(liveHex);
    const currentHex = hsvToHex(hue, sat, val);
    if (liveHex && liveHex !== currentHex) {
      const nextHsv = hexToHsv(liveHex);
      if (nextHsv) {
        setHue(nextHsv.h);
        setSat(nextHsv.s);
        setVal(nextHsv.v);
      }
    }
  }

  function handleSvTouch(evt: { nativeEvent: { locationX: number; locationY: number } }) {
    const x = clamp(evt.nativeEvent.locationX, 0, SV_SIZE);
    const y = clamp(evt.nativeEvent.locationY, 0, SV_SIZE);
    const nextSat = x / SV_SIZE;
    const nextVal = 1 - y / SV_SIZE;
    setSat(nextSat);
    setVal(nextVal);
    onChange(hsvToHex(hue, nextSat, nextVal));
  }

  function handleHueTouch(evt: { nativeEvent: { locationX: number } }) {
    const x = clamp(evt.nativeEvent.locationX, 0, HUE_SIZE);
    const nextHue = (x / HUE_SIZE) * 360;
    setHue(nextHue);
    onChange(hsvToHex(nextHue, sat, val));
  }

  const pureHueHex = hsvToHex(hue, 1, 1);

  return (
    <Wrapper>
      <View
        accessibilityLabel={accessibilityLabelPrefix + " saturation and lightness"}
        style={{ width: SV_SIZE, height: SV_SIZE }}
        onResponderGrant={handleSvTouch}
        onResponderMove={handleSvTouch}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
      >
        <Svg height={SV_SIZE} width={SV_SIZE}>
          <Defs>
            <LinearGradient id={satGradientId} x1="0" x2="1" y1="0" y2="0">
              <Stop offset="0" stopColor="#ffffff" stopOpacity="1" />
              <Stop offset="1" stopColor={pureHueHex} stopOpacity="1" />
            </LinearGradient>
            <LinearGradient id={valGradientId} x1="0" x2="0" y1="0" y2="1">
              <Stop offset="0" stopColor="#000000" stopOpacity="0" />
              <Stop offset="1" stopColor="#000000" stopOpacity="1" />
            </LinearGradient>
          </Defs>
          <Rect fill={"url(#" + satGradientId + ")"} height={SV_SIZE} width={SV_SIZE} x={0} y={0} />
          <Rect fill={"url(#" + valGradientId + ")"} height={SV_SIZE} width={SV_SIZE} x={0} y={0} />
        </Svg>
        <Puck
          style={{
            left: clamp(sat * SV_SIZE - PUCK_SIZE / 2, -PUCK_SIZE / 2, SV_SIZE - PUCK_SIZE / 2),
            top: clamp(
              (1 - val) * SV_SIZE - PUCK_SIZE / 2,
              -PUCK_SIZE / 2,
              SV_SIZE - PUCK_SIZE / 2,
            ),
          }}
        />
      </View>
      <HueBarWrapper
        accessibilityLabel={accessibilityLabelPrefix + " hue"}
        style={{ width: HUE_SIZE, height: HUE_BAR_HEIGHT }}
        onResponderGrant={handleHueTouch}
        onResponderMove={handleHueTouch}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
      >
        <Svg height={HUE_BAR_HEIGHT} width={HUE_SIZE}>
          <Defs>
            <LinearGradient id={hueGradientId} x1="0" x2="1" y1="0" y2="0">
              <Stop offset="0" stopColor="#ff0000" stopOpacity="1" />
              <Stop offset={1 / 6} stopColor="#ffff00" stopOpacity="1" />
              <Stop offset={2 / 6} stopColor="#00ff00" stopOpacity="1" />
              <Stop offset={3 / 6} stopColor="#00ffff" stopOpacity="1" />
              <Stop offset={4 / 6} stopColor="#0000ff" stopOpacity="1" />
              <Stop offset={5 / 6} stopColor="#ff00ff" stopOpacity="1" />
              <Stop offset="1" stopColor="#ff0000" stopOpacity="1" />
            </LinearGradient>
          </Defs>
          <Rect
            fill={"url(#" + hueGradientId + ")"}
            height={HUE_BAR_HEIGHT}
            width={HUE_SIZE}
            x={0}
            y={0}
          />
        </Svg>
        <HuePuck
          style={{
            left: clamp((hue / 360) * HUE_SIZE - PUCK_SIZE / 2, -PUCK_SIZE / 2, HUE_SIZE - PUCK_SIZE / 2),
          }}
        />
      </HueBarWrapper>
    </Wrapper>
  );
}

const Wrapper = styled.View`
  margin-bottom: 14px;
`;
const HueBarWrapper = styled.View`
  margin-top: 10px;
`;
const Puck = styled.View`
  position: absolute;
  width: ${PUCK_SIZE}px;
  height: ${PUCK_SIZE}px;
  border: 2px solid ${AppColors.ink};
  background-color: transparent;
`;
const HuePuck = styled.View`
  position: absolute;
  top: -2px;
  width: ${PUCK_SIZE}px;
  height: ${HUE_BAR_HEIGHT + 4}px;
  border: 2px solid ${AppColors.ink};
  background-color: transparent;
`;
