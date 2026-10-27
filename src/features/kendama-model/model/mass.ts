import { HANDLE, HANDLE_BODY, sampleProfile, SARADO, SARADO_BODY, saradoRadiusAt, type CupAnatomy } from './anatomy';
import type { Vec3 } from './views';

/** Grams. */
export const TAMA_MASS = 68;

/**
 * The ken's mass properties, integrated from the same lathe profiles the
 * mesh and colliders use, so they follow any change to the shape.
 *
 * Only tricks where the ken flies need these: while the hand holds it the
 * ken is kinematic. Held by the tama instead, as in Airplane, it hangs from
 * its string hole and turns about its centre of mass, and where that centre
 * sits under the hole is what decides how it hangs and how a pull flips it.
 */
export type MassProperties = {
  /** Grams. */
  mass: number;
  /** Ken-local mm. */
  centre: Vec3;
  /** Inertia about `centre` in ken-local axes, row-major 3×3, g mm². */
  inertia: readonly number[];
  /** Its inverse, 1 / (g mm²). */
  inverseInertia: readonly number[];
};

/**
 * g/mm³, beech. With it the measured shape weighs about what a real ken
 * does, which is a check on the integration rather than a tuning knob.
 */
const WOOD_DENSITY = 0.00072;
const SLICE = 0.25;

/** Inside radius of a cup's bowl at height `h` along its part's axis, or 0 outside the bowl. */
function bowlRadiusAt(h: number, depthToward: number, rimHeight: number, sphereRadius: number, centre: number) {
  const inBowl = depthToward > 0 ? h >= rimHeight && h <= rimHeight + depthToward : h <= rimHeight && h >= rimHeight + depthToward;
  if (!inBowl) return 0;
  return Math.sqrt(Math.max(sphereRadius ** 2 - (h - centre) ** 2, 0));
}

function cupBowlRadiusAt(cup: CupAnatomy, h: number): number {
  const direction = Math.sign(cup.bottomHeight - cup.rimHeight);
  const centre = cup.bottomHeight - direction * cup.sphereRadius;
  return bowlRadiusAt(h, cup.bottomHeight - cup.rimHeight, cup.rimHeight, cup.sphereRadius, centre);
}

/**
 * Sums thin lathe slices of the handle (axis +Y) and the sarado (axis +X,
 * crossing the handle at its seat height), hollowed by their cups. The
 * handle's short run through the sarado's waist is counted twice, about
 * 2g; small next to what the shape decides.
 */
export function computeKenMassProperties(): MassProperties {
  let mass = 0;
  const first = [0, 0, 0];
  // Second moments Σ m r rᵀ about the ken's origin, row-major.
  const second = [0, 0, 0, 0, 0, 0, 0, 0, 0];

  const handle = sampleProfile(HANDLE_BODY);
  const dishDepth = HANDLE.baseCup.depth;
  const dishSphere = (HANDLE.baseCup.mouthRadius ** 2 + dishDepth ** 2) / (2 * dishDepth);
  for (let y = SLICE / 2; y < HANDLE.height; y += SLICE) {
    const outer = saradoRadiusAt(y, handle);
    const inner = bowlRadiusAt(y, dishDepth, 0, dishSphere, dishDepth - dishSphere);
    const spread = outer ** 2 + inner ** 2;
    const dm = WOOD_DENSITY * Math.PI * (outer ** 2 - inner ** 2) * SLICE;
    mass += dm;
    first[1] += dm * y;
    second[0] += (dm * spread) / 4;
    second[4] += dm * y * y;
    second[8] += (dm * spread) / 4;
  }

  const sarado = sampleProfile(SARADO_BODY);
  const seat = SARADO.heightOnHandle;
  for (let x = SARADO.smallCup.rimHeight + SLICE / 2; x < SARADO.bigCup.rimHeight; x += SLICE) {
    const outer = saradoRadiusAt(x, sarado);
    const inner = Math.max(cupBowlRadiusAt(SARADO.bigCup, x), cupBowlRadiusAt(SARADO.smallCup, x));
    const spread = outer ** 2 + inner ** 2;
    const dm = WOOD_DENSITY * Math.PI * (outer ** 2 - inner ** 2) * SLICE;
    mass += dm;
    first[0] += dm * x;
    first[1] += dm * seat;
    second[0] += dm * x * x;
    second[1] += dm * x * seat;
    second[3] += dm * x * seat;
    second[4] += dm * (seat * seat + spread / 4);
    second[8] += (dm * spread) / 4;
  }

  const centre: Vec3 = [first[0] / mass, first[1] / mass, first[2] / mass];
  // About the centre: S_c = S − m c cᵀ, then I = tr(S_c) E − S_c.
  const central = second.map((s, i) => s - mass * centre[Math.floor(i / 3)] * centre[i % 3]);
  const trace = central[0] + central[4] + central[8];
  const inertia = central.map((s, i) => (i % 4 === 0 ? trace : 0) - s);
  return { mass, centre, inertia, inverseInertia: invert3(inertia) };
}

function invert3(m: readonly number[]): number[] {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const determinant = a * A + b * B + c * C;
  return [
    A / determinant,
    -(b * i - c * h) / determinant,
    (b * f - c * e) / determinant,
    B / determinant,
    (a * i - c * g) / determinant,
    -(a * f - c * d) / determinant,
    C / determinant,
    -(a * h - b * g) / determinant,
    (a * e - b * d) / determinant,
  ];
}

export const KEN_MASS = computeKenMassProperties();
