import { CatmullRomCurve3, Quaternion, Vector3 } from 'three';

import { stringPoints, type StringSim } from './string-sim';
import type { RoutineId } from './tricks';
import { stringHoleInsideLocal, TAMA_STRING_INSIDE } from './stringing';
import { rotate } from './vec';
import { MM } from './views';

/** How a run starts: hanging still, dropped from the hand, or a routine of tricks. */
export type StrungLayout = 'hanging' | 'drop' | RoutineId;

/** Where the ball is held before a drop: in front of the player, past the base cup. */
export const DROP_TAMA_CENTRE = [0, 30, 140] as const;

const scratch = [0, 0, 0];

/**
 * The string as a render curve, in scene units. Starts and ends a few mm
 * inside the two holes so it visibly disappears into the wood rather than
 * stopping on the surface.
 */
export function stringCurve(sim: StringSim): CatmullRomCurve3 {
  const points: Vector3[] = [];

  const inside = stringHoleInsideLocal(sim.handedness);
  rotate(sim.kenQuaternion, inside[0], inside[1], inside[2], scratch);
  points.push(
    new Vector3(
      (scratch[0] + sim.kenPosition[0]) * MM,
      (scratch[1] + sim.kenPosition[1]) * MM,
      (scratch[2] + sim.kenPosition[2]) * MM,
    ),
  );

  let last: Vector3 | undefined;
  for (const [x, y, z] of stringPoints(sim)) {
    const next = new Vector3(x * MM, y * MM, z * MM);
    // A slack string can fold particles onto each other, and a zero-length
    // span gives the tube a NaN tangent.
    if (last && last.distanceToSquared(next) < 1e-10) continue;
    points.push(next);
    last = next;
  }

  rotate(sim.tamaQuaternion, TAMA_STRING_INSIDE[0], TAMA_STRING_INSIDE[1], TAMA_STRING_INSIDE[2], scratch);
  points.push(
    new Vector3(
      (scratch[0] + sim.tamaPosition[0]) * MM,
      (scratch[1] + sim.tamaPosition[1]) * MM,
      (scratch[2] + sim.tamaPosition[2]) * MM,
    ),
  );

  return new CatmullRomCurve3(points, false, 'centripetal');
}

/**
 * Exponential follow, framerate-independent: the hand trails the pointer by
 * about `tau` seconds, so a fast drag swings the ken rather than teleporting
 * it through the ball.
 */
export function followHand(current: Vector3, target: Vector3, delta: number, tau = 0.04): void {
  current.lerp(target, 1 - Math.exp(-delta / tau));
}

/** `followHand` for the wrist: the ken turns after the pointer over about `tau` seconds. */
export function followOrientation(current: Quaternion, target: Quaternion, delta: number, tau = 0.06): void {
  current.slerp(target, 1 - Math.exp(-delta / tau));
}

/** Radians of turn per pixel of a tilt drag. */
const TURN_PER_PIXEL = 0.01;
const WORLD_UP = new Vector3(0, 1, 0);
const turnAboutUp = new Quaternion();
const turnAboutRight = new Quaternion();

/**
 * The orientation a tilt drag asks for: sideways pointer motion turns the
 * ken about the vertical, and up-and-down motion tips it toward or away from
 * the camera, about the camera's own right-hand axis.
 */
export function dragTurn(start: Quaternion, dx: number, dy: number, cameraRight: Vector3, out: Quaternion): void {
  turnAboutUp.setFromAxisAngle(WORLD_UP, dx * TURN_PER_PIXEL);
  turnAboutRight.setFromAxisAngle(cameraRight, dy * TURN_PER_PIXEL);
  out.copy(turnAboutUp).multiply(turnAboutRight).multiply(start);
}
