import { describe, expect, it } from "@jest/globals";

import { hexToHsv, hsvToHex } from "./hsv";

describe("hsvToHex", () => {
  it("renders pure hues at the standard 60-degree wheel positions", () => {
    expect(hsvToHex(0, 1, 1)).toBe("#ff0000");
    expect(hsvToHex(60, 1, 1)).toBe("#ffff00");
    expect(hsvToHex(120, 1, 1)).toBe("#00ff00");
    expect(hsvToHex(180, 1, 1)).toBe("#00ffff");
    expect(hsvToHex(240, 1, 1)).toBe("#0000ff");
    expect(hsvToHex(300, 1, 1)).toBe("#ff00ff");
  });

  it("renders black and white regardless of hue", () => {
    expect(hsvToHex(0, 0, 0)).toBe("#000000");
    expect(hsvToHex(200, 0, 1)).toBe("#ffffff");
  });
});

describe("hexToHsv / hsvToHex round trip", () => {
  it("round-trips a few app colors and arbitrary hex values", () => {
    const samples = ["#4477aa", "#f4c94d", "#112233", "#ffffff", "#000000", "#7c8b7c"];
    for (const hex of samples) {
      const hsv = hexToHsv(hex);
      expect(hsv).toBeDefined();
      expect(hsvToHex(hsv!.h, hsv!.s, hsv!.v)).toBe(hex);
    }
  });

  it("rejects undefined and malformed input", () => {
    expect(hexToHsv(undefined)).toBeUndefined();
    expect(hexToHsv("")).toBeUndefined();
    expect(hexToHsv("not-a-color")).toBeUndefined();
    expect(hexToHsv("#fff")).toBeUndefined();
  });
});
