import { localDirectionToWorld, type BodyPose, type Vec3 } from './body';
import { KENDAMA_LAYOUT } from './kendama-geometry';
import type { TrickState } from './timeline';

/**
 * A rough radius for the ken around its pose origin, so framing accounts for
 * the model itself and not only the tama.
 */
export const KEN_REACH = 0.9;

/** Fraction of headroom left around the action. */
const MARGIN = 1.15;

/** How far above the action the camera sits, relative to its lateral offset. */
const ELEVATION = 0.32;

export type Framing = {
  position: Vec3;
  target: Vec3;
};

/**
 * Where the camera watches a trick from, derived from how the ken is held.
 *
 * A player watches the *inside* of the ken — the face the string exits — and
 * the tama swings up on that same side. Viewing from the opposite side puts
 * the ken between the camera and the action, so the catch happens behind the
 * model. Composing the direction from the pose keeps that true for any grip
 * instead of encoding one trick's answer as a constant.
 */
export function viewDirectionFor(pose: BodyPose, stringHoleLocal: Vec3): Vec3 {
  // The base cup opens toward the player, so that is the near side.
  const playerSide = localDirectionToWorld([0, -1, 0], pose);

  // The string hole's offset off the shaft axis is the side it exits on.
  const lateralLocal: Vec3 = [stringHoleLocal[0], 0, stringHoleLocal[2]];
  const hasLateral = Math.hypot(lateralLocal[0], lateralLocal[2]) > 1e-6;
  const stringSide = hasLateral
    ? localDirectionToWorld(lateralLocal, pose)
    : ([0, 0, 0] as Vec3);

  const horizontal: [number, number] = [
    playerSide[0] + stringSide[0],
    playerSide[2] + stringSide[2],
  ];

  // With the ken upright — airplane, pull up spike — the base cup opens
  // straight down and contributes no horizontal hint at all, so the shot
  // collapses onto the string side alone. That is the *same* side the free
  // body swings clear on, which means watching the throw end-on: the arc
  // that makes the trick legible happens directly toward the camera and
  // reads as nothing moving. Turning a quarter round off that axis gives
  // the three-quarter view the other grips get for free.
  const playerSideIsVertical = Math.hypot(playerSide[0], playerSide[2]) < 1e-3;
  if (playerSideIsVertical && hasLateral) {
    const cos = Math.SQRT1_2;
    return [
      horizontal[0] * cos + horizontal[1] * cos,
      ELEVATION,
      -horizontal[0] * cos + horizontal[1] * cos,
    ];
  }

  return [horizontal[0], ELEVATION, horizontal[1]];
}

/**
 * The camera direction for a moment in a trick.
 *
 * Always read off the *ken*, whether or not the ken is the body being held:
 * the anatomy this composition understands — a base cup that opens toward
 * the player, a string hole on one face — only exists on the ken. Evaluated
 * once per beat rather than per frame, so a grip change pans the shot
 * instead of the camera chasing a body that is mid-flight.
 */
export function viewForState(state: TrickState): Vec3 {
  return viewDirectionFor(state.ken, KENDAMA_LAYOUT.stringHoleLocal);
}

/**
 * Fits the tama and the ken in frame together.
 *
 * Called both for the opening camera and every frame while following the
 * action, so the shot is always sized to what is actually on screen rather
 * than to a box big enough for the whole trick. That distinction matters at
 * a true-scale string: a static fit has to contain the tama hanging far
 * below the ken, leaving most of the frame empty once it is pulled up.
 */
export function frameSubjects(
  tamaCenter: Vec3,
  tamaRadius: number,
  kenCenter: Vec3,
  fovDegrees: number,
  direction: Vec3,
  /** Viewport width / height. Below 1 the horizontal fit is the binding one. */
  aspect = 1,
): Framing {
  const min: [number, number, number] = [0, 0, 0];
  const max: [number, number, number] = [0, 0, 0];

  for (let axis = 0; axis < 3; axis += 1) {
    min[axis] = Math.min(tamaCenter[axis] - tamaRadius, kenCenter[axis] - KEN_REACH);
    max[axis] = Math.max(tamaCenter[axis] + tamaRadius, kenCenter[axis] + KEN_REACH);
  }

  const target: Vec3 = [
    (min[0] + max[0]) / 2,
    (min[1] + max[1]) / 2,
    (min[2] + max[2]) / 2,
  ];

  // `fov` is the vertical field of view; the horizontal one narrows with the
  // aspect ratio. A tall, narrow viewport therefore runs out of width long
  // before height, so both fits have to be computed and the looser one wins.
  const halfFov = (fovDegrees * Math.PI) / 180 / 2;
  const tanVertical = Math.tan(halfFov);
  const tanHorizontal = tanVertical * aspect;

  const halfHeight = (max[1] - min[1]) / 2;
  const halfWidth = Math.max(max[0] - min[0], max[2] - min[2]) / 2;
  const distance =
    Math.max(halfHeight / tanVertical, halfWidth / tanHorizontal) * MARGIN;

  const length = Math.hypot(...direction) || 1;
  return {
    target,
    position: [
      target[0] + (direction[0] / length) * distance,
      target[1] + (direction[1] / length) * distance,
      target[2] + (direction[2] / length) * distance,
    ],
  };
}
