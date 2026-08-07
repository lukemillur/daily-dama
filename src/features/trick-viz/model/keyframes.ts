export type Vec3 = readonly [number, number, number];

export type Keyframe = {
  /** Normalized time in the trick, 0 to 1. */
  t: number;
  position: Vec3;
  rotation?: Vec3;
  /**
   * Easing for the segment *arriving at* this keyframe. Falls back to the
   * sequence default, so only segments that need a specific feel (a toss
   * decelerating under gravity, a catch cushioning) have to say so.
   */
  easing?: Easing;
};

export type Easing = (t: number) => number;

export const easeInOutQuad: Easing = (t) =>
  t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;

export const linear: Easing = (t) => t;

/**
 * Decelerating — the shape of a body rising against gravity. Quadratic
 * because constant acceleration traces a parabola, so this is physically
 * right for a toss rather than merely a stylistic choice.
 */
export const easeOutQuad: Easing = (t) => 1 - (1 - t) ** 2;

/** Accelerating: the falling half of that same parabola. */
export const easeInQuad: Easing = (t) => t * t;

/** Soft arrival, for settles and catch cushions. */
export const easeOutCubic: Easing = (t) => 1 - (1 - t) ** 3;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

/**
 * Bakes a continuous path into evenly spaced keyframes.
 *
 * Some motion is better written as a formula than as poses — a toss under
 * gravity is one parabola, not a set of waypoints. Sampling it densely and
 * interpolating linearly reproduces the curve exactly, and sidesteps the
 * trap that eased segments create: every easing that starts or ends at zero
 * velocity puts a stall at that keyframe, so a path built from several eased
 * hops reads as a series of steps rather than one movement.
 */
export function bakeKeyframes(
  from: number,
  to: number,
  steps: number,
  at: (t: number) => Vec3,
): Keyframe[] {
  const baked: Keyframe[] = [];

  for (let i = 0; i <= steps; i += 1) {
    const t = from + ((to - from) * i) / steps;
    baked.push({ t, position: at(t), easing: linear });
  }

  return baked;
}

/**
 * Samples position/rotation at normalized time `t` by finding the surrounding
 * keyframe pair and interpolating between them. Each segment uses the easing
 * declared on the keyframe it arrives at, falling back to `defaultEasing`.
 */
export function sampleAtTime(
  keyframes: readonly Keyframe[],
  t: number,
  defaultEasing: Easing = easeInOutQuad,
): { position: Vec3; rotation: Vec3 } {
  const clamped = Math.min(Math.max(t, keyframes[0].t), keyframes.at(-1)!.t);

  let from = keyframes[0];
  let to = keyframes[keyframes.length - 1];
  for (let i = 0; i < keyframes.length - 1; i += 1) {
    if (clamped >= keyframes[i].t && clamped <= keyframes[i + 1].t) {
      from = keyframes[i];
      to = keyframes[i + 1];
      break;
    }
  }

  const span = to.t - from.t;
  const ease = to.easing ?? defaultEasing;
  const localT = span === 0 ? 0 : ease((clamped - from.t) / span);

  return {
    position: lerpVec3(from.position, to.position, localT),
    rotation: lerpVec3(from.rotation ?? [0, 0, 0], to.rotation ?? [0, 0, 0], localT),
  };
}
