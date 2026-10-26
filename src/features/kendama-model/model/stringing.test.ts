import { SARADO } from './anatomy';
import { BIG_CUP_GRIP_QUATERNION, bigCupGripPose, stringExitLocal } from './stringing';
import { rotate } from './vec';

/** World: the player stands on +Z facing -Z, +X is their right, +Y is up. */
function gripDirection(local: [number, number, number]) {
  const out = [0, 0, 0];
  rotate(BIG_CUP_GRIP_QUATERNION, local[0], local[1], local[2], out);
  return out.map((v) => Math.round(v * 1e6) / 1e6 + 0);
}

describe('the big-cup grip', () => {
  it('points the big cup up', () => {
    expect(gripDirection([1, 0, 0])).toEqual([0, 1, 0]);
  });

  it('points the spike away from the player', () => {
    expect(gripDirection([0, 1, 0])).toEqual([0, 0, -1]);
  });

  it('turns local +Z to the player’s left', () => {
    expect(gripDirection([0, 0, 1])).toEqual([-1, 0, 0]);
  });

  it('centres the sarado on the hand', () => {
    const pose = bigCupGripPose([10, 20, 30]);
    const sarado = [0, 0, 0];
    rotate(pose.quaternion, 0, SARADO.heightOnHandle, 0, sarado);
    expect(sarado[0] + pose.position[0]).toBeCloseTo(10);
    expect(sarado[1] + pose.position[1]).toBeCloseTo(20);
    expect(sarado[2] + pose.position[2]).toBeCloseTo(30);
  });
});

describe('stringing handedness', () => {
  it('exits the string on the inside of a right-handed player: their left', () => {
    const exit = gripDirection([...stringExitLocal('right')] as [number, number, number]);
    expect(exit[0]).toBeLessThan(0);
  });

  it('exits on the other side for a left-handed stringing', () => {
    const exit = gripDirection([...stringExitLocal('left')] as [number, number, number]);
    expect(exit[0]).toBeGreaterThan(0);
  });
});
