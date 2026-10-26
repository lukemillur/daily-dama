import { Quaternion, Vector3 } from 'three';

import { SARADO, TAMA } from './anatomy';
import {
  collideWithKen,
  collideWithTama,
  createKenContact,
  SPIKE_SPHERE_COUNT,
  spikeSphere,
} from './collision';
import { createStringSim, stepStringSim, type StringSim } from './string-sim';
import { gripPose, SPIKE_UP_GRIP_QUATERNION } from './stringing';
import { rotate } from './vec';
import type { Vec3 } from './views';

const IDENTITY = [0, 0, 0, 1];
const ORIGIN = [0, 0, 0];

/** Deepest overlap between any spike sphere and the tama, ken at the origin, spike +Y. */
function spikeDepth(tamaCentre: number[], tamaQuaternion: number[]): number {
  const centre = new Float64Array(3);
  const contact = createKenContact();
  let deepest = 0;
  for (let i = 0; i < SPIKE_SPHERE_COUNT; i += 1) {
    const radius = spikeSphere(ORIGIN, IDENTITY, i, centre);
    if (collideWithTama(tamaCentre, tamaQuaternion, centre, 0, radius, contact)) {
      deepest = Math.max(deepest, contact.depth);
    }
  }
  return deepest;
}

function aboutAxis(axis: Vec3, degrees: number): number[] {
  const q = new Quaternion().setFromAxisAngle(new Vector3(...axis), (degrees * Math.PI) / 180);
  return [q.x, q.y, q.z, q.w];
}

describe('the tama as a solid with a bore', () => {
  // Ken-local: spike up +Y. Bore opening down, so the spike enters it.
  const onSpike = [0, SARADO.heightOnHandle + 45, 0];

  it('takes the spike into an aligned bore without touching it', () => {
    expect(spikeDepth(onSpike, IDENTITY)).toBe(0);
  });

  it('meets the spike as solid wood when the hole faces away', () => {
    expect(spikeDepth(onSpike, aboutAxis([1, 0, 0], 90))).toBeGreaterThan(5);
  });

  it('is not pushed off the spike by the handle', () => {
    const contact = createKenContact();
    expect(collideWithKen(ORIGIN, IDENTITY, onSpike, 0, TAMA.radius, contact, true)).toBe(false);
    // The string still sees the whole spike.
    expect(collideWithKen(ORIGIN, IDENTITY, onSpike, 0, TAMA.radius, contact)).toBe(true);
  });

  it('centres the bore on a spike pressing its wall', () => {
    // Bore axis 3mm to +X of the spike, so the spike presses the -X wall.
    const contact = createKenContact();
    const centre = new Float64Array(3);
    const radius = spikeSphere(ORIGIN, IDENTITY, SPIKE_SPHERE_COUNT - 12, centre);
    const tama = [centre[0] + 3, centre[1] + 10, centre[2]];
    expect(collideWithTama(tama, IDENTITY, centre, 0, radius + 2, contact)).toBe(true);
    // The spike presses the bore's -X wall. Out of that wood, toward the
    // spike, is +X; the ball is pushed the other way, -X, which brings its
    // bore back onto the spike.
    expect(contact.normal[0]).toBeGreaterThan(0.9);
  });
});

/** Holds the ken spike-up at the origin and lets go of the ball above it. */
function dropOntoSpike(tamaCentre: Vec3, tamaQuaternion: number[] = IDENTITY, seconds = 2): StringSim {
  const ken = gripPose([0, 0, 0], SPIKE_UP_GRIP_QUATERNION);
  const sim = createStringSim('right', ken, {
    kind: 'held',
    tamaCentre,
    tamaQuaternion: tamaQuaternion as [number, number, number, number],
  });
  for (let f = 0; f < seconds * 60; f += 1) stepStringSim(sim, ken, 1 / 60);
  return sim;
}

/** The ball's hole axis (local +Y, mouth to string hole) in world space. */
function holeAxis(sim: StringSim): number[] {
  const out = [0, 0, 0];
  rotate(sim.tamaQuaternion, 0, 1, 0, out);
  return out;
}

describe('dropping a tama onto a vertical spike', () => {
  it('slides down an aligned bore and comes to rest on the sarado', () => {
    const sim = dropOntoSpike([0, 120, 0]);
    expect(Math.hypot(sim.tamaPosition[0], sim.tamaPosition[2])).toBeLessThan(1.5);
    // Resting on the sarado's waist, centred on the spike.
    expect(sim.tamaPosition[1]).toBeGreaterThan(30);
    expect(sim.tamaPosition[1]).toBeLessThan(48);
    expect(holeAxis(sim)[1]).toBeGreaterThan(0.995);
  });

  it('is guided in by the countersink when it arrives off-centre and tipped', () => {
    const sim = dropOntoSpike([4, 120, -3], aboutAxis([0, 0, 1], 10));
    expect(Math.hypot(sim.tamaPosition[0], sim.tamaPosition[2])).toBeLessThan(1.5);
    expect(sim.tamaPosition[1]).toBeLessThan(48);
    expect(holeAxis(sim)[1]).toBeGreaterThan(0.995);
  });

  it('does not spike with the hole facing sideways', () => {
    const sim = dropOntoSpike([0, 120, 0], aboutAxis([1, 0, 0], 90));
    // It lands on the spike's tip and falls off, rather than sinking onto it.
    expect(sim.tamaPosition[1]).toBeLessThan(0);
  });
});
