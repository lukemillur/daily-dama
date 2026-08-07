import {
  easeInQuad,
  easeOutCubic,
  easeOutQuad,
  linear,
  sampleAtTime,
  type Keyframe,
  type Vec3,
} from '../keyframes';
import { KENDAMA_LAYOUT, seatOffset } from '../kendama-geometry';
import { localDirectionToWorld, localToWorld, type KenPose } from '../ken-pose';

/**
 * Big Cup (ozara).
 *
 * The player holds the ken with the **big cup facing up** and the **base
 * cup facing themselves**, which puts the shaft horizontal: spike pointing
 * away, small cup facing down. The tama hangs free on the string, gets
 * pulled straight up, and is caught seated on the rim of the big cup.
 *
 * Read as two named rotations in `KEN_ROTATION_ORDER` ('YZX', so Z first):
 * roll 90° about Z to bring the big cup from +X up to +Y, then swing -90°
 * about Y to bring the base cup from +X round to +Z, facing the player.
 */
export const BIG_CUP_KEN_POSE: KenPose = {
  position: [0, 0, 0],
  rotation: [0, -Math.PI / 2, Math.PI / 2],
};

/**
 * The ken is not a prop the tama flies at — the player lifts it into the
 * catch and gives with it. It loads slightly, rises to meet the falling
 * tama, then cushions downward on contact.
 */
export const BIG_CUP_KEN_KEYFRAMES: readonly Keyframe[] = [
  { t: 0, position: [0, 0, 0] },
  // Load: the small dip that precedes the pull.
  { t: 0.15, position: [0, -0.05, 0] },
  // Rise to meet the tama.
  { t: 0.72, position: [0, 0.18, 0], easing: easeOutQuad },
  // Hold steady through the catch itself.
  { t: 0.88, position: [0, 0.18, 0], easing: linear },
  // Cushion: absorb the tama instead of letting it bounce.
  { t: 0.95, position: [0, 0.03, 0], easing: easeOutCubic },
  { t: 1, position: [0, 0.07, 0], easing: easeOutCubic },
];

const stringHoleWorld = localToWorld(KENDAMA_LAYOUT.stringHoleLocal, BIG_CUP_KEN_POSE);

/**
 * Where the tama comes to rest: on the big cup's rim, derived from the cup
 * geometry rather than hand-placed, so it stays correct if the cup or tama
 * dimensions are retuned.
 */
const bigCupMouthLocal: Vec3 = [
  KENDAMA_LAYOUT.bigCup.center[0] + KENDAMA_LAYOUT.bigCup.height / 2,
  KENDAMA_LAYOUT.bigCup.center[1],
  KENDAMA_LAYOUT.bigCup.center[2],
];

const cupAxisWorld = localDirectionToWorld([1, 0, 0], BIG_CUP_KEN_POSE);
const mouthWorld = localToWorld(bigCupMouthLocal, BIG_CUP_KEN_POSE);
const rimOffset = seatOffset(KENDAMA_LAYOUT.tamaRadius, KENDAMA_LAYOUT.bigCup.mouthRadius);

const seatWorld: Vec3 = [
  mouthWorld[0] + cupAxisWorld[0] * rimOffset,
  mouthWorld[1] + cupAxisWorld[1] * rimOffset,
  mouthWorld[2] + cupAxisWorld[2] * rimOffset,
];

/**
 * The seat travels with the ken, so once the tama is caught its position
 * is the rim plus wherever the ken has moved to. Sampling the same
 * keyframes the renderer samples keeps the tama glued to the cup through
 * the cushion instead of drifting out of it.
 */
function seatAt(t: number): Vec3 {
  const ken = sampleAtTime(BIG_CUP_KEN_KEYFRAMES, t).position;
  return [seatWorld[0] + ken[0], seatWorld[1] + ken[1], seatWorld[2] + ken[2]];
}

const hangWorld: Vec3 = [
  stringHoleWorld[0],
  stringHoleWorld[1] - KENDAMA_LAYOUT.stringRestLength,
  stringHoleWorld[2],
];

/**
 * How far the tama swings clear of the ken's vertical plane on the way up.
 *
 * With the ken held horizontal, everything directly under the big cup is
 * occupied — the serato bar, then the small cup facing straight down — so
 * the tama cannot rise into the cup from below. It has to pass the ken's
 * level *beside* it and drop in from above, which is what the real trick
 * looks like. This clears the widest obstacle at that height (the cup
 * mouth, radius 0.225) plus the tama's own radius, with margin.
 */
const SWING_CLEARANCE = 0.55;

/**
 * Time is normalized 0-1; TrickScene controls actual playback duration.
 */
export const BIG_CUP_KEYFRAMES: readonly Keyframe[] = [
  // Hanging free, string taut, straight below the hole.
  { t: 0, position: hangWorld },
  // Anticipation: the tama dips as the player loads the pull.
  { t: 0.12, position: [hangWorld[0], hangWorld[1] - 0.06, hangWorld[2]] },
  // Pulled up and swung wide, passing the ken's level off to one side.
  { t: 0.4, position: [SWING_CLEARANCE, -0.35, -0.05], easing: easeOutQuad },
  // Apex, above the cup and still decelerating against gravity.
  { t: 0.62, position: [0.35, 0.95, -0.1], easing: easeOutQuad },
  // Falling into the cup from above.
  { t: 0.88, position: seatAt(0.88), easing: easeInQuad },
  // Riding the ken's cushion down.
  { t: 0.95, position: seatAt(0.95), easing: easeOutCubic },
  // Held, so the catch gets a beat before the animation ends.
  { t: 1, position: seatAt(1), easing: easeOutCubic },
];
