import { Quaternion, Vector3 } from 'three';

import { TAMA } from './anatomy';
import {
  HAND_MAX_ACCELERATION,
  moveHand,
  restingHand,
  trackAxis,
  trackOrientation,
  type Hand,
} from './hand';
import { createStringSim, GRAVITY, stepStringSimDriven, type StringSim } from './string-sim';
import { GRIP_QUATERNIONS, gripPose, type Grip, type Handedness, type Quat } from './stringing';
import { rotate } from './vec';
import type { Vec3 } from './views';

/**
 * A catch trick as a hand strategy, not a path: the ball only ever moves
 * under the string simulation, and this decides what the hand does, the way
 * a player does it. Big Cup and Spike are the same strategy aimed at a
 * different part of the ken.
 *
 * 1. **Pull**: lift hard, so the taut string launches the ball upward.
 * 2. **Rise**: brake. The ball flies on with the string slack. Step the
 *    ken aside so the ball climbs past it, then slide the catching part
 *    under it.
 * 3. **Catch**: from the apex, meet the falling ball, matching its speed by
 *    the time it arrives so it lands rather than bounces.
 * 4. **Absorb**: ease the falling hand to a stop with the ball seated.
 *
 * The pull is open-loop, sized from ballistics. Everything after it watches
 * the ball, so the trick survives a swinging start or a change to the
 * string's tuning.
 */
export type CatchTrick = {
  name: string;
  grip: Grip;
  /** The ken-local axis the ball is caught along; the grip turns it upright. */
  catchAxis: Vec3;
  /** The caught ball's centre, from the hand along `catchAxis`. */
  seatHeight: number;
  /** The ken's highest point along `catchAxis`, which the rising ball must clear. */
  kenTop: number;
  /**
   * How far the ball's underside rises above `kenTop`, with the hand home
   * again: room to slide the ken under. More is easier to catch, but the
   * string must still reach: a ball thrown to the end of it is jerked back
   * by its string hole, and turned over.
   */
  apexClearance: number;
  /**
   * Extra depth, per mm of sideways misalignment, at which the ken plans to
   * meet the ball, so it is never raised into a ball it is not under. A cup
   * rim tolerates a few mm; a countersink struck off-axis kicks the ball
   * sideways, so a spike holds off until it is close to exact.
   */
  alignRoom: number;
  /**
   * Whether the ball's hole must meet the ken: the wrist then tilts the
   * catching axis to follow the hole, and the hand aims along the hole's
   * axis rather than at the ball's centre.
   */
  followsHole: boolean;
};

/** What the player has to go on: what they see of the ball, and whether they feel it arrive. */
export type BallObservation = {
  readonly tamaPosition: ArrayLike<number>;
  readonly tamaVelocity: ArrayLike<number>;
  readonly tamaQuaternion: ArrayLike<number>;
  readonly tamaTouching: boolean;
};

export type CatchPhase =
  /** Steadying the hanging ball: the hand follows its swing until it stops. */
  | { kind: 'settle'; calmFor: number }
  | { kind: 'pull'; launchSpeed: number }
  | { kind: 'rise' }
  | { kind: 'catch'; blockedFor: number }
  | { kind: 'absorb'; seatedFor: number }
  | { kind: 'landed' }
  | { kind: 'missed'; reason: MissReason };

export type MissReason =
  /** Fell below the ken, beyond a cushioning arm's reach. */
  | 'fell-past'
  /** Arrived, then left the seat. */
  | 'bounced-out'
  /** Came down on the ken away from the seat and stayed: on the spike's tip, say. */
  | 'blocked'
  /** The ball went where the arm cannot follow. */
  | 'out-of-reach';

export type CatchAttempt = {
  phase: CatchPhase;
  hand: Hand;
  /** Where the hand started, and returns to while the ball flies. */
  home: Vec3;
  /** Seconds since the attempt began. */
  time: number;
};

/** Let the hanging ball come to rest before pulling: at least this long, */
const SETTLE_TIME = 0.35;
/**
 * until it has swung slower than this for `CALM_TIME`. A swinging ball is
 * slow at every turning point, so a moment's slowness proves nothing; a
 * sustained one bounds what swing is left to about 10 mm.
 */
const STEADY_SPEED = 40;
const CALM_TIME = 0.3;
/** or this long has passed, when the player pulls anyway. */
const MAX_SETTLE_TIME = 2.5;
/**
 * How hard the hand follows the hanging ball's swing, per mm/s of its
 * speed. A pendulum's pivot accelerated along the bob's velocity takes
 * energy out of the swing; it is what a player's hand does by feel.
 */
const STEADY_GAIN = 10;
/**
 * While steadying, the hand drifts home this gently. It must stay well
 * below the hanging ball's own swing frequency, √(g / ℓ) ≈ 5 rad/s:
 * homing near it drives the pivot at resonance and pumps the swing back up.
 */
const SETTLE_HOME_OMEGA = 1.5;
/** The hand's reach from where it started, across. */
const REACH = 350;
/** Resting on the ken away from the seat for this long is a miss, not a catch in progress. */
const BLOCKED_TIME = 0.4;
/** The pull is the hardest the hand can lift. */
const PULL_ACCELERATION = HAND_MAX_ACCELERATION;
/**
 * Sideways gap, centre to axis, that lets the rising ball pass the ken: the
 * ball's radius, the sarado's widest band, and a little room.
 */
const CLEARANCE = TAMA.radius + 24.65 + 14;
const CLEAR_ABOVE = 12;

const RETURN_OMEGA = 22;
const HORIZONTAL_OMEGA = 40;
/**
 * The ken meets the ball moving down at this fraction of the ball's speed.
 * The difference, about 150 mm/s, is under the contact's bounce threshold,
 * so the ball lands rather than bounces, and the arm has the rest of the
 * speed to absorb.
 */
const CATCH_SPEED_MATCH = 0.9;
/** Shortest planning horizon: an intercept due sooner than this is chased, not planned. */
const MIN_INTERCEPT_TIME = 0.03;
const ABSORB_OMEGA = 14;
/** The wrist holds the grip steady against the string's tug. */
const GRIP_OMEGA = 60;
/** The furthest the wrist tilts to follow a ball's hole, in radians. */
const MAX_FOLLOW_TILT = 0.6;

/** Within this of the seat, at this relative speed, for this long: landed. */
const SEATED_DISTANCE = 4;
/** Touching the ken this close to the seat is the ball arriving. */
const ARRIVAL_DISTANCE = 8;
const SEATED_SPEED = 60;
const SEATED_TIME = 0.5;
const BOUNCED_OUT_DISTANCE = 20;
/**
 * The ball has fallen this far below where the seat sits at home: no catch
 * is in reach of a cushioning arm.
 */
const FELL_PAST = 250;

export function startCatch(trick: CatchTrick, home: Vec3): CatchAttempt {
  return { phase: { kind: 'settle', calmFor: 0 }, hand: restingHand(home, GRIP_QUATERNIONS[trick.grip]), home, time: 0 };
}

/**
 * Launch speed for a pull at `PULL_ACCELERATION` that lifts the ball from
 * `drop` below the hand until its underside clears the ken's top by the
 * trick's `apexClearance`.
 *
 * The ball rides the taut string through the pull, covering v² / 2a, then
 * flies to its apex, v² / 2g. The two together must cover the whole rise.
 */
export function launchSpeedFor(trick: CatchTrick, drop: number): number {
  const rise = drop + trick.kenTop + TAMA.radius + trick.apexClearance;
  return Math.sqrt((2 * rise) / (1 / GRAVITY + 1 / PULL_ACCELERATION));
}

export function isFinished(attempt: CatchAttempt): boolean {
  return attempt.phase.kind === 'landed' || attempt.phase.kind === 'missed';
}

/** One substep of the controller: the authority for every phase change. */
export function stepCatch(
  trick: CatchTrick,
  attempt: CatchAttempt,
  ball: BallObservation,
  h: number,
): CatchAttempt {
  const { hand, home } = attempt;
  const time = attempt.time + h;
  const p = ball.tamaPosition;
  const v = ball.tamaVelocity;
  const grip = GRIP_QUATERNIONS[trick.grip];

  const advance = (phase: CatchPhase, acceleration: Vec3, wrist: Quat = grip): CatchAttempt => ({
    phase,
    hand: moveHand(hand, { linear: acceleration, angular: trackOrientation(hand, wrist, GRIP_OMEGA) }, h),
    home,
    time,
  });
  const hold = (): Vec3 => [
    trackAxis(hand.position[0], hand.velocity[0], home[0], 0, RETURN_OMEGA),
    trackAxis(hand.position[1], hand.velocity[1], home[1], 0, RETURN_OMEGA),
    trackAxis(hand.position[2], hand.velocity[2], home[2], 0, RETURN_OMEGA),
  ];
  const catching = (phase: CatchPhase) =>
    advance(
      phase,
      catchAcceleration(trick, hand, home, ball),
      trick.followsHole ? followHole(grip, ball.tamaQuaternion) : grip,
    );

  switch (attempt.phase.kind) {
    case 'settle': {
      // The swing is the ball's motion relative to the hand. Following the
      // ball's absolute velocity would chase the drift the hand itself causes.
      const swingX = v[0] - hand.velocity[0];
      const swingZ = v[2] - hand.velocity[2];
      const calmFor = Math.hypot(swingX, swingZ) < STEADY_SPEED ? attempt.phase.calmFor + h : 0;
      const steady = time >= SETTLE_TIME && calmFor >= CALM_TIME;
      if (!steady && time < MAX_SETTLE_TIME) {
        return advance({ kind: 'settle', calmFor }, [
          trackAxis(hand.position[0], hand.velocity[0], home[0], 0, SETTLE_HOME_OMEGA) + STEADY_GAIN * swingX,
          trackAxis(hand.position[1], hand.velocity[1], home[1], 0, RETURN_OMEGA),
          trackAxis(hand.position[2], hand.velocity[2], home[2], 0, SETTLE_HOME_OMEGA) + STEADY_GAIN * swingZ,
        ]);
      }
      const launchSpeed = launchSpeedFor(trick, hand.position[1] - p[1]);
      return advance({ kind: 'pull', launchSpeed }, [0, PULL_ACCELERATION, 0]);
    }

    case 'pull': {
      if (hand.velocity[1] < attempt.phase.launchSpeed) {
        return advance(attempt.phase, [0, PULL_ACCELERATION, 0]);
      }
      return advance({ kind: 'rise' }, hold());
    }

    case 'rise': {
      if (outOfReach(hand, home)) return advance({ kind: 'missed', reason: 'out-of-reach' }, hold());
      if (v[1] <= 0) return catching({ kind: 'catch', blockedFor: 0 });

      // Below the top of the ken, the ball must pass beside it; above, the
      // ken can slide under.
      const passing = p[1] - TAMA.radius < hand.position[1] + trick.kenTop + CLEAR_ABOVE;
      const [x, z] = passing ? besideBall(hand, p) : aimPoint(trick, hand, ball);
      return advance(attempt.phase, [
        trackAxis(hand.position[0], hand.velocity[0], x, v[0], HORIZONTAL_OMEGA),
        trackAxis(hand.position[1], hand.velocity[1], home[1], 0, RETURN_OMEGA),
        trackAxis(hand.position[2], hand.velocity[2], z, v[2], HORIZONTAL_OMEGA),
      ]);
    }

    case 'catch': {
      if (p[1] < home[1] + trick.seatHeight - FELL_PAST) {
        return advance({ kind: 'missed', reason: 'fell-past' }, hold());
      }
      if (outOfReach(hand, home)) return advance({ kind: 'missed', reason: 'out-of-reach' }, hold());
      const atSeat = seatDistance(trick, hand, p) < ARRIVAL_DISTANCE;
      if (ball.tamaTouching && atSeat) {
        return advance({ kind: 'absorb', seatedFor: 0 }, absorbAcceleration(hand));
      }
      const blockedFor = ball.tamaTouching ? attempt.phase.blockedFor + h : 0;
      if (blockedFor >= BLOCKED_TIME) return advance({ kind: 'missed', reason: 'blocked' }, hold());
      return catching({ kind: 'catch', blockedFor });
    }

    case 'absorb': {
      const distance = seatDistance(trick, hand, p);
      if (distance > BOUNCED_OUT_DISTANCE) {
        return advance({ kind: 'missed', reason: 'bounced-out' }, hold());
      }
      const relativeSpeed = Math.hypot(
        v[0] - hand.velocity[0],
        v[1] - hand.velocity[1],
        v[2] - hand.velocity[2],
      );
      const seated = distance < SEATED_DISTANCE && relativeSpeed < SEATED_SPEED;
      const seatedFor = seated ? attempt.phase.seatedFor + h : 0;
      const next: CatchPhase = seatedFor >= SEATED_TIME ? { kind: 'landed' } : { kind: 'absorb', seatedFor };
      return advance(next, absorbAcceleration(hand));
    }

    case 'landed':
      return advance(attempt.phase, absorbAcceleration(hand));

    case 'missed':
      return advance(attempt.phase, hold());
  }
}

function outOfReach(hand: Hand, home: Vec3): boolean {
  return Math.hypot(hand.position[0] - home[0], hand.position[2] - home[2]) > REACH;
}

/** Where the hand steps to let the rising ball pass the ken: directly away from it, by `CLEARANCE`. */
function besideBall(hand: Hand, p: ArrayLike<number>): [number, number] {
  const awayX = hand.position[0] - p[0];
  const awayZ = hand.position[2] - p[2];
  const away = Math.hypot(awayX, awayZ);
  // The string hangs the ball to the player's inside, so stepping the
  // other way is the short way round.
  const ux = away > 1e-6 ? awayX / away : 1;
  const uz = away > 1e-6 ? awayZ / away : 0;
  return [p[0] + ux * CLEARANCE, p[2] + uz * CLEARANCE];
}

const holeAxis = [0, 0, 0];

/**
 * Where the hand should be, across, to catch the ball: under its centre,
 * or for a hole trick on the hole's own axis line at the hand's height, so
 * a tilted ball's hole still comes down onto the spike.
 */
function aimPoint(trick: CatchTrick, hand: Hand, ball: BallObservation): [number, number] {
  const p = ball.tamaPosition;
  if (!trick.followsHole) return [p[0], p[2]];
  rotate(ball.tamaQuaternion, 0, 1, 0, holeAxis);
  if (holeAxis[1] < Math.cos(MAX_FOLLOW_TILT)) return [p[0], p[2]];
  const along = (hand.position[1] - p[1]) / holeAxis[1];
  return [p[0] + holeAxis[0] * along, p[2] + holeAxis[2] * along];
}

const WORLD_UP = new Vector3(0, 1, 0);
const scratchAxis = new Vector3();
const scratchTilt = new Quaternion();
const scratchGrip = new Quaternion();

/**
 * The grip tilted so its catching axis, upright in the grip, lies along the
 * ball's hole axis: the bore opens along the ball's local -Y, so the spike
 * must point along its +Y. Tilts beyond `MAX_FOLLOW_TILT` are not followed;
 * a ball turned that far is not coming down hole-first.
 */
function followHole(grip: Quat, tamaQuaternion: ArrayLike<number>): Quat {
  rotate(tamaQuaternion, 0, 1, 0, holeAxis);
  scratchAxis.set(holeAxis[0], holeAxis[1], holeAxis[2]);
  if (scratchAxis.y < Math.cos(MAX_FOLLOW_TILT)) return grip;
  scratchTilt.setFromUnitVectors(WORLD_UP, scratchAxis);
  scratchGrip.set(grip[0], grip[1], grip[2], grip[3]).premultiply(scratchTilt);
  return [scratchGrip.x, scratchGrip.y, scratchGrip.z, scratchGrip.w];
}

/**
 * Intercept the falling ball with the hand back at home height.
 *
 * Ballistics say when the ball will reach its seat over the home position.
 * The hand plans the cubic that arrives there at that moment, moving down
 * at nearly the ball's speed, and takes that cubic's starting acceleration.
 * Re-planning every substep turns the plan into feedback.
 *
 * A misaligned ken plans to arrive lower, so it is never raised into the
 * ball before it is under it.
 */
function catchAcceleration(trick: CatchTrick, hand: Hand, home: Vec3, ball: BallObservation): Vec3 {
  const p = ball.tamaPosition;
  const v = ball.tamaVelocity;
  const [x, z] = aimPoint(trick, hand, ball);
  const misalignment = Math.hypot(x - hand.position[0], z - hand.position[2]);
  const meetY = home[1] - trick.alignRoom * misalignment;
  const drop = p[1] - (meetY + trick.seatHeight);
  const discriminant = v[1] * v[1] + 2 * GRAVITY * drop;

  // Past the planned meeting point already: chase the seat to the ball.
  const planned = drop > 0 && discriminant > 0;
  const until = planned ? (v[1] + Math.sqrt(discriminant)) / GRAVITY : 0;
  const horizon = Math.max(until, MIN_INTERCEPT_TIME);
  const targetY = planned ? meetY : p[1] - trick.seatHeight;
  const targetVy = CATCH_SPEED_MATCH * (v[1] - GRAVITY * until);

  return [
    trackAxis(hand.position[0], hand.velocity[0], x, v[0], HORIZONTAL_OMEGA),
    hermiteStartAcceleration(hand.position[1], hand.velocity[1], targetY, targetVy, horizon),
    trackAxis(hand.position[2], hand.velocity[2], z, v[2], HORIZONTAL_OMEGA),
  ];
}

/** Starting acceleration of the cubic from (y0, v0) to (y1, v1) over `t` seconds. */
function hermiteStartAcceleration(y0: number, v0: number, y1: number, v1: number, t: number): number {
  return (6 * (y1 - y0)) / (t * t) - (4 * v0 + 2 * v1) / t;
}

/** Bring the hand, and the ball it caught, gently to rest. */
function absorbAcceleration(hand: Hand): Vec3 {
  return [
    -ABSORB_OMEGA * hand.velocity[0],
    -ABSORB_OMEGA * hand.velocity[1],
    -ABSORB_OMEGA * hand.velocity[2],
  ];
}

const seat = [0, 0, 0];

/** How far the ball is from where the trick seats it, wherever the wrist has the ken turned. */
export function seatDistance(trick: CatchTrick, hand: Hand, p: ArrayLike<number>): number {
  const [ax, ay, az] = trick.catchAxis;
  rotate(hand.orientation, ax * trick.seatHeight, ay * trick.seatHeight, az * trick.seatHeight, seat);
  return Math.hypot(
    p[0] - (hand.position[0] + seat[0]),
    p[1] - (hand.position[1] + seat[1]),
    p[2] - (hand.position[2] + seat[2]),
  );
}

/** An attempt bound to its own simulation, from a ball hanging at rest. */
export type TrickRun = { trick: CatchTrick; sim: StringSim; attempt: CatchAttempt };

export function createTrickRun(trick: CatchTrick, handedness: Handedness, home: Vec3 = [0, 0, 0]): TrickRun {
  return {
    trick,
    sim: createStringSim(handedness, gripPose(home, GRIP_QUATERNIONS[trick.grip]), { kind: 'hanging' }),
    attempt: startCatch(trick, home),
  };
}

/** Advances the run by `dt` seconds, the controller stepping with the physics. */
export function advanceTrickRun(run: TrickRun, dt: number): void {
  stepStringSimDriven(run.sim, dt, (sim, h) => {
    run.attempt = stepCatch(run.trick, run.attempt, sim, h);
    return gripPose(run.attempt.hand.position, run.attempt.hand.orientation);
  });
}
