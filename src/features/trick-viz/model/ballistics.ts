import { Vector3 } from 'three';

import type { Vec3 } from './body';

/**
 * Downward acceleration used to time tricks, in scene units per second².
 *
 * Deliberately far below real gravity (~75 units/s² at this model's scale)
 * and below the rope solver's own tuned 26 — this is a slow-motion trick
 * playback, because a real Big Cup takes well under a second and the point
 * of the visualization is that the geometry is legible.
 *
 * What matters is that it is *a* gravity rather than a set of hand-typed
 * durations: toss length then scales as √height automatically, so a big toss
 * and a small one sitting next to each other in a sequence keep their
 * relative timing right. The absolute value is a style knob, calibrated so
 * Big Cup's flight lands at the ~1.7s that was tuned and verified by eye.
 */
export const TRICK_GRAVITY = 4.4;

export type TossArc = {
  /** Seconds the flight takes, derived from how high it goes. */
  duration: number;
  /** Where in the flight the apex falls, 0-1. */
  apexU: number;
  apexY: number;
  /** Parabola steepness, fixed by requiring the curve to pass through launch. */
  fall: number;
  launch: Vec3;
  land: Vec3;
  /** World offset at the widest point of the lateral swing. */
  swing: Vec3;
};

export type TossOptions = {
  launch: Vec3;
  land: Vec3;
  /** How far above the higher endpoint the tama peaks. */
  apexRise: number;
  /** World offset at mid-flight. Zero for a straight vertical toss. */
  swing?: Vec3;
};

/**
 * Solves one ballistic flight.
 *
 * Under constant gravity the time to cover a height goes as its square root,
 * so a long climb from a hanging tama takes far longer than the short drop
 * into a cup and the peak sits late — around u ≈ 0.77 for Big Cup. Deriving
 * that split keeps rise and fall consistent with each other instead of
 * asking a keyframe to guess a value that looks right.
 */
export function tossArc({ launch, land, apexRise, swing = [0, 0, 0] }: TossOptions): TossArc {
  const apexY = Math.max(launch[1], land[1]) + apexRise;
  const rise = Math.sqrt((2 * (apexY - launch[1])) / TRICK_GRAVITY);
  const drop = Math.sqrt((2 * (apexY - land[1])) / TRICK_GRAVITY);
  const duration = rise + drop;
  const apexU = duration === 0 ? 0.5 : rise / duration;

  return {
    duration,
    apexU,
    apexY,
    fall: apexU === 0 ? 0 : (apexY - launch[1]) / apexU ** 2,
    launch,
    land,
    swing,
  };
}

function smoothstep(u: number): number {
  return u * u * (3 - 2 * u);
}

/**
 * The flight, as one continuous function rather than a chain of poses.
 *
 * Vertical is a single parabola whose endpoints are provably exactly the
 * launch and the landing — the √ terms in the apex split cancel — so there
 * is no seam where the flight hands off to whatever follows. Lateral is an
 * independent smooth swing out and back, peaking mid-flight so the tama is
 * at its widest exactly when it passes the ken.
 *
 * Driving the two axes separately is what makes the movement read as one
 * gesture: neither has to pause for the other to catch up. Do not
 * "improve" this by reintroducing eased waypoints — every easing that
 * starts or ends at zero velocity puts a stall at that keyframe, and a path
 * built from several eased hops reads as a series of steps.
 */
export function tossPositionAt(arc: TossArc, u: number): Vec3 {
  const blend = smoothstep(u);
  const wide = Math.sin(Math.PI * u);

  return [
    arc.launch[0] + (arc.land[0] - arc.launch[0]) * blend + arc.swing[0] * wide,
    arc.apexY - arc.fall * (u - arc.apexU) ** 2,
    arc.launch[2] + (arc.land[2] - arc.launch[2]) * blend + arc.swing[2] * wide,
  ];
}

/**
 * Which way the free body swings clear on its way past the held one.
 *
 * Two constraints decide this, and both were learned by getting them wrong.
 * It must swing on the **side the string exits**: the string leaves one face
 * of the shaft, so a tama that rises on the far side drags it around the
 * outside of the ken and ends up wrapped over the sarado. And it must swing
 * **across** the ken rather than along it, since the ken's own length is the
 * obstacle being cleared.
 *
 * Taking both from the pose — the string hole's own offset, with the
 * component along the ken's axis projected out — means neither has to be
 * restated per trick, and both stay right if the hole or the grip moves.
 */
export function swingDirection(stringHoleOffset: Vec3, bodyAxisWorld: Vec3): Vec3 {
  const axis = new Vector3(...bodyAxisWorld).normalize();
  const side = new Vector3(stringHoleOffset[0], 0, stringHoleOffset[2]);

  // Remove whatever part of the string-hole offset runs along the ken, so
  // what's left is purely "which side", then flatten again since projecting
  // out a tilted axis can reintroduce height.
  side.addScaledVector(axis, -side.dot(axis));
  side.y = 0;

  if (side.lengthSq() < 1e-9) {
    // The hole sits on the ken's own axis: no side is implied, so pick the
    // horizontal perpendicular rather than returning a zero swing.
    const fallback = new Vector3(-axis.z, 0, axis.x);
    if (fallback.lengthSq() < 1e-9) return [1, 0, 0];
    return fallback.normalize().toArray() as unknown as Vec3;
  }

  side.normalize();
  return [side.x, 0, side.z];
}
