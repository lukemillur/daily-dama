import { GRAVITY } from './string-sim';
import type { Vec3 } from './views';

/**
 * The player's hand as a point mass with human limits. A trick controller
 * decides an acceleration; the hand clamps it and integrates. That keeps
 * every trick honest: a controller cannot teleport the ken under the ball,
 * only move it as fast as an arm and a knee bend can.
 *
 * Millimetres and seconds, like the string simulation.
 */
export type Hand = { position: Vec3; velocity: Vec3 };

/** About what a quick wrist-and-knee pop reaches. */
export const HAND_MAX_ACCELERATION = 3 * GRAVITY;
export const HAND_MAX_SPEED = 4000;

export function restingHand(position: Vec3): Hand {
  return { position, velocity: [0, 0, 0] };
}

/** One semi-implicit Euler step under `acceleration`, clamped to the hand's limits. */
export function moveHand(hand: Hand, acceleration: Vec3, h: number): Hand {
  const a = clampLength(acceleration, HAND_MAX_ACCELERATION);
  const velocity = clampLength(
    [hand.velocity[0] + a[0] * h, hand.velocity[1] + a[1] * h, hand.velocity[2] + a[2] * h],
    HAND_MAX_SPEED,
  );
  return {
    position: [
      hand.position[0] + velocity[0] * h,
      hand.position[1] + velocity[1] * h,
      hand.position[2] + velocity[2] * h,
    ],
    velocity,
  };
}

/**
 * Critically damped acceleration toward a target moving at `targetVelocity`.
 * `omega` sets how hard the hand chases: settling takes about 5 / omega
 * seconds, with no overshoot.
 */
export function trackAxis(
  position: number,
  velocity: number,
  target: number,
  targetVelocity: number,
  omega: number,
): number {
  return omega * omega * (target - position) + 2 * omega * (targetVelocity - velocity);
}

function clampLength(v: Vec3, limit: number): Vec3 {
  const length = Math.hypot(v[0], v[1], v[2]);
  if (length <= limit) return v;
  const scale = limit / length;
  return [v[0] * scale, v[1] * scale, v[2] * scale];
}
