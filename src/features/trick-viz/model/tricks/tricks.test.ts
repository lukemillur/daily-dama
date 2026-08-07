import { describe, expect, it } from '@jest/globals';
import { Quaternion, Vector3 } from 'three';

import type { Vec3 } from '@/features/trick-viz/model/body';
import { KENDAMA_LAYOUT, seatOffset } from '@/features/trick-viz/model/kendama-geometry';
import { findStallAt, type Sample, type Trick } from '@/features/trick-viz/model/timeline';
import { TAMA_LAYOUT } from '@/features/trick-viz/model/tama-geometry';
import {
  airplane,
  bigCup,
  pullUpSpikeNoSpin,
  pullUpSpikeWithSpin,
  smallCup,
  TRICK_VISUALIZATIONS,
} from '@/features/trick-viz/model/tricks';

function last(trick: Trick): Sample {
  return trick.samples[trick.samples.length - 1];
}

function direction(sample: Sample, body: 'ken' | 'tama', local: Vec3): Vector3 {
  const q = sample[body].quaternion;
  return new Vector3(...local).applyQuaternion(new Quaternion(q[0], q[1], q[2], q[3]));
}

function position(sample: Sample, body: 'ken' | 'tama'): Vector3 {
  return new Vector3(...sample[body].position);
}

/**
 * The property the whole beat library exists to guarantee. A stall reads as
 * the action taking a step rather than making one movement, and it is
 * invisible in any single beat — which is why it is asserted over the whole
 * track rather than left to review.
 */
function findAnyStall(trick: Trick): number | null {
  for (const join of trick.joins) {
    const stall = findStallAt(trick.samples, join);
    if (stall !== null) return stall;
  }
  return null;
}

describe.each(TRICK_VISUALIZATIONS.map((trick) => [trick.name, trick] as const))(
  '%s',
  (_name, trick) => {
    it('never comes to a stop mid-trick', () => {
      expect(findAnyStall(trick)).toBeNull();
    });

    it('runs for a watchable length', () => {
      expect(trick.durationSeconds).toBeGreaterThan(1);
      expect(trick.durationSeconds).toBeLessThan(4);
    });

    it('has a strictly increasing clock', () => {
      for (let i = 1; i < trick.samples.length; i += 1) {
        expect(trick.samples[i].t).toBeGreaterThan(trick.samples[i - 1].t);
      }
    });

    it('starts with the tama hanging a full string below the ken’s hole', () => {
      const first = trick.samples[0];
      const hole = new Vector3(...KENDAMA_LAYOUT.stringHoleLocal)
        .applyQuaternion(
          new Quaternion(
            first.ken.quaternion[0],
            first.ken.quaternion[1],
            first.ken.quaternion[2],
            first.ken.quaternion[3],
          ),
        )
        .add(position(first, 'ken'));

      expect(hole.distanceTo(position(first, 'tama'))).toBeCloseTo(
        KENDAMA_LAYOUT.stringRestLength,
        4,
      );
    });
  },
);

describe('Big Cup', () => {
  it('catches the tama seated on the big cup rim', () => {
    const end = last(bigCup);
    const mouth = new Vector3(0.4, 0.1, 0)
      .applyQuaternion(
        new Quaternion(
          end.ken.quaternion[0],
          end.ken.quaternion[1],
          end.ken.quaternion[2],
          end.ken.quaternion[3],
        ),
      )
      .add(position(end, 'ken'));

    // On the rim, not in the cup: the tama is wider than the mouth, so the
    // gap between mouth plane and centre is fixed by the two radii.
    expect(mouth.distanceTo(position(end, 'tama'))).toBeCloseTo(
      seatOffset(TAMA_LAYOUT.radius, KENDAMA_LAYOUT.bigCup.mouthRadius),
      4,
    );
  });

  it('passes the ken beside it rather than rising into the cup from below', () => {
    // Everything directly under the big cup is occupied — serato bar, then
    // the small cup facing down — so the tama has to clear the ken's width
    // at the moment it crosses the cup's height.
    const seatHeight = last(bigCup).tama.position[1];
    const crossing = bigCup.samples.find(
      (sample) => sample.t > 0.3 && sample.tama.position[1] > seatHeight - 0.4,
    );

    expect(crossing).toBeDefined();
    const lateral = Math.hypot(
      crossing!.tama.position[0] - crossing!.ken.position[0],
      crossing!.tama.position[2] - crossing!.ken.position[2],
    );
    expect(lateral).toBeGreaterThan(TAMA_LAYOUT.radius + KENDAMA_LAYOUT.bigCup.mouthRadius);
  });

  it('keeps the tama glued to the cup through the cushion', () => {
    const caught = bigCup.samples.filter((sample) => sample.t > bigCup.durationSeconds - 0.25);
    const gaps = caught.map((sample) => position(sample, 'tama').distanceTo(position(sample, 'ken')));

    // The hand keeps moving after the catch; if the seat were frozen at the
    // catch position instead of re-solved, this spread would open up.
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThan(1e-6);
  });

  it('holds the tuned overall length', () => {
    expect(bigCup.durationSeconds).toBeCloseTo(2.2, 0);
  });
});

describe('Small Cup', () => {
  it('is Big Cup’s trick with the grip mirrored, not a second flight path', () => {
    // The mirrored grip brings the *other* cup to the same place, so both
    // tricks present the same shot — which is what they look like in life.
    // The tell that they are genuinely different catches is the seat height:
    // the narrower cup holds the tama further out on its rim.
    expect(last(smallCup).tama.position[1]).toBeGreaterThan(
      last(bigCup).tama.position[1],
    );
    expect(smallCup.durationSeconds).toBeCloseTo(bigCup.durationSeconds, 1);
  });

  it('seats on the small cup’s narrower rim', () => {
    const end = last(smallCup);
    const mouth = new Vector3(-0.4, 0.1, 0)
      .applyQuaternion(
        new Quaternion(
          end.ken.quaternion[0],
          end.ken.quaternion[1],
          end.ken.quaternion[2],
          end.ken.quaternion[3],
        ),
      )
      .add(position(end, 'ken'));

    expect(mouth.distanceTo(position(end, 'tama'))).toBeCloseTo(
      seatOffset(TAMA_LAYOUT.radius, KENDAMA_LAYOUT.smallCup.mouthRadius),
      4,
    );
  });
});

describe('Pull up spike', () => {
  it('lands the tama with its hole facing back down the spike', () => {
    const holeAxis = direction(last(pullUpSpikeNoSpin), 'tama', TAMA_LAYOUT.holeAxisLocal);

    expect(holeAxis.y).toBeCloseTo(-1, 4);
  });

  it('puts the spike tip inside the ball, not under it', () => {
    const end = last(pullUpSpikeNoSpin);
    const tip = new Vector3(...KENDAMA_LAYOUT.spikeTip).add(position(end, 'ken'));

    expect(position(end, 'tama').distanceTo(tip)).toBeCloseTo(
      TAMA_LAYOUT.radius - TAMA_LAYOUT.holeDepth,
      4,
    );
  });

  it('turns the tama on the spin variant and not on the other', () => {
    const spinSweep = (trick: Trick) => {
      let total = 0;
      for (let i = 1; i < trick.samples.length; i += 1) {
        const before = direction(trick.samples[i - 1], 'tama', [0, 0, 1]);
        const after = direction(trick.samples[i], 'tama', [0, 0, 1]);
        total += before.angleTo(after);
      }
      return total;
    };

    expect(spinSweep(pullUpSpikeWithSpin)).toBeCloseTo(2 * Math.PI, 4);
    expect(spinSweep(pullUpSpikeNoSpin)).toBeLessThan(Math.PI / 2);
  });
});

describe('Airplane', () => {
  it('moves the ken and holds the tama — the role reversal', () => {
    const kenTravel = position(last(airplane), 'ken').distanceTo(
      position(airplane.samples[0], 'ken'),
    );
    const tamaTravel = position(last(airplane), 'tama').distanceTo(
      position(airplane.samples[0], 'tama'),
    );

    expect(kenTravel).toBeGreaterThan(1.5);
    expect(tamaTravel).toBeLessThan(0.3);
  });

  it('lands the spike in the held tama’s hole', () => {
    const end = last(airplane);
    const tip = new Vector3(...KENDAMA_LAYOUT.spikeTip)
      .applyQuaternion(
        new Quaternion(
          end.ken.quaternion[0],
          end.ken.quaternion[1],
          end.ken.quaternion[2],
          end.ken.quaternion[3],
        ),
      )
      .add(position(end, 'ken'));

    expect(position(end, 'tama').distanceTo(tip)).toBeCloseTo(
      TAMA_LAYOUT.radius - TAMA_LAYOUT.holeDepth,
      4,
    );
  });

  it('brings the ken up spike-first into a hole that faces the floor', () => {
    const end = last(airplane);

    expect(direction(end, 'tama', TAMA_LAYOUT.holeAxisLocal).y).toBeCloseTo(-1, 4);
    expect(direction(end, 'ken', [0, 1, 0]).y).toBeCloseTo(1, 4);
    expect(position(end, 'ken').y).toBeLessThan(position(end, 'tama').y);
  });
});
