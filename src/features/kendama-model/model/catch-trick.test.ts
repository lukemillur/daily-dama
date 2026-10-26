import { TAMA } from './anatomy';
import {
  advanceTrickRun,
  createTrickRun,
  isFinished,
  launchSpeedFor,
  seatDistance,
  stepCatch,
  type CatchAttempt,
  type CatchPhase,
  type CatchTrick,
  type TrickRun,
} from './catch-trick';
import { collideWithKen, createKenContact } from './collision';
import { HAND_MAX_ACCELERATION, restingHand } from './hand';
import { GRAVITY, SUBSTEP, stringPathLength } from './string-sim';
import { BIG_CUP_GRIP_QUATERNION, STRING_LENGTH, type Handedness } from './stringing';
import { BIG_CUP, SPIKE } from './tricks';
import type { Vec3 } from './views';

type Outcome = {
  run: TrickRun;
  seconds: number;
  deepest: number;
  longest: number;
  /** Ball speed relative to the hand at the substep the ball arrived at its seat. */
  arrivalSpeed: number;
};

function attempt(
  trick: CatchTrick,
  handedness: Handedness,
  {
    swing = [0, 0, 0],
    home = [0, 0, 0],
    frame = 1 / 60,
    /** Run exactly this long, rather than stopping when the attempt finishes. */
    duration,
  }: { swing?: Vec3; home?: Vec3; frame?: number; duration?: number } = {},
): Outcome {
  const run = createTrickRun(trick, handedness, home);
  // A ball already swinging when the attempt starts.
  run.sim.tamaVelocity.set(swing);
  for (let k = 0; k < 3; k += 1) run.sim.tamaPrevious[k] = run.sim.tamaPosition[k] - swing[k] * SUBSTEP;

  const contact = createKenContact();
  let seconds = 0;
  let deepest = 0;
  let longest = 0;
  let arrivalSpeed = NaN;
  const frames = duration === undefined ? Infinity : Math.round(duration / frame);
  for (let f = 0; f < frames && seconds < 4 && (duration !== undefined || !isFinished(run.attempt)); f += 1) {
    const before = phaseOf(run);
    advanceTrickRun(run, frame);
    seconds += frame;
    const { sim } = run;
    // The ball's shell against the ken; the spike meets its bore instead.
    if (collideWithKen(sim.kenPosition, sim.kenQuaternion, sim.tamaPosition, 0, TAMA.radius, contact, true)) {
      deepest = Math.max(deepest, contact.depth);
    }
    longest = Math.max(longest, stringPathLength(sim));
    if (before === 'catch' && phaseOf(run) === 'absorb') {
      const hand = run.attempt.hand.velocity;
      arrivalSpeed = Math.hypot(
        sim.tamaVelocity[0] - hand[0],
        sim.tamaVelocity[1] - hand[1],
        sim.tamaVelocity[2] - hand[2],
      );
    }
  }
  return { run, seconds, deepest, longest, arrivalSpeed };
}

/**
 * Read through a call: the run mutates in place, and TypeScript would
 * otherwise carry a narrowed phase across `advanceTrickRun`.
 */
function phaseOf(run: TrickRun): CatchPhase['kind'] {
  return run.attempt.phase.kind;
}

/**
 * Relative speed at arrival below which the trick is caught, not lost.
 * A cup can bounce a ball back out, so it must stay under string-sim's
 * 250 mm/s bounce threshold. A spiked ball arrives by sliding down a
 * frictionless bore and clicks onto the sarado; the spike holds it through
 * the half-millimetre hop that follows.
 */
const ARRIVAL_LIMIT = { [BIG_CUP.name]: 250, [SPIKE.name]: 450 };

describe.each([BIG_CUP, SPIKE])('$name from a ball hanging at rest', (trick) => {
  const right = attempt(trick, 'right');
  const left = attempt(trick, 'left');

  it('lands, for either stringing', () => {
    expect(right.run.attempt.phase).toEqual({ kind: 'landed' });
    expect(left.run.attempt.phase).toEqual({ kind: 'landed' });
    expect(right.seconds).toBeLessThan(2.2);
  });

  it('leaves the ball sitting at its seat', () => {
    expect(seatDistance(trick, right.run.attempt.hand, right.run.sim.tamaPosition)).toBeLessThan(4);
    expect(Math.hypot(...right.run.sim.tamaVelocity)).toBeLessThan(20);
  });

  it('catches near home height, with a short cushion rather than a dive', () => {
    expect(Math.abs(right.run.attempt.hand.position[1])).toBeLessThan(40);
  });

  it('arrives gently enough to stay', () => {
    expect(right.arrivalSpeed).toBeLessThan(ARRIVAL_LIMIT[trick.name]);
  });

  it('mirrors between stringings', () => {
    // Positions, not finishing times: float noise can tip a threshold, such
    // as when the ball first reads calm or seated, a few substeps apart.
    // Each run stops when its own attempt does, so compare the ball where
    // it sits on the ken rather than where the still-easing hand has it.
    const onKen = ({ run }: Outcome) =>
      [0, 1, 2].map((k) => run.sim.tamaPosition[k] - run.attempt.hand.position[k]);
    const [lx, ly, lz] = onKen(left);
    const [rx, ry, rz] = onKen(right);
    expect(Math.abs(lx + rx)).toBeLessThan(1);
    expect(Math.abs(ly - ry)).toBeLessThan(1);
    expect(Math.abs(lz - rz)).toBeLessThan(1);
  });

  it('keeps the physics honest throughout', () => {
    expect(right.deepest).toBeLessThan(2);
    expect(right.longest).toBeLessThan(STRING_LENGTH * 1.02);
  });
});

describe.each([BIG_CUP, SPIKE])('$name is repeatable', (trick) => {
  it('lands the same way at any display frame rate', () => {
    const at60 = attempt(trick, 'right', { frame: 1 / 60, duration: 2.2 });
    expect(at60.run.attempt.phase).toEqual({ kind: 'landed' });
    for (const frame of [1 / 30, 1 / 120]) {
      const other = attempt(trick, 'right', { frame, duration: 2.2 });
      expect(other.run.attempt.phase).toEqual(at60.run.attempt.phase);
      for (let k = 0; k < 3; k += 1) {
        expect(other.run.sim.tamaPosition[k]).toBeCloseTo(at60.run.sim.tamaPosition[k], 6);
      }
    }
  });

  it('is deterministic', () => {
    const a = attempt(trick, 'right', { swing: [400, 0, 400], duration: 1.2 });
    const b = attempt(trick, 'right', { swing: [400, 0, 400], duration: 1.2 });
    expect(Array.from(a.run.sim.positions)).toEqual(Array.from(b.run.sim.positions));
    expect(a.run.attempt).toEqual(b.run.attempt);
  });

  it('lands wherever the hand starts', () => {
    expect(attempt(trick, 'right', { home: [120, 80, -60] }).run.attempt.phase).toEqual({ kind: 'landed' });
  });

  it.each<[string, Vec3]>([
    ['toward the player’s right', [400, 0, 0]],
    ['toward their left', [-600, 0, 0]],
    ['away from them', [0, 0, -300]],
    ['diagonally', [400, 0, 400]],
  ])('lands from a ball already swinging %s', (_, swing) => {
    const outcome = attempt(trick, 'right', { swing });
    expect(outcome.run.attempt.phase).toEqual({ kind: 'landed' });
    expect(outcome.deepest).toBeLessThan(2);
  });
});

describe('the catch controller', () => {
  it('sizes the pull so the ball clears the top of the ken by the margin', () => {
    const drop = 368;
    const v = launchSpeedFor(SPIKE, drop);
    const rise = (v * v) / (2 * HAND_MAX_ACCELERATION) + (v * v) / (2 * GRAVITY);
    expect(rise - drop - SPIKE.kenTop - TAMA.radius).toBeCloseTo(SPIKE.apexClearance, 6);
  });

  it('calls a miss once the ball falls out of reach, instead of chasing it', () => {
    const catching: CatchAttempt = {
      phase: { kind: 'catch', blockedFor: 0 },
      hand: restingHand([0, 0, 0], BIG_CUP_GRIP_QUATERNION),
      home: [0, 0, 0],
      time: 1,
    };
    const next = stepCatch(
      BIG_CUP,
      catching,
      {
        tamaPosition: [80, BIG_CUP.seatHeight - 300, 0],
        tamaVelocity: [0, -2000, 0],
        tamaQuaternion: [0, 0, 0, 1],
        tamaTouching: false,
      },
      SUBSTEP,
    );
    expect(next.phase).toEqual({ kind: 'missed', reason: 'fell-past' });
  });

  it('starts absorbing only when it feels the ball arrive at the seat', () => {
    const catching: CatchAttempt = {
      phase: { kind: 'catch', blockedFor: 0 },
      hand: { ...restingHand([0, 0, 0], BIG_CUP_GRIP_QUATERNION), velocity: [0, -1300, 0] },
      home: [0, 0, 0],
      time: 1,
    };
    const atSeat = {
      tamaPosition: [0, BIG_CUP.seatHeight, 0],
      tamaVelocity: [0, -1450, 0],
      tamaQuaternion: [0, 0, 0, 1],
    };
    expect(stepCatch(BIG_CUP, catching, { ...atSeat, tamaTouching: false }, SUBSTEP).phase.kind).toBe('catch');
    expect(stepCatch(BIG_CUP, catching, { ...atSeat, tamaTouching: true }, SUBSTEP).phase.kind).toBe('absorb');
  });
});
