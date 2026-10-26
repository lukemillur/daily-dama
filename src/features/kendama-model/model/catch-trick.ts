import { Quaternion, Vector3 } from 'three';

import { sampleProfile, SARADO_BODY, TAMA } from './anatomy';
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
  | { kind: 'pull'; launchSpeed: number; from: LaunchFrom }
  /** `free` latches once the ball has left the ken it was launched from. */
  | { kind: 'rise'; from: LaunchFrom; free: boolean }
  | { kind: 'catch'; blockedFor: number }
  | { kind: 'absorb'; seatedFor: number }
  | { kind: 'landed' }
  | { kind: 'missed'; reason: MissReason };

/**
 * Where a launch sends the ball from: up past the ken from hanging below
 * it, or up off a seat on it, as when one trick leads into the next.
 */
export type LaunchFrom = 'below' | 'seat';

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
  /**
   * How the wrist holds the ken until the ball is free of it. In a fresh
   * attempt that is the trick's own grip; leading on from another trick it
   * is the grip the ball is sitting in, which must not turn under the ball.
   */
  heldGrip: Quat;
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
/** Room left between a ball passing beside the ken and the sarado's furthest point that way. */
const PASSING_ROOM = 14;
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
const SARADO_PROFILE = sampleProfile(SARADO_BODY);
/**
 * The sarado's furthest point from its centre, which is the hand: as the
 * wrist turns, its rims sweep a sphere this big about the hand.
 */
const SARADO_REACH = Math.max(...SARADO_PROFILE.map(([r, h]) => Math.hypot(r, h)));
/** A ball this far from the hand is clear of everything a turning sarado can sweep. */
const CLEAR_OF_TURN = SARADO_REACH + TAMA.radius + 6;
/** How far a popped ball's centre rises past what it must clear: time for the wrist to turn. */
const POP_CLEARANCE = 15;
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
  const grip = GRIP_QUATERNIONS[trick.grip];
  return { phase: { kind: 'settle', calmFor: 0 }, hand: restingHand(home, grip), home, time: 0, heldGrip: grip };
}

/**
 * Leads on into `trick` from an attempt whose ball is sitting in its seat:
 * the hand pops the ball up off it, holding the ken as it is until the ball
 * is clear, then turns to the new grip while the ball is in the air.
 */
export function continueCatch(trick: CatchTrick, previous: CatchAttempt, ball: BallObservation): CatchAttempt {
  const launchSpeed = launchSpeedFor(trick, previous.hand.position[1] - ball.tamaPosition[1], 'seat');
  return {
    phase: { kind: 'pull', launchSpeed, from: 'seat' },
    hand: previous.hand,
    home: previous.home,
    time: 0,
    heldGrip: previous.hand.orientation,
  };
}

/**
 * Launch speed for a pull at `PULL_ACCELERATION` that lifts the ball from
 * `drop` below the hand (negative when it starts above it, on a seat).
 *
 * From below, the ball rides the taut string through the pull, covering
 * v² / 2a, then flies to its apex, v² / 2g: the two together must lift its
 * underside the trick's `apexClearance` above the ken's top.
 */
export function launchSpeedFor(trick: CatchTrick, drop: number, from: LaunchFrom = 'below'): number {
  if (from === 'below') {
    const rise = drop + trick.kenTop + TAMA.radius + trick.apexClearance;
    return Math.sqrt((2 * rise) / (1 / GRAVITY + 1 / PULL_ACCELERATION));
  }
  // A pop off a seat goes just high enough to clear the new catching part
  // and the sweep of the turn toward it. Every mm higher draws more slack
  // string up over the ken it lies draped across, and a string dragged
  // that way tugs on the string hole and turns the ball.
  const rise = drop + Math.max(trick.kenTop + TAMA.radius, CLEAR_OF_TURN) + POP_CLEARANCE;
  return Math.sqrt(2 * GRAVITY * rise);
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
    heldGrip: attempt.heldGrip,
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
        return advance(
          { kind: 'settle', calmFor },
          [
          trackAxis(hand.position[0], hand.velocity[0], home[0], 0, SETTLE_HOME_OMEGA) + STEADY_GAIN * swingX,
          trackAxis(hand.position[1], hand.velocity[1], home[1], 0, RETURN_OMEGA),
          trackAxis(hand.position[2], hand.velocity[2], home[2], 0, SETTLE_HOME_OMEGA) + STEADY_GAIN * swingZ,
          ],
          attempt.heldGrip,
        );
      }
      const launchSpeed = launchSpeedFor(trick, hand.position[1] - p[1]);
      return advance({ kind: 'pull', launchSpeed, from: 'below' }, [0, PULL_ACCELERATION, 0], attempt.heldGrip);
    }

    case 'pull': {
      const { launchSpeed, from } = attempt.phase;
      if (hand.velocity[1] < launchSpeed) {
        return advance(attempt.phase, [0, PULL_ACCELERATION, 0], attempt.heldGrip);
      }
      return advance({ kind: 'rise', from, free: false }, hold(), attempt.heldGrip);
    }

    case 'rise': {
      if (outOfReach(hand, home)) return advance({ kind: 'missed', reason: 'out-of-reach' }, hold());
      if (v[1] <= 0) return catching({ kind: 'catch', blockedFor: 0 });

      // Turning the ken while the ball is near it would sweep a rim into
      // it, so the wrist holds the old grip until the ball is clear of
      // everything the turn can reach, then turns to the trick's grip.
      const { from } = attempt.phase;
      const reach = Math.hypot(p[0] - hand.position[0], p[1] - hand.position[1], p[2] - hand.position[2]);
      const free = attempt.phase.free || (!ball.tamaTouching && reach > CLEAR_OF_TURN);
      // A ball rising from below must pass beside the ken until it is above
      // its top; one popped off a seat is above it already.
      const passing = from === 'below' && p[1] - TAMA.radius < hand.position[1] + trick.kenTop + CLEAR_ABOVE;
      const [x, z, vx, vz]: Aim = passing ? [...besideBall(hand, p), v[0], v[2]] : aimPoint(trick, hand, ball);
      return advance(
        { kind: 'rise', from, free },
        [
          trackAxis(hand.position[0], hand.velocity[0], x, vx, HORIZONTAL_OMEGA),
          trackAxis(hand.position[1], hand.velocity[1], home[1], 0, RETURN_OMEGA),
          trackAxis(hand.position[2], hand.velocity[2], z, vz, HORIZONTAL_OMEGA),
        ],
        free ? grip : attempt.heldGrip,
      );
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

const saradoAxis = [0, 0, 0];

/**
 * Where the hand steps to let the rising ball pass the ken: directly away
 * from it, far enough that the ball clears the sarado's furthest point
 * toward it. The sarado stands upright in the big-cup grip, so that is its
 * band, but it lies across in the spike-up grip, where a cup reaches out
 * much further toward a ball passing off its end.
 */
function besideBall(hand: Hand, p: ArrayLike<number>): [number, number] {
  const awayX = hand.position[0] - p[0];
  const awayZ = hand.position[2] - p[2];
  const away = Math.hypot(awayX, awayZ);
  // The string hangs the ball to the player's inside, so stepping the
  // other way is the short way round.
  const ux = away > 1e-6 ? awayX / away : 1;
  const uz = away > 1e-6 ? awayZ / away : 0;
  // The sarado is a lathe about its axis, ken-local +X; its extent along a
  // direction u is the most any profile point reaches, h (a·u) + r √(1 − (a·u)²).
  rotate(hand.orientation, 1, 0, 0, saradoAxis);
  const along = Math.abs(saradoAxis[0] * ux + saradoAxis[2] * uz);
  const across = Math.sqrt(Math.max(1 - along * along, 0));
  let extent = 0;
  for (const [r, h] of SARADO_PROFILE) extent = Math.max(extent, Math.abs(h) * along + r * across);
  const clearance = extent + TAMA.radius + PASSING_ROOM;
  return [p[0] + ux * clearance, p[2] + uz * clearance];
}

const holeAxis = [0, 0, 0];

/** Where the hand aims across, and how fast that point moves: `[x, z, vx, vz]`. */
type Aim = [number, number, number, number];

/**
 * Where the hand should be, across, to catch the ball: under its centre,
 * or for a hole trick on the hole's own axis line at the hand's height, so
 * a tilted ball's hole still comes down onto the spike.
 *
 * That point slides along the tilted line as the hand and ball close
 * vertically, so its velocity carries the slide as well as the ball's own:
 * tracking the ball's velocity alone leaves the hand lagging off the line.
 */
function aimPoint(trick: CatchTrick, hand: Hand, ball: BallObservation): Aim {
  const p = ball.tamaPosition;
  const v = ball.tamaVelocity;
  if (!trick.followsHole) return [p[0], p[2], v[0], v[2]];
  rotate(ball.tamaQuaternion, 0, 1, 0, holeAxis);
  if (holeAxis[1] < Math.cos(MAX_FOLLOW_TILT)) return [p[0], p[2], v[0], v[2]];
  const along = (hand.position[1] - p[1]) / holeAxis[1];
  const closing = (hand.velocity[1] - v[1]) / holeAxis[1];
  return [
    p[0] + holeAxis[0] * along,
    p[2] + holeAxis[2] * along,
    v[0] + holeAxis[0] * closing,
    v[2] + holeAxis[2] * closing,
  ];
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
  const [x, z, vx, vz] = aimPoint(trick, hand, ball);
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
    trackAxis(hand.position[0], hand.velocity[0], x, vx, HORIZONTAL_OMEGA),
    hermiteStartAcceleration(hand.position[1], hand.velocity[1], targetY, targetVy, horizon),
    trackAxis(hand.position[2], hand.velocity[2], z, vz, HORIZONTAL_OMEGA),
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

/**
 * Attempts bound to their own simulation, one trick after another from a
 * ball hanging at rest: each leads on from the last once its ball has
 * settled in its seat, with no reset in between.
 */
export type TrickRun = {
  tricks: readonly CatchTrick[];
  /** Which of `tricks` the current attempt is at. */
  step: number;
  sim: StringSim;
  attempt: CatchAttempt;
};

/**
 * How long the ball sits settled in its seat before a run leads on into
 * the next trick: long enough that the pop starts from a ball at rest in
 * the cup, short enough to read as one motion.
 */
const LEAD_ON_SEATED_TIME = 0.15;

export function createTrickRun(
  tricks: readonly [CatchTrick, ...CatchTrick[]],
  handedness: Handedness,
  home: Vec3 = [0, 0, 0],
): TrickRun {
  return {
    tricks,
    step: 0,
    sim: createStringSim(handedness, gripPose(home, GRIP_QUATERNIONS[tricks[0].grip]), { kind: 'hanging' }),
    attempt: startCatch(tricks[0], home),
  };
}

export function currentTrick(run: TrickRun): CatchTrick {
  return run.tricks[run.step];
}

/** Done: missed somewhere, or landed the last trick. */
export function isRunFinished(run: TrickRun): boolean {
  const { phase } = run.attempt;
  return phase.kind === 'missed' || (phase.kind === 'landed' && run.step === run.tricks.length - 1);
}

function readyToLeadOn(run: TrickRun): boolean {
  if (run.step === run.tricks.length - 1) return false;
  const { phase } = run.attempt;
  return phase.kind === 'landed' || (phase.kind === 'absorb' && phase.seatedFor >= LEAD_ON_SEATED_TIME);
}

/** Advances the run by `dt` seconds, the controller stepping with the physics. */
export function advanceTrickRun(run: TrickRun, dt: number): void {
  stepStringSimDriven(run.sim, dt, (sim, h) => {
    if (readyToLeadOn(run)) {
      run.step += 1;
      run.attempt = continueCatch(currentTrick(run), run.attempt, sim);
    }
    run.attempt = stepCatch(currentTrick(run), run.attempt, sim, h);
    return gripPose(run.attempt.hand.position, run.attempt.hand.orientation);
  });
}
