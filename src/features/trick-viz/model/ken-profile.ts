import { Vector2 } from 'three';

import {
  cupLipHeight,
  cupLipOuterRadius,
  cupLipRise,
  KENDAMA_LAYOUT,
  SPIKE_PROFILE,
} from './kendama-geometry';
import { TAMA_LAYOUT } from './tama-geometry';

/**
 * Lathe profiles for the ken.
 *
 * A kendama is a turned object: every part of it except the sarado's two
 * arms is a surface of revolution, which is exactly what a wood lathe
 * produces and exactly what `LatheGeometry` reproduces. The first version
 * approximated the whole thing with cylinders and cones, which is why it
 * read as low-poly — not because of the triangle count, but because a cup
 * was a straight-walled funnel with no thickness, no rim and no inside.
 *
 * These live outside the component file on purpose: React Compiler is
 * enabled, and a module-scope helper defined inside a component file throws
 * an impossible-looking `ReferenceError` at runtime.
 *
 * Nothing here changes `KENDAMA_LAYOUT`. Every landmark the tricks are
 * built against — cup mouths, mouth radii, the spike tip, the string hole —
 * is still exactly where it was; this only fills in the shape between them.
 */

/**
 * How far a duplicated profile point is nudged to keep an edge crisp.
 *
 * `LatheGeometry` derives its normals from the direction between adjacent
 * profile points, so it smooths every corner — a rim would look like a
 * rolled-over lip instead of a turned edge. Repeating a point with a hair
 * of offset gives the corner two normals without handing the geometry a
 * zero-length tangent to normalize, which would poison it with NaNs.
 */
const EDGE = 0.0008;

type ProfilePoint = { r: number; y: number };

/**
 * Points along a curved wall between two profile points.
 *
 * `power` bends the radius against the height: below 1 the wall flares fast
 * and then straightens, which is what a cup's outside does; above 1 it
 * hangs onto its width and then falls away, which is what the inside of a
 * bowl does above its floor.
 */
function wall(from: ProfilePoint, to: ProfilePoint, steps: number, power: number): Vector2[] {
  const points: Vector2[] = [];

  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    points.push(new Vector2(from.r + (to.r - from.r) * t ** power, from.y + (to.y - from.y) * t));
  }

  return points;
}

export type CupLayout = {
  center: readonly [number, number, number];
  mouthRadius: number;
  neckRadius: number;
  height: number;
};

/** Wall thickness at a cup's rim. Thin, like turned wood, but not zero. */
const CUP_WALL = 0.017;

/**
 * Clearance between a cup's inside and the ball it cradles.
 *
 * Enough to read as a gap and to keep the two surfaces off each other, far
 * below anything visible at this scale.
 */
const CRADLE_CLEARANCE = 0.008;

/**
 * The inside of a cup, turned to cradle the tama.
 *
 * Not a decorative choice — a forced one. `seatOffset` rests the ball on the
 * mouth *circle*, which leaves most of a cup's depth occupied by the ball:
 * with a 0.25 ball on a 0.225 mouth, it reaches 0.141 below the rim. Any
 * interior narrower than the ball's own cross-section at that depth gets
 * intersected, which is exactly what a straight taper to the floor did.
 * Following an arc of the ball's radius guarantees it cannot happen, and is
 * what a real cup's inside approximates anyway.
 *
 * Returned from the mouth inward. `opening` is +1 for a cup opening along
 * +Y and -1 for one opening along -Y (the base cup).
 */
function cradleArc(
  mouthRadius: number,
  mouthY: number,
  cradleRadius: number,
  opening: 1 | -1,
  steps: number,
): Vector2[] {
  const centreOffset = Math.sqrt(Math.max(cradleRadius ** 2 - mouthRadius ** 2, 0));
  const startAngle = Math.asin(Math.min(mouthRadius / cradleRadius, 1));
  const points: Vector2[] = [];

  // From i = 0 so the arc starts exactly on the aperture, and the rim face
  // before it is a clean step rather than a stray cone.
  for (let i = 0; i <= steps; i += 1) {
    const angle = startAngle * (1 - i / steps);
    points.push(
      new Vector2(
        cradleRadius * Math.sin(angle),
        mouthY + opening * (centreOffset - cradleRadius * Math.cos(angle)),
      ),
    );
  }

  return points;
}

/**
 * The bead standing proud of a cup's mouth, which a tama's hole hooks over
 * in the perch balances.
 *
 * A flush rim gives a hole nothing to catch on — it slides straight off — so
 * the wood has to stand above the mouth plane. The trap is that the ball a
 * cup *catches* sits on that same mouth circle, and anything rising at the
 * aperture would be inside it.
 *
 * What buys the room is that the ball's surface climbs away from the mouth
 * plane as it goes outward. `cupLipRise` reads that climb off the ball
 * itself, so the lip's inner face is the ball's own curve dropped by a
 * clearance and it cannot intersect a catch — not by being tuned not to, but
 * by construction. Where the curve outruns the height we want, the top goes
 * flat and the rest of the climb is left as headroom.
 *
 * Returned from the outer wall, up over the bead and back down to the
 * aperture, ending a hair short of it so `cradleArc` can supply that point
 * and the edge comes out crisp. `opening` matches `cradleArc`'s.
 */
function rimLip(mouthRadius: number, mouthY: number, opening: 1 | -1, steps: number): Vector2[] {
  const outer = cupLipOuterRadius(mouthRadius);
  const height = cupLipHeight(TAMA_LAYOUT.radius, mouthRadius);

  const face = (radius: number) => {
    const rise = cupLipRise(TAMA_LAYOUT.radius, mouthRadius, radius);
    return new Vector2(radius, mouthY + opening * Math.min(Math.max(rise, 0), height));
  };

  return [
    // Out past the wall, leaving the small overhang a hole's rim bears on.
    new Vector2(outer, mouthY + opening * EDGE),
    // Up the outside of the bead.
    new Vector2(outer, mouthY + opening * height),
    // And back down its inner face, following the ball.
    ...Array.from({ length: steps }, (_, i) =>
      face(outer - EDGE - (outer - EDGE - mouthRadius - EDGE) * (i / (steps - 1))),
    ),
  ];
}

/**
 * A side cup and the arm carrying it, as one profile revolved about the
 * cup's own axis.
 *
 * Modelled as a single piece rather than a bar with a funnel stuck on the
 * end, because that is what it is: the sarado's arm swells continuously
 * into the bowl. `armReach` is how far back toward the ken's shaft the
 * profile runs — far enough to bury its closed end inside the shaft, so the
 * two meshes read as one turned piece where they meet.
 */
export function sideCupProfile(cup: CupLayout, armReach: number, cradleRadius: number): Vector2[] {
  const mouthY = cup.height / 2;
  const neckY = -cup.height / 2;
  const armRadius = cup.neckRadius * 0.92;

  return [
    // Closed end, inside the shaft.
    new Vector2(0, -armReach),
    new Vector2(armRadius, -armReach + EDGE),
    // The arm, holding its width until the bowl starts.
    new Vector2(armRadius, neckY - EDGE),
    // Outside of the bowl, flaring past the mouth by the wall's thickness —
    // `mouthRadius` is the *aperture*, which is what the ball seats on, so
    // the wood has to sit outside it rather than eat into it.
    ...wall(
      { r: armRadius, y: neckY },
      { r: cup.mouthRadius + CUP_WALL, y: mouthY },
      16,
      0.72,
    ),
    // The rim's lip, out over the wall and back in to the aperture.
    ...rimLip(cup.mouthRadius, mouthY, 1, 10),
    // Inside of the bowl.
    ...cradleArc(cup.mouthRadius, mouthY, cradleRadius, 1, 16),
  ];
}

/**
 * The ken's body, from the base cup's rim all the way up to the spike tip,
 * as one profile.
 *
 * One piece because it *is* one piece: base cup, grip, sarado hub, neck and
 * spike are all turned on the same axis from the same billet. Building it
 * as separate primitives is what produced the visible joins where a shaft
 * poked out of a cup.
 */
export function kenBodyProfile(cradleRadius: number): Vector2[] {
  const { baseCup, shaftBottom, shaftTop, spikeTip, saradoY, saradoTop } = KENDAMA_LAYOUT;

  const baseMouthY = baseCup.center[1] - baseCup.height / 2;
  const baseNeckY = baseCup.center[1] + baseCup.height / 2;

  return [
    // Inside the base cup, from the top of its cradle back down to the rim.
    // Reversed, because the profile has to run bottom-to-top overall and
    // this cup opens downward.
    ...cradleArc(baseCup.mouthRadius, baseMouthY, cradleRadius, -1, 14).reverse(),
    // Its lip, mirrored: the same bead read from the aperture outward,
    // because this cup's profile runs the other way.
    ...rimLip(baseCup.mouthRadius, baseMouthY, -1, 10).reverse(),
    // The overhang back to the wall, then up the outside to the neck.
    new Vector2(baseCup.mouthRadius + CUP_WALL, baseMouthY + EDGE),
    ...wall(
      { r: baseCup.mouthRadius + CUP_WALL, y: baseMouthY },
      { r: baseCup.neckRadius, y: baseNeckY },
      14,
      1.5,
    ),

    // A turned bead where the base cup meets the grip. Every kendama has
    // one, and without it the cup looks glued on.
    new Vector2(baseCup.neckRadius + 0.008, baseNeckY + 0.018),
    new Vector2(baseCup.neckRadius - 0.004, baseNeckY + 0.042),

    // The grip, very slightly tapered — wider at the hand, narrower where
    // the sarado sits.
    new Vector2(0.083, shaftBottom + 0.12),
    new Vector2(0.074, saradoY - 0.08),

    // The sarado hub: a squat collar the two arms grow out of, finished flat
    // on top. That face is what a landed tama comes to rest on, so it is a
    // real surface here and a named landmark in `KENDAMA_LAYOUT`, not the
    // incidental end of a taper it used to be.
    new Vector2(0.1, saradoY - 0.05),
    new Vector2(0.102, saradoTop - EDGE),
    new Vector2(0.102, saradoTop),

    // The neck, and then the spike: an ogive rather than a straight cone, so
    // it reads as turned rather than machined.
    //
    // Nothing from here to the tip may be wider than a tama's bore. The ball
    // rides all the way down this stick to the sarado, and a single proud
    // shoulder — there used to be one, at radius 0.096 — hangs it up two
    // thirds of the way and leaves the spike showing. `ken-profile.test.ts`
    // holds the line.
    new Vector2(SPIKE_PROFILE.neckRadius, saradoTop + EDGE),
    new Vector2(SPIKE_PROFILE.baseRadius, shaftTop),
    ...wall(
      { r: SPIKE_PROFILE.baseRadius, y: shaftTop },
      { r: SPIKE_PROFILE.tipRadius, y: spikeTip[1] },
      22,
      SPIKE_PROFILE.power,
    ),
    new Vector2(0, spikeTip[1]),
  ];
}

/** How far each side cup's arm reaches back toward the ken's axis. */
export const SIDE_CUP_ARM_REACH = 0.34;

/**
 * The radius every cup's inside is turned to.
 *
 * The ball's own radius plus a hair. A kendama's cups are cut to fit its
 * tama, so taking this from `TAMA_LAYOUT` rather than picking a number is
 * both the accurate thing and the thing that keeps the two from
 * intersecting if either is ever retuned.
 */
export const CRADLE_RADIUS = TAMA_LAYOUT.radius + CRADLE_CLEARANCE;
