import type { Vec3 } from "./keyframes";

/**
 * Shared layout constants for the primitive-built kendama model and its
 * trick keyframes, so trick authors can reference cup/spike positions
 * without duplicating magic numbers.
 *
 * Anatomy (facing the kendama, string hole toward the viewer): the spike
 * sits at the top, where the dama rests. Just below it, the serato
 * (crosspiece) forms a T — big cup on the right arm facing right, small
 * cup on the left arm facing left. The handle descends from the serato
 * to the base cup at the very bottom, facing down/outward. Each cup's
 * neck radius matches the shaft it tapers from (the serato bar for the
 * side cups, the handle for the base cup) so the taper reads as one
 * continuous piece of wood rather than a shaft poking through a cap.
 */
export const KENDAMA_LAYOUT = {
  seratoY: 0.1,
  handleTop: 0.375,
  handleBottom: -0.62,
  handleRadius: 0.08,
  spikeTip: [0, 0.6, 0] as Vec3,

  seratoBarRadius: 0.08,
  seratoBarHalfSpan: 0.2,

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

  // Where the dama comes to rest when caught in the big cup, used by the
  // Big Cup trick's landing keyframe.
  bigCupRest: [0.58, 0.14, 0] as Vec3,
  tamaRadius: 0.25,
  stringRestLength: 0.7,
};
