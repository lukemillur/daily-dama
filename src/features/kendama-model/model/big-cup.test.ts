import { TAMA } from './anatomy';
import {
  advanceBigCupRun,
  BIG_CUP_SEAT_HEIGHT,
  createBigCupRun,
  isFinished,
  launchSpeedFor,
  stepBigCup,
  type BigCupAttempt,
  type BigCupPhase,
  type BigCupRun,
} from './big-cup';
import { HAND_MAX_ACCELERATION } from './hand';
import { collideWithKen, createKenContact } from './collision';
import { GRAVITY, SUBSTEP, stringPathLength } from './string-sim';
import { STRING_LENGTH, type Handedness } from './stringing';
import type { Vec3 } from './views';

type Outcome = {
  run: BigCupRun;
  seconds: number;
  deepest: number;
  longest: number;
  /** Ball speed relative to the hand at the substep the ball arrived in the cup. */
  arrivalSpeed: number;
};

function attempt(
  handedness: Handedness,
  {
    swing = [0, 0, 0],
    home = [0, 0, 0],
    frame = 1 / 60,
    /** Run exactly this long, rather than stopping when the attempt finishes. */
    duration,
  }: { swing?: Vec3; home?: Vec3; frame?: number; duration?: number } = {},
): Outcome {
  const run = createBigCupRun(handedness, home);
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
    advanceBigCupRun(run, frame);
    seconds += frame;
    const { sim } = run;
    if (collideWithKen(sim.kenPosition, sim.kenQuaternion, sim.tamaPosition, 0, TAMA.radius, contact)) {
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
 * otherwise carry a narrowed phase across `advanceBigCupRun`.
 */
function phaseOf(run: BigCupRun): BigCupPhase['kind'] {
  return run.attempt.phase.kind;
}

function seatOffset({ run }: Outcome): number[] {
  const hand = run.attempt.hand.position;
  const ball = run.sim.tamaPosition;
  return [ball[0] - hand[0], ball[1] - hand[1] - BIG_CUP_SEAT_HEIGHT, ball[2] - hand[2]];
}

describe('Big Cup from a ball hanging at rest', () => {
  const right = attempt('right');
  const left = attempt('left');

  it('lands, for either stringing', () => {
    expect(right.run.attempt.phase).toEqual({ kind: 'landed' });
    expect(left.run.attempt.phase).toEqual({ kind: 'landed' });
    expect(right.seconds).toBeLessThan(2);
  });

  it('leaves the ball sitting in the big cup', () => {
    for (const component of seatOffset(right)) expect(Math.abs(component)).toBeLessThan(4);
    expect(Math.hypot(...right.run.sim.tamaVelocity)).toBeLessThan(20);
  });

  it('catches near home height, with a short cushion rather than a dive', () => {
    expect(Math.abs(right.run.attempt.hand.position[1])).toBeLessThan(40);
  });

  it('arrives slower than the contact bounces', () => {
    // string-sim's bounce threshold is 250 mm/s.
    expect(right.arrivalSpeed).toBeLessThan(250);
  });

  it('mirrors between stringings', () => {
    expect(left.run.attempt.hand.position[0]).toBeCloseTo(-right.run.attempt.hand.position[0], 0);
    expect(left.seconds).toBeCloseTo(right.seconds, 6);
  });

  it('keeps the physics honest throughout', () => {
    expect(right.deepest).toBeLessThan(2);
    expect(right.longest).toBeLessThan(STRING_LENGTH * 1.02);
  });
});

describe('Big Cup is repeatable', () => {
  it('lands the same way at any display frame rate', () => {
    const at60 = attempt('right', { frame: 1 / 60, duration: 2 });
    expect(at60.run.attempt.phase).toEqual({ kind: 'landed' });
    for (const frame of [1 / 30, 1 / 120]) {
      const other = attempt('right', { frame, duration: 2 });
      expect(other.run.attempt.phase).toEqual(at60.run.attempt.phase);
      for (let k = 0; k < 3; k += 1) {
        expect(other.run.sim.tamaPosition[k]).toBeCloseTo(at60.run.sim.tamaPosition[k], 6);
      }
    }
  });

  it('is deterministic', () => {
    const a = attempt('right', { swing: [400, 0, 400], duration: 1.2 });
    const b = attempt('right', { swing: [400, 0, 400], duration: 1.2 });
    expect(Array.from(a.run.sim.positions)).toEqual(Array.from(b.run.sim.positions));
    expect(a.run.attempt).toEqual(b.run.attempt);
  });

  it('lands wherever the hand starts', () => {
    expect(attempt('right', { home: [120, 80, -60] }).run.attempt.phase).toEqual({ kind: 'landed' });
  });

  it.each<[string, Vec3]>([
    ['toward the player’s right', [400, 0, 0]],
    ['toward their left', [-600, 0, 0]],
    ['away from them', [0, 0, -300]],
    ['diagonally', [400, 0, 400]],
  ])('lands from a ball already swinging %s', (_, swing) => {
    const outcome = attempt('right', { swing });
    expect(outcome.run.attempt.phase).toEqual({ kind: 'landed' });
    expect(outcome.deepest).toBeLessThan(2);
  });
});

describe('the Big Cup controller', () => {
  it('sizes the pull so the ball clears its seat by the margin', () => {
    const drop = 368;
    const v = launchSpeedFor(drop);
    const rise = (v * v) / (2 * HAND_MAX_ACCELERATION) + (v * v) / (2 * GRAVITY);
    expect(rise - drop - BIG_CUP_SEAT_HEIGHT).toBeCloseTo(120, 6);
  });

  it('calls a miss once the ball falls out of reach, instead of chasing it', () => {
    const catching: BigCupAttempt = {
      phase: { kind: 'catch' },
      hand: { position: [0, 0, 0], velocity: [0, 0, 0] },
      home: [0, 0, 0],
      time: 1,
    };
    const next = stepBigCup(
      catching,
      { tamaPosition: [80, BIG_CUP_SEAT_HEIGHT - 300, 0], tamaVelocity: [0, -2000, 0], tamaTouching: false },
      SUBSTEP,
    );
    expect(next.phase).toEqual({ kind: 'missed', reason: 'fell-past' });
  });

  it('starts absorbing only when it feels the ball arrive at the seat', () => {
    const catching: BigCupAttempt = {
      phase: { kind: 'catch' },
      hand: { position: [0, 0, 0], velocity: [0, -1300, 0] },
      home: [0, 0, 0],
      time: 1,
    };
    const atSeat = { tamaPosition: [0, BIG_CUP_SEAT_HEIGHT, 0], tamaVelocity: [0, -1450, 0] };
    expect(stepBigCup(catching, { ...atSeat, tamaTouching: false }, SUBSTEP).phase.kind).toBe('catch');
    expect(stepBigCup(catching, { ...atSeat, tamaTouching: true }, SUBSTEP).phase.kind).toBe('absorb');
  });
});
