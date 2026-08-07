import { Quaternion, Vector3 } from 'three';

import {
  addScaledVec3,
  fromQuaternion,
  scaleVec3,
  type BodyPose,
  type Vec3,
} from './body';
import { seatOffset } from './kendama-geometry';
import {
  KEN_SOCKETS,
  TAMA_SOCKETS,
  toWorldSocket,
  type Socket,
  type WorldSocket,
} from './sockets';
import { TAMA_LAYOUT } from './tama-geometry';

/**
 * Poses a free body so one of its sockets lands on a given world point,
 * pointing a given world direction.
 *
 * This is the one primitive underneath every catch. Big Cup derives its
 * catch position with a page of inline trigonometry that only answers the
 * question for that one cup under that one grip; stating the constraint
 * instead — *this landmark goes here, facing this way* — answers it for any
 * socket under any grip, and is pure enough to unit-test.
 */
export function alignedPose(
  socket: Socket,
  axisWorld: Vec3,
  pointWorld: Vec3,
  spin = 0,
): BodyPose {
  const rotation = new Quaternion().setFromUnitVectors(
    new Vector3(...socket.axis).normalize(),
    new Vector3(...axisWorld).normalize(),
  );

  // Spin about the contact axis is the one degree of freedom the constraint
  // leaves open — "pull up spike" is graded on whether the tama turns, so it
  // has to be expressible rather than whatever `setFromUnitVectors` happens
  // to pick.
  if (spin !== 0) {
    rotation.premultiply(
      new Quaternion().setFromAxisAngle(new Vector3(...axisWorld).normalize(), spin),
    );
  }

  const offset = new Vector3(...socket.point).applyQuaternion(rotation);

  return fromQuaternion(rotation, [
    pointWorld[0] - offset.x,
    pointWorld[1] - offset.y,
    pointWorld[2] - offset.z,
  ]);
}

/**
 * The tama caught in a cup.
 *
 * It rests *on the rim*, not inside: the tama (r 0.25) is wider than even
 * the big cup's mouth (r 0.225), so the rim circle cuts a chord across the
 * sphere and the centre floats `seatOffset` beyond the mouth plane. Because
 * that is derived from the two radii rather than placed by hand, the ball
 * can never clip through a cup wall however the cups are retuned.
 *
 * A sphere on a rim looks the same whichever way it is turned, so the tama's
 * orientation is carried through rather than solved — which matters for
 * sequences, where the ball may arrive already spinning.
 */
export function seatTamaInCup(cup: WorldSocket, carriedRotation: Vec3 = [0, 0, 0]): BodyPose {
  return {
    position: addScaledVec3(
      cup.point,
      cup.axis,
      seatOffset(TAMA_LAYOUT.radius, cup.radius),
    ),
    rotation: carriedRotation,
  };
}

/**
 * How far a spike goes into a hole: as far as it can, which is the shorter
 * of the spike and the bore.
 *
 * A real tama is hollowed out deeper than the spike is long, so a landed
 * spike vanishes inside it completely — the tama comes to rest against the
 * ken where the spike leaves the shaft. Taking the minimum makes that a
 * consequence of the two bodies' dimensions rather than a tuned number, and
 * keeps the ken from spearing straight through a shallower ball.
 */
export function insertionDepth(spike: Socket, hole: Socket): number {
  return Math.min(spike.depth ?? 0, hole.depth ?? 0);
}

/**
 * The tama speared on the spike.
 *
 * The hole faces back down the spike, so its axis is the spike's reversed,
 * and its mouth sits one insertion short of the tip — which puts the whole
 * spike inside the ball rather than the ball perched on the point.
 */
export function spearTamaOnSpike(spike: WorldSocket, spin = 0): BodyPose {
  return alignedPose(
    TAMA_SOCKETS.hole,
    scaleVec3(spike.axis, -1),
    addScaledVec3(spike.point, spike.axis, -insertionDepth(spike, TAMA_SOCKETS.hole)),
    spin,
  );
}

/**
 * The ken speared *into* a held tama — airplane, and every other trick where
 * the player holds the ball and swings the ken up into it.
 *
 * Exactly the same rendezvous as `spearTamaOnSpike`, solved for the other
 * body: the spike and the hole must be anti-aligned and the tip must sit
 * `holeDepth` inside the bore. Which body ends up moving is a question about
 * who is holding what, not about the geometry.
 */
export function spearKenIntoTama(tama: BodyPose, spin = 0): BodyPose {
  const hole = toWorldSocket(TAMA_SOCKETS.hole, tama);
  const insertion = insertionDepth(KEN_SOCKETS.spike, TAMA_SOCKETS.hole);

  // The tip ends up one insertion in from the hole's mouth, and the mouth
  // is on the ball's surface.
  return alignedPose(
    KEN_SOCKETS.spike,
    scaleVec3(hole.axis, -1),
    addScaledVec3(hole.point, hole.axis, -insertion),
    spin,
  );
}

/**
 * The ken standing upright on the tama — lighthouse.
 *
 * Solves the *ken's* pose against a held tama, the reverse of every other
 * case, which is the check that this solver is genuinely symmetric rather
 * than tama-only. The geometry is the same rim-on-sphere chord as a cup
 * catch, read the other way round: `seatOffset` gives the distance from the
 * ball's centre out to the plane of the rim it is balancing on.
 */
export function standKenOnTama(tamaCenter: Vec3, up: Vec3 = [0, 1, 0], spin = 0): BodyPose {
  const rim = KEN_SOCKETS.baseCupRim;

  return alignedPose(
    rim,
    scaleVec3(up, -1),
    addScaledVec3(tamaCenter, up, seatOffset(TAMA_LAYOUT.radius, rim.radius)),
    spin,
  );
}
