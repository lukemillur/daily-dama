import { cupSeatOffset, SARADO, TAMA } from './anatomy';
import { HAND_MAX_ACCELERATION, moveHand, restingHand, trackAxis, type Hand } from './hand';
import { createStringSim, GRAVITY, stepStringSimDriven, type StringSim } from './string-sim';
import { bigCupGripPose, type Handedness } from './stringing';
import type { Vec3 } from './views';

/**
 * Big Cup as a hand strategy, not a path: the ball only ever moves under
 * the string simulation, and this decides what the hand does, the way a
 * player does it.
 *
 * 1. **Pull**: lift hard, so the taut string launches the ball upward.
 * 2. **Rise**: brake. The ball flies on with the string slack. Step the
 *    ken aside so the ball climbs past it, then slide the cup under it.
 * 3. **Catch**: from the apex, meet the falling ball, matching its speed by
 *    the time it touches so it lands rather than bounces.
 * 4. **Absorb**: ease the falling hand to a stop with the ball seated.
 *
 * The pull is open-loop, sized from ballistics. Everything after it watches
 * the ball, so the trick survives a swinging start or a change to the
 * string's tuning.
 */

/** What the player has to go on: what they see of the ball, and whether they feel it land. */
export type BallObservation = {
  readonly tamaPosition: ArrayLike<number>;
  readonly tamaVelocity: ArrayLike<number>;
  readonly tamaTouching: boolean;
};

export type BigCupPhase =
  | { kind: 'settle' }
  | { kind: 'pull'; launchSpeed: number }
  | { kind: 'rise' }
  | { kind: 'catch' }
  | { kind: 'absorb'; seatedFor: number }
  | { kind: 'landed' }
  | { kind: 'missed'; reason: MissReason };

export type MissReason = 'fell-past' | 'bounced-out';

export type BigCupAttempt = {
  phase: BigCupPhase;
  hand: Hand;
  /** Where the hand started, and returns to while the ball flies. */
  home: Vec3;
  /** Seconds since the attempt began. */
  time: number;
};

/** Let the hanging ball come to rest before pulling. */
const SETTLE_TIME = 0.35;
/** The pull is the hardest the hand can lift. */
const PULL_ACCELERATION = HAND_MAX_ACCELERATION;
/** How far the ball should rise above its seat when the hand is home again. */
const APEX_MARGIN = 120;

/** The seated ball's centre above the hand (the sarado's centre). */
export const BIG_CUP_SEAT_HEIGHT = SARADO.bigCup.rimHeight + cupSeatOffset(SARADO.bigCup);
/** The top of the ken in the grip: the big cup's rim. */
const KEN_TOP = SARADO.bigCup.rimHeight;
/**
 * Sideways gap, centre to axis, that lets the rising ball pass the ken: the
 * ball's radius, the sarado's widest band, and a little room.
 */
const CLEARANCE = TAMA.radius + 24.65 + 14;
const CLEAR_ABOVE = 12;

const RETURN_OMEGA = 22;
const HORIZONTAL_OMEGA = 40;
/**
 * The cup meets the ball moving down at this fraction of the ball's speed.
 * The difference, about 150 mm/s, is under the contact's bounce threshold,
 * so the ball lands rather than bounces, and the arm has the rest of the
 * speed to absorb.
 */
const CATCH_SPEED_MATCH = 0.9;
/** Shortest planning horizon: an intercept due sooner than this is chased, not planned. */
const MIN_INTERCEPT_TIME = 0.03;
/**
 * Extra vertical room per mm of sideways misalignment. The cup must not
 * rise into the ball until it is under it, or the rim strikes it sideways.
 */
const ALIGN_ROOM = 1.2;
const ABSORB_OMEGA = 14;

/** Within this of the seat, at this relative speed, for this long: landed. */
const SEATED_DISTANCE = 4;
/** Touching the ken this close to the seat is the ball arriving in the cup. */
const ARRIVAL_DISTANCE = 8;
const SEATED_SPEED = 60;
const SEATED_TIME = 0.5;
const BOUNCED_OUT_DISTANCE = 20;
/**
 * The ball has fallen this far below where the seat sits at home: no catch
 * is in reach of a cushioning arm.
 */
const FELL_PAST = 250;

export function startBigCup(home: Vec3): BigCupAttempt {
  return { phase: { kind: 'settle' }, hand: restingHand(home), home, time: 0 };
}

/**
 * Launch speed for a pull at `PULL_ACCELERATION` that lifts the ball from
 * `drop` below the hand to `APEX_MARGIN` above its seat.
 *
 * The ball rides the taut string through the pull, covering v² / 2a, then
 * flies to its apex, v² / 2g. The two together must cover the drop plus the
 * seat height plus the margin.
 */
export function launchSpeedFor(drop: number): number {
  const rise = drop + BIG_CUP_SEAT_HEIGHT + APEX_MARGIN;
  return Math.sqrt((2 * rise) / (1 / GRAVITY + 1 / PULL_ACCELERATION));
}

export function isFinished(attempt: BigCupAttempt): boolean {
  return attempt.phase.kind === 'landed' || attempt.phase.kind === 'missed';
}

/** One substep of the controller: the authority for every phase change. */
export function stepBigCup(attempt: BigCupAttempt, ball: BallObservation, h: number): BigCupAttempt {
  const { hand, home } = attempt;
  const time = attempt.time + h;
  const p = ball.tamaPosition;
  const v = ball.tamaVelocity;

  const advance = (phase: BigCupPhase, acceleration: Vec3): BigCupAttempt => ({
    phase,
    hand: moveHand(hand, acceleration, h),
    home,
    time,
  });
  const hold = (): Vec3 => [
    trackAxis(hand.position[0], hand.velocity[0], home[0], 0, RETURN_OMEGA),
    trackAxis(hand.position[1], hand.velocity[1], home[1], 0, RETURN_OMEGA),
    trackAxis(hand.position[2], hand.velocity[2], home[2], 0, RETURN_OMEGA),
  ];

  switch (attempt.phase.kind) {
    case 'settle': {
      if (time < SETTLE_TIME) return advance(attempt.phase, hold());
      const launchSpeed = launchSpeedFor(hand.position[1] - p[1]);
      return advance({ kind: 'pull', launchSpeed }, [0, PULL_ACCELERATION, 0]);
    }

    case 'pull': {
      if (hand.velocity[1] < attempt.phase.launchSpeed) {
        return advance(attempt.phase, [0, PULL_ACCELERATION, 0]);
      }
      return advance({ kind: 'rise' }, hold());
    }

    case 'rise': {
      if (v[1] <= 0) return advance({ kind: 'catch' }, catchAcceleration(hand, home, p, v));

      // Below the top of the ken, the ball must pass beside it; above, the
      // cup can slide under.
      const passing = p[1] - TAMA.radius < hand.position[1] + KEN_TOP + CLEAR_ABOVE;
      const awayX = hand.position[0] - p[0];
      const awayZ = hand.position[2] - p[2];
      const away = Math.hypot(awayX, awayZ);
      // The string hangs the ball to the player's inside, so stepping the
      // other way is the short way round.
      const ux = away > 1e-6 ? awayX / away : 1;
      const uz = away > 1e-6 ? awayZ / away : 0;
      const offset = passing ? CLEARANCE : 0;
      return advance(attempt.phase, [
        trackAxis(hand.position[0], hand.velocity[0], p[0] + ux * offset, v[0], HORIZONTAL_OMEGA),
        trackAxis(hand.position[1], hand.velocity[1], home[1], 0, RETURN_OMEGA),
        trackAxis(hand.position[2], hand.velocity[2], p[2] + uz * offset, v[2], HORIZONTAL_OMEGA),
      ]);
    }

    case 'catch': {
      if (p[1] < home[1] + BIG_CUP_SEAT_HEIGHT - FELL_PAST) {
        return advance({ kind: 'missed', reason: 'fell-past' }, hold());
      }
      if (ball.tamaTouching && seatDistance(hand, p) < ARRIVAL_DISTANCE) {
        return advance({ kind: 'absorb', seatedFor: 0 }, absorbAcceleration(hand));
      }
      return advance(attempt.phase, catchAcceleration(hand, home, p, v));
    }

    case 'absorb': {
      const distance = seatDistance(hand, p);
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
      if (seatedFor >= SEATED_TIME) return advance({ kind: 'landed' }, absorbAcceleration(hand));
      return advance({ kind: 'absorb', seatedFor }, absorbAcceleration(hand));
    }

    case 'landed':
      return advance(attempt.phase, absorbAcceleration(hand));

    case 'missed':
      return advance(attempt.phase, hold());
  }
}

/**
 * Intercept the falling ball with the cup back at home height.
 *
 * Ballistics say when the ball will reach its seat over the home position.
 * The hand plans the cubic that arrives there at that moment, moving down
 * at nearly the ball's speed, and takes that cubic's starting acceleration.
 * Re-planning every substep turns the plan into feedback.
 *
 * A misaligned cup plans to arrive lower, so it is never raised into the
 * ball before it is under it; otherwise the rim would strike it sideways.
 */
function catchAcceleration(hand: Hand, home: Vec3, p: ArrayLike<number>, v: ArrayLike<number>): Vec3 {
  const misalignment = Math.hypot(p[0] - hand.position[0], p[2] - hand.position[2]);
  const meetY = home[1] - ALIGN_ROOM * misalignment;
  const drop = p[1] - (meetY + BIG_CUP_SEAT_HEIGHT);
  const discriminant = v[1] * v[1] + 2 * GRAVITY * drop;

  // Past the planned meeting point already: chase the seat to the ball.
  const planned = drop > 0 && discriminant > 0;
  const until = planned ? (v[1] + Math.sqrt(discriminant)) / GRAVITY : 0;
  const horizon = Math.max(until, MIN_INTERCEPT_TIME);
  const targetY = planned ? meetY : p[1] - BIG_CUP_SEAT_HEIGHT;
  const targetVy = CATCH_SPEED_MATCH * (v[1] - GRAVITY * until);

  return [
    trackAxis(hand.position[0], hand.velocity[0], p[0], v[0], HORIZONTAL_OMEGA),
    hermiteStartAcceleration(hand.position[1], hand.velocity[1], targetY, targetVy, horizon),
    trackAxis(hand.position[2], hand.velocity[2], p[2], v[2], HORIZONTAL_OMEGA),
  ];
}

/** Starting acceleration of the cubic from (y0, v0) to (y1, v1) over `t` seconds. */
function hermiteStartAcceleration(y0: number, v0: number, y1: number, v1: number, t: number): number {
  return (6 * (y1 - y0)) / (t * t) - (4 * v0 + 2 * v1) / t;
}

/** Bring the hand, and the ball sitting in its cup, gently to rest. */
function absorbAcceleration(hand: Hand): Vec3 {
  return [
    -ABSORB_OMEGA * hand.velocity[0],
    -ABSORB_OMEGA * hand.velocity[1],
    -ABSORB_OMEGA * hand.velocity[2],
  ];
}

function seatDistance(hand: Hand, p: ArrayLike<number>): number {
  return Math.hypot(
    p[0] - hand.position[0],
    p[1] - (hand.position[1] + BIG_CUP_SEAT_HEIGHT),
    p[2] - hand.position[2],
  );
}

/** A Big Cup attempt bound to its own simulation, from a ball hanging at rest. */
export type BigCupRun = { sim: StringSim; attempt: BigCupAttempt };

export function createBigCupRun(handedness: Handedness, home: Vec3 = [0, 0, 0]): BigCupRun {
  return {
    sim: createStringSim(handedness, bigCupGripPose(home), { kind: 'hanging' }),
    attempt: startBigCup(home),
  };
}

/** Advances the run by `dt` seconds, the controller stepping with the physics. */
export function advanceBigCupRun(run: BigCupRun, dt: number): void {
  stepStringSimDriven(run.sim, dt, (sim, h) => {
    run.attempt = stepBigCup(run.attempt, sim, h);
    return bigCupGripPose(run.attempt.hand.position);
  });
}
