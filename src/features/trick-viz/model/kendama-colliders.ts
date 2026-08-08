import { Matrix4, Vector3 } from 'three';

import { cupLipOuterRadius, KENDAMA_LAYOUT } from './kendama-geometry';
import type { Capsule } from './rope';
import type { Vec3 } from './body';

type CupLayout = {
  center: Vec3;
  mouthRadius: number;
  neckRadius: number;
  height: number;
};

/**
 * A cup as a collider: a capsule running from its neck to its mouth along
 * the direction it opens, matching how `Ken` builds the mesh (the cylinder's
 * wide end is the mouth, offset half its height along the opening axis).
 */
function cupCapsule(cup: CupLayout, opensToward: Vec3): Capsule {
  const half = cup.height / 2;
  const axis = new Vector3(...opensToward).normalize();
  const center = new Vector3(...cup.center);

  return {
    a: center.clone().addScaledVector(axis, -half),
    b: center.clone().addScaledVector(axis, half),
    radiusA: cup.neckRadius,
    // The lip, not the aperture: the bead is the widest wood at the mouth and
    // the outermost thing the string can catch on.
    radiusB: cupLipOuterRadius(cup.mouthRadius),
  };
}

/**
 * Collision proxies for the ken, in the same neutral local frame as
 * `KENDAMA_LAYOUT` — derived from those constants rather than restated, so
 * retuning a cup or the shaft moves its collider with it.
 *
 * Six capsules stand in for the whole model. That is coarse next to the
 * rendered mesh, but the string only ever touches the outside, and a handful
 * of analytic primitives is what keeps the per-frame solve cheap.
 */
export const KEN_COLLIDERS: readonly Capsule[] = [
  {
    a: new Vector3(0, KENDAMA_LAYOUT.shaftBottom, 0),
    b: new Vector3(0, KENDAMA_LAYOUT.saradoTop, 0),
    radiusA: KENDAMA_LAYOUT.shaftRadius,
    radiusB: KENDAMA_LAYOUT.shaftRadius,
  },
  {
    // Above the sarado the wood is much thinner than the grip — it has to be,
    // to fit a tama's bore — so this capsule starts at the neck's radius
    // rather than the shaft's.
    a: new Vector3(0, KENDAMA_LAYOUT.saradoTop, 0),
    b: new Vector3(...KENDAMA_LAYOUT.spikeTip),
    radiusA: 0.07,
    radiusB: 0.012,
  },
  {
    a: new Vector3(-KENDAMA_LAYOUT.saradoBarHalfSpan, KENDAMA_LAYOUT.saradoY, 0),
    b: new Vector3(KENDAMA_LAYOUT.saradoBarHalfSpan, KENDAMA_LAYOUT.saradoY, 0),
    radiusA: KENDAMA_LAYOUT.saradoBarRadius,
    radiusB: KENDAMA_LAYOUT.saradoBarRadius,
  },
  cupCapsule(KENDAMA_LAYOUT.smallCup, [-1, 0, 0]),
  cupCapsule(KENDAMA_LAYOUT.bigCup, [1, 0, 0]),
  cupCapsule(KENDAMA_LAYOUT.baseCup, [0, -1, 0]),
];

/**
 * Projects the local colliders through the ken's live world matrix.
 *
 * Done once per frame into `target`, rather than converting each rope
 * particle into ken-local space and back: there are far fewer colliders than
 * particle-iterations, and the rope solver then works entirely in world
 * space alongside the tama. Radii pass through untouched, which holds
 * because the ken is only ever rotated and translated, never scaled.
 */
export function toWorldColliders(matrixWorld: Matrix4, target: Capsule[]): Capsule[] {
  for (let i = 0; i < KEN_COLLIDERS.length; i += 1) {
    const source = KEN_COLLIDERS[i];
    const slot = target[i];
    slot.a.copy(source.a).applyMatrix4(matrixWorld);
    slot.b.copy(source.b).applyMatrix4(matrixWorld);
    slot.radiusA = source.radiusA;
    slot.radiusB = source.radiusB;
  }
  return target;
}

/** Mutable scratch colliders for `toWorldColliders` to write into. */
export function createWorldColliderBuffer(): Capsule[] {
  return KEN_COLLIDERS.map((capsule) => ({
    a: new Vector3(),
    b: new Vector3(),
    radiusA: capsule.radiusA,
    radiusB: capsule.radiusB,
  }));
}
