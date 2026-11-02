import { advanceTrickRun, climbingGrip, createTrickRun, isFinished, type CatchPhase, type TrickRun } from './catch-trick';
import { SPIKE_DOWN_GRIP_QUATERNION, SPIKE_UP_GRIP_QUATERNION, type Quat } from './stringing';
import { BASE_CUP } from './tricks';
import { rotate } from './vec';

/** The spike's direction in world axes. */
function spikeOf(orientation: Quat): number[] {
  const spike = [0, 0, 0];
  rotate(orientation, 0, 1, 0, spike);
  return spike;
}

function phaseOf(run: TrickRun): CatchPhase {
  return run.attempt.phase;
}

type Sample = { phase: CatchPhase['kind']; climbed: number; spikeUp: number };

/** The spike's height component against how far through its planned climb the ball is, through pull and rise. */
function turnDuringClimb(): { samples: Sample[]; atApex: number; run: TrickRun } {
  const run = createTrickRun([BASE_CUP], 'right');
  const samples: Sample[] = [];
  let atApex = NaN;
  for (let t = 0; t < 4 && !isFinished(run.attempt); t += 1 / 240) {
    const before = phaseOf(run).kind;
    advanceTrickRun(run, 1 / 240);
    const phase = phaseOf(run);
    const spikeUp = spikeOf(run.attempt.hand.orientation)[1];
    if (phase.kind === 'pull' || phase.kind === 'rise') {
      const { from, to } = phase.climb;
      samples.push({ phase: phase.kind, climbed: (run.sim.tamaPosition[1] - from) / (to - from), spikeUp });
    }
    if (before === 'rise' && phase.kind === 'catch') atApex = spikeUp;
  }
  return { samples, atApex, run };
}

describe('Base Cup', () => {
  const { samples, atApex, run } = turnDuringClimb();

  it('holds the spike-down grip with the base cup facing up', () => {
    const baseCup = [0, 0, 0];
    rotate(SPIKE_DOWN_GRIP_QUATERNION, 0, -1, 0, baseCup);
    expect(baseCup[1]).toBeCloseTo(1, 9);
  });

  it('turns exactly from spike up to spike down', () => {
    const start = climbingGrip(BASE_CUP, 'below', { from: 0, to: 1 }, 0);
    const end = climbingGrip(BASE_CUP, 'below', { from: 0, to: 1 }, 1);
    // q and -q are the same orientation.
    const same = (a: Quat | null, b: Quat) =>
      Math.abs(Math.abs(a![0] * b[0] + a![1] * b[1] + a![2] * b[2] + a![3] * b[3]) - 1);
    expect(same(start, SPIKE_UP_GRIP_QUATERNION)).toBeLessThan(1e-12);
    expect(same(end, SPIKE_DOWN_GRIP_QUATERNION)).toBeLessThan(1e-12);
  });

  it('turns only on a launch from below, not leading on from a seat', () => {
    expect(climbingGrip(BASE_CUP, 'seat', { from: 0, to: 1 }, 0.5)).toBeNull();
  });

  it('starts the pull spike up', () => {
    expect(samples[0].phase).toBe('pull');
    expect(samples[0].spikeUp).toBeGreaterThan(0.99);
  });

  it('turns gradually, in step with the ball climbing', () => {
    // Never back: the spike only ever comes down as the ball goes up.
    for (let i = 1; i < samples.length; i += 1) {
      expect(samples[i].spikeUp).toBeLessThan(samples[i - 1].spikeUp + 0.02);
    }
    // Spread across the climb rather than snapped at either end: mostly up
    // a quarter of the way, lying across halfway (the wrist trails the ball
    // a little, which climbs fastest early), and mostly over by three
    // quarters.
    const at = (fraction: number) => samples.find((s) => s.climbed >= fraction)!.spikeUp;
    expect(at(0.25)).toBeGreaterThan(0.7);
    expect(Math.abs(at(0.5))).toBeLessThan(0.7);
    expect(at(0.75)).toBeLessThan(0);
  });

  it('has the spike down by the time the ball peaks', () => {
    expect(atApex).toBeLessThan(-0.97);
  });

  it('lands with the spike still pointing down', () => {
    expect(run.attempt.phase).toEqual({ kind: 'landed' });
    expect(spikeOf(run.attempt.hand.orientation)[1]).toBeLessThan(-0.99);
  });
});
