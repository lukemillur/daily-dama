import { Matrix4, Quaternion, Vector3 } from 'three';

import { SARADO, TAMA } from './anatomy';
import type { Vec3 } from './views';

/** Quaternion as `[x, y, z, w]`, matching three.js component order. */
export type Quat = readonly [number, number, number, number];

/** A rigid pose in millimetres. */
export type Pose = { position: Vec3; quaternion: Quat };

/**
 * Which side of the sarado the string leaves from.
 *
 * Defined by the player's grip rather than by the ken alone: hold the ken in
 * the big-cup grip (big cup up, spike pointing away from you) and the string
 * should drop the tama on the *inside* of your body. For a right-handed
 * player that is their left.
 *
 * In ken-local terms (big cup +X, spike +Y), that grip turns local +Z toward
 * the player's left, so right-handed stringing exits the waist on +Z and
 * left-handed on -Z. `stringing.test.ts` asserts the grip, so this cannot
 * silently flip.
 */
export type Handedness = 'right' | 'left';

export function stringSide(handedness: Handedness): 1 | -1 {
  return handedness === 'right' ? 1 : -1;
}

/**
 * Hole-to-hole hanging length. Players cut strings to taste; this is a
 * typical length, about two and a bit kens.
 */
export const STRING_LENGTH = 340;
export const STRING_RADIUS = 0.9;

/** Where the string leaves the sarado's waist, in ken-local mm. */
export function stringExitLocal(handedness: Handedness): Vec3 {
  return [0, SARADO.heightOnHandle, stringSide(handedness) * (SARADO.waistRadius + STRING_RADIUS)];
}

/** A point inside the sarado's hole, so the rendered string visibly enters it. */
export function stringHoleInsideLocal(handedness: Handedness): Vec3 {
  return [0, SARADO.heightOnHandle, stringSide(handedness) * (SARADO.waistRadius - 4)];
}

/**
 * Where the string attaches to the tama: its string hole, at the pole
 * opposite the spike hole. It is knotted inside, so the pull acts at the
 * surface of the ball, off its centre. That offset is what makes a hanging
 * tama turn its string hole up toward the ken.
 */
export const TAMA_STRING_ATTACH: Vec3 = [0, TAMA.radius, 0];
export const TAMA_STRING_INSIDE: Vec3 = [0, TAMA.radius - 4, 0];

/**
 * The big-cup grip, in a world where the player stands on +Z facing -Z,
 * with +X to their right and +Y up.
 *
 * Big cup (local +X) up, spike (local +Y) pointing away from the player.
 * Local +Z then follows by the right-hand rule: up × away = the player's
 * left.
 */
const BIG_CUP_GRIP_ROTATION = new Quaternion().setFromRotationMatrix(
  new Matrix4().makeBasis(
    new Vector3(0, 1, 0),
    new Vector3(0, 0, -1),
    new Vector3(-1, 0, 0),
  ),
);

export const BIG_CUP_GRIP_QUATERNION: Quat = [
  BIG_CUP_GRIP_ROTATION.x,
  BIG_CUP_GRIP_ROTATION.y,
  BIG_CUP_GRIP_ROTATION.z,
  BIG_CUP_GRIP_ROTATION.w,
];

/**
 * The ken in the big-cup grip with its sarado centred on `hand`. The hand is
 * modelled at the sarado so dragging moves the part the player watches.
 */
export function bigCupGripPose(hand: Vec3): Pose {
  const saradoOffset = new Vector3(0, SARADO.heightOnHandle, 0).applyQuaternion(
    BIG_CUP_GRIP_ROTATION,
  );
  return {
    position: [hand[0] - saradoOffset.x, hand[1] - saradoOffset.y, hand[2] - saradoOffset.z],
    quaternion: BIG_CUP_GRIP_QUATERNION,
  };
}
