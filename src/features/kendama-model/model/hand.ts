import { GRAVITY } from './string-sim';
import type { Quat } from './stringing';
import { addRotation, rotationBetween } from './vec';
import type { Vec3 } from './views';

/**
 * The player's hand as a rigid body with human limits: where it holds the
 * ken (at the sarado) and how the wrist turns it. A trick controller decides
 * a linear and an angular acceleration; the hand clamps both and integrates.
 * That keeps every trick honest: a controller cannot teleport the ken under
 * the ball or snap it to a new angle, only move it as fast as an arm, a
 * knee bend and a wrist can.
 *
 * Millimetres, radians and seconds, like the string simulation.
 */
export type Hand = {
  position: Vec3;
  velocity: Vec3;
  /** The ken's orientation, as held. */
  orientation: Quat;
  /** World-axis angular velocity, rad/s. */
  angularVelocity: Vec3;
};

export type HandAcceleration = { linear: Vec3; angular: Vec3 };

/** About what a quick wrist-and-knee pop reaches. */
export const HAND_MAX_ACCELERATION = 3 * GRAVITY;
export const HAND_MAX_SPEED = 4000;
/**
 * A fast wrist flick turns a quarter turn in well under a tenth of a
 * second; these allow that and no more.
 */
export const WRIST_MAX_ANGULAR_ACCELERATION = 400;
export const WRIST_MAX_ANGULAR_SPEED = 30;

export function restingHand(position: Vec3, orientation: Quat): Hand {
  return { position, velocity: [0, 0, 0], orientation, angularVelocity: [0, 0, 0] };
}

/** One semi-implicit Euler step, each acceleration clamped to the hand's limits. */
export function moveHand(hand: Hand, { linear, angular }: HandAcceleration, h: number): Hand {
  const a = clampLength(linear, HAND_MAX_ACCELERATION);
  const velocity = clampLength(
    [hand.velocity[0] + a[0] * h, hand.velocity[1] + a[1] * h, hand.velocity[2] + a[2] * h],
    HAND_MAX_SPEED,
  );
  const alpha = clampLength(angular, WRIST_MAX_ANGULAR_ACCELERATION);
  const angularVelocity = clampLength(
    [
      hand.angularVelocity[0] + alpha[0] * h,
      hand.angularVelocity[1] + alpha[1] * h,
      hand.angularVelocity[2] + alpha[2] * h,
    ],
    WRIST_MAX_ANGULAR_SPEED,
  );
  const orientation = [...hand.orientation];
  addRotation(orientation, angularVelocity[0] * h, angularVelocity[1] * h, angularVelocity[2] * h);
  return {
    position: [
      hand.position[0] + velocity[0] * h,
      hand.position[1] + velocity[1] * h,
      hand.position[2] + velocity[2] * h,
    ],
    velocity,
    orientation: [orientation[0], orientation[1], orientation[2], orientation[3]],
    angularVelocity,
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

const turn = [0, 0, 0];

/**
 * `trackAxis` for the wrist: critically damped angular acceleration that
 * turns the ken toward `target` the short way round and stops there.
 */
export function trackOrientation(hand: Hand, target: Quat, omega: number): Vec3 {
  rotationBetween(hand.orientation, target, turn);
  const w = hand.angularVelocity;
  return [
    omega * omega * turn[0] - 2 * omega * w[0],
    omega * omega * turn[1] - 2 * omega * w[1],
    omega * omega * turn[2] - 2 * omega * w[2],
  ];
}

function clampLength(v: Vec3, limit: number): Vec3 {
  const length = Math.hypot(v[0], v[1], v[2]);
  if (length <= limit) return v;
  const scale = limit / length;
  return [v[0] * scale, v[1] * scale, v[2] * scale];
}
