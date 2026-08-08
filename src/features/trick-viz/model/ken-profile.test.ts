import { describe, expect, it } from '@jest/globals';

import {
  CUP_LIP_CLEARANCE,
  CUP_LIP_WIDTH,
  cupLipHeight,
  cupLipOuterRadius,
  KENDAMA_LAYOUT,
  seatOffset,
} from '@/features/trick-viz/model/kendama-geometry';
import {
  CRADLE_RADIUS,
  kenBodyProfile,
  sideCupProfile,
  SIDE_CUP_ARM_REACH,
} from '@/features/trick-viz/model/ken-profile';
import { KEN_SOCKETS } from '@/features/trick-viz/model/sockets';
import { TAMA_LAYOUT } from '@/features/trick-viz/model/tama-geometry';

/**
 * The mesh is allowed to look like whatever it likes between the landmarks,
 * but two of its shapes are load-bearing for the tricks rather than
 * decorative, and both were wrong before this suite existed:
 *
 * - a proud shoulder on the neck hung the tama two thirds of the way down
 *   the spike, well short of the sarado;
 * - a rim standing above the mouth plane would sit inside a ball caught in
 *   that same cup.
 *
 * Neither is visible in the numbers in `KENDAMA_LAYOUT`; both are visible
 * here, in the profile the lathe is actually turned from.
 */

const body = kenBodyProfile(CRADLE_RADIUS);

const SIDE_CUPS = [
  { name: 'big cup', cup: KENDAMA_LAYOUT.bigCup },
  { name: 'small cup', cup: KENDAMA_LAYOUT.smallCup },
] as const;

/**
 * How far a seated ball's surface has climbed above the mouth plane by the
 * time it reaches `radius` — the ceiling every bit of rim has to stay under.
 */
function ballRise(cup: { mouthRadius: number }, radius: number): number {
  return (
    seatOffset(TAMA_LAYOUT.radius, cup.mouthRadius) - seatOffset(TAMA_LAYOUT.radius, radius)
  );
}

describe('the ken above the sarado', () => {
  it('stays inside the tama’s bore the whole way to the tip, so the ball can reach the sarado', () => {
    const { saradoTop, spikeTip } = KENDAMA_LAYOUT;
    const exposed = body.filter((point) => point.y > saradoTop && point.y <= spikeTip[1]);

    // Not an empty assertion by accident: there is a real neck and cone up
    // there to check.
    expect(exposed.length).toBeGreaterThan(10);

    for (const point of exposed) {
      expect(point.x).toBeLessThan(TAMA_LAYOUT.holeRadius);
    }
  });

  it('finishes the sarado with a face wider than the bore for the ball to land on', () => {
    const { saradoTop } = KENDAMA_LAYOUT;
    const atTheFace = body.filter((point) => Math.abs(point.y - saradoTop) < 0.002);

    // A flat top, from wider than the hole in to narrower than it — which is
    // what makes it a landing rather than the end of a taper.
    expect(Math.max(...atTheFace.map((point) => point.x))).toBeGreaterThan(
      TAMA_LAYOUT.holeRadius,
    );
    expect(Math.min(...atTheFace.map((point) => point.x))).toBeLessThan(TAMA_LAYOUT.holeRadius);
  });
});

describe('cup rim lips', () => {
  it('stands proud of the wall, or there is nothing to hook a hole on', () => {
    // `CUP_WALL` is deliberately not exported — the relationship that matters
    // is that the lip reaches further out than the wood below it, and the
    // profiles put the widest point of every cup on the lip.
    for (const { name, cup } of SIDE_CUPS) {
      const profile = sideCupProfile(cup, SIDE_CUP_ARM_REACH, CRADLE_RADIUS);
      const widest = Math.max(...profile.map((point) => point.x));

      expect({ name, widest }).toEqual({
        name,
        widest: cupLipOuterRadius(cup.mouthRadius),
      });
    }

    expect(Math.max(...body.map((point) => point.x))).toBeCloseTo(
      cupLipOuterRadius(KENDAMA_LAYOUT.baseCup.mouthRadius),
      10,
    );
  });

  it('rises above the mouth plane on every cup', () => {
    for (const cup of [KENDAMA_LAYOUT.bigCup, KENDAMA_LAYOUT.smallCup, KENDAMA_LAYOUT.baseCup]) {
      expect(cupLipHeight(TAMA_LAYOUT.radius, cup.mouthRadius)).toBeGreaterThan(0.01);
    }
  });

  it('never touches a ball seated in the same cup', () => {
    // The ball rests on the mouth circle and its surface climbs away going
    // outward. Every piece of wood outside the aperture has to stay under
    // that curve, or a catch intersects its own rim.
    //
    // Right at the aperture the curve *is* the mouth plane, so no clearance
    // is possible there and none is asserted — the rim has to be that high,
    // it is what the ball lands on. The clearance is what the lip gives back
    // where the ball has climbed enough to allow it, checked below.
    for (const { name, cup } of SIDE_CUPS) {
      const mouthY = cup.height / 2;

      for (const point of sideCupProfile(cup, SIDE_CUP_ARM_REACH, CRADLE_RADIUS)) {
        if (point.x < cup.mouthRadius) continue;

        expect({ name, inside: point.y - mouthY > ballRise(cup, point.x) + 1e-9 }).toEqual({
          name,
          inside: false,
        });
      }
    }

    const baseMouthY = KENDAMA_LAYOUT.baseCup.center[1] - KENDAMA_LAYOUT.baseCup.height / 2;

    for (const point of body) {
      if (point.x < KENDAMA_LAYOUT.baseCup.mouthRadius) continue;

      // This cup opens downward, so "above the mouth plane" is below it in y.
      expect(baseMouthY - point.y).toBeLessThanOrEqual(
        ballRise(KENDAMA_LAYOUT.baseCup, point.x) + 1e-9,
      );
    }
  });

  it('holds the full clearance at its top, where the ball has climbed away', () => {
    for (const cup of [KENDAMA_LAYOUT.bigCup, KENDAMA_LAYOUT.smallCup, KENDAMA_LAYOUT.baseCup]) {
      const top = cupLipHeight(TAMA_LAYOUT.radius, cup.mouthRadius);

      expect(ballRise(cup, cupLipOuterRadius(cup.mouthRadius)) - top).toBeGreaterThanOrEqual(
        CUP_LIP_CLEARANCE - 1e-9,
      );
    }
  });

  it('puts the lip sockets on the wood the lathe actually turns', () => {
    const cases = [
      { socket: KEN_SOCKETS.bigCupLip, cup: KENDAMA_LAYOUT.bigCup, axis: 0, sign: 1 },
      { socket: KEN_SOCKETS.smallCupLip, cup: KENDAMA_LAYOUT.smallCup, axis: 0, sign: -1 },
      { socket: KEN_SOCKETS.baseCupLip, cup: KENDAMA_LAYOUT.baseCup, axis: 1, sign: -1 },
    ];

    for (const { socket, cup, axis, sign } of cases) {
      const mouth = cup.center[axis] + sign * (cup.height / 2);
      const height = cupLipHeight(TAMA_LAYOUT.radius, cup.mouthRadius);

      expect(socket.point[axis]).toBeCloseTo(mouth + sign * height, 10);
      expect(socket.radius).toBeCloseTo(cup.mouthRadius + CUP_LIP_WIDTH, 10);
    }
  });
});
