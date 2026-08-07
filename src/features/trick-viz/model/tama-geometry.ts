import type { Vec3 } from './body';

/**
 * The tama (dama), in its own neutral local frame.
 *
 * Two holes at opposite poles, and the frame is oriented by the big one:
 * the **spike hole faces −Y**, so a tama landed on an upright spike sits at
 * neutral rotation with its painted top upward, which is how it looks in
 * life.
 *
 * - The **big hole (ana)** at the bottom opens into a hollow interior. The
 *   cavity is deep enough to swallow the ken's spike whole — when a spike
 *   is landed, no part of the spike is left showing.
 * - The **string hole** is a much smaller bore at the top. The string
 *   passes through it and is knotted on the inside, so the knot bears
 *   against the cavity and holds the string in place.
 * - The **painted circle** most tamas carry is centred on the string hole,
 *   on top.
 *
 * The first version had none of this: one shallow dimple standing in for
 * the spike hole, the string attached at the ball's centre, and the painted
 * mark on the side. That was survivable while every trick caught the tama
 * in a cup, and wrong as soon as a spike went into it.
 */
export const TAMA_LAYOUT = {
  radius: 0.25,

  /** The big hole, at the bottom pole of the neutral frame. */
  holeLocal: [0, -0.25, 0] as Vec3,
  holeAxisLocal: [0, -1, 0] as Vec3,

  /**
   * Mouth radius of the big hole.
   *
   * True to a real tama (a ~2.1cm hole in a ~6cm ball) and, not by
   * coincidence, a shade wider than the ken's shaft — the hole has to
   * clear the base of the spike for the spike to go all the way in.
   */
  holeRadius: 0.088,

  /**
   * How deep the cavity runs from the mouth.
   *
   * Must be at least the ken's spike length or the spike would bottom out
   * with its base still showing; `mate.ts` clamps the insertion to the
   * smaller of the two, and `tama.test.ts` asserts this one is the larger.
   */
  holeDepth: 0.24,

  /** The string hole, at the top pole. */
  stringHoleLocal: [0, 0.25, 0] as Vec3,
  stringHoleAxisLocal: [0, 1, 0] as Vec3,
  stringHoleRadius: 0.022,

  /** The knot that stops the string pulling back through. */
  knotRadius: 0.032,

  /** The painted circle around the string hole. */
  markRadius: 0.11,
};

/**
 * Half-angle of the painted circle as seen from the tama's centre.
 *
 * The mark is painted *on* a sphere, so it is a spherical cap rather than a
 * flat disc stuck to the top — a disc would cut into the ball at its edges.
 */
export const TAMA_MARK_ANGLE = Math.asin(TAMA_LAYOUT.markRadius / TAMA_LAYOUT.radius);
