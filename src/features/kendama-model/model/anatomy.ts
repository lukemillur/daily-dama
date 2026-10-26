import { SplineCurve, Vector2 } from 'three';

/**
 * Kendama anatomy, in millimetres, measured from a 3D scan of a Sweets
 * Kendamas "Boost" shape (DerKernsen2, Thingiverse thing:6569274, CC BY-NC).
 * The scan is a measuring reference only: no scanned geometry ships. Every
 * surface here is authored as a lathe profile through measured control
 * points, so the model stays procedural.
 *
 * Real kendamas are three parts, and the old model's biggest error was
 * treating them as one:
 *
 * - **Ken (handle)**: one turned piece from the base cup up through the
 *   spike. Its axis is local +Y, base cup mouth at y = 0.
 * - **Sarado**: a separate hourglass crosspiece with the big cup at one end
 *   and the small cup at the other. The handle passes through a bore in its
 *   waist. Its axis is local +X (big cup at +X).
 * - **Tama**: the ball, with a deep bore for the spike and a small string
 *   hole at the opposite pole. Its hole faces local -Y.
 *
 * A profile point is `[radius, height]` along that part's own axis, which is
 * the coordinate order `LatheGeometry` wants.
 */
export type ProfilePoint = readonly [r: number, h: number];

/**
 * A run of control points interpolated as one smooth Catmull-Rom curve.
 * Consecutive pieces meet at a crisp corner, which is how turned edges like
 * the bevel ring and the cup bands read.
 */
export type ProfilePiece = readonly ProfilePoint[];

export const TAMA = {
  radius: 30,
  /** Main bore, which takes the whole spike. */
  boreRadius: 6.5,
  /** Height of the bore's flat ceiling above the ball's centre. */
  boreTopHeight: 22.2,
  /** The countersink (bevel) around the hole mouth. */
  bevelOuterRadius: 10.64,
  bevelDepth: 5.75,
  stringHoleRadius: 1.6,
} as const;

/** Where the hole mouth's plane sits, below the ball's centre. */
export const TAMA_MOUTH_HEIGHT = -Math.sqrt(TAMA.radius ** 2 - TAMA.bevelOuterRadius ** 2);

/** From the mouth plane to the bore ceiling: how much spike the ball can take. */
export const TAMA_BORE_DEPTH = TAMA.boreTopHeight - TAMA_MOUTH_HEIGHT;

export type CupAnatomy = {
  /** Height along the sarado axis of the rim's top face. Signed: small cup is negative. */
  rimHeight: number;
  /** Height of the bowl's deepest point. */
  bottomHeight: number;
  /** The bowl's inside is a spherical cap of this radius. */
  sphereRadius: number;
};

export const SARADO = {
  length: 74,
  /** Where the sarado's axis crosses the handle, measured up from the base cup mouth. */
  heightOnHandle: 105,
  waistRadius: 10.2,
  stringHoleRadius: 1.8,
  bigCup: { rimHeight: 36.83, bottomHeight: 25.8, sphereRadius: 27.7 },
  smallCup: { rimHeight: -37.17, bottomHeight: -27.8, sphereRadius: 24 },
} as const;

export const HANDLE = {
  height: 161,
  baseCup: { mouthRadius: 16.3, depth: 6.8, outerRadius: 20.6 },
} as const;

/**
 * The radius of a cup's opening at its rim, derived from the bowl sphere so
 * the bowl and the mouth cannot disagree.
 */
export function cupMouthRadius(cup: CupAnatomy): number {
  const direction = Math.sign(cup.bottomHeight - cup.rimHeight);
  const sphereCentre = cup.bottomHeight - direction * cup.sphereRadius;
  return Math.sqrt(cup.sphereRadius ** 2 - (cup.rimHeight - sphereCentre) ** 2);
}

/**
 * How far above the rim plane a caught tama's centre sits. The ball is wider
 * than every mouth, so it rests on the rim circle rather than in the bowl.
 */
export function cupSeatOffset(cup: CupAnatomy): number {
  return Math.sqrt(TAMA.radius ** 2 - cupMouthRadius(cup) ** 2);
}

/** Points along a circle centred on the axis at `centreH`, from `fromH` to `toH`. */
function sphericalArc(radius: number, centreH: number, fromH: number, toH: number, steps = 24) {
  const points: ProfilePoint[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const h = fromH + ((toH - fromH) * i) / steps;
    points.push([Math.sqrt(Math.max(radius ** 2 - (h - centreH) ** 2, 0)), h]);
  }
  return points;
}

function bowlArc(cup: CupAnatomy, toH: number): ProfilePoint[] {
  const direction = Math.sign(cup.bottomHeight - cup.rimHeight);
  const sphereCentre = cup.bottomHeight - direction * cup.sphereRadius;
  return sphericalArc(cup.sphereRadius, sphereCentre, cup.bottomHeight, toH);
}

const DISH_EDGE = 0.3;
const DISH_SPHERE_RADIUS =
  (HANDLE.baseCup.mouthRadius ** 2 + HANDLE.baseCup.depth ** 2) / (2 * HANDLE.baseCup.depth);
const DISH = sphericalArc(
  DISH_SPHERE_RADIUS,
  HANDLE.baseCup.depth - DISH_SPHERE_RADIUS,
  HANDLE.baseCup.depth,
  DISH_EDGE,
);

/**
 * The handle's bowl and the rest of its surface are separate meshes, so the
 * dish can take concentric grain (it exposes end grain) while the shaft
 * takes lengthwise grain.
 */
export const HANDLE_DISH: readonly ProfilePiece[] = [DISH];

export const HANDLE_BODY: readonly ProfilePiece[] = [
  // Base cup rim, rounded on both edges.
  [
    DISH[DISH.length - 1],
    [16.7, 0.05],
    [17.2, 0],
    [19.6, 0],
    [20.15, 0.15],
    [20.45, 0.6],
    [20.55, 1.2],
  ],
  // The base cup's outer band, then the ledge that steps in above it.
  [
    [20.55, 1.2],
    [20.6, 5],
    [20.55, 9.6],
  ],
  [
    [20.55, 9.6],
    [20.3, 10.6],
    [19.2, 11.3],
    [18, 11.9],
  ],
  // Lower grip tapering in, then swelling to the bevel ring.
  [
    [18, 11.9],
    [16.9, 14],
    [16.15, 18],
    [15.4, 22],
    [14.8, 26],
    [14.1, 29],
    [13.45, 32.5],
    [13.4, 34],
    [14.3, 36],
    [15.85, 38.5],
    [16.7, 40.2],
    [16.85, 40.8],
  ],
  // Above the bevel ring's crisp top edge: a quick fall, then the long
  // taper through the sarado seat, the spike and its rounded tip.
  [
    [16.85, 40.8],
    [15.4, 41.8],
    [13.6, 43.2],
    [12, 45],
    [11.1, 47],
    [10.5, 49.5],
    [10.1, 52],
    [9.5, 56],
    [8.9, 60],
    [8.35, 64],
    [7.75, 69],
    [7.2, 75],
    [6.7, 81],
    [6.3, 88],
    [6, 94],
    [5.8, 99],
    [5.65, 104],
    [5.5, 112],
    [5.35, 125],
    [5.2, 138],
    [5.05, 149],
    [4.85, 152.5],
    [4.45, 155],
    [3.7, 157.2],
    [2.6, 159.2],
    [1.3, 160.5],
    [0, HANDLE.height],
  ],
];

const { bigCup, smallCup } = SARADO;
const SMALL_BOWL_EDGE = smallCup.rimHeight + 0.22;
const BIG_BOWL_EDGE = bigCup.rimHeight - 0.28;

export const SARADO_SMALL_BOWL: readonly ProfilePiece[] = [bowlArc(smallCup, SMALL_BOWL_EDGE)];

/** Reversed so the bowl runs rim-to-centre and its normals face into the cup. */
export const SARADO_BIG_BOWL: readonly ProfilePiece[] = [
  [...bowlArc(bigCup, BIG_BOWL_EDGE)].reverse(),
];

export const SARADO_BODY: readonly ProfilePiece[] = [
  // Small cup rim.
  [
    [sphericalRadiusAt(smallCup, SMALL_BOWL_EDGE), SMALL_BOWL_EDGE],
    [19.1, -37.12],
    [19.5, smallCup.rimHeight],
    [21.2, smallCup.rimHeight],
    [21.6, -37.1],
    [21.8, -36.9],
  ],
  // Small cup band: widens slightly toward the waist.
  [
    [21.8, -36.9],
    [22, -36],
    [22.45, -34],
    [23, -31],
    [23.45, -28.6],
    [23.7, -26.9],
  ],
  // The hourglass waist. The handle passes through it at h = 0.
  [
    [23.7, -26.9],
    [22.2, -25.5],
    [21.2, -24.5],
    [20.15, -23.5],
    [19, -22.5],
    [18.1, -21.5],
    [17.15, -20.5],
    [16.25, -19.5],
    [14.9, -17.5],
    [13.65, -15.5],
    [12.65, -13.5],
    [11.9, -11.5],
    [11.15, -9.5],
    [10.65, -7.5],
    [10.45, -5],
    [SARADO.waistRadius, 0],
    [10.4, 3.5],
    [10.6, 6.5],
    [11.2, 8.5],
    [11.8, 10.5],
    [12.55, 12.5],
    [13.55, 14.5],
    [14.85, 16.5],
    [16.25, 18.5],
    [17.95, 20.5],
    [20.05, 22.5],
    [22.45, 24.5],
    [23.75, 25.5],
    [24.65, 26.4],
  ],
  // Big cup band: narrows slightly toward the rim.
  [
    [24.65, 26.4],
    [24.4, 28.5],
    [24.15, 30.5],
    [23.95, 32.5],
    [23.65, 34.5],
    [23.5, 35.8],
    [23.45, 36.4],
  ],
  // Big cup rim.
  [
    [23.45, 36.4],
    [23.35, 36.7],
    [23, bigCup.rimHeight],
    [22.6, bigCup.rimHeight],
    [22.3, 36.75],
    [sphericalRadiusAt(bigCup, BIG_BOWL_EDGE), BIG_BOWL_EDGE],
  ],
];

function sphericalRadiusAt(cup: CupAnatomy, h: number): number {
  const direction = Math.sign(cup.bottomHeight - cup.rimHeight);
  const sphereCentre = cup.bottomHeight - direction * cup.sphereRadius;
  return Math.sqrt(cup.sphereRadius ** 2 - (h - sphereCentre) ** 2);
}

const BEVEL_INNER: ProfilePoint = [TAMA.boreRadius, TAMA_MOUTH_HEIGHT + TAMA.bevelDepth];
const STRING_HOLE_TOP: ProfilePoint = [
  TAMA.stringHoleRadius,
  Math.sqrt(TAMA.radius ** 2 - TAMA.stringHoleRadius ** 2),
];

/** The painted outside: bevel, then the sphere up to the string hole. */
export const TAMA_SHELL: readonly ProfilePiece[] = [
  [BEVEL_INNER, [TAMA.bevelOuterRadius, TAMA_MOUTH_HEIGHT]],
  sphericalArc(TAMA.radius, 0, TAMA_MOUTH_HEIGHT, STRING_HOLE_TOP[1], 64),
];

/** The unpainted inside: string hole, bore ceiling, bore walls. */
export const TAMA_BORE: readonly ProfilePiece[] = [
  [STRING_HOLE_TOP, [TAMA.stringHoleRadius, TAMA.boreTopHeight]],
  [
    [TAMA.stringHoleRadius, TAMA.boreTopHeight],
    [TAMA.boreRadius, TAMA.boreTopHeight],
  ],
  [[TAMA.boreRadius, TAMA.boreTopHeight], BEVEL_INNER],
];

/**
 * Corner offset when one piece hands over to the next. Duplicating a point
 * exactly gives `LatheGeometry` a zero-length tangent and NaN normals; a
 * tiny step gives the corner two distinct normals, which is what makes it
 * read crisp instead of rolled over.
 */
const CORNER_STEP = 0.02;

/** Target spacing between resampled points, in mm. */
const SPACING = 0.5;

/**
 * Turns pieces into one evenly spaced polyline for a lathe. Even spacing
 * matters beyond smoothness: lathe UVs run along the point index, so uneven
 * spacing would stretch the wood grain wherever control points are sparse.
 */
export function sampleProfile(pieces: readonly ProfilePiece[]): ProfilePoint[] {
  const out: ProfilePoint[] = [];

  for (const piece of pieces) {
    const curve = new SplineCurve(piece.map(([r, h]) => new Vector2(r, h)));
    const divisions = Math.max(1, Math.ceil(curve.getLength() / SPACING));
    const points = curve.getSpacedPoints(divisions);

    for (const [index, point] of points.entries()) {
      if (index === 0 && out.length > 0) {
        const next = points[1];
        const length = Math.hypot(next.x - point.x, next.y - point.y);
        const step = Math.min(CORNER_STEP, length / 4) / length;
        out.push([
          Math.max(point.x + (next.x - point.x) * step, 0),
          point.y + (next.y - point.y) * step,
        ]);
        continue;
      }
      out.push([Math.max(point.x, 0), point.y]);
    }
  }

  return out;
}

/**
 * The sarado's outer radius at a height along its axis, read off the
 * sampled waist. Used to find where a spiked tama comes to rest.
 */
export function saradoRadiusAt(h: number, samples: readonly ProfilePoint[]): number {
  for (let i = 0; i < samples.length - 1; i += 1) {
    const [r0, h0] = samples[i];
    const [r1, h1] = samples[i + 1];
    if ((h0 - h) * (h1 - h) <= 0 && h0 !== h1) {
      return r0 + ((r1 - r0) * (h - h0)) / (h1 - h0);
    }
  }
  throw new Error(`[kendama-model] no sarado surface at h = ${h}`);
}

/**
 * Height above the sarado's axis where a spiked tama's mouth comes to rest.
 *
 * The mouth is a circle around the handle, and the sarado is an hourglass
 * across it, so the ring touches down where the hourglass stands highest
 * under it: at the two points over the sarado's axis, not in front or
 * behind, where the waist falls away.
 */
export function spikedMouthRestHeight(): number {
  const waist = sampleProfile([SARADO_BODY[2]]);
  const ring = TAMA.bevelOuterRadius;
  let highest = -Infinity;

  for (let i = 0; i < 360; i += 1) {
    const angle = (i / 360) * 2 * Math.PI;
    const along = ring * Math.cos(angle);
    const across = ring * Math.sin(angle);
    const radius = saradoRadiusAt(along, waist);
    if (radius > Math.abs(across)) {
      highest = Math.max(highest, Math.sqrt(radius ** 2 - across ** 2));
    }
  }

  return highest;
}
