import type { Vec3 } from './body';
import { KENDAMA_LAYOUT, SPIKE_EXPOSED, spikeHeightAtRadius } from './kendama-geometry';

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

  /**
   * The big hole faces the bottom of the neutral frame. Where its mouth
   * *is* is `TAMA_HOLE_MOUTH_LOCAL` below — boring the hole cuts the ball
   * off short of the pole, so the two are not the same point.
   */
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
   * **Bored to the length of the ken's spike**, because that is how a real
   * pair is made — the tip reaches the bottom of the bore at the same moment
   * the ball's rim reaches the sarado. Derived rather than chosen so the two
   * cannot drift: lengthen the spike and the hole follows it.
   *
   * The ball is what limits how far that can go. `tama-geometry.test.ts`
   * holds the cavity clear of the string hole with real wood between them.
   */
  holeDepth: SPIKE_EXPOSED,

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

/**
 * The plane the big hole actually opens on, which is **not** the bottom pole.
 *
 * Boring a hole of `holeRadius` into a ball cuts it off short of the pole —
 * the same chord across a sphere that seats a tama on a cup rim, read from
 * the other side. The difference is only 0.016, and it did not matter while
 * a landed ball floated clear of the ken; it matters now that the ball is
 * meant to touch the sarado, because the pole is 0.016 of thin air below the
 * lowest wood on the ball.
 *
 * `Tama` cuts the sphere here and `TAMA_SOCKETS.hole` sits here, so the mesh
 * and the mate cannot disagree about where the opening is.
 */
export const TAMA_HOLE_MOUTH_Y = -Math.sqrt(TAMA_LAYOUT.radius ** 2 - TAMA_LAYOUT.holeRadius ** 2);

/** The big hole's mouth, on its own axis at the plane it truly opens on. */
export const TAMA_HOLE_MOUTH_LOCAL: Vec3 = [0, TAMA_HOLE_MOUTH_Y, 0];

/**
 * The hole is bored in **two stages**, the way a real tama's is: a wide one
 * at the mouth that takes the body of the spike, then a narrower one that
 * carries on for the point.
 *
 * It is not decoration. A spike this long bored at full width the whole way
 * would hollow the ball into a shell — the narrow stage is what buys the
 * depth back, and it is why the bore can match the spike at all.
 */
export const TAMA_BORE_TIP_RADIUS = 0.042;

/** How much the narrow bore is cut wider than the spike it takes. */
export const TAMA_BORE_CLEARANCE = 0.006;

/**
 * How deep the wide bore runs before it steps down, measured from the mouth.
 *
 * **Derived from the ken**, not chosen: the step goes exactly where the spike
 * has tapered down to what the narrow bore can clear. Cut it any shallower
 * and the spike fouls the step; any deeper and the narrow stage is not
 * earning the wood it saves.
 */
export const TAMA_BORE_STEP_DEPTH =
  spikeHeightAtRadius(TAMA_BORE_TIP_RADIUS - TAMA_BORE_CLEARANCE) - KENDAMA_LAYOUT.saradoTop;
