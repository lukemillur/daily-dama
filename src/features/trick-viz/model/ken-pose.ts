import { Euler, Vector3 } from 'three';

import type { Vec3 } from './keyframes';

/**
 * How the player is holding the ken.
 *
 * Tricks differ mostly in grip, not in the ken itself: Big Cup holds it
 * with the shaft horizontal and the big cup up, while other tricks hold it
 * spike-up, upside down, and so on. Keeping the pose separate from the
 * model lets `KENDAMA_LAYOUT` stay in one fixed local frame that trick
 * authors can reason about, with the grip applied on top.
 *
 * `rotation` is applied as two named rotations rather than a raw Euler
 * triple — see `KEN_ROTATION_ORDER` for why.
 */
export type KenPose = {
  position: Vec3;
  /**
   * [x, y, z] Euler angles in radians, applied in `KEN_ROTATION_ORDER`.
   */
  rotation: Vec3;
};

/**
 * Euler order used for every ken pose.
 *
 * Big Cup's grip is naturally described as "roll the ken 90° so the big
 * cup points up (Z), then swing it 90° so the base cup faces the player
 * (Y)" — a Z-then-Y composition, which in three.js terms is order 'YZX'
 * (rightmost applied first). Pinning the order here keeps that reading
 * exact instead of depending on the default 'XYZ'.
 */
export const KEN_ROTATION_ORDER = 'YZX' as const;

/**
 * Maps a ken-local landmark (a cup mouth, the string hole) into world
 * space under the given pose, so tricks can be authored against
 * `KENDAMA_LAYOUT` instead of against hand-derived world coordinates.
 */
export function localToWorld(point: Vec3, pose: KenPose): Vec3 {
  const world = new Vector3(...point)
    .applyEuler(kenEuler(pose))
    .add(new Vector3(...pose.position));

  return [world.x, world.y, world.z];
}

/**
 * The pose's rotation as a three.js `Euler` with the order pinned. Both
 * the landmark math here and the rendered group in `TrickScene` build
 * their rotation from this, so they can never drift apart.
 */
export function kenEuler(pose: KenPose): Euler {
  return new Euler(...pose.rotation, KEN_ROTATION_ORDER);
}

/**
 * Rotates a ken-local *direction* (a cup's opening axis) into world space.
 * Same as `localToWorld` minus the translation, since directions don't
 * care where the ken is, only how it's turned.
 */
export function localDirectionToWorld(direction: Vec3, pose: KenPose): Vec3 {
  const world = new Vector3(...direction).applyEuler(kenEuler(pose)).normalize();
  return [world.x, world.y, world.z];
}
