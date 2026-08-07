import { describe, expect, it } from '@jest/globals';

import type { Vec3 } from '@/features/trick-viz/model/body';
import {
  swingDirection,
  tossArc,
  tossPositionAt,
} from '@/features/trick-viz/model/ballistics';

/** The launch and catch Big Cup was tuned against, in world space. */
const BIG_CUP_LAUNCH: Vec3 = [-0.08, -2.739, -0.08];
const BIG_CUP_LAND: Vec3 = [0, 0.689, -0.1];
const BIG_CUP_APEX_RISE = 0.35;

describe('tossArc', () => {
  it('lands exactly on the target — the apex split makes the √ terms cancel', () => {
    const arc = tossArc({
      launch: BIG_CUP_LAUNCH,
      land: BIG_CUP_LAND,
      apexRise: BIG_CUP_APEX_RISE,
    });

    // Not "close enough": a seam here is a visible hitch where the flight
    // hands off to the catch.
    expect(tossPositionAt(arc, 0)[1]).toBeCloseTo(BIG_CUP_LAUNCH[1], 10);
    expect(tossPositionAt(arc, 1)[1]).toBeCloseTo(BIG_CUP_LAND[1], 10);
  });

  it('starts and ends on the endpoints laterally too', () => {
    const arc = tossArc({
      launch: BIG_CUP_LAUNCH,
      land: BIG_CUP_LAND,
      apexRise: BIG_CUP_APEX_RISE,
      swing: [-0.55, 0, 0],
    });

    expect(tossPositionAt(arc, 0)[0]).toBeCloseTo(BIG_CUP_LAUNCH[0], 10);
    expect(tossPositionAt(arc, 0)[2]).toBeCloseTo(BIG_CUP_LAUNCH[2], 10);
    expect(tossPositionAt(arc, 1)[0]).toBeCloseTo(BIG_CUP_LAND[0], 10);
    expect(tossPositionAt(arc, 1)[2]).toBeCloseTo(BIG_CUP_LAND[2], 10);
  });

  it('puts the apex late, because the long climb takes longer than the short drop', () => {
    const arc = tossArc({
      launch: BIG_CUP_LAUNCH,
      land: BIG_CUP_LAND,
      apexRise: BIG_CUP_APEX_RISE,
    });

    expect(arc.apexU).toBeCloseTo(0.77, 2);
  });

  it('keeps the tuned Big Cup flight length after moving timing onto gravity', () => {
    const arc = tossArc({
      launch: BIG_CUP_LAUNCH,
      land: BIG_CUP_LAND,
      apexRise: BIG_CUP_APEX_RISE,
    });

    // The hand-tuned original ran the flight over 0.10-0.88 of a 2.2s trick.
    expect(arc.duration).toBeCloseTo(1.716, 1);
  });

  it('peaks at the apex and nowhere else', () => {
    const arc = tossArc({
      launch: BIG_CUP_LAUNCH,
      land: BIG_CUP_LAND,
      apexRise: BIG_CUP_APEX_RISE,
    });

    expect(tossPositionAt(arc, arc.apexU)[1]).toBeCloseTo(arc.apexY, 10);

    // Strictly monotonic either side: the "two-step floaty" bug was a stall
    // mid-flight, and a stall shows up here as a repeated height.
    for (let i = 1; i <= 40; i += 1) {
      const u = (i / 40) * arc.apexU;
      expect(tossPositionAt(arc, u)[1]).toBeGreaterThan(
        tossPositionAt(arc, u - arc.apexU / 40)[1],
      );
    }
  });

  it('takes longer for a higher toss, so sequenced tosses keep relative timing', () => {
    const low = tossArc({ launch: [0, 0, 0], land: [0, 0, 0], apexRise: 1 });
    const high = tossArc({ launch: [0, 0, 0], land: [0, 0, 0], apexRise: 4 });

    expect(high.duration / low.duration).toBeCloseTo(2, 6);
  });

  it('swings widest at mid-flight, when the tama passes the ken', () => {
    const arc = tossArc({
      launch: [0, 0, 0],
      land: [0, 0, 0],
      apexRise: 1,
      swing: [-0.55, 0, 0],
    });

    expect(tossPositionAt(arc, 0.5)[0]).toBeCloseTo(-0.55, 6);
  });
});

describe('swingDirection', () => {
  it('swings to the side the string exits', () => {
    expect(swingDirection([-0.08, 0, -0.08], [0, 1, 0])[0]).toBeLessThan(0);
    expect(swingDirection([0.08, 0, 0.08], [0, 1, 0])[0]).toBeGreaterThan(0);
  });

  it('swings across the ken, not along it', () => {
    // Ken lying along world Z, string hole offset with a component both
    // across (-X) and along (-Z) it: only the across part should survive,
    // since the ken's own length is the obstacle being cleared.
    const swing = swingDirection([-0.08, 0, -0.08], [0, 0, 1]);

    expect(swing[0]).toBeCloseTo(-1, 6);
    expect(swing[2]).toBeCloseTo(0, 6);
  });

  it('stays horizontal and unit length', () => {
    const swing = swingDirection([-0.08, 0, -0.08], [0, 0.6, 0.8]);

    expect(swing[1]).toBe(0);
    expect(Math.hypot(swing[0], swing[2])).toBeCloseTo(1, 6);
  });

  it('falls back to a perpendicular when the hole sits on the ken axis', () => {
    const swing = swingDirection([0, 0.2, 0], [0, 1, 0]);

    expect(Math.hypot(swing[0], swing[2])).toBeCloseTo(1, 6);
  });
});
