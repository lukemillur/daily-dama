import type { Vec3 } from "./body";

/**
 * Shared layout constants for the primitive-built kendama model and its
 * trick keyframes, so trick authors can reference cup/spike positions
 * without duplicating magic numbers.
 *
 * These are all **ken-local** coordinates, describing the ken in its
 * neutral pose: spike up, sarado horizontal, base cup down. Tricks hold
 * the ken at all sorts of angles, so a trick declares a `KenPose` and maps
 * these landmarks into world space via `localToWorld` (see `ken-pose.ts`)
 * rather than hardcoding world coordinates that only hold for one grip.
 *
 * Anatomy (facing the kendama, string hole toward the viewer): the spike
 * sits at the top, where the dama rests. Just below it, the sarado
 * (crosspiece) forms a T — big cup on the right arm facing right, small
 * cup on the left arm facing left. The shaft descends from the sarado
 * to the base cup at the very bottom, facing down/outward. Each cup's
 * neck radius matches the shaft it tapers from (the sarado bar for the
 * side cups, the grip shaft for the base cup) so the taper reads as one
 * continuous piece of wood rather than a shaft poking through a cap.
 *
 * Naming note: "ken" means the whole assembly (shaft + sarado + cups +
 * spike); "shaft" means just the grip section below the sarado. That's
 * why the topmost point is `spikeTip` and not `shaftTop` — the spike
 * extends above where the shaft ends.
 */
export const KENDAMA_LAYOUT = {
  saradoY: 0.1,

  /**
   * The sarado's flat top face — the plane a speared tama comes to rest on.
   *
   * A ken and its tama are a matched pair: the hole is bored to exactly the
   * depth the spike stands proud of this face, so on a real spike landing the
   * tip reaches the bottom of the bore at the same moment the ball reaches
   * the crosspiece. One landing, two contacts. That is why this face is a
   * landmark rather than an incidental end of a taper, and why the bore is
   * derived from it (`TAMA_LAYOUT.holeDepth`) instead of chosen.
   */
  saradoTop: 0.2,

  shaftTop: 0.28,
  shaftBottom: -0.62,
  shaftRadius: 0.08,

  /**
   * A real spike is long — most of the height of the tama it catches, a
   * slender dowel that only tapers near the point. An earlier version had it
   * at less than two thirds of this, which made the ken look stubby and,
   * because the bore follows it, gave the ball a shallow dimple rather than a
   * hole you can see into.
   */
  spikeTip: [0, 0.56, 0] as Vec3,

  saradoBarRadius: 0.08,
  saradoBarHalfSpan: 0.2,

  smallCup: {
    center: [-0.3, 0.1, 0] as Vec3,
    mouthRadius: 0.2,
    neckRadius: 0.08,
    height: 0.2,
  },
  bigCup: {
    center: [0.3, 0.1, 0] as Vec3,
    mouthRadius: 0.225,
    neckRadius: 0.08,
    height: 0.2,
  },
  baseCup: {
    center: [0, -0.72, 0] as Vec3,
    mouthRadius: 0.15,
    neckRadius: 0.09,
    height: 0.2,
  },

  /**
   * Where the string exits the ken: through the shaft just below the
   * sarado, not at the spike tip. Sits on the shaft *surface* (+Z, the
   * face toward the viewer in the neutral frame) rather than on its axis,
   * so the string reads as leaving a drilled hole instead of emerging
   * from inside solid wood.
   */
  stringHoleLocal: [0, 0.2 - 0.12, 0.08] as Vec3,

  /**
   * True scale, not stylized: a real kendama string (~35cm against a ~16cm
   * ken) is roughly 2.7 units at these proportions. It hangs the tama far
   * outside any fixed frame that also shows the ken at a readable size,
   * which is exactly why the camera fits tama and ken *per frame* rather
   * than to a static box (see `frameSubjects`). Do not shorten this back to
   * a stylized value to make a static camera work.
   */
  stringRestLength: 2.7,
};

/**
 * How far the spike stands proud of the sarado.
 *
 * The load-bearing number for the whole spike landing, and not the length of
 * the cone: the neck under the cone is narrower than a tama's bore too, so
 * the ball swallows the entire span. `TAMA_LAYOUT.holeDepth` is bored to
 * exactly this, the way a real pair is made.
 *
 * `ken-profile.test.ts` asserts nothing in the span is wider than the bore,
 * because a single proud shoulder is enough to make all of this a lie.
 */
export const SPIKE_EXPOSED = KENDAMA_LAYOUT.spikeTip[1] - KENDAMA_LAYOUT.saradoTop;

/**
 * The spike's taper.
 *
 * This lives here rather than in `ken-profile.ts` with the rest of the mesh's
 * shape, and it is the one exception to that split: the tama's bore is cut to
 * fit this curve, so how fat the spike is at a given height stopped being a
 * look and became a landmark. `ken-profile` turns the ogive from these
 * numbers and the tama steps its bore off the same ones.
 *
 * `power` above 1 holds the width and then lets it fall away, which is what a
 * real spike does — a slender dowel that only becomes a point near the tip. A
 * gentler curve over a spike this long reads as a needle.
 */
export const SPIKE_PROFILE = {
  /** Where the neck leaves the sarado. */
  neckRadius: 0.07,
  /** Where the cone leaves the neck, at `shaftTop`. */
  baseRadius: 0.058,
  tipRadius: 0.004,
  power: 2.2,
};

/**
 * The height at which the spike has tapered down to `radius`.
 *
 * The analytic inverse of the ogive, which is what lets the tama place the
 * step in its bore where the spike is thin enough for the narrow part to
 * clear it, rather than at a depth someone picked. Clamped at both ends, so
 * a radius fatter than the base gives `shaftTop` and one finer than the tip
 * gives `spikeTip`.
 */
export function spikeHeightAtRadius(radius: number): number {
  const { baseRadius, tipRadius, power } = SPIKE_PROFILE;
  const fraction = (baseRadius - radius) / (baseRadius - tipRadius);
  const t = Math.min(Math.max(fraction, 0), 1) ** (1 / power);

  return (
    KENDAMA_LAYOUT.shaftTop + t * (KENDAMA_LAYOUT.spikeTip[1] - KENDAMA_LAYOUT.shaftTop)
  );
}

/**
 * How much of a hair the ball is held off the wood when it lands.
 *
 * The ball's own surface curves away from its hole's rim slowly — it clears
 * the sarado's top face by only ~0.005 out at the hub's edge — so seating it
 * dead flush leaves two surfaces close enough to trade places under shading.
 * Half a millimetre at true scale, invisible, and it still reads as resting.
 *
 * Because the bore matches the spike, this one number backs the ball off
 * both contacts at once: the tip stops the same hair short of the bore's
 * blind end as the rim does of the sarado.
 */
export const SPIKE_SEAT_CLEARANCE = 0.004;

/** How far the spike actually goes in, once the seating clearance is off it. */
export const SPIKE_INSERTION = SPIKE_EXPOSED - SPIKE_SEAT_CLEARANCE;

/**
 * How far a tama's center sits from a cup's mouth plane when seated.
 *
 * A tama is wider than the cup mouth, so it rests *on the rim* rather
 * than sinking in: the rim circle cuts a chord across the sphere, and the
 * center floats this far along the cup's axis beyond the mouth plane.
 * Returns 0 for a mouth wide enough to swallow the tama entirely.
 */
export function seatOffset(tamaRadius: number, mouthRadius: number): number {
  if (mouthRadius >= tamaRadius) return 0;
  return Math.sqrt(tamaRadius ** 2 - mouthRadius ** 2);
}

/**
 * How far the rim lip reaches out past the aperture.
 *
 * Must exceed the cup's wall thickness or the lip would not stand proud of
 * the outside of the bowl and there would be nothing to hook a hole on;
 * `ken-profile.test.ts` holds the two in that order.
 */
export const CUP_LIP_WIDTH = 0.024;

/**
 * How proud the rim lip stands, where the ball leaves room for it.
 *
 * Authored — this is a look, roughly 3mm of turned bead at true scale. What
 * is *not* authored is whether a given cup can have it; see `cupLipHeight`.
 */
export const CUP_LIP_HEIGHT = 0.024;

/** How far the lip is held clear of a ball seated in the same cup. */
export const CUP_LIP_CLEARANCE = 0.004;

/** The circle a tama's hole hooks over: the outer edge of a cup's lip. */
export function cupLipOuterRadius(mouthRadius: number): number {
  return mouthRadius + CUP_LIP_WIDTH;
}

/**
 * How far a seated ball's own surface has climbed by the time it reaches
 * `radius`, less the clearance the lip is held off it by.
 *
 * The ball rests on the mouth *circle*, so its surface leaves the mouth
 * plane going outward — slowly at first, then fast. That curve is the entire
 * budget the lip has to live inside, and reading it off `seatOffset` twice is
 * what makes the lip provably unable to touch a catch however the cups are
 * retuned. Past the ball's equator `seatOffset` returns 0, which is the right
 * answer rather than an edge case: out there nothing below the equator can
 * touch the ball at all.
 */
export function cupLipRise(tamaRadius: number, mouthRadius: number, radius: number): number {
  return seatOffset(tamaRadius, mouthRadius) - seatOffset(tamaRadius, radius) - CUP_LIP_CLEARANCE;
}

/**
 * How proud a given cup's lip actually stands: the authored height, or as
 * much of it as the ball allows.
 *
 * The base cup is the tight one — its mouth is narrow, so a seated ball hugs
 * the rim and there is less than 2mm of room. That the three cups differ
 * slightly is a consequence of their mouths, not an inconsistency.
 */
export function cupLipHeight(tamaRadius: number, mouthRadius: number): number {
  const room = cupLipRise(tamaRadius, mouthRadius, cupLipOuterRadius(mouthRadius));
  return Math.max(Math.min(CUP_LIP_HEIGHT, room), 0);
}
