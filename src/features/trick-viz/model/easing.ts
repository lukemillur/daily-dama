export type Easing = (t: number) => number;

export const linear: Easing = (t) => t;

export const easeInOutQuad: Easing = (t) =>
  t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;

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

export const smoothstep: Easing = (t) => t * t * (3 - 2 * t);

/**
 * A note on where easings belong.
 *
 * These shape the *held* body's gestures — a hand loading, rising to meet a
 * catch, cushioning it. They must not be used to chain a free body's flight
 * together out of eased hops: every easing that starts or ends at zero
 * velocity puts a stall at that boundary, and two of them back to back is
 * how the tama came to a complete stop twice mid-flight. Free-body motion
 * comes from `ballistics.ts` as one continuous function instead.
 */
export function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}
