import { describe, expect, it } from '@jest/globals';

import {
  KENDAMA_LAYOUT,
  SPIKE_EXPOSED,
  SPIKE_SEAT_CLEARANCE,
  spikeHeightAtRadius,
} from '@/features/trick-viz/model/kendama-geometry';
import { CRADLE_RADIUS, kenBodyProfile } from '@/features/trick-viz/model/ken-profile';
import {
  TAMA_BORE_CLEARANCE,
  TAMA_BORE_STEP_DEPTH,
  TAMA_BORE_TIP_RADIUS,
  TAMA_HOLE_MOUTH_Y,
  TAMA_LAYOUT,
} from '@/features/trick-viz/model/tama-geometry';

/**
 * A ken and its tama are turned as a matched pair, and the two numbers that
 * have to match are the depth of the bore and how far the spike stands proud
 * of the sarado. The model used to carry them as independent constants that
 * happened to be close; they are one number now, and this is where that is
 * held true along with the ball's own limit on how deep it can go.
 */
describe('the tama’s bore against the ken’s spike', () => {
  it('is bored to exactly the length the spike stands proud', () => {
    expect(TAMA_LAYOUT.holeDepth).toBeCloseTo(SPIKE_EXPOSED, 10);
  });

  it('brings the tip to the bottom of the bore as the ball reaches the sarado', () => {
    // The landing has two contacts and they have to happen together. Read in
    // world terms with the ball landed: the blind end of the bore and the
    // spike's tip are the same point.
    const centre = KENDAMA_LAYOUT.saradoTop - TAMA_HOLE_MOUTH_Y;
    const boreEnd = centre + TAMA_HOLE_MOUTH_Y + TAMA_LAYOUT.holeDepth;

    expect(boreEnd).toBeCloseTo(KENDAMA_LAYOUT.spikeTip[1], 10);
  });

  it('clears the spike in both stages of the bore', () => {
    // The whole point of the step, and the thing that breaks silently if the
    // spike's taper is ever retuned without the bore following: every bit of
    // the ken that ends up inside the narrow stage has to fit it.
    const step = KENDAMA_LAYOUT.saradoTop + SPIKE_SEAT_CLEARANCE + TAMA_BORE_STEP_DEPTH;
    const inNarrowStage = kenBodyProfile(CRADLE_RADIUS).filter(
      (point) => point.y > step && point.y <= KENDAMA_LAYOUT.spikeTip[1],
    );

    expect(inNarrowStage.length).toBeGreaterThan(5);

    for (const point of inNarrowStage) {
      expect(point.x).toBeLessThanOrEqual(TAMA_BORE_TIP_RADIUS);
    }
  });

  it('puts the step where the spike has thinned to it, not at a chosen depth', () => {
    // Read back the other way: at the step, the spike is exactly the narrow
    // bore's radius less its clearance.
    const atStep = spikeHeightAtRadius(TAMA_BORE_TIP_RADIUS - TAMA_BORE_CLEARANCE);

    expect(TAMA_BORE_STEP_DEPTH).toBeCloseTo(atStep - KENDAMA_LAYOUT.saradoTop, 10);

    // And it is a step in the middle of the hole, not one at either end.
    expect(TAMA_BORE_STEP_DEPTH).toBeGreaterThan(0);
    expect(TAMA_BORE_STEP_DEPTH).toBeLessThan(TAMA_LAYOUT.holeDepth);
  });

  it('stops short of the string hole with real wood between them', () => {
    // What limits how long the spike can get. The cavity's blind end has to
    // stay inside the ball with enough left above it to drill the string
    // channel through and seat the knot against.
    const cavityTop = TAMA_HOLE_MOUTH_Y + TAMA_LAYOUT.holeDepth;
    const wood = TAMA_LAYOUT.stringHoleLocal[1] - cavityTop;

    expect(cavityTop).toBeLessThan(TAMA_LAYOUT.radius);
    expect(wood).toBeGreaterThan(TAMA_LAYOUT.knotRadius * 2);
  });

  it('opens on the plane the bore is measured from, not the pole', () => {
    // Boring the hole cuts the ball off short of the pole. Both `Tama` and
    // the hole socket read this, so the mesh and the mate agree about where
    // the opening is — 0.016 of thin air is the difference between a ball
    // resting on the sarado and one hovering over it.
    expect(TAMA_HOLE_MOUTH_Y).toBeCloseTo(
      -Math.sqrt(TAMA_LAYOUT.radius ** 2 - TAMA_LAYOUT.holeRadius ** 2),
      10,
    );
    expect(Math.abs(TAMA_HOLE_MOUTH_Y)).toBeLessThan(TAMA_LAYOUT.radius);
  });
});
