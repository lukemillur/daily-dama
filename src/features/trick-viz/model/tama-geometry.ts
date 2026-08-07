import type { Vec3 } from './body';

/**
 * The tama (ball), in its own neutral local frame: the spike hole faces
 * straight up (+Y).
 *
 * The tama used to be a bare radius hanging off `KENDAMA_LAYOUT` with no
 * orientation, which is fine while every trick catches it in a cup — a
 * sphere seated on a rim looks the same whichever way it is turned. It stops
 * being fine at the first spike trick, where the hole has to line up with
 * the spike, and at the first spin trick, where the player can see it turn.
 * So the tama gets the same treatment as the ken: a fixed local frame plus a
 * pose.
 */
export const TAMA_LAYOUT = {
  radius: 0.25,

  /** The spike hole, centred on the surface at the top of the neutral frame. */
  holeLocal: [0, 0.25, 0] as Vec3,
  holeAxisLocal: [0, 1, 0] as Vec3,
  holeRadius: 0.04,

  /**
   * How far the spike tip sits inside the hole when the tama is speared.
   *
   * Not the full bore depth — a real tama is only ever a little way down the
   * spike, and burying the tip deeper reads as the ball swallowing the ken.
   */
  holeDepth: 0.12,
};
