export type Vec3 = readonly [number, number, number];

export type Keyframe = {
  /** Normalized time in the trick, 0 to 1. */
  t: number;
  position: Vec3;
  rotation?: Vec3;
};

export type Easing = (t: number) => number;

export const easeInOutQuad: Easing = (t) =>
  t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;

export const linear: Easing = (t) => t;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

/**
 * Samples position/rotation at normalized time `t` by finding the surrounding
 * keyframe pair and interpolating between them with the given easing.
 */
export function sampleAtTime(
  keyframes: readonly Keyframe[],
  t: number,
  easing: Easing = easeInOutQuad,
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
  const localT = span === 0 ? 0 : easing((clamped - from.t) / span);

  return {
    position: lerpVec3(from.position, to.position, localT),
    rotation: lerpVec3(from.rotation ?? [0, 0, 0], to.rotation ?? [0, 0, 0], localT),
  };
}
