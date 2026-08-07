import { Euler, Quaternion, Vector3 } from 'three';

export type Vec3 = readonly [number, number, number];

/** Quaternion as `[x, y, z, w]`, matching three.js component order. */
export type Quat = readonly [number, number, number, number];

/**
 * How a rigid body is held or oriented, authored as named rotations.
 *
 * Previously `KenPose` — the ken was the only posed body, and the tama was a
 * bare position with no orientation at all. Tricks where the player holds the
 * *tama* and the ken flies (airplane, trapeze, lighthouse) invert that, so
 * both bodies now carry the same pose type and the same local-frame
 * convention: each layout describes its body in a neutral pose, and a trick
 * maps landmarks into world space rather than hardcoding world coordinates
 * that only hold for one grip.
 */
export type BodyPose = {
  position: Vec3;
  /** [x, y, z] Euler angles in radians, applied in `POSE_ROTATION_ORDER`. */
  rotation: Vec3;
};

/**
 * A pose in the form the renderer and the interpolator want.
 *
 * Grips are *authored* as Euler triples because that is how a player would
 * describe one ("roll it so the big cup points up, then swing the base cup
 * round to face me"). But Euler angles cannot be interpolated component-wise
 * without taking a non-geodesic path and risking gimbal lock, which is
 * invisible while nothing rotates and badly wrong the moment a ken flips.
 * So authoring keeps Euler and everything downstream of `toRigid` uses
 * quaternions.
 */
export type RigidPose = {
  position: Vec3;
  quaternion: Quat;
};

/**
 * Euler order used for every body pose.
 *
 * Big Cup's grip is naturally described as "roll the ken 90° so the big cup
 * points up (Z), then swing it 90° so the base cup faces the player (Y)" — a
 * Z-then-Y composition, which in three.js terms is order 'YZX' (rightmost
 * applied first). Pinning the order here keeps that reading exact instead of
 * depending on the default 'XYZ'.
 */
export const POSE_ROTATION_ORDER = 'YZX' as const;

export const IDENTITY_POSE: BodyPose = {
  position: [0, 0, 0],
  rotation: [0, 0, 0],
};

/**
 * The pose's rotation as a three.js `Euler` with the order pinned. Landmark
 * math and the rendered group both build their rotation from this, so they
 * cannot drift apart. Keep that property.
 */
export function poseEuler(pose: BodyPose): Euler {
  return new Euler(...pose.rotation, POSE_ROTATION_ORDER);
}

export function poseQuaternion(pose: BodyPose): Quaternion {
  return new Quaternion().setFromEuler(poseEuler(pose));
}

export function toRigid(pose: BodyPose): RigidPose {
  const q = poseQuaternion(pose);
  return { position: pose.position, quaternion: [q.x, q.y, q.z, q.w] };
}

/**
 * Back to authored form. Lossless as a representation — the same rotation,
 * read out in the pinned order — though not necessarily the same triple the
 * author originally wrote, since several triples name one rotation.
 */
export function fromQuaternion(quaternion: Quaternion, position: Vec3): BodyPose {
  const euler = new Euler().setFromQuaternion(quaternion, POSE_ROTATION_ORDER);
  return { position, rotation: [euler.x, euler.y, euler.z] };
}

/**
 * Maps a body-local landmark (a cup mouth, the string hole, the tama's spike
 * hole) into world space under the given pose, so tricks can be authored
 * against a layout instead of against hand-derived world coordinates.
 */
export function localToWorld(point: Vec3, pose: BodyPose): Vec3 {
  const world = new Vector3(...point)
    .applyEuler(poseEuler(pose))
    .add(new Vector3(...pose.position));

  return [world.x, world.y, world.z];
}

/**
 * Rotates a body-local *direction* (a cup's opening axis, a spike's pointing
 * axis) into world space. Same as `localToWorld` minus the translation, since
 * directions don't care where the body is, only how it's turned.
 */
export function localDirectionToWorld(direction: Vec3, pose: BodyPose): Vec3 {
  const world = new Vector3(...direction).applyEuler(poseEuler(pose)).normalize();
  return [world.x, world.y, world.z];
}

export function addVec3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function scaleVec3(a: Vec3, k: number): Vec3 {
  return [a[0] * k, a[1] * k, a[2] * k];
}

/** `a + b * k` — the "step along a direction" that landmark math is full of. */
export function addScaledVec3(a: Vec3, b: Vec3, k: number): Vec3 {
  return [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
}
