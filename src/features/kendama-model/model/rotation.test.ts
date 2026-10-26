import { Quaternion, Vector3 } from 'three';

import { cupMouthRadius, cupSeatOffset, SARADO, TAMA } from './anatomy';
import { advanceTrickRun, createTrickRun, isFinished } from './catch-trick';
import { BIG_CUP } from './tricks';
import { collideWithKen, createKenContact } from './collision';
import {
  moveHand,
  restingHand,
  trackAxis,
  trackOrientation,
  WRIST_MAX_ANGULAR_ACCELERATION,
  WRIST_MAX_ANGULAR_SPEED,
  type Hand,
} from './hand';
import {
  createStringSim,
  kenSurfaceDisplacement,
  PARTICLE_COUNT,
  stepStringSimDriven,
  stringPathLength,
  SUBSTEP,
  type StringSim,
} from './string-sim';
import {
  BIG_CUP_GRIP_QUATERNION,
  bigCupGripPose,
  gripPose,
  SPIKE_UP_GRIP_QUATERNION,
  STRING_LENGTH,
  STRING_RADIUS,
  type Quat,
} from './stringing';
import { rotate, rotationBetween } from './vec';
import type { Vec3 } from './views';

const WRIST_OMEGA = 25;

type TiltDirection = readonly [name: string, axis: Vec3];

/** Toward the player's left is toward the string, for a right-handed stringing. */
const TILT_DIRECTIONS: readonly TiltDirection[] = [
  ['left', [0, 0, 1]],
  ['right', [0, 0, -1]],
  ['toward the player', [1, 0, 0]],
  ['away', [-1, 0, 0]],
];

/** The big-cup grip tipped by `degrees` about a world axis. */
function tilted(degrees: number, axis: Vec3): Quat {
  const q = new Quaternion()
    .setFromAxisAngle(new Vector3(...axis), (degrees * Math.PI) / 180)
    .multiply(new Quaternion(...BIG_CUP_GRIP_QUATERNION));
  return [q.x, q.y, q.z, q.w];
}

type WristRun = { hand: Hand; deepestBall: number; deepestString: number; longest: number };

/** Holds the hand where it is and turns the wrist toward `target`. */
function turnWrist(sim: StringSim, start: Hand, target: Quat, seconds: number): WristRun {
  const contact = createKenContact();
  const run: WristRun = { hand: start, deepestBall: 0, deepestString: 0, longest: 0 };
  const home = start.position;
  const frames = Math.round(seconds * 60);
  for (let f = 0; f < frames; f += 1) {
    stepStringSimDriven(sim, 1 / 60, (_, h) => {
      const { hand } = run;
      run.hand = moveHand(
        hand,
        {
          linear: [0, 1, 2].map((k) =>
            trackAxis(hand.position[k], hand.velocity[k], home[k], 0, 30),
          ) as unknown as Vec3,
          angular: trackOrientation(hand, target, WRIST_OMEGA),
        },
        h,
      );
      return gripPose(run.hand.position, run.hand.orientation);
    });
    if (collideWithKen(sim.kenPosition, sim.kenQuaternion, sim.tamaPosition, 0, TAMA.radius, contact)) {
      run.deepestBall = Math.max(run.deepestBall, contact.depth);
    }
    for (let i = 1; i < PARTICLE_COUNT; i += 1) {
      if (collideWithKen(sim.kenPosition, sim.kenQuaternion, sim.positions, i * 3, STRING_RADIUS, contact)) {
        run.deepestString = Math.max(run.deepestString, contact.depth);
      }
    }
    run.longest = Math.max(run.longest, stringPathLength(sim));
  }
  return run;
}

/** Where the ball sits relative to the big cup's seat, in the ken's own frame. */
function offSeat(sim: StringSim, hand: Hand): number {
  // The big cup is ken-local +X, on the sarado's axis through the hand.
  const seat = [0, 0, 0];
  rotate(hand.orientation, BIG_CUP.seatHeight, 0, 0, seat);
  return Math.hypot(
    sim.tamaPosition[0] - (hand.position[0] + seat[0]),
    sim.tamaPosition[1] - (hand.position[1] + seat[1]),
    sim.tamaPosition[2] - (hand.position[2] + seat[2]),
  );
}

function landedBigCup() {
  const run = createTrickRun(BIG_CUP, 'right');
  while (!isFinished(run.attempt)) advanceTrickRun(run, 1 / 60);
  expect(run.attempt.phase).toEqual({ kind: 'landed' });
  return run;
}

describe('the wrist', () => {
  it('turns a quarter turn to spike-up and stops there, within its limits', () => {
    let hand = restingHand([0, 0, 0], BIG_CUP_GRIP_QUATERNION);
    let fastest = 0;
    for (let t = 0; t < 0.6; t += SUBSTEP) {
      hand = moveHand(
        hand,
        { linear: [0, 0, 0], angular: trackOrientation(hand, SPIKE_UP_GRIP_QUATERNION, WRIST_OMEGA) },
        SUBSTEP,
      );
      fastest = Math.max(fastest, Math.hypot(...hand.angularVelocity));
    }
    const left = [0, 0, 0];
    rotationBetween(hand.orientation, SPIKE_UP_GRIP_QUATERNION, left);
    expect(Math.hypot(...left)).toBeLessThan(0.01);
    expect(fastest).toBeLessThanOrEqual(WRIST_MAX_ANGULAR_SPEED + 1e-9);
  });

  it('cannot turn faster than its acceleration allows', () => {
    // Even flat out from rest, reaching within 0.05 rad of a quarter turn
    // takes √(2θ/α): the wrist gets there no sooner, however hard it is told.
    const quickest = Math.sqrt((2 * (Math.PI / 2 - 0.05)) / WRIST_MAX_ANGULAR_ACCELERATION);
    let hand = restingHand([0, 0, 0], BIG_CUP_GRIP_QUATERNION);
    const left = [0, 0, 0];
    let t = 0;
    for (; t < 1; t += SUBSTEP) {
      hand = moveHand(hand, { linear: [0, 0, 0], angular: trackOrientation(hand, SPIKE_UP_GRIP_QUATERNION, 200) }, SUBSTEP);
      rotationBetween(hand.orientation, SPIKE_UP_GRIP_QUATERNION, left);
      if (Math.hypot(...left) < 0.05) break;
    }
    expect(t).toBeGreaterThan(quickest - 2 * SUBSTEP);
  });
});

describe('rotationBetween', () => {
  it('recovers an axis and angle', () => {
    const from = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.3);
    const to = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 1.1).multiply(from);
    const out = [0, 0, 0];
    rotationBetween([from.x, from.y, from.z, from.w], [to.x, to.y, to.z, to.w], out);
    expect(out[0]).toBeCloseTo(1.1, 9);
    expect(out[1]).toBeCloseTo(0, 9);
    expect(out[2]).toBeCloseTo(0, 9);
  });
});

describe('the ken surface under rotation', () => {
  it('moves at ω × r, so a turning rim outruns its axis', () => {
    const sim = createStringSim('right', bigCupGripPose([0, 0, 0]), { kind: 'hanging' });
    const turn = new Quaternion()
      .setFromAxisAngle(new Vector3(0, 1, 0), 0.01)
      .multiply(new Quaternion(...BIG_CUP_GRIP_QUATERNION));
    sim.kenPreviousQuaternion.set(sim.kenQuaternion);
    sim.kenPreviousPosition.set(sim.kenPosition);
    sim.kenQuaternion.set([turn.x, turn.y, turn.z, turn.w]);
    // Rotating about the world vertical through the ken's base cup.
    const out = new Float64Array(3);
    kenSurfaceDisplacement(sim, sim.kenPosition[0] + 40, sim.kenPosition[1], sim.kenPosition[2], out);
    // ω × r for a turn about +Y at a point on +X moves it toward -Z.
    expect(out[2]).toBeCloseTo(-0.4, 3);
    expect(Math.abs(out[0])).toBeLessThan(0.01);
  });
});

describe('tilting a caught Big Cup', () => {
  const threshold =
    (Math.atan2(cupMouthRadius(SARADO.bigCup), cupSeatOffset(SARADO.bigCup)) * 180) / Math.PI;

  it('has a tipping angle near 47° by its geometry', () => {
    expect(threshold).toBeGreaterThan(44);
    expect(threshold).toBeLessThan(50);
  });

  it.each(TILT_DIRECTIONS)('keeps the ball seated through a 25° tilt %s', (_, axis) => {
    const { sim, attempt } = landedBigCup();
    const run = turnWrist(sim, attempt.hand, tilted(25, axis), 1.5);
    expect(offSeat(sim, run.hand)).toBeLessThan(5);
    expect(run.deepestBall).toBeLessThan(2);
  });

  // Toward the string included: slack string draped over the ken must slide
  // off when the ball pulls it, not glue the ball into the cup.
  it.each(TILT_DIRECTIONS)('spills the ball past the tipping angle, tilting %s', (_, axis) => {
    const { sim, attempt } = landedBigCup();
    const run = turnWrist(sim, attempt.hand, tilted(75, axis), 1.5);
    expect(offSeat(sim, run.hand)).toBeGreaterThan(30);
    expect(run.deepestBall).toBeLessThan(2);
  });

  it('carries the ball round a spin of the cup about its own axis', () => {
    const { sim, attempt } = landedBigCup();
    const spun = new Quaternion()
      .setFromAxisAngle(new Vector3(0, 1, 0), Math.PI * 0.9)
      .multiply(new Quaternion(...BIG_CUP_GRIP_QUATERNION));
    const run = turnWrist(sim, attempt.hand, [spun.x, spun.y, spun.z, spun.w], 1.5);
    expect(offSeat(sim, run.hand)).toBeLessThan(5);
  });
});

describe('turning to spike-up with the ball hanging', () => {
  const sim = createStringSim('right', bigCupGripPose([0, 0, 0]), { kind: 'hanging' });
  const settle = turnWrist(sim, restingHand([0, 0, 0], BIG_CUP_GRIP_QUATERNION), BIG_CUP_GRIP_QUATERNION, 1);
  const run = turnWrist(sim, settle.hand, SPIKE_UP_GRIP_QUATERNION, 3);

  it('points the spike up', () => {
    const spike = [0, 0, 0];
    rotate(run.hand.orientation, 0, 1, 0, spike);
    expect(spike[1]).toBeGreaterThan(0.999);
  });

  it('keeps the string out of the wood and at its length', () => {
    expect(run.deepestString).toBeLessThan(1);
    expect(run.longest).toBeLessThan(STRING_LENGTH * 1.02);
  });

  it('leaves the ball hanging below the hand', () => {
    expect(sim.tamaPosition[1]).toBeLessThan(-STRING_LENGTH * 0.8);
  });
});
