/**
 * HSV <-> hex conversion utilities. Sibling to `contrast.ts` - pure, dependency-free, and shared
 * by anything that needs to render or drive a hue/saturation/value color picker.
 */

import { hexToRgb } from "./contrast";

export interface Hsv {
  readonly h: number;
  readonly s: number;
  readonly v: number;
}

interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export function rgbToHsv({ r, g, b }: Rgb): Hsv {
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;

  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === rNorm) {
      h = 60 * (((gNorm - bNorm) / delta) % 6);
    } else if (max === gNorm) {
      h = 60 * ((bNorm - rNorm) / delta + 2);
    } else {
      h = 60 * ((rNorm - gNorm) / delta + 4);
    }
  }
  if (h < 0) h += 360;

  const s = max === 0 ? 0 : delta / max;
  const v = max;

  return { h, s, v };
}

export function hsvToRgb({ h, s, v }: Hsv): Rgb {
  const c = v * s;
  const hPrime = h / 60;
  const x = c * (1 - Math.abs((hPrime % 2) - 1));
  const m = v - c;

  let rPrime = 0;
  let gPrime = 0;
  let bPrime = 0;

  if (hPrime >= 0 && hPrime < 1) {
    rPrime = c;
    gPrime = x;
  } else if (hPrime >= 1 && hPrime < 2) {
    rPrime = x;
    gPrime = c;
  } else if (hPrime >= 2 && hPrime < 3) {
    gPrime = c;
    bPrime = x;
  } else if (hPrime >= 3 && hPrime < 4) {
    gPrime = x;
    bPrime = c;
  } else if (hPrime >= 4 && hPrime < 5) {
    rPrime = x;
    bPrime = c;
  } else {
    rPrime = c;
    bPrime = x;
  }

  return {
    r: Math.round((rPrime + m) * 255),
    g: Math.round((gPrime + m) * 255),
    b: Math.round((bPrime + m) * 255),
  };
}

function toHexChannel(value: number): string {
  return Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0");
}

export function hsvToHex(h: number, s: number, v: number): string {
  const { r, g, b } = hsvToRgb({ h, s, v });
  return "#" + toHexChannel(r) + toHexChannel(g) + toHexChannel(b);
}

export function hexToHsv(hex?: string): Hsv | undefined {
  if (!hex) return undefined;
  const rgb = hexToRgb(hex);
  if (!rgb) return undefined;
  return rgbToHsv(rgb);
}
