import { TAMA } from './anatomy';
import { createStringSim, stepStringSim, stringPoints, type StringSim } from './string-sim';
import { gripPose, SPIKE_UP_GRIP_QUATERNION, TAMA_STRING_ATTACH } from './stringing';
import { stringCurve } from './strung-render';
import { rotate } from './vec';
import { MM } from './views';

/** A ball dropped onto the spike and left to settle: its string hangs over its top. */
function seatedOnSpike(): StringSim {
  const ken = gripPose([0, 0, 0], SPIKE_UP_GRIP_QUATERNION);
  const sim = createStringSim('right', ken, { kind: 'held', tamaCentre: [0, 120, 0], tamaQuaternion: [0, 0, 0, 1] });
  for (let f = 0; f < 120; f += 1) stepStringSim(sim, ken, 1 / 60);
  return sim;
}

/** How far inside the ball each point is, mm, ignoring points entering its string hole. */
function deepestInsideBall(sim: StringSim, points: readonly number[][]): number {
  const mouth = [0, 0, 0];
  rotate(sim.tamaQuaternion, TAMA_STRING_ATTACH[0], TAMA_STRING_ATTACH[1], TAMA_STRING_ATTACH[2], mouth);
  let deepest = 0;
  for (const [x, y, z] of points) {
    const dx = x - sim.tamaPosition[0], dy = y - sim.tamaPosition[1], dz = z - sim.tamaPosition[2];
    if (Math.hypot(dx - mouth[0], dy - mouth[1], dz - mouth[2]) < 8) continue;
    deepest = Math.max(deepest, TAMA.radius - Math.hypot(dx, dy, dz));
  }
  return deepest;
}

describe('the drawn string', () => {
  it('hangs over a spiked ball rather than through it', () => {
    const sim = seatedOnSpike();
    const drawn = stringCurve(sim, stringPoints(sim))
      .getSpacedPoints(400)
      .map((p) => [p.x / MM, p.y / MM, p.z / MM]);
    // The simulated particles near the string hole pass through the ball by design.
    expect(deepestInsideBall(sim, stringPoints(sim))).toBeGreaterThan(2);
    expect(deepestInsideBall(sim, drawn)).toBeLessThan(0.5);
  });
});
