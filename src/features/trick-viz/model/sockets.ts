import { addScaledVec3, localDirectionToWorld, localToWorld, type BodyPose, type Vec3 } from './body';
import { KENDAMA_LAYOUT } from './kendama-geometry';
import { TAMA_LAYOUT } from './tama-geometry';

/**
 * What kind of contact a socket affords, which is what decides how two
 * sockets mate:
 *
 * - `cup` catches a ball on its rim (the ball is wider than the mouth).
 * - `spike` enters a `hole`.
 * - `hole` receives a spike.
 * - `flat` is a rim the ken balances *on* rather than catches *with* —
 *   the lighthouse case, where the ken stands upright on the tama.
 */
export type SocketKind = 'cup' | 'spike' | 'hole' | 'flat';

/**
 * A named contact point on a body, in that body's local frame.
 *
 * This is the vocabulary tricks are written against. Big Cup currently
 * recomputes its cup mouth and opening axis inline; naming them once here —
 * and deriving them from the layout, exactly as `kendama-colliders.ts`
 * already derives its capsules — means retuning a cup moves its mesh, its
 * collider, and every trick that catches in it together.
 */
export type Socket = {
  point: Vec3;
  /** Direction the socket opens or points, local and unit-length. */
  axis: Vec3;
  kind: SocketKind;
  /** Mouth radius for a cup or flat, tip radius for a spike, bore for a hole. */
  radius: number;
};

/** The same socket resolved through a pose. */
export type WorldSocket = Socket;

export function toWorldSocket(socket: Socket, pose: BodyPose): WorldSocket {
  return {
    ...socket,
    point: localToWorld(socket.point, pose),
    axis: localDirectionToWorld(socket.axis, pose),
  };
}

type CupLayout = {
  center: Vec3;
  mouthRadius: number;
  height: number;
};

/** A cup's mouth is half its height along the direction it opens. */
function cupSocket(cup: CupLayout, opensToward: Vec3, kind: SocketKind): Socket {
  return {
    point: addScaledVec3(cup.center, opensToward, cup.height / 2),
    axis: opensToward,
    kind,
    radius: cup.mouthRadius,
  };
}

export const KEN_SOCKETS = {
  bigCup: cupSocket(KENDAMA_LAYOUT.bigCup, [1, 0, 0], 'cup'),
  smallCup: cupSocket(KENDAMA_LAYOUT.smallCup, [-1, 0, 0], 'cup'),
  baseCup: cupSocket(KENDAMA_LAYOUT.baseCup, [0, -1, 0], 'cup'),

  /**
   * The base cup's rim read as a stand rather than a catch. Same circle as
   * `baseCup`, different contact: in lighthouse the ken balances on the tama
   * here instead of the tama landing in it.
   */
  baseCupRim: cupSocket(KENDAMA_LAYOUT.baseCup, [0, -1, 0], 'flat'),

  spike: {
    point: KENDAMA_LAYOUT.spikeTip,
    axis: [0, 1, 0],
    kind: 'spike',
    radius: 0.012,
  },
} as const satisfies Record<string, Socket>;

export const TAMA_SOCKETS = {
  hole: {
    point: TAMA_LAYOUT.holeLocal,
    axis: TAMA_LAYOUT.holeAxisLocal,
    kind: 'hole',
    radius: TAMA_LAYOUT.holeRadius,
  },
} as const satisfies Record<string, Socket>;

export type KenSocketId = keyof typeof KEN_SOCKETS;
