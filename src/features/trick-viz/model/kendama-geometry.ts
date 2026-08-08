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
  shaftTop: 0.375,
  shaftBottom: -0.62,
  shaftRadius: 0.08,
  spikeTip: [0, 0.6, 0] as Vec3,

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
 * Length of the spike, from where it leaves the shaft to its tip.
 *
 * Derived rather than restated: `Ken` builds the cone from the same two
 * numbers, and the tama's cavity has to be at least this deep for a landed
 * spike to disappear inside it.
 */
export const SPIKE_LENGTH = KENDAMA_LAYOUT.spikeTip[1] - KENDAMA_LAYOUT.shaftTop;

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
