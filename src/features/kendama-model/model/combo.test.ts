import { TAMA } from './anatomy';
import {
  advanceTrickRun,
  continueCatch,
  createTrickRun,
  currentTrick,
  isRunFinished,
  startCatch,
  type TrickRun,
} from './catch-trick';
import { collideWithKen, createKenContact } from './collision';
import { SUBSTEP } from './string-sim';
import { BIG_CUP_GRIP_QUATERNION, type Handedness } from './stringing';
import { BIG_CUP, SPIKE } from './tricks';
import { rotate } from './vec';
import type { Vec3 } from './views';

type ComboOutcome = {
  run: TrickRun;
  seconds: number;
  /** When Big Cup's ball first sat in the cup, and when the run led on into Spike. */
  seatedAt: number;
  ledOnAt: number;
  deepest: number;
  /** Fastest the ball spun while in the air between the cup and the spike. */
  flightSpin: number;
  /** The spike's lean from vertical, in degrees, while the ball was still in the cup's reach. */
  earlyTurn: number;
};

function bigCupToSpike(handedness: Handedness, { swing = [0, 0, 0], frame = 1 / 60 }: { swing?: Vec3; frame?: number } = {}): ComboOutcome {
  const run = createTrickRun([BIG_CUP, SPIKE], handedness);
  run.sim.tamaVelocity.set(swing);
  for (let k = 0; k < 3; k += 1) run.sim.tamaPrevious[k] = run.sim.tamaPosition[k] - swing[k] * SUBSTEP;

  const contact = createKenContact();
  const spike = [0, 0, 0];
  const outcome = { run, seconds: 0, seatedAt: NaN, ledOnAt: NaN, deepest: 0, flightSpin: 0, earlyTurn: 0 };
  let cleared = false;
  while (outcome.seconds < 6 && !isRunFinished(run)) {
    advanceTrickRun(run, frame);
    outcome.seconds += frame;
    const { sim, attempt } = run;
    const { kind } = attempt.phase;
    if (run.step === 0 && kind === 'absorb' && Number.isNaN(outcome.seatedAt)) outcome.seatedAt = outcome.seconds;
    if (run.step === 1 && Number.isNaN(outcome.ledOnAt)) outcome.ledOnAt = outcome.seconds;
    if (collideWithKen(sim.kenPosition, sim.kenQuaternion, sim.tamaPosition, 0, TAMA.radius, contact, true)) {
      outcome.deepest = Math.max(outcome.deepest, contact.depth);
    }
    const reach = Math.hypot(...[0, 1, 2].map((k) => sim.tamaPosition[k] - attempt.hand.position[k]));
    // In flight: beyond anything on the ken it could touch, the spike's tip
    // included. Contacts sampled once a frame would miss brief ones.
    if (run.step === 1 && kind !== 'pull' && reach > SPIKE.kenTop + TAMA.radius + 5) {
      outcome.flightSpin = Math.max(outcome.flightSpin, Math.hypot(...sim.tamaSpin));
    }
    if (run.step === 1 && reach > 80) cleared = true;
    if (run.step === 1 && !cleared && reach < 70) {
      rotate(attempt.hand.orientation, 0, 1, 0, spike);
      // In the big-cup grip the spike points away, level: 90° from vertical.
      outcome.earlyTurn = Math.max(outcome.earlyTurn, 90 - (Math.acos(Math.min(1, spike[1])) * 180) / Math.PI);
    }
  }
  return outcome;
}

describe('Big Cup to Spike from a ball hanging at rest', () => {
  const right = bigCupToSpike('right');
  const left = bigCupToSpike('left');

  it('lands both, for either stringing', () => {
    for (const { run } of [right, left]) {
      expect(currentTrick(run)).toBe(SPIKE);
      expect(run.attempt.phase).toEqual({ kind: 'landed' });
    }
  });

  it('leads on from the cup without a pause to reset', () => {
    // A brief settle in the cup, then straight into the pop: no steadying
    // phase, which is for a hanging ball.
    expect(right.ledOnAt - right.seatedAt).toBeLessThan(0.3);
    expect(right.seconds - right.seatedAt).toBeLessThan(1.4);
  });

  it('turns the ken from the big-cup grip to spike-up while the ball is in the air', () => {
    const spike = [0, 0, 0];
    rotate(right.run.attempt.hand.orientation, 0, 1, 0, spike);
    expect(spike[1]).toBeGreaterThan(Math.cos((12 * Math.PI) / 180));
    // Until the ball is clear, the wrist holds the cup level under it.
    expect(right.earlyTurn).toBeLessThan(3);
  });

  it('pops the ball cleanly: no string jerk spins it in flight', () => {
    expect(right.flightSpin).toBeLessThan(2);
    expect(left.flightSpin).toBeLessThan(2);
  });

  it('never drives the ball into the ken', () => {
    expect(right.deepest).toBeLessThan(2);
    expect(left.deepest).toBeLessThan(2);
  });

  it('is the same at any display frame rate', () => {
    const at30 = bigCupToSpike('right', { frame: 1 / 30 });
    expect(at30.run.attempt.phase).toEqual({ kind: 'landed' });
    for (let k = 0; k < 3; k += 1) {
      expect(at30.run.sim.tamaPosition[k] - at30.run.attempt.hand.position[k]).toBeCloseTo(
        right.run.sim.tamaPosition[k] - right.run.attempt.hand.position[k],
        0,
      );
    }
  });
});

describe('Big Cup to Spike from a swinging ball', () => {
  const swings: Vec3[] = [
    [400, 0, 400],
    [-600, 0, 0],
    [0, 0, -300],
    [400, 0, 0],
  ];
  const outcomes = (['right', 'left'] as const).flatMap((hand) =>
    swings.map((swing) => bigCupToSpike(hand, { swing }).run),
  );

  it('always ends, landed or with a named miss, never balancing forever', () => {
    for (const run of outcomes) expect(isRunFinished(run)).toBe(true);
  });

  it('lands most of them', () => {
    // A ball that settles in the cup more than about 20° off hole-down can
    // still be knocked off the countersink; see the handoff notes.
    const landed = outcomes.filter((run) => run.step === 1 && run.attempt.phase.kind === 'landed');
    expect(landed.length).toBeGreaterThanOrEqual(5);
  });
});

describe('leading on from a seat', () => {
  it('pops straight into the next trick, holding the grip the ball sits in', () => {
    const seated = startCatch(BIG_CUP, [0, 0, 0]);
    const ball = {
      tamaPosition: [0, BIG_CUP.seatHeight, 0],
      tamaVelocity: [0, 0, 0],
      tamaQuaternion: [0, 0, 0, 1],
      tamaTouching: true,
    };
    const next = continueCatch(SPIKE, seated, ball);
    expect(next.phase).toMatchObject({ kind: 'pull', from: 'seat' });
    expect(next.heldGrip).toEqual(BIG_CUP_GRIP_QUATERNION);
  });
});
