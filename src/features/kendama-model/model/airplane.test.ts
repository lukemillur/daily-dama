import { SARADO } from './anatomy';
import { advanceAirplaneRun, createAirplaneRun, isAirplaneFinished, kenSeatDistance, type AirplaneRun } from './airplane';
import { spikedTamaRestHeight } from './collision';
import { HAND_MAX_SPEED } from './hand';
import { KEN_MASS } from './mass';
import { layPolyline } from './string-chain';
import { GRAVITY, SUBSTEP } from './string-sim';
import { stringExitLocal, TAMA_HOLE_UP_QUATERNION, type Handedness } from './stringing';
import { createTamaHeldSim, hangingKenQuaternion, stepTamaHeldSimDriven, type TamaHeldSim } from './tama-held-sim';
import { rotate, rotateInverse } from './vec';
import type { Vec3 } from './views';

const HELD = { position: [0, 0, 0] as Vec3, quaternion: TAMA_HOLE_UP_QUATERNION };

function spikeUp(sim: TamaHeldSim): number {
  const axis = [0, 0, 0];
  rotate(sim.kenQuaternion, 0, 1, 0, axis);
  return axis[1];
}

/** Kinetic plus potential energy of the ken, in g mm²/s². */
function kenEnergy(sim: TamaHeldSim): number {
  const v = sim.kenVelocity;
  const w = [0, 0, 0];
  rotateInverse(sim.kenQuaternion, sim.kenSpin[0], sim.kenSpin[1], sim.kenSpin[2], w);
  const I = KEN_MASS.inertia;
  let spin = 0;
  for (let r = 0; r < 3; r += 1) spin += w[r] * (I[r * 3] * w[0] + I[r * 3 + 1] * w[1] + I[r * 3 + 2] * w[2]);
  return 0.5 * KEN_MASS.mass * (v[0] ** 2 + v[1] ** 2 + v[2] ** 2) + 0.5 * spin + KEN_MASS.mass * GRAVITY * sim.kenCentre[1];
}

describe('a ken hanging from a held tama', () => {
  it.each(['right', 'left'] as const)('hangs still, centre of mass under its string hole (%s)', (handedness) => {
    const sim = createTamaHeldSim(handedness, HELD);
    const start = Array.from(sim.kenCentre);
    for (let i = 0; i < 120; i += 1) stepTamaHeldSimDriven(sim, 1 / 60, () => HELD);
    for (let k = 0; k < 3; k += 1) expect(sim.kenCentre[k]).toBeCloseTo(start[k], 1);
    expect(Math.hypot(...sim.kenSpin)).toBeLessThan(1e-3);
    // Spike up, leaning about 20° because the hole is at the waist's side.
    expect(spikeUp(sim)).toBeGreaterThan(0.9);
    expect(spikeUp(sim)).toBeLessThan(0.97);
  });

  it('stands its centre-to-hole line straight up', () => {
    const q = hangingKenQuaternion('right');
    const exit = stringExitLocal('right');
    const d = [0, 0, 0];
    rotate(q, exit[0] - KEN_MASS.centre[0], exit[1] - KEN_MASS.centre[1], exit[2] - KEN_MASS.centre[2], d);
    expect(d[0]).toBeCloseTo(0, 6);
    expect(d[2]).toBeCloseTo(0, 6);
    expect(d[1]).toBeGreaterThan(0);
  });

  it('gains no energy when it is thrown up and snaps the string taut', () => {
    // A string draped over the free ken once solved as wood behind it and
    // the ken pulled itself along by it, gaining 200 times its energy.
    for (const spin of [0, 6]) {
      const sim = createTamaHeldSim('right', HELD);
      sim.kenVelocity.set([0, 2500, 0]);
      sim.kenSpin.set([spin, 0, 0]);
      const start = kenEnergy(sim);
      let most = -Infinity;
      for (let i = 0; i < 1440; i += 1) {
        stepTamaHeldSimDriven(sim, SUBSTEP, () => HELD);
        most = Math.max(most, kenEnergy(sim));
      }
      expect(most).toBeLessThanOrEqual(start * (start > 0 ? 1.001 : 0.999));
    }
  });

  it('seats spike down in the ball when dropped onto it plumb', () => {
    const sim = createTamaHeldSim('right', HELD);
    const down = [1, 0, 0, 0];
    const restHeight = SARADO.heightOnHandle + spikedTamaRestHeight();
    const origin = [0, restHeight + 40, 0];
    sim.kenQuaternion.set(down);
    sim.kenPreviousQuaternion.set(down);
    sim.kenPosition.set(origin);
    const centre = [0, 0, 0];
    rotate(down, KEN_MASS.centre[0], KEN_MASS.centre[1], KEN_MASS.centre[2], centre);
    for (let k = 0; k < 3; k += 1) sim.kenCentre[k] = origin[k] + centre[k];
    sim.kenCentrePrevious.set(sim.kenCentre);
    // Slack, round the ball from its string hole underneath up to the waist.
    const exit = [0, 0, 0];
    const e = stringExitLocal('right');
    rotate(down, e[0], e[1], e[2], exit);
    layPolyline(sim.positions, [[0, -30, 0], [0, -20, 40], [0, 20, 40], [exit[0], exit[1] + origin[1], exit[2]]]);
    sim.previous.set(sim.positions);

    // Seated by one second, and still seated for the next two. Contacts are
    // frictionless, so it may rock a little in the bore's clearance; it
    // must not walk off or topple.
    for (let i = 0; i < 60; i += 1) stepTamaHeldSimDriven(sim, 1 / 60, () => HELD);
    for (let i = 0; i < 120; i += 1) {
      stepTamaHeldSimDriven(sim, 1 / 60, () => HELD);
      expect(spikeUp(sim)).toBeLessThan(-0.99);
      // Within a mm: the spike sits a little off the bore's axis.
      expect(Math.abs(sim.kenPosition[1] - restHeight)).toBeLessThan(1);
    }
  });
});

type Outcome = { run: AirplaneRun; seconds: number; mostSpikeDown: number; fastestHand: number };

function airplane(handedness: Handedness, { frame = 1 / 60, swing = [0, 0, 0] }: { frame?: number; swing?: Vec3 } = {}): Outcome {
  const run = createAirplaneRun(handedness);
  run.sim.kenVelocity.set(swing);
  for (let k = 0; k < 3; k += 1) run.sim.kenCentrePrevious[k] = run.sim.kenCentre[k] - swing[k] * SUBSTEP;
  const outcome = { run, seconds: 0, mostSpikeDown: 0, fastestHand: 0 };
  while (outcome.seconds < 6 && !isAirplaneFinished(run.attempt)) {
    advanceAirplaneRun(run, frame);
    outcome.seconds += frame;
    outcome.mostSpikeDown = Math.max(outcome.mostSpikeDown, -spikeUp(run.sim));
    outcome.fastestHand = Math.max(outcome.fastestHand, Math.hypot(...run.attempt.hand.velocity));
  }
  return outcome;
}

describe('Airplane from a ken hanging at rest', () => {
  const right = airplane('right');
  const left = airplane('left');

  it('lands, for either stringing', () => {
    expect(right.run.attempt.phase).toEqual({ kind: 'landed' });
    expect(left.run.attempt.phase).toEqual({ kind: 'landed' });
  });

  it('ends with the ken upside down on the ball, spike in the hole', () => {
    for (const { run } of [right, left]) {
      expect(kenSeatDistance(run.attempt.hand, run.sim)).toBeLessThan(4);
      // Spike down and upright: the bore holds it to the levelled ball.
      expect(spikeUp(run.sim)).toBeLessThan(-0.98);
    }
  });

  it('turns the ken over in the air, from hanging spike up', () => {
    expect(right.mostSpikeDown).toBeGreaterThan(0.95);
  });

  it('keeps the hand within its limits', () => {
    expect(right.fastestHand).toBeLessThanOrEqual(HAND_MAX_SPEED + 1e-6);
  });

  it('is the same at any display frame rate', () => {
    for (const frame of [1 / 30, 1 / 120]) {
      const other = airplane('right', { frame });
      expect(other.run.attempt.phase).toEqual({ kind: 'landed' });
      for (let k = 0; k < 3; k += 1) {
        expect(other.run.sim.kenPosition[k]).toBeCloseTo(right.run.sim.kenPosition[k], 0);
      }
    }
  });
});

describe('Airplane from a swinging ken', () => {
  const swings: Vec3[] = [
    [200, 0, 0],
    [-200, 0, 0],
    [0, 0, 200],
    [0, 0, -200],
    [150, 0, 150],
    [300, 0, -100],
    [-100, 0, 300],
  ];
  const outcomes = swings.map((swing) => airplane('right', { swing }).run);

  it('always ends, landed or with a named miss', () => {
    for (const run of outcomes) expect(isAirplaneFinished(run.attempt)).toBe(true);
  });

  it('lands most of them', () => {
    // The pull throws the ken from 400 mm below the hand, and stopping the
    // hand after it under its 3 g limit leaves it above the ken; from some
    // swings it cannot get back under in time. See the handoff notes.
    const landed = outcomes.filter((run) => run.attempt.phase.kind === 'landed');
    expect(landed.length).toBeGreaterThanOrEqual(4);
  });
});
