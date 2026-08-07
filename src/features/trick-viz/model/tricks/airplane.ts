import { hang, ride, startHanging, toss } from '../beats';
import type { BodyPose } from '../body';
import { viewForState } from '../framing';
import { buildTrick } from '../timeline';

/**
 * Airplane (hikouki).
 *
 * The role reversal: the player holds the **tama**, hole facing down, and
 * the ken dangles below on the string. The ken is swung up and out, and its
 * spike is landed in the hole.
 *
 * Nothing about the flight is new — it is the same ballistic arc onto the
 * same spike/hole rendezvous as `pullUpSpike`. What is new is which body
 * moves. The first implementation modelled the ken as a fixed grip and the
 * tama as a position track with no orientation, which made this trick
 * literally inexpressible; both bodies now carry the same pose type, and the
 * mate solver answers "where does the spike meet the hole" without caring
 * which side of it is holding still.
 */

/**
 * The tama held with its hole pointing at the floor: a half turn about X
 * takes the hole's local +Y round to world -Y. Held a little above the
 * origin so the ken has somewhere to hang.
 */
export const AIRPLANE_TAMA_GRIP: BodyPose = {
  position: [0, 0, 0],
  rotation: [Math.PI, 0, 0],
};

export const airplane = buildTrick({
  id: 'airplane',
  name: 'Airplane',
  // A ken hanging from its string hole sits spike-up: the hole is just below
  // the serato, and almost all the weight — shaft, base cup — is below that.
  start: startHanging('tama', AIRPLANE_TAMA_GRIP, [0, 0, 0]),
  beats: [
    hang({ seconds: 0.25, load: 0.04 }),
    toss({
      target: { kind: 'spike' },
      apexRise: 0.3,
      // The ken swings out and up rather than rising straight into the ball,
      // which is both how the trick is actually thrown and what keeps the
      // string clear of the tama on the way.
      clearance: 0.8,
      gesture: { rise: 0.14 },
    }),
    ride({ seconds: 0.34, gesture: { cushion: 0.1, settle: -0.07 } }),
  ],
  viewFor: viewForState,
});
