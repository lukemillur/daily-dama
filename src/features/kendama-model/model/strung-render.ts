import { CatmullRomCurve3, Quaternion, TubeGeometry, Vector3, type Mesh, type Object3D } from 'three';

import { STRING_RADIUS, stringHoleInsideLocal, TAMA_STRING_INSIDE, type Handedness } from './stringing';
import type { RoutineId } from './tricks';
import { rotate } from './vec';
import { MM } from './views';

/**
 * How a run starts: hanging still, dropped from the hand, a routine of
 * tricks, or Airplane, the one trick where the hand holds the tama.
 */
export type StrungLayout = 'hanging' | 'drop' | RoutineId | 'airplane';

/** Both bodies' poses, whichever one the hand holds. */
export type StrungPoses = {
  handedness: Handedness;
  kenPosition: ArrayLike<number>;
  kenQuaternion: ArrayLike<number>;
  tamaPosition: ArrayLike<number>;
  tamaQuaternion: ArrayLike<number>;
};

/** Where the camera sits and what it looks at, in scene units. */
export type Framing = {
  position: readonly [number, number, number];
  target: readonly [number, number, number];
};

/**
 * Behind the player's right shoulder, looking where they look, and far
 * enough back to keep both the hanging ball and a Big Cup's flight above
 * the hand in frame.
 */
export const HELD_KEN_FRAMING: Framing = { position: [2.9, 1.9, 13.6], target: [-0.2, -0.6, 0] };

/**
 * The same view, further back and further out: Airplane spans the ken
 * hanging 400 mm below the hand to turning over 400 mm above it, carried a
 * forearm's length forward. Aimed low, so the action sits above the
 * sandbox's controls, which cover the bottom of the view.
 */
export const HELD_TAMA_FRAMING: Framing = { position: [5.1, 3.1, 21.1], target: [-0.2, -1.1, -2] };

/**
 * The same view, further back and aimed higher: Base Cup's pull carries the
 * hand about 300 mm up while the ken turns over, with the base cup 105 mm
 * above it, and that turn is the part worth seeing.
 */
export const BASE_CUP_FRAMING: Framing = { position: [4.1, 3.5, 19], target: [-0.2, 0, 0] };

export function framingFor(layout: StrungLayout): Framing {
  if (layout === 'airplane') return HELD_TAMA_FRAMING;
  if (layout === 'base-cup') return BASE_CUP_FRAMING;
  return HELD_KEN_FRAMING;
}

/** The parts of drei's OrbitControls a framing change touches. */
type Orbit = { target: Vector3; update: () => void };

function isOrbit(controls: unknown): controls is Orbit {
  return typeof controls === 'object' && controls !== null && 'target' in controls && 'update' in controls;
}

/**
 * Moves the camera, and the orbit's centre with it, to `framing`. False
 * when the orbit controls have not mounted yet, so the caller tries again.
 */
export function applyFraming(camera: Object3D, controls: unknown, framing: Framing): boolean {
  if (!isOrbit(controls)) return false;
  camera.position.set(...framing.position);
  controls.target.set(...framing.target);
  controls.update();
  return true;
}

/** Where the ball is held before a drop: in front of the player, past the base cup. */
export const DROP_TAMA_CENTRE = [0, 30, 140] as const;

const scratch = [0, 0, 0];

/**
 * The string as a render curve, in scene units, from `points` running ken
 * hole to ball hole. Starts and ends a few mm inside the two holes so it
 * visibly disappears into the wood rather than stopping on the surface.
 */
export function stringCurve(sim: StrungPoses, points: readonly number[][]): CatmullRomCurve3 {
  const curve: Vector3[] = [];

  const inside = stringHoleInsideLocal(sim.handedness);
  rotate(sim.kenQuaternion, inside[0], inside[1], inside[2], scratch);
  curve.push(
    new Vector3(
      (scratch[0] + sim.kenPosition[0]) * MM,
      (scratch[1] + sim.kenPosition[1]) * MM,
      (scratch[2] + sim.kenPosition[2]) * MM,
    ),
  );

  let last: Vector3 | undefined;
  for (const [x, y, z] of points) {
    const next = new Vector3(x * MM, y * MM, z * MM);
    // A slack string can fold particles onto each other, and a zero-length
    // span gives the tube a NaN tangent.
    if (last && last.distanceToSquared(next) < 1e-10) continue;
    curve.push(next);
    last = next;
  }

  rotate(sim.tamaQuaternion, TAMA_STRING_INSIDE[0], TAMA_STRING_INSIDE[1], TAMA_STRING_INSIDE[2], scratch);
  curve.push(
    new Vector3(
      (scratch[0] + sim.tamaPosition[0]) * MM,
      (scratch[1] + sim.tamaPosition[1]) * MM,
      (scratch[2] + sim.tamaPosition[2]) * MM,
    ),
  );

  return new CatmullRomCurve3(curve, false, 'centripetal');
}

/** Writes both bodies' simulated poses, in mm, into their scene groups. */
export function placeBodies(ken: Object3D, tama: Object3D, sim: StrungPoses): void {
  ken.position.set(sim.kenPosition[0] * MM, sim.kenPosition[1] * MM, sim.kenPosition[2] * MM);
  ken.quaternion.set(sim.kenQuaternion[0], sim.kenQuaternion[1], sim.kenQuaternion[2], sim.kenQuaternion[3]);
  tama.position.set(sim.tamaPosition[0] * MM, sim.tamaPosition[1] * MM, sim.tamaPosition[2] * MM);
  tama.quaternion.set(sim.tamaQuaternion[0], sim.tamaQuaternion[1], sim.tamaQuaternion[2], sim.tamaQuaternion[3]);
}

/** Swaps the string mesh's tube for one along `curve`, freeing the old one. */
export function replaceString(string: Mesh, curve: CatmullRomCurve3): void {
  const next = new TubeGeometry(curve, 160, STRING_RADIUS * MM, 6, false);
  string.geometry.dispose();
  string.geometry = next;
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
