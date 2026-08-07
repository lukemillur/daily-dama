import { localDirectionToWorld, localToWorld, type KenPose } from "../ken-pose";
import { KENDAMA_LAYOUT, seatOffset } from "../kendama-geometry";
import {
  bakeKeyframes,
  easeOutCubic,
  easeOutQuad,
  linear,
  sampleAtTime,
  type Keyframe,
  type Vec3,
} from "../keyframes";

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

const stringHoleWorld = localToWorld(
  KENDAMA_LAYOUT.stringHoleLocal,
  BIG_CUP_KEN_POSE,
);

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
const rimOffset = seatOffset(
  KENDAMA_LAYOUT.tamaRadius,
  KENDAMA_LAYOUT.bigCup.mouthRadius,
);

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

/**
 * Where the tama hangs at time `t`: straight below the string hole, which
 * itself rides with the ken. Deriving it this way means the player's initial
 * load shows up in the tama automatically, instead of being faked with a
 * separate downward nudge that the ken knows nothing about.
 */
function hangAt(t: number): Vec3 {
  const ken = sampleAtTime(BIG_CUP_KEN_KEYFRAMES, t).position;
  return [
    stringHoleWorld[0] + ken[0],
    stringHoleWorld[1] + ken[1] - KENDAMA_LAYOUT.stringRestLength,
    stringHoleWorld[2] + ken[2],
  ];
}

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
 * Which side of the ken the tama swings up on: the same side the string
 * exits.
 *
 * The string leaves the hole on one face of the shaft, so a tama that rises
 * on the far side drags the string around the outside of the ken — it ends
 * up wrapped over the sarado rather than hanging clear. Players keep the
 * string on the inside, and taking the sign from the hole's own position
 * means this stays true if the hole ever moves.
 */
const SWING_SIDE = Math.sign(stringHoleWorld[0]) || -1;

/** The pull begins here; before it the tama just hangs and loads. */
const LAUNCH_T = 0.1;
/** The tama meets the cup here. */
const CATCH_T = 0.88;
/** How far above the seat the tama peaks before dropping in. */
const APEX_RISE = 0.35;

const launchPoint = hangAt(LAUNCH_T);
const catchPoint = seatAt(CATCH_T);
const apexY = catchPoint[1] + APEX_RISE;

/**
 * Where the apex falls within the flight.
 *
 * Under constant gravity the time to cover a height is proportional to its
 * square root, so the long climb from the hang takes far longer than the
 * short drop into the cup and the peak sits late. Deriving the split keeps
 * the rise and fall consistent with one another instead of asking a keyframe
 * to guess a value that looks right.
 */
const apexU =
  Math.sqrt(apexY - launchPoint[1]) /
  (Math.sqrt(apexY - launchPoint[1]) + Math.sqrt(apexY - catchPoint[1]));

/** Parabola steepness, fixed by requiring the curve to pass through launch. */
const fall = (apexY - launchPoint[1]) / apexU ** 2;

function smoothstep(u: number): number {
  return u * u * (3 - 2 * u);
}

/**
 * The flight, as one continuous curve rather than a chain of poses.
 *
 * Vertical is a single parabola from launch to catch — the whole toss is one
 * ballistic arc, so the only place the tama stops climbing is the apex, where
 * stopping is correct. Lateral is an independent smooth swing out and back,
 * peaking mid-flight so the tama is at its widest exactly when it passes the
 * ken. Driving the two axes separately is what makes the movement read as one
 * gesture: neither has to pause for the other to catch up.
 */
function flightAt(u: number): Vec3 {
  const swing = SWING_SIDE * SWING_CLEARANCE * Math.sin(Math.PI * u);
  const blend = smoothstep(u);

  return [
    launchPoint[0] + (catchPoint[0] - launchPoint[0]) * blend + swing,
    apexY - fall * (u - apexU) ** 2,
    launchPoint[2] + (catchPoint[2] - launchPoint[2]) * blend,
  ];
}

/**
 * Samples across the flight. Dense enough that the linear interpolation
 * between them is indistinguishable from the curve itself.
 */
const FLIGHT_SAMPLES = 40;

/**
 * Time is normalized 0-1; TrickScene controls actual playback duration.
 */
export const BIG_CUP_KEYFRAMES: readonly Keyframe[] = [
  // Hanging free on a taut string, following the ken as it loads.
  ...bakeKeyframes(0, LAUNCH_T, 6, hangAt),
  // One continuous flight: pulled up, swung wide past the ken, into the cup.
  ...bakeKeyframes(LAUNCH_T, CATCH_T, FLIGHT_SAMPLES, (t) =>
    flightAt((t - LAUNCH_T) / (CATCH_T - LAUNCH_T)),
  ),
  // Seated, riding the ken's cushion down and settling.
  ...bakeKeyframes(CATCH_T, 1, 8, seatAt),
];
