import { Quaternion, Vector3 } from 'three';

import { SARADO } from './anatomy';
import {
  absorbAcceleration,
  ARRIVAL_DISTANCE,
  BLOCKED_TIME,
  BOUNCED_OUT_DISTANCE,
  FELL_PAST,
  GRIP_OMEGA,
  hermiteStartAcceleration,
  HORIZONTAL_OMEGA,
  MAX_FOLLOW_TILT,
  MIN_INTERCEPT_TIME,
  PULL_ACCELERATION,
  RETURN_OMEGA,
  SEATED_DISTANCE,
  SEATED_SPEED,
  SEATED_TIME,
  settle,
  type MissReason,
} from './catch-trick';
import { spikedTamaRestHeight } from './collision';
import { moveHand, restingHand, trackAxis, trackOrientation, type Hand } from './hand';
import { KEN_MASS } from './mass';
import { GRAVITY } from './string-sim';
import { TAMA_HOLE_UP_QUATERNION, type Handedness, type Quat } from './stringing';
import { createTamaHeldSim, stepTamaHeldSimDriven, type TamaHeldSim } from './tama-held-sim';
import { multiply, rotate } from './vec';
import type { Vec3 } from './views';

/**
 * Airplane: the hand holds the tama hole up and the ken hangs below it.
 * A pull that sweeps sideways as it lifts throws the ken up and turns it
 * over in the air, and the ball is brought under it to take the spike.
 *
 * It is the catch strategy of `catch-trick` with the bodies swapped, and
 * the same honesty: the ken only ever moves under the simulation, and the
 * hand decides what to do from what it sees of the ken.
 *
 * Why a sweep: a ken hanging from its string hole lines up with the string
 * within a few hundredths of a second, so it leaves a pull turning at the
 * rate the string turns, the hand's sideways speed over the string's
 * length. A straight pull launches it without a turn at all.
 */
export type AirplanePhase =
  | { kind: 'settle'; calmFor: number }
  /** `sweep` is the unit horizontal direction the hand sweeps, `[x, z]`. */
  | { kind: 'pull'; sweep: [number, number] }
  | { kind: 'rise'; sweep: [number, number] }
  | { kind: 'catch'; blockedFor: number; sweep: [number, number] }
  | { kind: 'absorb'; seatedFor: number }
  | { kind: 'landed' }
  | { kind: 'missed'; reason: MissReason };

export type AirplaneAttempt = {
  phase: AirplanePhase;
  hand: Hand;
  home: Vec3;
  time: number;
};

/** What the player has to go on: what they see of the ken, and whether they feel it arrive. */
export type KenObservation = Pick<
  TamaHeldSim,
  'kenCentre' | 'kenVelocity' | 'kenSpin' | 'kenPosition' | 'kenQuaternion' | 'kenTouching'
>;

/**
 * How far the pull leans from vertical toward the sweep, in radians. The
 * sideways share sets the ken's turn, about 5 rad/s here, and with it how
 * far the ken drifts. One of the trick's two tuned numbers, with
 * `LAUNCH_SPEED`, and a narrow one: a few hundredths either way and the
 * ken comes round too early or too late for the ball to get under it.
 */
const SWEEP_ANGLE = 0.6;

/**
 * While the ken turns over, the hand waits beside it, on the home side of
 * its drift, clear of whatever the turn sweeps: the spike and base cup
 * reach about 90 mm from its centre while it lies across, but only the
 * sarado's cups, under 40 mm, once it hangs spike down. The ball's radius
 * and some room come on top. Closing in as it turns puts the ball a short
 * step from under it by the time it can be caught.
 */
const PASSING_ACROSS = 150;
const PASSING_DOWN = 85;

function passingDistance(spikeDown: number): number {
  const across = Math.sqrt(Math.max(1 - spikeDown * spikeDown, 0));
  return spikeDown > 0 ? PASSING_DOWN + (PASSING_ACROSS - PASSING_DOWN) * across : PASSING_ACROSS;
}

/**
 * Upward speed at which the pull lets the ken go, mm/s. It throws the ken
 * from hanging 400 mm below the hand to about 330 mm above home, in the
 * air long enough for the sweep's spin to turn it spike down as it falls
 * back to where the ball can get under it. Like `SWEEP_ANGLE`, tuned, and
 * narrow: from rest it lands between about 3000 and 3060.
 */
const LAUNCH_SPEED = 3030;

/**
 * While the ken flies, the hand stops its lift hard and then drifts back
 * toward home height slowly: overdamped, so it neither keeps rising nor
 * drops back fast, either of which drags the string looped behind the ken.
 */
const SETTLE_BACK_OMEGA = 6;
const LIFT_DAMPING = 30;
/**
 * The hand's reach from where it started, across. Wider than for the ball
 * tricks: a ken turned over by the string drifts the way the string turned
 * it, about as far as the string's length times the angle it turned, times
 * the share of the sweep's speed it picked up, so a half turn carries it a
 * forearm's length out, and the ball goes out to meet it.
 */
const AIRPLANE_REACH = 450;

function outOfReach(hand: Hand, home: Vec3): boolean {
  return Math.hypot(hand.position[0] - home[0], hand.position[2] - home[2]) > AIRPLANE_REACH;
}

/**
 * How briskly the wrist levels the ball once the ken is seated on it:
 * gently, so the spike rides the bore round rather than being knocked.
 */
const LEVEL_OMEGA = 6;

/** Extra depth per mm of sideways misalignment at which the ball plans to meet the spike. */
const ALIGN_ROOM = 4;

/** Where a caught tama's centre sits on the ken, in ken-local mm: on the spike's axis, down on the sarado. */
export const KEN_SEAT_LOCAL: Vec3 = [0, SARADO.heightOnHandle + spikedTamaRestHeight(), 0];

export function startAirplane(home: Vec3): AirplaneAttempt {
  return {
    phase: { kind: 'settle', calmFor: 0 },
    hand: restingHand(home, TAMA_HOLE_UP_QUATERNION),
    home,
    time: 0,
  };
}

const spikeAxis = [0, 0, 0];

/**
 * The sweep goes the way the hanging spike already leans: the ken turns
 * that way over, so its lean is a head start rather than a turn to undo.
 */
function sweepDirection(ken: KenObservation): [number, number] {
  rotate(ken.kenQuaternion, 0, 1, 0, spikeAxis);
  const lean = Math.hypot(spikeAxis[0], spikeAxis[2]);
  if (lean < 1e-6) return [0, -1];
  return [spikeAxis[0] / lean, spikeAxis[2] / lean];
}

const seat = [0, 0, 0];

/** Writes where the ken wants the ball's centre, in world mm, into `out`. */
export function kenSeatWorld(ken: Pick<KenObservation, 'kenPosition' | 'kenQuaternion'>, out: number[]): void {
  rotate(ken.kenQuaternion, KEN_SEAT_LOCAL[0], KEN_SEAT_LOCAL[1], KEN_SEAT_LOCAL[2], out);
  out[0] += ken.kenPosition[0];
  out[1] += ken.kenPosition[1];
  out[2] += ken.kenPosition[2];
}

/** How far the ball, centred on the hand, is from the ken's seat. */
export function kenSeatDistance(hand: Hand, ken: KenObservation): number {
  kenSeatWorld(ken, seat);
  return Math.hypot(seat[0] - hand.position[0], seat[1] - hand.position[1], seat[2] - hand.position[2]);
}

export function isAirplaneFinished(attempt: AirplaneAttempt): boolean {
  return attempt.phase.kind === 'landed' || attempt.phase.kind === 'missed';
}

/** One substep of the controller: the authority for every phase change. */
export function stepAirplane(attempt: AirplaneAttempt, ken: KenObservation, h: number): AirplaneAttempt {
  const { hand, home } = attempt;
  const time = attempt.time + h;
  const v = ken.kenVelocity;

  const advance = (
    phase: AirplanePhase,
    acceleration: Vec3,
    wrist: Quat = TAMA_HOLE_UP_QUATERNION,
    wristOmega = GRIP_OMEGA,
  ): AirplaneAttempt => ({
    phase,
    hand: moveHand(hand, { linear: acceleration, angular: trackOrientation(hand, wrist, wristOmega) }, h),
    home,
    time,
  });
  const hold = (): Vec3 => [
    trackAxis(hand.position[0], hand.velocity[0], home[0], 0, RETURN_OMEGA),
    trackAxis(hand.position[1], hand.velocity[1], home[1], 0, RETURN_OMEGA),
    trackAxis(hand.position[2], hand.velocity[2], home[2], 0, RETURN_OMEGA),
  ];

  const catching = (phase: Extract<AirplanePhase, { kind: 'catch' }>) =>
    advance(phase, catchAcceleration(hand, home, ken, phase.sweep), followSpike(ken.kenQuaternion));

  switch (attempt.phase.kind) {
    case 'settle': {
      const settling = settle(hand, home, v, attempt.phase.calmFor, time, h);
      if (settling) return advance({ kind: 'settle', calmFor: settling.calmFor }, settling.acceleration);
      const sweep = sweepDirection(ken);
      return advance({ kind: 'pull', sweep }, pullAcceleration(sweep));
    }

    case 'pull': {
      const { sweep } = attempt.phase;
      if (hand.velocity[1] < LAUNCH_SPEED) return advance(attempt.phase, pullAcceleration(sweep));
      return advance({ kind: 'rise', sweep }, beside(hand, home, ken, sweep));
    }

    case 'rise': {
      if (outOfReach(hand, home)) return advance({ kind: 'missed', reason: 'out-of-reach' }, hold());
      const { sweep } = attempt.phase;
      // The catch starts at the apex, or sooner if the spike will be down
      // soon enough that the ball must start across now.
      const intercept = firstSpikeDown(ken, LOOKAHEAD);
      if (v[1] <= 0 || (intercept && intercept.time < PLAN_LEAD)) {
        return catching({ kind: 'catch', blockedFor: 0, sweep });
      }
      return advance(attempt.phase, beside(hand, home, ken, sweep));
    }

    case 'catch': {
      kenSeatWorld(ken, seat);
      if (seat[1] < home[1] - FELL_PAST) return advance({ kind: 'missed', reason: 'fell-past' }, hold());
      if (outOfReach(hand, home)) return advance({ kind: 'missed', reason: 'out-of-reach' }, hold());
      const atSeat = kenSeatDistance(hand, ken) < ARRIVAL_DISTANCE;
      if (ken.kenTouching && atSeat) {
        return advance({ kind: 'absorb', seatedFor: 0 }, absorbAcceleration(hand), TAMA_HOLE_UP_QUATERNION, LEVEL_OMEGA);
      }
      const blockedFor = ken.kenTouching ? attempt.phase.blockedFor + h : 0;
      if (blockedFor >= BLOCKED_TIME) return advance({ kind: 'missed', reason: 'blocked' }, hold());
      return catching({ ...attempt.phase, blockedFor });
    }

    case 'absorb': {
      const distance = kenSeatDistance(hand, ken);
      if (distance > BOUNCED_OUT_DISTANCE) return advance({ kind: 'missed', reason: 'bounced-out' }, hold());
      const relativeSpeed = Math.hypot(v[0] - hand.velocity[0], v[1] - hand.velocity[1], v[2] - hand.velocity[2]);
      const seated = distance < SEATED_DISTANCE && relativeSpeed < SEATED_SPEED;
      const seatedFor = seated ? attempt.phase.seatedFor + h : 0;
      const next: AirplanePhase = seatedFor >= SEATED_TIME ? { kind: 'landed' } : { kind: 'absorb', seatedFor };
      // Seated, the bore holds the ken to the ball, so the wrist levels the
      // ball and carries the ken upright with it. Following the ken's lean
      // instead would balance it like a stick on a fingertip the wrong
      // way: lean, tilt after it, lean further.
      return advance(next, absorbAcceleration(hand), TAMA_HOLE_UP_QUATERNION, LEVEL_OMEGA);
    }

    case 'landed':
      return advance(attempt.phase, absorbAcceleration(hand), TAMA_HOLE_UP_QUATERNION, LEVEL_OMEGA);

    case 'missed':
      return advance(attempt.phase, hold());
  }

}

function pullAcceleration([x, z]: [number, number]): Vec3 {
  const across = PULL_ACCELERATION * Math.sin(SWEEP_ANGLE);
  return [x * across, PULL_ACCELERATION * Math.cos(SWEEP_ANGLE), z * across];
}

/**
 * Wait beside the flying ken, on the home side of its drift, and settle
 * back toward home height gently. The string trails the ken up in a taut
 * loop: a ball that keeps rising, or drops back fast, drags that loop and
 * brakes or reverses the ken's turn. Nor does it follow the ken up; the
 * catch at its apex raises the ball to it from below.
 */
function beside(hand: Hand, home: Vec3, ken: KenObservation, [sx, sz]: [number, number]): Vec3 {
  const c = ken.kenCentre;
  const v = ken.kenVelocity;
  rotate(ken.kenQuaternion, 0, 1, 0, spikeAxis);
  const passing = passingDistance(-spikeAxis[1]);
  const ay = SETTLE_BACK_OMEGA ** 2 * (home[1] - hand.position[1]) - LIFT_DAMPING * hand.velocity[1];
  let ax = trackAxis(hand.position[0], hand.velocity[0], c[0] - sx * passing, v[0], HORIZONTAL_OMEGA);
  let az = trackAxis(hand.position[2], hand.velocity[2], c[2] - sz * passing, v[2], HORIZONTAL_OMEGA);
  if (hand.velocity[1] > 0) {
    // Stopping the pull's lift comes first: every mm the hand overshoots
    // is a mm it must come back down beside the ken before the catch.
    const room = Math.sqrt(Math.max(PULL_ACCELERATION ** 2 - ay * ay, 0));
    const across = Math.hypot(ax, az);
    if (across > room) {
      ax *= room / across;
      az *= room / across;
    }
  }
  return [ax, ay, az];
}

const WORLD_DOWN = new Vector3(0, -1, 0);
const scratchAxis = new Vector3();
const scratchTilt = new Quaternion();
const scratchGrip = new Quaternion();

/**
 * The hole-up grip tilted so the bore lines up with the spike: the bore
 * runs into the ball along its local +Y, which hole up points down, and
 * the spike points along the ken's +Y. Past `MAX_FOLLOW_TILT` the wrist
 * goes only that far, leaning the ball toward a ken still turning over.
 */
function followSpike(kenQuaternion: ArrayLike<number>): Quat {
  rotate(kenQuaternion, 0, 1, 0, spikeAxis);
  scratchAxis.set(spikeAxis[0], spikeAxis[1], spikeAxis[2]);
  const angle = scratchAxis.angleTo(WORLD_DOWN);
  if (angle < 1e-6) return TAMA_HOLE_UP_QUATERNION;
  if (angle > MAX_FOLLOW_TILT) {
    // Leaning toward the spike by the most the wrist allows.
    const axis = new Vector3().crossVectors(WORLD_DOWN, scratchAxis).normalize();
    scratchTilt.setFromAxisAngle(axis, MAX_FOLLOW_TILT);
  } else {
    scratchTilt.setFromUnitVectors(WORLD_DOWN, scratchAxis);
  }
  const [x, y, z, w] = TAMA_HOLE_UP_QUATERNION;
  scratchGrip.set(x, y, z, w).premultiply(scratchTilt);
  return [scratchGrip.x, scratchGrip.y, scratchGrip.z, scratchGrip.w];
}

const seatVelocity = [0, 0, 0];

/** How far ahead the hand looks for the moment the spike points down. */
const LOOKAHEAD = 0.5;
const LOOKAHEAD_STEP = 0.004;
/**
 * Once that moment is this close, the hand leaves the ken's side and plans
 * its way under it; earlier, a turning ken would sweep the ball.
 */
const PLAN_LEAD = 0.3;
/**
 * The most the planned meeting drops for misalignment: with the ball's
 * centre this far below the seat, its top is clear of the spike's tip,
 * which reaches past the seat.
 */
const MAX_DUCK = 80;
/**
 * The ball meets the falling ken moving down at this share of its speed.
 * Lower than a ball catch's: the ken is still turning, so the spike must
 * go home quickly, before the turn carries it off the hole. The bore takes
 * the turn out of it from there.
 */
const AIRPLANE_SPEED_MATCH = 0.6;

type Intercept = { time: number; seat: number[]; velocity: number[] };

const turnStep = new Float64Array(4);
const predicted = new Float64Array(4);
const offset = [0, 0, 0];
const lever = [0, 0, 0];
const plan: Intercept = { time: 0, seat: [0, 0, 0], velocity: [0, 0, 0] };
const SEAT_FROM_CENTRE = KEN_SEAT_LOCAL.map((x, k) => x - KEN_MASS.centre[k]);

/**
 * When the ken's spike will next point most nearly down, within
 * `lookahead` seconds, and where its seat will be then and how fast it
 * will be moving: its centre flies ballistically and it keeps turning at
 * its present spin. That is the first time it turns within the wrist's
 * reach of down, at the closest it comes. Null when it does not within the
 * lookahead, or it is down now and turning away.
 */
function firstSpikeDown(ken: KenObservation, lookahead: number): Intercept | null {
  const w = ken.kenSpin;
  const rate = Math.hypot(w[0], w[1], w[2]);
  const reach = Math.cos(MAX_FOLLOW_TILT);
  let best = -Infinity;
  let bestTime = -1;
  for (let t = 0; t <= lookahead; t += LOOKAHEAD_STEP) {
    turnAhead(ken.kenQuaternion, w, rate, t);
    rotate(predicted, 0, 1, 0, spikeAxis);
    const down = -spikeAxis[1];
    if (down >= reach && down > best) {
      best = down;
      bestTime = t;
    } else if (bestTime >= 0) {
      break;
    }
  }
  if (bestTime < MIN_INTERCEPT_TIME) return null;

  turnAhead(ken.kenQuaternion, w, rate, bestTime);
  rotate(predicted, SEAT_FROM_CENTRE[0], SEAT_FROM_CENTRE[1], SEAT_FROM_CENTRE[2], offset);
  const c = ken.kenCentre;
  const v = ken.kenVelocity;
  plan.time = bestTime;
  plan.seat[0] = c[0] + v[0] * bestTime + offset[0];
  plan.seat[1] = c[1] + v[1] * bestTime - 0.5 * GRAVITY * bestTime * bestTime + offset[1];
  plan.seat[2] = c[2] + v[2] * bestTime + offset[2];
  lever[0] = w[1] * offset[2] - w[2] * offset[1];
  lever[1] = w[2] * offset[0] - w[0] * offset[2];
  lever[2] = w[0] * offset[1] - w[1] * offset[0];
  plan.velocity[0] = v[0] + lever[0];
  plan.velocity[1] = v[1] - GRAVITY * bestTime + lever[1];
  plan.velocity[2] = v[2] + lever[2];
  return plan;
}

/** Writes the ken's orientation `t` seconds on, turning at spin `w`, into `predicted`. */
function turnAhead(q: ArrayLike<number>, w: ArrayLike<number>, rate: number, t: number) {
  const half = 0.5 * rate * t;
  const s = rate > 1e-9 ? Math.sin(half) / rate : 0;
  turnStep[0] = w[0] * s;
  turnStep[1] = w[1] * s;
  turnStep[2] = w[2] * s;
  turnStep[3] = Math.cos(half);
  multiply(turnStep, q, predicted);
}

/**
 * Bring the ball up under the falling ken.
 *
 * While the ken is still turning over, the hand predicts when its spike
 * will point down and where its seat will be then, and plans the cubic on
 * every axis that puts the ball there at that moment, moving down a little
 * slower than the seat. Re-planned every substep, the plan is feedback, as
 * for Spike. Until that moment is near, the ball waits beside the ken.
 *
 * Once it is past, or never comes, the hand chases as Spike does: onto the
 * line of the spike's axis at the ball's height, so a tilted spike still
 * comes down into the hole, meeting it lower the further off that line it
 * is.
 */
function catchAcceleration(hand: Hand, home: Vec3, ken: KenObservation, sweep: [number, number]): Vec3 {
  const intercept = firstSpikeDown(ken, LOOKAHEAD);
  if (intercept) {
    if (intercept.time > PLAN_LEAD) return beside(hand, home, ken, sweep);
    const { time, seat: target, velocity } = intercept;
    // Off to the side, plan to be lower, so the ball is never raised into
    // a spike it is not under. No lower than keeps its top clear of the
    // spike's tip, though: diving further spends on falling the
    // acceleration the hand needs to get across.
    const misalignment = Math.hypot(target[0] - hand.position[0], target[2] - hand.position[2]);
    const duck = Math.min(ALIGN_ROOM * misalignment, MAX_DUCK);
    return [
      hermiteStartAcceleration(hand.position[0], hand.velocity[0], target[0], velocity[0], time),
      hermiteStartAcceleration(
        hand.position[1],
        hand.velocity[1],
        target[1] - duck,
        AIRPLANE_SPEED_MATCH * velocity[1],
        time,
      ),
      hermiteStartAcceleration(hand.position[2], hand.velocity[2], target[2], velocity[2], time),
    ];
  }

  kenSeatWorld(ken, seat);
  // The seat moves with the ken's centre and its turn about it.
  const c = ken.kenCentre;
  const w = ken.kenSpin;
  const rx = seat[0] - c[0], ry = seat[1] - c[1], rz = seat[2] - c[2];
  seatVelocity[0] = ken.kenVelocity[0] + w[1] * rz - w[2] * ry;
  seatVelocity[1] = ken.kenVelocity[1] + w[2] * rx - w[0] * rz;
  seatVelocity[2] = ken.kenVelocity[2] + w[0] * ry - w[1] * rx;

  rotate(ken.kenQuaternion, 0, 1, 0, spikeAxis);
  let [x, z, vx, vz] = [seat[0], seat[2], seatVelocity[0], seatVelocity[2]];
  // The spike's axis runs from the seat back up toward the sarado, along -spike.
  if (-spikeAxis[1] > Math.cos(MAX_FOLLOW_TILT)) {
    const up = -spikeAxis[1];
    const along = (hand.position[1] - seat[1]) / up;
    const closing = (hand.velocity[1] - seatVelocity[1]) / up;
    x -= spikeAxis[0] * along;
    z -= spikeAxis[2] * along;
    vx -= spikeAxis[0] * closing;
    vz -= spikeAxis[2] * closing;
  }

  const misalignment = Math.hypot(x - hand.position[0], z - hand.position[2]);
  const meetY = home[1] - ALIGN_ROOM * misalignment;
  const vy = seatVelocity[1];
  const drop = seat[1] - meetY;
  const discriminant = vy * vy + 2 * GRAVITY * drop;
  const planned = drop > 0 && discriminant > 0;
  const until = planned ? (vy + Math.sqrt(discriminant)) / GRAVITY : 0;
  const horizon = Math.max(until, MIN_INTERCEPT_TIME);
  const targetY = planned ? meetY : seat[1];
  const targetVy = AIRPLANE_SPEED_MATCH * (vy - GRAVITY * until);

  return [
    trackAxis(hand.position[0], hand.velocity[0], x, vx, HORIZONTAL_OMEGA),
    hermiteStartAcceleration(hand.position[1], hand.velocity[1], targetY, targetVy, horizon),
    trackAxis(hand.position[2], hand.velocity[2], z, vz, HORIZONTAL_OMEGA),
  ];
}

/** An Airplane attempt bound to its own simulation, from a ken hanging at rest. */
export type AirplaneRun = { sim: TamaHeldSim; attempt: AirplaneAttempt };

export function createAirplaneRun(handedness: Handedness, home: Vec3 = [0, 0, 0]): AirplaneRun {
  return {
    sim: createTamaHeldSim(handedness, { position: home, quaternion: TAMA_HOLE_UP_QUATERNION }),
    attempt: startAirplane(home),
  };
}

/** Advances the run by `dt` seconds, the controller stepping with the physics. */
export function advanceAirplaneRun(run: AirplaneRun, dt: number): void {
  stepTamaHeldSimDriven(run.sim, dt, (sim, h) => {
    run.attempt = stepAirplane(run.attempt, sim, h);
    return { position: run.attempt.hand.position, quaternion: run.attempt.hand.orientation };
  });
}
