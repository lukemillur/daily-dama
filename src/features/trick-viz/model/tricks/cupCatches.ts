import { hang, ride, startHanging, toss } from '../beats';
import type { BodyPose } from '../body';
import { viewForState } from '../framing';
import { buildTrick, type Trick } from '../timeline';

/**
 * Big Cup (ozara) and Small Cup, which are the same trick twice.
 *
 * The player holds the ken with one side cup facing up and the base cup
 * facing themselves, which puts the shaft horizontal. The tama hangs free,
 * gets pulled straight up, and is caught seated on the cup's rim.
 *
 * Big Cup was hand-derived first, and every number in it — the seat, the
 * swing side, the apex, the launch and catch times — was worked out for that
 * one cup under that one grip. Small Cup is the check that none of that had
 * to be re-derived: it differs by a grip and a socket name.
 */

/**
 * Read as two named rotations in `POSE_ROTATION_ORDER` ('YZX', so Z first):
 * roll 90° about Z to bring the big cup from +X up to +Y, then swing -90°
 * about Y to bring the base cup from +X round to +Z, facing the player.
 */
export const BIG_CUP_GRIP: BodyPose = {
  position: [0, 0, 0],
  rotation: [0, -Math.PI / 2, Math.PI / 2],
};

/** The mirror grip: the small cup lives on local -X, so both rolls reverse. */
export const SMALL_CUP_GRIP: BodyPose = {
  position: [0, 0, 0],
  rotation: [0, Math.PI / 2, -Math.PI / 2],
};

type CupCatchOptions = {
  id: string;
  name: string;
  grip: BodyPose;
  socket: 'bigCup' | 'smallCup';
  /**
   * How far the tama swings clear of the ken on the way past.
   *
   * It cannot rise into the cup from below — the sarado bar and the opposite
   * cup are directly underneath — so it passes the ken's level beside it and
   * drops in from above, which is also what the real trick looks like. Wide
   * enough to clear the cup mouth plus the tama's own radius, with margin.
   */
  clearance: number;
};

function cupCatch({ id, name, grip, socket, clearance }: CupCatchOptions): Trick {
  return buildTrick({
    id,
    name,
    start: startHanging('ken', grip),
    beats: [
      hang({ seconds: 0.22, load: 0.05 }),
      toss({
        target: { kind: 'cup', socket },
        apexRise: 0.35,
        clearance,
        gesture: { rise: 0.23 },
      }),
      ride({ seconds: 0.3, gesture: { cushion: 0.15, settle: -0.11 } }),
    ],
    viewFor: viewForState,
  });
}

export const bigCup = cupCatch({
  id: 'big-cup',
  name: 'Big cup',
  grip: BIG_CUP_GRIP,
  socket: 'bigCup',
  clearance: 0.55,
});

export const smallCup = cupCatch({
  id: 'small-cup',
  name: 'Small cup',
  grip: SMALL_CUP_GRIP,
  socket: 'smallCup',
  // The small cup is the narrower one, so there is marginally less to clear.
  clearance: 0.52,
});
