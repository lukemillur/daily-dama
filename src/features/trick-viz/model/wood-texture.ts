import { Color, DataTexture, LinearFilter, RepeatWrapping, SRGBColorSpace } from 'three';

/**
 * Procedural wood grain, generated into a `DataTexture`.
 *
 * Built rather than loaded, for the same reason the models are: no licensed
 * or imported assets. Generated as raw bytes rather than drawn on a canvas
 * so it works on native as well as web — `document` does not exist there.
 *
 * Flat colour was the last thing making the ken read as a render rather than
 * an object. Shape alone gets you a smooth turned form; the eye still wants
 * the surface to have something in it.
 */

/**
 * Period of the noise lattice across the texture's width.
 *
 * The texture wraps all the way around a body of revolution, so the noise
 * has to be periodic in x or the seam shows up as a stripe down the ken.
 */
const NOISE_PERIOD = 8;

function hash(ix: number, iy: number): number {
  const wrapped = ((ix % NOISE_PERIOD) + NOISE_PERIOD) % NOISE_PERIOD;
  let h = wrapped * 374761393 + iy * 668265263;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

function valueNoise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const u = smooth(x - ix);
  const v = smooth(y - iy);

  return (
    hash(ix, iy) * (1 - u) * (1 - v) +
    hash(ix + 1, iy) * u * (1 - v) +
    hash(ix, iy + 1) * (1 - u) * v +
    hash(ix + 1, iy + 1) * u * v
  );
}

function fbm(x: number, y: number): number {
  let sum = 0;
  let amplitude = 0.5;
  let frequency = 1;

  for (let octave = 0; octave < 4; octave += 1) {
    sum += valueNoise(x * frequency, y * frequency) * amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }

  return sum;
}

const SIZE = 256;

export type WoodOptions = {
  /** The lighter background tone. */
  base: string;
  /** The darker tone the grain lines are drawn in. */
  grain: string;
  /** How strongly the grain shows, 0-1. */
  strength?: number;
  /** How many grain lines across the piece. */
  lines?: number;
  /**
   * Which way the grain runs.
   *
   * `lengthwise` for the ken's body: the billet's grain runs along the axis,
   * so on the shaft it shows as lines down its length.
   *
   * `concentric` for a cup. The same setting there would put the lines
   * around the bowl's own axis, which renders them as spokes radiating from
   * the centre — the one pattern wood never makes. Rings read as the growth
   * rings a turned bowl actually exposes.
   */
  direction?: 'lengthwise' | 'concentric';
};

/**
 * Grain runs *along* the ken, because that is how the billet was cut and
 * turned. In lathe UVs `u` goes around the revolution and `v` along the
 * profile, so lengthwise grain means a pattern that varies with `u` — and
 * warping it with noise is what keeps it from reading as a barcode.
 */
export function createWoodTexture({
  base,
  grain,
  strength = 0.22,
  lines = 13,
  direction = 'lengthwise',
}: WoodOptions): DataTexture {
  const light = new Color(base);
  const dark = new Color(grain);
  const data = new Uint8Array(SIZE * SIZE * 4);

  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const u = (x / SIZE) * NOISE_PERIOD;
      const v = (y / SIZE) * 3;

      // Noise is always sampled with `u` first, so it stays periodic around
      // the revolution whichever way the grain runs — otherwise the wrap
      // shows up as a seam down the piece.
      const warp = fbm(u, v) - 0.5;
      const along =
        direction === 'concentric' ? v * (lines / 3) : u * (lines / NOISE_PERIOD);

      // Heavily warped and only gently sharpened. Evenly spaced hard lines
      // read as corduroy, not timber — the wander is what sells it.
      const ring = Math.abs(Math.sin(Math.PI * (along + warp * 3.2)));
      const figure = ring ** 0.8;

      // A slow wander in tone, which does most of the work. Turned maple is
      // a plain wood; the grain should be something you notice second.
      const tone = fbm(u * 0.4, v * 0.4) - 0.5;
      const mix = Math.min(Math.max((1 - figure) * strength + tone * 0.45, 0), 1);

      const index = (y * SIZE + x) * 4;
      data[index] = Math.round((light.r + (dark.r - light.r) * mix) * 255);
      data[index + 1] = Math.round((light.g + (dark.g - light.g) * mix) * 255);
      data[index + 2] = Math.round((light.b + (dark.b - light.b) * mix) * 255);
      data[index + 3] = 255;
    }
  }

  const texture = new DataTexture(data, SIZE, SIZE);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;

  return texture;
}
