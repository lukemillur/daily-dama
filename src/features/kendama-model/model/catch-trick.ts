import { Quaternion, Vector3 } from 'three';

import { sampleProfile, SARADO_BODY, TAMA } from './anatomy';
import {
  HAND_MAX_ACCELERATION,
  moveHand,
  restingHand,
  trackAxis,
  trackOrientation,
  WRIST_MAX_ANGULAR_ACCELERATION,
  WRIST_MAX_ANGULAR_SPEED,
  type Hand,
} from './hand';
import { createStringSim, GRAVITY, stepStringSimDriven, type StringSim } from './string-sim';
import { GRIP_QUATERNIONS, gripPose, type Grip, type Handedness, type Quat } from './stringing';
import { multiply, rotate, rotateInverse } from './vec';
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
  /**
   * For a trick caught in a grip a pull cannot start from: the grip held
   * through the pull, and the turn that takes it to `grip`. The wrist turns
   * through it gradually, in step with the ball's climb, so the ken reaches
   * its catching grip as the ball peaks. Only a launch from below turns this
   * way; one leading on from a seat turns once the ball is clear.
   */
  riseTurn?: RiseTurn;
  /**
   * How the hand plans to meet the falling ball (`catchAcceleration`). A
   * `dive` reaches the ball's speed within the hand's limits however far it
   * falls; Big Cup and Spike are tuned around the older `cubic`.
   */
  intercept: Intercept;
};

export type Intercept = 'cubic' | 'dive';

/** Turning from the grip `from` by `angle` radians about the world `axis`. */
export type RiseTurn = { from: Grip; axis: Vec3; angle: number };

/** The ball's height when the pull began, and the apex the pull is sized for. */
export type Climb = { from: number; to: number };

/** What the player has to go on: what they see of the ball, and whether they feel it arrive. */
export type BallObservation = {
  readonly tamaPosition: ArrayLike<number>;
  readonly tamaVelocity: ArrayLike<number>;
  readonly tamaQuaternion: ArrayLike<number>;
  readonly tamaTouching: boolean;
  /** How fast the ball is turning, rad/s about world axes, as a player sees it spin. */
  readonly tamaSpin?: ArrayLike<number>;
};

export type CatchPhase =
  /** Steadying the hanging ball: the hand follows its swing until it stops. */
  | { kind: 'settle'; calmFor: number }
  /** `lifted` latches once the hand reaches `launchSpeed`, in a turnover's pop. */
  | { kind: 'pull'; launchSpeed: number; from: LaunchFrom; climb: Climb; lifted?: boolean }
  /** `free` latches once the ball has left the ken it was launched from. */
  | { kind: 'rise'; from: LaunchFrom; free: boolean; climb: Climb }
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
  /**
   * Set when leading on into a hole trick from a seat that holds the hole
   * the wrong way: the ball must turn over in the air, and the ken turns
   * with it.
   */
  turnover?: Turnover;
  /**
   * Where the ball sat when a pop off a seat began, in the ken's own frame
   * from the hand. The wrist holds the ken still until the ball has lifted
   * clear of it.
   */
  seat?: Vec3;
};

/**
 * Turning a seated ball over on the way to a hole catch. The pop swings the
 * ken about the ball's centre, so the seat carries the ball round instead
 * of sliding under it, and the ball leaves spinning about `axis` at `spin`.
 * `grip` is the ken turned half over about the same axis: the catching
 * grip, which may face the sarado the other way from the trick's own.
 */
export type Turnover = { axis: Vec3; spin: number; grip: Quat };

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
export const REACH = 350;
/** Resting on the ken away from the seat for this long is a miss, not a catch in progress. */
export const BLOCKED_TIME = 0.4;
/** The pull is the hardest the hand can lift. */
export const PULL_ACCELERATION = HAND_MAX_ACCELERATION;
/** Room left between a ball passing beside the ken and the sarado's furthest point that way. */
const PASSING_ROOM = 14;
const CLEAR_ABOVE = 12;

export const RETURN_OMEGA = 22;
export const HORIZONTAL_OMEGA = 40;
/**
 * The ken meets the ball moving down at this fraction of the ball's speed.
 * The difference, about 150 mm/s, is under the contact's bounce threshold,
 * so the ball lands rather than bounces, and the arm has the rest of the
 * speed to absorb.
 */
export const CATCH_SPEED_MATCH = 0.9;
/** Shortest planning horizon: an intercept due sooner than this is chased, not planned. */
export const MIN_INTERCEPT_TIME = 0.03;
const ABSORB_OMEGA = 14;
/** The wrist holds the grip steady against the string's tug. */
export const GRIP_OMEGA = 60;
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
export const MAX_FOLLOW_TILT = 0.6;
/**
 * Air time a seat pop adds past the wrist's quickest turn to the next grip:
 * enough to finish turning before the ball comes down.
 */
const POP_TURN_SLACK = 0.1;
/** A ball that must also turn over gets longer, so the wrist can follow its hole in. */
const TURNOVER_TURN_SLACK = 0.3;
/** A turnover's pop has spun the ball up once the swing reaches this share of its planned speed. */
const SPUN_SHARE = 0.9;
/**
 * How far the ball must have lifted off its seat, mm, before the wrist may
 * turn the seat away under it, or a turnover stop swinging. A ball that has
 * merely stopped pressing is still within reach of the rim, and a rim turned
 * against it rubs a spin onto it.
 */
const RELEASE_GAP = 8;
/** The hole counts as facing down within this of straight down, radians. */
const HOLE_DOWN_AIM = 0.15;
/** A turning ball is met no lower than this below home, nor higher than this above, mm. */
const MEET_BELOW_HOME = 150;
const MEET_ABOVE_HOME = 60;

/** Within this of the seat, at this relative speed, for this long: landed. */
export const SEATED_DISTANCE = 4;
/** Touching the ken this close to the seat is the ball arriving. */
export const ARRIVAL_DISTANCE = 8;
export const SEATED_SPEED = 60;
export const SEATED_TIME = 0.5;
export const BOUNCED_OUT_DISTANCE = 20;
/**
 * The ball has fallen this far below where the seat sits at home: no catch
 * is in reach of a cushioning arm.
 */
export const FELL_PAST = 250;

/** The grip the ken is held in before the pull. */
export function startingGrip(trick: CatchTrick): Quat {
  return GRIP_QUATERNIONS[trick.riseTurn?.from ?? trick.grip];
}

export function startCatch(trick: CatchTrick, home: Vec3): CatchAttempt {
  const grip = startingGrip(trick);
  return { phase: { kind: 'settle', calmFor: 0 }, hand: restingHand(home, grip), home, time: 0, heldGrip: grip };
}

/**
 * Leads on into `trick` from an attempt whose ball is sitting in its seat:
 * the hand pops the ball up off it, holding the ken as it is until the ball
 * is clear, then turns to the new grip while the ball is in the air.
 */
export function continueCatch(
  trick: CatchTrick,
  previous: CatchAttempt,
  ball: BallObservation,
  kenStringHole?: ArrayLike<number>,
): CatchAttempt {
  const lift = launchSpeedFor(trick, previous.hand.position[1] - ball.tamaPosition[1], 'seat');
  // A ball that must turn over needs longer in the air than the wrist's turn alone.
  const turnsOver = needsTurnover(trick, ball);
  const turn = turnTime(previous.hand.orientation, GRIP_QUATERNIONS[trick.grip]) + (turnsOver ? TURNOVER_TURN_SLACK : POP_TURN_SLACK);
  const fall = ball.tamaPosition[1] - (previous.home[1] + trick.seatHeight);
  const launchSpeed = Math.max(lift, (GRAVITY * turn) / 2 - fall / turn);
  return {
    phase: { kind: 'pull', launchSpeed, from: 'seat', climb: plannedClimb(ball.tamaPosition[1], launchSpeed) },
    hand: previous.hand,
    home: previous.home,
    time: 0,
    heldGrip: previous.hand.orientation,
    turnover: turnsOver ? turnoverFor(trick, previous.hand, ball, kenStringHole, (launchSpeed + Math.sqrt(launchSpeed ** 2 + 2 * GRAVITY * Math.max(fall, 0))) / GRAVITY) : undefined,
    seat: seatFrom(previous.hand, ball.tamaPosition),
  };
}

/** Where the ball sits, in the ken's own frame from the hand. */
function seatFrom(hand: Hand, p: ArrayLike<number>): Vec3 {
  const seat = [0, 0, 0];
  rotateInverse(hand.orientation, p[0] - hand.position[0], p[1] - hand.position[1], p[2] - hand.position[2], seat);
  return [seat[0], seat[1], seat[2]];
}

const seatNow = [0, 0, 0];

/** How far the ball has lifted off where it sat, wherever the ken has moved it. */
function gapFromSeat(hand: Hand, p: ArrayLike<number>, seat: Vec3): number {
  rotate(hand.orientation, seat[0], seat[1], seat[2], seatNow);
  return Math.hypot(
    p[0] - hand.position[0] - seatNow[0],
    p[1] - hand.position[1] - seatNow[1],
    p[2] - hand.position[2] - seatNow[2],
  );
}

const seatHole = [0, 0, 0];

/** Whether `trick` needs the ball's hole facing down and it sits further off than the wrist can follow. */
function needsTurnover(trick: CatchTrick, ball: BallObservation): boolean {
  if (!trick.followsHole) return false;
  rotate(ball.tamaQuaternion, 0, -1, 0, seatHole);
  return Math.acos(Math.min(Math.max(-seatHole[1], -1), 1)) > MAX_FOLLOW_TILT;
}

/** The spin that turns the seated ball hole-down over `airtime`. */
function turnoverFor(
  trick: CatchTrick,
  hand: Hand,
  ball: BallObservation,
  kenStringHole: ArrayLike<number> | undefined,
  airtime: number,
): Turnover {
  // The hole opens along the ball's local -Y.
  rotate(ball.tamaQuaternion, 0, -1, 0, seatHole);
  const angle = Math.acos(Math.min(Math.max(-seatHole[1], -1), 1));
  // The turn rolls the string hole, opposite the hole, toward where the
  // string runs off to, the ken's own string hole: the string then unwinds
  // off the ball as it turns, rather than wrapping half round it and running
  // out. That is the axis d × up, for d the way across to the ken's hole.
  let ax = 1, az = 0;
  if (kenStringHole) {
    const dx = kenStringHole[0] - ball.tamaPosition[0];
    const dz = kenStringHole[2] - ball.tamaPosition[2];
    const across = Math.hypot(dx, dz);
    if (across > 1) {
      ax = -dz / across;
      az = dx / across;
    }
  } else {
    // hole × down: the turn that carries the hole round to the bottom.
    const length = Math.hypot(seatHole[2], seatHole[0]);
    if (length > 1e-3) {
      ax = seatHole[2] / length;
      az = -seatHole[0] / length;
    }
  }
  const kenFrom: Quat = [...hand.orientation];
  // The ken turns over with the ball, about the same axis.
  const half = Math.PI / 2;
  const turn = [ax * Math.sin(half), 0, az * Math.sin(half), Math.cos(half)];
  const grip = [0, 0, 0, 1];
  multiply(turn, kenFrom, grip);
  return {
    axis: [ax, 0, az],
    spin: angle / airtime,
    grip: [grip[0], grip[1], grip[2], grip[3]],
  };
}

const holeNow = [0, 0, 0];

/**
 * The height to meet a turning ball at: where it will have fallen to by the
 * time its hole comes round to face down, from how fast it is actually
 * turning now. A ball that left spinning slowly is met lower, later; one
 * spinning fast, higher. Within the arm's reach of home either way.
 */
function meetWhenHoleDown(trick: CatchTrick, home: Vec3, ball: BallObservation): number {
  const w = ball.tamaSpin;
  if (!w) return home[1];
  rotate(ball.tamaQuaternion, 0, -1, 0, holeNow);
  const angle = Math.acos(Math.min(Math.max(-holeNow[1], -1), 1));
  // d(angle)/dt from the hole's motion, ω × hole, which moves its height.
  const rising = w[2] * holeNow[0] - w[0] * holeNow[2];
  const rate = rising / Math.max(Math.sin(angle), 1e-3);
  if (angle <= HOLE_DOWN_AIM || rate >= -0.5) return home[1];
  const t = (angle - HOLE_DOWN_AIM) / -rate;
  const p = ball.tamaPosition;
  const v = ball.tamaVelocity;
  const fallen = p[1] + v[1] * t - 0.5 * GRAVITY * t * t - trick.seatHeight;
  return Math.min(Math.max(fallen, home[1] - MEET_BELOW_HOME), home[1] + MEET_ABOVE_HOME);
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
  const rise = Math.max(drop + Math.max(trick.kenTop + TAMA.radius, CLEAR_OF_TURN), 0) + POP_CLEARANCE;
  return Math.sqrt(2 * GRAVITY * rise);
}

/**
 * Where a ball launched at `launchSpeed` from `height` is planned to peak:
 * it rides the pull, v² / 2a, then flies, v² / 2g.
 */
export function plannedClimb(height: number, launchSpeed: number): Climb {
  const v2 = launchSpeed * launchSpeed;
  return { from: height, to: height + v2 / (2 * PULL_ACCELERATION) + v2 / (2 * GRAVITY) };
}

/** The quickest the wrist can turn from one orientation to another, from rest to rest. */
export function turnTime(from: Quat, to: Quat): number {
  const dot = Math.abs(from[0] * to[0] + from[1] * to[1] + from[2] * to[2] + from[3] * to[3]);
  const angle = 2 * Math.acos(Math.min(dot, 1));
  const a = WRIST_MAX_ANGULAR_ACCELERATION;
  const w = WRIST_MAX_ANGULAR_SPEED;
  return angle <= (w * w) / a ? 2 * Math.sqrt(angle / a) : angle / w + w / a;
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
  const grip = attempt.turnover?.grip ?? GRIP_QUATERNIONS[trick.grip];

  const advance = (phase: CatchPhase, acceleration: Vec3, wrist: Quat = grip): CatchAttempt => ({
    phase,
    hand: moveHand(hand, { linear: acceleration, angular: trackOrientation(hand, wrist, GRIP_OMEGA) }, h),
    home,
    time,
    heldGrip: attempt.heldGrip,
    turnover: attempt.turnover,
    seat: attempt.seat,
  });
  const hold = (): Vec3 => [
    trackAxis(hand.position[0], hand.velocity[0], home[0], 0, RETURN_OMEGA),
    trackAxis(hand.position[1], hand.velocity[1], home[1], 0, RETURN_OMEGA),
    trackAxis(hand.position[2], hand.velocity[2], home[2], 0, RETURN_OMEGA),
  ];
  const catching = (phase: CatchPhase) =>
    advance(
      phase,
      catchAcceleration(trick, hand, home, ball, attempt.turnover ? meetWhenHoleDown(trick, home, ball) : home[1]),
      trick.followsHole ? followHole(grip, ball.tamaQuaternion) : grip,
    );

  switch (attempt.phase.kind) {
    case 'settle': {
      const settling = settle(hand, home, v, attempt.phase.calmFor, time, h);
      if (settling) return advance({ kind: 'settle', calmFor: settling.calmFor }, settling.acceleration, attempt.heldGrip);
      const launchSpeed = launchSpeedFor(trick, hand.position[1] - p[1]);
      const climb = plannedClimb(p[1], launchSpeed);
      return advance({ kind: 'pull', launchSpeed, from: 'below', climb }, [0, PULL_ACCELERATION, 0], attempt.heldGrip);
    }

    case 'pull': {
      const { launchSpeed, from, climb } = attempt.phase;
      const { turnover } = attempt;
      if (turnover) {
        // Lift, and swing the ken round the ball's centre, so the seat turns
        // the ball with it rather than sliding out from under it. The arm
        // gets up to the swing's speed more slowly than the wrist can turn,
        // so the wrist turns only as fast as the arm is swinging: ω = v / r.
        const rx = hand.position[0] - p[0], ry = hand.position[1] - p[1], rz = hand.position[2] - p[2];
        const r = Math.hypot(rx, ry, rz);
        const [ax, ay, az] = turnover.axis;
        // The swing's direction, axis × (hand − ball), across.
        let sx = ay * rz - az * ry, sz = ax * ry - ay * rx;
        const across = Math.hypot(sx, sz);
        sx /= across;
        sz /= across;
        const swingSpeed = turnover.spin * r;
        const swung = hand.velocity[0] * sx + hand.velocity[2] * sz;
        const omega = swung / r;
        const w = hand.angularVelocity;
        const lifting = !attempt.phase.lifted && hand.velocity[1] < launchSpeed;
        const spun = swung >= SPUN_SHARE * swingSpeed;
        // The swing and the turn hold steady until the ball is clear of the
        // seat: turning on ahead of the ball tilts the seat, and its trailing
        // rim rises into the ball and rubs its spin back off. A ball that
        // has merely stopped pressing is not clear.
        const gap = attempt.seat ? gapFromSeat(hand, p, attempt.seat) : Infinity;
        // Once the hand has stopped rising the pop is over, spun up or not.
        const popOver = !lifting && hand.velocity[1] <= 0;
        const released = (!lifting && spun && gap > RELEASE_GAP) || popOver;
        const next: CatchAttempt = {
          phase: released ? { kind: 'rise', from, free: true, climb } : { ...attempt.phase, lifted: !lifting },
          hand: moveHand(
            hand,
            {
              linear: [
                2 * HORIZONTAL_OMEGA * (sx * swingSpeed - hand.velocity[0]),
                // Once up to speed, the pop stops hard, so the ball flies on.
                lifting ? PULL_ACCELERATION : hand.velocity[1] > 0 ? -PULL_ACCELERATION : 0,
                2 * HORIZONTAL_OMEGA * (sz * swingSpeed - hand.velocity[2]),
              ],
              angular: [
                2 * GRIP_OMEGA * (ax * omega - w[0]),
                2 * GRIP_OMEGA * (ay * omega - w[1]),
                2 * GRIP_OMEGA * (az * omega - w[2]),
              ],
            },
            h,
          ),
          home,
          time,
          heldGrip: attempt.heldGrip,
          turnover,
          seat: attempt.seat,
        };
        return next;
      }
      const wrist = climbingGrip(trick, from, climb, p[1]) ?? attempt.heldGrip;
      if (hand.velocity[1] < launchSpeed) {
        return advance(attempt.phase, [0, PULL_ACCELERATION, 0], wrist);
      }
      return advance({ kind: 'rise', from, free: false, climb }, hold(), wrist);
    }

    case 'rise': {
      if (outOfReach(hand, home)) return advance({ kind: 'missed', reason: 'out-of-reach' }, hold());
      if (v[1] <= 0) return catching({ kind: 'catch', blockedFor: 0 });

      // Turning the ken while the ball is near it would sweep a rim into
      // it, so the wrist holds the old grip until the ball is clear of
      // everything the turn can reach, then turns to the trick's grip. The
      // sarado's sweep is not enough on its own: a ball on the base cup sits
      // beyond it already, at the end of the handle, and must lift off first.
      const { from, climb } = attempt.phase;
      const reach = Math.hypot(p[0] - hand.position[0], p[1] - hand.position[1], p[2] - hand.position[2]);
      const offSeat = !attempt.seat || gapFromSeat(hand, p, attempt.seat) > RELEASE_GAP;
      const free = attempt.phase.free || (!ball.tamaTouching && reach > CLEAR_OF_TURN && offSeat);
      // A ball rising from below must pass beside the ken until it is above
      // its top; one popped off a seat is above it already.
      const passing = from === 'below' && p[1] - TAMA.radius < hand.position[1] + trick.kenTop + CLEAR_ABOVE;
      const [x, z, vx, vz]: Aim = passing ? [...besideBall(hand, p), v[0], v[2]] : aimPoint(trick, hand, ball);
      const homing = trackAxis(hand.position[1], hand.velocity[1], home[1], 0, RETURN_OMEGA);
      return advance(
        { kind: 'rise', from, free, climb },
        [
          trackAxis(hand.position[0], hand.velocity[0], x, vx, HORIZONTAL_OMEGA),
          from === 'seat' && hand.velocity[1] > 0 ? Math.min(homing, -PULL_ACCELERATION) : homing,
          trackAxis(hand.position[2], hand.velocity[2], z, vz, HORIZONTAL_OMEGA),
        ],
        climbingGrip(trick, from, climb, p[1]) ?? (free ? grip : attempt.heldGrip),
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
      // Struck well away from the seat, on the spike's tip, say: the player
      // feels it and stops steering under the ball, which would balance it
      // there as no hand can, and it rolls off. Nearer the seat, a touch is
      // the ball arriving, and the catch carries on.
      if (!ball.tamaTouching || seatDistance(trick, hand, p) < BOUNCED_OUT_DISTANCE) {
        return catching({ kind: 'catch', blockedFor });
      }
      const [, y] = catchAcceleration(trick, hand, home, ball);
      return advance(
        { kind: 'catch', blockedFor },
        [-2 * HORIZONTAL_OMEGA * hand.velocity[0], y, -2 * HORIZONTAL_OMEGA * hand.velocity[2]],
        trick.followsHole ? followHole(grip, ball.tamaQuaternion) : grip,
      );
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

/**
 * One substep of steadying whatever hangs from the hand, from the velocity
 * of what swings: the hand follows the swing to take energy out of it, and
 * drifts home slowly. Null once it has been calm long enough, or the
 * player's patience has run out.
 */
export function settle(
  hand: Hand,
  home: Vec3,
  swinging: ArrayLike<number>,
  calmFor: number,
  time: number,
  h: number,
): { calmFor: number; acceleration: Vec3 } | null {
  // The swing is the motion relative to the hand. Following the absolute
  // velocity would chase the drift the hand itself causes.
  const swingX = swinging[0] - hand.velocity[0];
  const swingZ = swinging[2] - hand.velocity[2];
  const calm = Math.hypot(swingX, swingZ) < STEADY_SPEED ? calmFor + h : 0;
  const steady = time >= SETTLE_TIME && calm >= CALM_TIME;
  if (steady || time >= MAX_SETTLE_TIME) return null;
  return {
    calmFor: calm,
    acceleration: [
      trackAxis(hand.position[0], hand.velocity[0], home[0], 0, SETTLE_HOME_OMEGA) + STEADY_GAIN * swingX,
      trackAxis(hand.position[1], hand.velocity[1], home[1], 0, RETURN_OMEGA),
      trackAxis(hand.position[2], hand.velocity[2], home[2], 0, SETTLE_HOME_OMEGA) + STEADY_GAIN * swingZ,
    ],
  };
}

export function outOfReach(hand: Hand, home: Vec3): boolean {
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

const turnStep = [0, 0, 0, 1];
const turned = [0, 0, 0, 1];

/**
 * The wrist part way through a trick's rise turn, as far through it as the
 * ball is through its planned climb; null when the trick has no such turn
 * or the ball was not launched from below. Eased at both ends, so the
 * wrist starts and finishes the turn gently rather than at a jerk.
 */
export function climbingGrip(trick: CatchTrick, from: LaunchFrom, climb: Climb, height: number): Quat | null {
  const { riseTurn } = trick;
  if (!riseTurn || from !== 'below') return null;
  const progress = Math.min(Math.max((height - climb.from) / (climb.to - climb.from), 0), 1);
  const half = (riseTurn.angle * progress * progress * (3 - 2 * progress)) / 2;
  const [ax, ay, az] = riseTurn.axis;
  const sine = Math.sin(half) / Math.hypot(ax, ay, az);
  turnStep[0] = ax * sine;
  turnStep[1] = ay * sine;
  turnStep[2] = az * sine;
  turnStep[3] = Math.cos(half);
  multiply(turnStep, GRIP_QUATERNIONS[riseTurn.from], turned);
  return [turned[0], turned[1], turned[2], turned[3]];
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
 * The hand dives to meet the ball this hard: well inside its 3 g, so the
 * dive is one it can actually make with acceleration to spare for lining
 * up across.
 */
const DIVE_ACCELERATION = 2 * GRAVITY;
/** How hard the hand holds to the planned wait-and-dive. */
const DIVE_OMEGA = 40;

/**
 * Intercept the falling ball with the hand back at home height.
 *
 * Ballistics say when the ball will reach its seat over the home position.
 * The hand plans to be there at that moment moving down at nearly the
 * ball's speed. Re-planning every substep turns the plan into feedback.
 *
 * A `cubic` plan takes the starting acceleration of the cubic through those
 * two ends. It asks for little at first and most at the end, which on a
 * long fall is more than the hand can give: it arrives too slow, and a ball
 * dropped 200 mm onto the base cup's shallow rim bounces off. A `dive`
 * gets up to speed at a steady `DIVE_ACCELERATION` instead: it waits at the
 * height the dive starts from, then drops.
 *
 * A misaligned ken plans to arrive lower, so it is never raised into the
 * ball before it is under it.
 */
function catchAcceleration(trick: CatchTrick, hand: Hand, home: Vec3, ball: BallObservation, meetHeight = home[1]): Vec3 {
  const p = ball.tamaPosition;
  const v = ball.tamaVelocity;
  const [x, z, vx, vz] = aimPoint(trick, hand, ball);
  const misalignment = Math.hypot(x - hand.position[0], z - hand.position[2]);
  const meetY = meetHeight - trick.alignRoom * misalignment;
  const drop = p[1] - (meetY + trick.seatHeight);
  const discriminant = v[1] * v[1] + 2 * GRAVITY * drop;
  const across = (target: number, at: number, targetVelocity: number, velocity: number) =>
    trackAxis(at, velocity, target, targetVelocity, HORIZONTAL_OMEGA);

  // Past the planned meeting point already: chase the seat to the ball.
  if (drop <= 0 || discriminant <= 0) {
    return [
      across(x, hand.position[0], vx, hand.velocity[0]),
      hermiteStartAcceleration(
        hand.position[1],
        hand.velocity[1],
        p[1] - trick.seatHeight,
        CATCH_SPEED_MATCH * v[1],
        MIN_INTERCEPT_TIME,
      ),
      across(z, hand.position[2], vz, hand.velocity[2]),
    ];
  }

  const until = (v[1] + Math.sqrt(discriminant)) / GRAVITY;
  const meetVy = CATCH_SPEED_MATCH * (v[1] - GRAVITY * until);
  if (trick.intercept === 'cubic') {
    return [
      across(x, hand.position[0], vx, hand.velocity[0]),
      hermiteStartAcceleration(hand.position[1], hand.velocity[1], meetY, meetVy, Math.max(until, MIN_INTERCEPT_TIME)),
      across(z, hand.position[2], vz, hand.velocity[2]),
    ];
  }
  // Where the plan has the hand now, `until` before the meeting: still
  // waiting, or that far into the dive.
  const dive = Math.min(until, -meetVy / DIVE_ACCELERATION);
  const targetVy = meetVy + DIVE_ACCELERATION * dive;
  const targetY = meetY - meetVy * dive - 0.5 * DIVE_ACCELERATION * dive * dive;
  const diving = until < -meetVy / DIVE_ACCELERATION;

  return [
    across(x, hand.position[0], vx, hand.velocity[0]),
    (diving ? -DIVE_ACCELERATION : 0) + trackAxis(hand.position[1], hand.velocity[1], targetY, targetVy, DIVE_OMEGA),
    across(z, hand.position[2], vz, hand.velocity[2]),
  ];
}

/** Starting acceleration of the cubic from (y0, v0) to (y1, v1) over `t` seconds. */
export function hermiteStartAcceleration(y0: number, v0: number, y1: number, v1: number, t: number): number {
  return (6 * (y1 - y0)) / (t * t) - (4 * v0 + 2 * v1) / t;
}

/** Bring the hand, and the ball it caught, gently to rest. */
export function absorbAcceleration(hand: Hand): Vec3 {
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
    sim: createStringSim(handedness, gripPose(home, startingGrip(tricks[0])), { kind: 'hanging' }),
    attempt: startCatch(tricks[0], home),
  };
}

/**
 * A run that starts with the ball already sitting in the first trick's
 * seat, turned to `tamaQuaternion`: for leading on from a seat the ball is
 * placed in, such as hole up on the base cup.
 */
export function createSeatedRun(
  tricks: readonly [CatchTrick, ...CatchTrick[]],
  handedness: Handedness,
  tamaQuaternion: Quat,
  home: Vec3 = [0, 0, 0],
): TrickRun {
  const [first] = tricks;
  const grip = GRIP_QUATERNIONS[first.grip];
  const [ax, ay, az] = first.catchAxis;
  const seat = [0, 0, 0];
  // A hair above the seat, so the ball settles onto it rather than starting buried.
  const height = first.seatHeight + 0.5;
  rotate(grip, ax * height, ay * height, az * height, seat);
  const tamaCentre: Vec3 = [home[0] + seat[0], home[1] + seat[1], home[2] + seat[2]];
  return {
    tricks,
    step: 0,
    sim: createStringSim(handedness, gripPose(home, grip), { kind: 'held', tamaCentre, tamaQuaternion }),
    attempt: { phase: { kind: 'absorb', seatedFor: 0 }, hand: restingHand(home, grip), home, time: 0, heldGrip: grip },
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
      run.attempt = continueCatch(currentTrick(run), run.attempt, sim, sim.positions);
    }
    run.attempt = stepCatch(currentTrick(run), run.attempt, sim, h);
    return gripPose(run.attempt.hand.position, run.attempt.hand.orientation);
  });
}
