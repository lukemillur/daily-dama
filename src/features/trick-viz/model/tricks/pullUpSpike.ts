import { hang, ride, startHanging, toss } from '../beats';
import type { BodyPose } from '../body';
import { viewForState } from '../framing';
import { buildTrick, type Trick } from '../timeline';

/**
 * Pull up spike (kenzai / tomeken), spin and no-spin.
 *
 * The ken is held upright in its neutral pose — spike up, base cup down —
 * and the tama is pulled straight up and dropped onto the spike.
 *
 * This is the first trick whose catch is a *hole*, not a rim, and that makes
 * it the one that proves the mate solver earns its keep: a cup catch leaves
 * the tama's orientation free, so the ball could be a plain sphere, but a
 * spike catch fixes it completely. The graded variant is whether the tama
 * turns on the way up, which is a spin parameter on one beat rather than a
 * second trick.
 */
export const UPRIGHT_GRIP: BodyPose = {
  position: [0, 0, 0],
  rotation: [0, 0, 0],
};

function pullUpSpike(id: string, name: string, turns: number): Trick {
  return buildTrick({
    id,
    name,
    start: startHanging('ken', UPRIGHT_GRIP),
    beats: [
      hang({ seconds: 0.22, load: 0.06 }),
      toss({
        target: { kind: 'spike' },
        apexRise: 0.4,
        // Barely any: with the ken upright there is nothing above the spike
        // to clear, so the tama goes almost straight up and straight back
        // down. The small offset keeps it off the string on the way.
        clearance: 0.12,
        gesture: { rise: 0.16 },
        turns,
      }),
      ride({ seconds: 0.32, gesture: { cushion: 0.12, settle: -0.09 } }),
    ],
    viewFor: viewForState,
  });
}

export const pullUpSpikeNoSpin = pullUpSpike(
  'pull-up-spike-spin-or-no-spin',
  'Pull up spike (No spin)',
  0,
);

export const pullUpSpikeWithSpin = pullUpSpike(
  'pull-up-spike-with-spin',
  'Pull up spike (Spin)',
  1,
);
