import { Vector3 } from 'three';

/**
 * A tapered capsule: the segment `a`→`b` swept by a radius that lerps from
 * `radiusA` to `radiusB`. One primitive covers every part of the ken — the
 * shaft and serato bar are untapered, the spike tapers to a point, and a
 * cup tapers from its neck to its mouth.
 *
 * It treats a cup as solid rather than hollow, so the string drapes over a
 * cup instead of dipping inside it. That's the right call here: the string
 * never needs to sit in a cup, and a hollow collider would let it slip
 * through the wall.
 */
export type Capsule = {
  a: Vector3;
  b: Vector3;
  radiusA: number;
  radiusB: number;
};

/**
 * Downward acceleration in scene units.
 *
 * True gravity would be ~75 units/s² at this model's scale (1 unit ≈ 13cm),
 * which whips the string faster than the eye can follow on a 2.2s trick.
 * This is deliberately slack-tuned so the drape reads as rope.
 */
const GRAVITY = 26;

/** Bleeds off velocity so the rope settles instead of oscillating forever. */
const DAMPING = 0.96;

/** Largest timestep we'll integrate; a tab-switch stall must not explode. */
const MAX_DT = 1 / 30;

export type RopeState = {
  positions: Vector3[];
  previous: Vector3[];
  /** Fixed distance between neighbours — the rope is inextensible. */
  segmentLength: number;
};

/**
 * Builds a rope laid out straight from `anchor` to `end`, so the first
 * frame starts from a sane pose rather than settling out of a tangle.
 */
export function createRope(
  particleCount: number,
  anchor: Vector3,
  end: Vector3,
  totalLength: number,
): RopeState {
  const positions: Vector3[] = [];
  const previous: Vector3[] = [];

  for (let i = 0; i < particleCount; i += 1) {
    const t = i / (particleCount - 1);
    const point = new Vector3().lerpVectors(anchor, end, t);
    positions.push(point);
    previous.push(point.clone());
  }

  return { positions, previous, segmentLength: totalLength / (particleCount - 1) };
}

// Scratch vectors, reused across every call to keep the per-frame solve
// free of allocation.
const delta = new Vector3();
const ab = new Vector3();
const ap = new Vector3();
const closest = new Vector3();
const push = new Vector3();

/**
 * Pushes `point` out to the surface of `capsule` if it has sunk inside.
 *
 * The radius is interpolated along the axis, which approximates a cone by
 * its axis-nearest point rather than its true slant surface. The error is
 * a fraction of the taper and invisible at string thickness.
 */
function resolveCapsule(point: Vector3, capsule: Capsule, skin: number): void {
  ab.subVectors(capsule.b, capsule.a);
  const lengthSq = ab.lengthSq();
  const t = lengthSq === 0 ? 0 : Math.min(1, Math.max(0, ap.subVectors(point, capsule.a).dot(ab) / lengthSq));

  closest.copy(capsule.a).addScaledVector(ab, t);
  const radius = capsule.radiusA + (capsule.radiusB - capsule.radiusA) * t + skin;

  push.subVectors(point, closest);
  const distance = push.length();
  if (distance >= radius) return;

  // Dead centre on the axis has no escape direction; any is as good.
  if (distance < 1e-6) push.set(0, 1, 0);
  else push.divideScalar(distance);

  point.copy(closest).addScaledVector(push, radius);
}

function resolveSphere(point: Vector3, center: Vector3, radius: number): void {
  push.subVectors(point, center);
  const distance = push.length();
  if (distance >= radius) return;

  if (distance < 1e-6) push.set(0, 1, 0);
  else push.divideScalar(distance);

  point.copy(center).addScaledVector(push, radius);
}

export type RopeStepOptions = {
  /** Pinned first particle: the string hole, in world space. */
  anchor: Vector3;
  /** Pinned last particle: where the string meets the tama. */
  end: Vector3;
  /** Ken colliders, already transformed into world space. */
  colliders: readonly Capsule[];
  tamaCenter: Vector3;
  tamaRadius: number;
  /** Half the string's thickness, kept clear of every surface. */
  skin: number;
  dt: number;
  /** Constraint/collision passes. More is stiffer and less stretchy. */
  iterations?: number;
};

/**
 * Advances the rope one frame: verlet integration, then alternating
 * distance-constraint and collision passes.
 *
 * Interleaving the two matters. Solving all the distances and then all the
 * collisions lets the last collision push leave the rope stretched; running
 * them together each pass converges on a rope that is both the right length
 * and outside the ken.
 */
export function stepRope(rope: RopeState, options: RopeStepOptions): void {
  const { anchor, end, colliders, tamaCenter, tamaRadius, skin, iterations = 10 } = options;
  const { positions, previous, segmentLength } = rope;
  const count = positions.length;

  const dt = Math.min(options.dt, MAX_DT);
  const gravityStep = GRAVITY * dt * dt;

  for (let i = 1; i < count - 1; i += 1) {
    const point = positions[i];
    const prior = previous[i];

    const vx = (point.x - prior.x) * DAMPING;
    const vy = (point.y - prior.y) * DAMPING;
    const vz = (point.z - prior.z) * DAMPING;

    prior.copy(point);
    point.set(point.x + vx, point.y + vy - gravityStep, point.z + vz);
  }

  pinEnds(rope, anchor, end);

  for (let pass = 0; pass < iterations; pass += 1) {
    for (let i = 0; i < count - 1; i += 1) {
      const head = positions[i];
      const tail = positions[i + 1];

      delta.subVectors(tail, head);
      const distance = delta.length();
      if (distance === 0) continue;

      const correction = (distance - segmentLength) / distance;
      const headPinned = i === 0;
      const tailPinned = i + 1 === count - 1;

      if (headPinned && tailPinned) continue;
      if (headPinned) {
        tail.addScaledVector(delta, -correction);
      } else if (tailPinned) {
        head.addScaledVector(delta, correction);
      } else {
        head.addScaledVector(delta, correction * 0.5);
        tail.addScaledVector(delta, -correction * 0.5);
      }
    }

    for (let i = 1; i < count - 1; i += 1) {
      const point = positions[i];
      for (const capsule of colliders) resolveCapsule(point, capsule, skin);
      resolveSphere(point, tamaCenter, tamaRadius + skin);
    }
  }

  pinEnds(rope, anchor, end);
}

/**
 * Closer than this and two particles are treated as one point.
 *
 * A slack rope folds, and folding lets neighbours land on top of each
 * other. A zero-length segment gives CatmullRomCurve3 a zero tangent,
 * which turns its arc-length table into NaN and makes the tube sample
 * `points[NaN]`. Collapsing coincident points keeps the curve well-formed
 * without constraining how the rope is allowed to fold.
 */
const MIN_POINT_SPACING = 2e-3;

/**
 * The rope's particles reduced to a curve-safe point list: coincident
 * neighbours dropped, endpoints always kept. Returns undefined if any
 * particle has gone non-finite, which is the caller's cue to reset.
 */
export function toCurvePoints(
  positions: readonly Vector3[],
  anchor: Vector3,
  end: Vector3,
): Vector3[] | undefined {
  const points: Vector3[] = [];

  for (const point of positions) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(point.z)) {
      return undefined;
    }
    const previous = points[points.length - 1];
    if (previous && previous.distanceTo(point) < MIN_POINT_SPACING) continue;
    points.push(point.clone());
  }

  // The tama end must survive the filter, or the string stops short of it.
  const last = points[points.length - 1];
  if (!last || last.distanceTo(end) > MIN_POINT_SPACING) points.push(end.clone());
  else last.copy(end);

  if (points.length < 2) return [anchor.clone(), end.clone()];
  return points;
}

function pinEnds(rope: RopeState, anchor: Vector3, end: Vector3): void {
  const { positions, previous } = rope;
  const last = positions.length - 1;

  positions[0].copy(anchor);
  previous[0].copy(anchor);
  positions[last].copy(end);
  previous[last].copy(end);
}
