import { TAMA } from './anatomy';
import { collideWithKen, createKenContact } from './collision';
import {
  createStringSim,
  GRAVITY,
  stepStringSim,
  stringPathLength,
  type InitialLayout,
  type StringSim,
} from './string-sim';
import { bigCupGripPose, STRING_LENGTH, type Handedness } from './stringing';
import { rotate } from './vec';

/** The hand holds the sarado at the world origin; the player is on +Z, facing -Z. */
const GRIP = bigCupGripPose([0, 0, 0]);

function run(
  handedness: Handedness,
  layout: InitialLayout,
  seconds: number,
  frame = 1 / 60,
  averageOverLast = 0,
) {
  const sim = createStringSim(handedness, GRIP, layout);
  let deepest = 0;
  let longest = 0;
  let sumX = 0;
  let samples = 0;
  const contact = createKenContact();
  const frames = Math.round(seconds / frame);
  for (let f = 0; f < frames; f += 1) {
    stepStringSim(sim, GRIP, frame);
    if (collideWithKen(sim.kenPosition, sim.kenQuaternion, sim.tamaPosition, 0, TAMA.radius, contact)) {
      deepest = Math.max(deepest, contact.depth);
    }
    longest = Math.max(longest, stringPathLength(sim));
    if ((frames - f) * frame <= averageOverLast) {
      sumX += sim.tamaPosition[0];
      samples += 1;
    }
  }
  return { sim, deepest, longest, meanX: samples ? sumX / samples : NaN };
}

function stringHoleUp(sim: StringSim): number {
  const up = [0, 0, 0];
  rotate(sim.tamaQuaternion, 0, 1, 0, up);
  return up[1];
}

describe('a strung tama at rest in the big-cup grip', () => {
  const right = run('right', { kind: 'hanging' }, 4).sim;

  it('hangs on the inside of a right-handed player: their left, -X', () => {
    expect(right.tamaPosition[0]).toBeLessThan(-10);
    // Below the hand by about the string's length plus the ball.
    expect(right.tamaPosition[1]).toBeLessThan(-STRING_LENGTH);
    expect(Math.abs(right.tamaPosition[2])).toBeLessThan(15);
  });

  it('mirrors for a left-handed stringing', () => {
    const left = run('left', { kind: 'hanging' }, 4).sim;
    expect(left.tamaPosition[0]).toBeGreaterThan(10);
  });

  it('turns its string hole up toward the ken', () => {
    expect(stringHoleUp(right)).toBeGreaterThan(0.97);
  });

  it('comes to rest', () => {
    const speed = Math.hypot(...right.tamaVelocity);
    expect(speed).toBeLessThan(20);
  });

  it('does not stretch the string', () => {
    expect(stringPathLength(right)).toBeLessThan(STRING_LENGTH * 1.02);
  });
});

describe('a tama let go beside the big cup', () => {
  // Held out in front of the player, past the base cup and at hand height,
  // so it falls clear of the ken and the string decides where it swings.
  const layout: InitialLayout = { kind: 'held', tamaCentre: [0, 30, 140] };
  // A 34cm pendulum swings for a long time on air drag alone, so let the
  // swing die down and then judge where it swings *about*: the mean over
  // several periods.
  const period = 2 * Math.PI * Math.sqrt((STRING_LENGTH + TAMA.radius) / GRAVITY);
  const { deepest, longest, meanX } = run('right', layout, 14, 1 / 60, 4 * period);

  it('falls, swings through, and swings about a rest point on the inside', () => {
    expect(meanX).toBeLessThan(-10);
  });

  it('holds the string to its length, even as it snaps taut', () => {
    expect(longest).toBeLessThan(STRING_LENGTH * 1.02);
  });

  it('never sinks into the ken', () => {
    expect(deepest).toBeLessThan(2);
  });
});

describe('stepping', () => {
  it('is independent of the display frame rate', () => {
    const at60 = run('right', { kind: 'hanging' }, 1, 1 / 60).sim;
    const at30 = run('right', { kind: 'hanging' }, 1, 1 / 30).sim;
    for (let k = 0; k < 3; k += 1) {
      expect(at30.tamaPosition[k]).toBeCloseTo(at60.tamaPosition[k], 6);
    }
  });

  it('is deterministic', () => {
    const a = run('right', { kind: 'held', tamaCentre: [0, 30, 140] }, 1).sim;
    const b = run('right', { kind: 'held', tamaCentre: [0, 30, 140] }, 1).sim;
    expect(Array.from(a.positions)).toEqual(Array.from(b.positions));
  });
});
