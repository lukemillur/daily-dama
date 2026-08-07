import { describe, expect, it } from '@jest/globals';

import { localDirectionToWorld, localToWorld, type BodyPose, type Vec3 } from '@/features/trick-viz/model/body';
import {
  KENDAMA_LAYOUT,
  SPIKE_LENGTH,
  seatOffset,
} from '@/features/trick-viz/model/kendama-geometry';
import {
  insertionDepth,
  seatTamaInCup,
  spearTamaOnSpike,
  standKenOnTama,
} from '@/features/trick-viz/model/mate';
import { KEN_SOCKETS, TAMA_SOCKETS, toWorldSocket } from '@/features/trick-viz/model/sockets';
import { TAMA_LAYOUT } from '@/features/trick-viz/model/tama-geometry';

/**
 * The grip verified by eye during the Big Cup work: roll the big cup up to
 * +Y, then swing the base cup round to +Z facing the player.
 */
const BIG_CUP_POSE: BodyPose = {
  position: [0, 0, 0],
  rotation: [0, -Math.PI / 2, Math.PI / 2],
};

function expectVec3(actual: Vec3, expected: Vec3, precision = 6) {
  expect(actual[0]).toBeCloseTo(expected[0], precision);
  expect(actual[1]).toBeCloseTo(expected[1], precision);
  expect(actual[2]).toBeCloseTo(expected[2], precision);
}

/**
 * Locks in the hand-verified Big Cup orientation table. If a change to the
 * pose plumbing silently reinterprets the grip, this fails here rather than
 * in a screenshot three layers up.
 */
describe('Big Cup grip landmark orientation', () => {
  it('points the big cup up, the base cup at the player, and the spike away', () => {
    expectVec3(localDirectionToWorld([1, 0, 0], BIG_CUP_POSE), [0, 1, 0]);
    expectVec3(localDirectionToWorld([0, -1, 0], BIG_CUP_POSE), [0, 0, 1]);
    expectVec3(localDirectionToWorld([0, 1, 0], BIG_CUP_POSE), [0, 0, -1]);
    expectVec3(localDirectionToWorld([-1, 0, 0], BIG_CUP_POSE), [0, -1, 0]);
  });

  it('puts the string hole off the shaft on the near side', () => {
    expectVec3(localToWorld(KENDAMA_LAYOUT.stringHoleLocal, BIG_CUP_POSE), [-0.08, 0, -0.08]);
  });
});

describe('seatTamaInCup', () => {
  it('rests the tama on the rim, never inside the cup', () => {
    const cup = toWorldSocket(KEN_SOCKETS.bigCup, BIG_CUP_POSE);
    const seat = seatTamaInCup(cup);

    const offset = seatOffset(TAMA_LAYOUT.radius, cup.radius);
    expect(offset).toBeGreaterThan(0);
    expectVec3(seat.position, [
      cup.point[0] + cup.axis[0] * offset,
      cup.point[1] + cup.axis[1] * offset,
      cup.point[2] + cup.axis[2] * offset,
    ]);
  });

  it('reproduces the world seat Big Cup was verified against', () => {
    const cup = toWorldSocket(KEN_SOCKETS.bigCup, BIG_CUP_POSE);
    const seat = seatTamaInCup(cup);

    // The big cup mouth is local [0.4, 0.1, 0]; under this grip it lands
    // just off-centre and above the origin, opening straight up.
    expectVec3(cup.point, [0, 0.4, -0.1], 5);
    expectVec3(seat.position, [0, 0.4 + seatOffset(TAMA_LAYOUT.radius, 0.225), -0.1], 5);

    // The catch is above the ken's centre, which is what makes the tama have
    // to arrive from over the top rather than from underneath.
    expect(seat.position[1]).toBeGreaterThan(0);
  });

  it('swallows the tama whole only if a mouth is wider than it', () => {
    expect(seatOffset(TAMA_LAYOUT.radius, TAMA_LAYOUT.radius + 0.1)).toBe(0);
  });

  it('carries the tama orientation through, since a sphere on a rim has none', () => {
    const spun: Vec3 = [0, 1.2, 0];
    expect(seatTamaInCup(toWorldSocket(KEN_SOCKETS.bigCup, BIG_CUP_POSE), spun).rotation).toEqual(
      spun,
    );
  });
});

describe('spearTamaOnSpike', () => {
  it('anti-aligns the hole with the spike so the bore faces back down it', () => {
    const spike = toWorldSocket(KEN_SOCKETS.spike, { position: [0, 0, 0], rotation: [0, 0, 0] });
    const pose = spearTamaOnSpike(spike);

    expectVec3(localDirectionToWorld(TAMA_LAYOUT.holeAxisLocal, pose), [
      -spike.axis[0],
      -spike.axis[1],
      -spike.axis[2],
    ]);
  });

  it('swallows the whole spike, so none of it is left showing', () => {
    const spike = toWorldSocket(KEN_SOCKETS.spike, { position: [0, 0, 0], rotation: [0, 0, 0] });
    const pose = spearTamaOnSpike(spike);

    // The tama goes on until the spike bottoms out, which here is the
    // spike's own length rather than the (deeper) bore.
    expect(insertionDepth(KEN_SOCKETS.spike, TAMA_SOCKETS.hole)).toBeCloseTo(SPIKE_LENGTH, 10);
    expectVec3(pose.position, [
      0,
      KENDAMA_LAYOUT.spikeTip[1] + TAMA_LAYOUT.radius - SPIKE_LENGTH,
      0,
    ]);

    // Every point along the spike sits inside the ball...
    for (let i = 0; i <= 20; i += 1) {
      const y = KENDAMA_LAYOUT.shaftTop + (SPIKE_LENGTH * i) / 20;
      expect(Math.abs(pose.position[1] - y)).toBeLessThanOrEqual(TAMA_LAYOUT.radius + 1e-9);
    }

    // ...and the hole's mouth comes to rest exactly where it leaves the shaft.
    expect(pose.position[1] + TAMA_LAYOUT.holeLocal[1]).toBeCloseTo(KENDAMA_LAYOUT.shaftTop, 10);
  });

  it('leaves the string hole and its paint on the far side from the spike', () => {
    const spike = toWorldSocket(KEN_SOCKETS.spike, { position: [0, 0, 0], rotation: [0, 0, 0] });
    const pose = spearTamaOnSpike(spike);

    // A landed tama sits at neutral rotation with its painted top upward,
    // which is how the frame is oriented and how it looks in life.
    expectVec3(localDirectionToWorld(TAMA_LAYOUT.stringHoleAxisLocal, pose), [0, 1, 0]);
  });

  it('would stop short of burying a spike longer than the bore', () => {
    // Guards the other direction: a ken that outreaches the cavity must not
    // be driven through the ball.
    const longSpike = { ...KEN_SOCKETS.spike, depth: TAMA_LAYOUT.holeDepth + 1 };
    expect(insertionDepth(longSpike, TAMA_SOCKETS.hole)).toBe(TAMA_LAYOUT.holeDepth);
  });

  it('holds the mate while spinning the tama about the spike', () => {
    const spike = toWorldSocket(KEN_SOCKETS.spike, { position: [0, 0, 0], rotation: [0, 0, 0] });
    const still = spearTamaOnSpike(spike);
    const spun = spearTamaOnSpike(spike, Math.PI / 3);

    expectVec3(spun.position, still.position);
    expectVec3(localDirectionToWorld(TAMA_LAYOUT.holeAxisLocal, spun), [0, -1, 0]);
  });
});

describe('standKenOnTama', () => {
  it('solves the ken pose, not the tama pose — the reverse of a catch', () => {
    const tamaCenter: Vec3 = [0, 1, 0];
    const pose = standKenOnTama(tamaCenter);

    // The base cup rim must face down onto the ball.
    expectVec3(localDirectionToWorld(KEN_SOCKETS.baseCupRim.axis, pose), [0, -1, 0]);

    // ...and land on the rim plane, the same chord across the sphere that a
    // cup catch uses, read the other way round.
    const rimWorld = localToWorld(KEN_SOCKETS.baseCupRim.point, pose);
    expectVec3(rimWorld, [
      0,
      1 + seatOffset(TAMA_LAYOUT.radius, KEN_SOCKETS.baseCupRim.radius),
      0,
    ]);
  });

  it('stands the spike up above the ball', () => {
    const pose = standKenOnTama([0, 1, 0]);
    const spikeWorld = localToWorld(KENDAMA_LAYOUT.spikeTip, pose);

    expect(spikeWorld[1]).toBeGreaterThan(1 + TAMA_LAYOUT.radius);
    expect(Math.hypot(spikeWorld[0], spikeWorld[2])).toBeCloseTo(0, 6);
  });
});
