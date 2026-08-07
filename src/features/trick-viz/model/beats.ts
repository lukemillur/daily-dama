import { Quaternion, Vector3 } from 'three';

import { swingDirection, tossArc, tossPositionAt } from './ballistics';
import {
  fromQuaternion,
  localDirectionToWorld,
  localToWorld,
  poseQuaternion,
  type BodyPose,
  type Vec3,
} from './body';
import { easeInOutQuad, easeOutQuad, smoothstep } from './easing';
import { KENDAMA_LAYOUT } from './kendama-geometry';
import { seatTamaInCup, spearKenIntoTama, spearTamaOnSpike } from './mate';
import { KEN_SOCKETS, toWorldSocket, type KenSocketId } from './sockets';
import { TAMA_LAYOUT } from './tama-geometry';
import {
  bakeSpan,
  freeRole,
  poseAt,
  type Beat,
  type Contact,
  type Role,
  type TrickState,
} from './timeline';

/**
 * The player's hand, as a vertical offset applied to whichever body is held.
 *
 * The ken is not a prop the tama flies at — the player loads, lifts into the
 * catch, and gives with it. Naming those three moments once means every
 * trick gets the same hand rather than each one re-authoring a set of
 * keyframes, and it keeps the gesture layered *over* the toss instead of
 * chopping the toss into pieces around it.
 */
export type Gesture = {
  /** Dip before the pull. */
  load?: number;
  /** How far the hand lifts to meet the catch. */
  rise?: number;
  /** How far it gives on contact, absorbing the tama instead of bouncing it. */
  cushion?: number;
  /** Where it comes to rest, relative to the catch height. */
  settle?: number;
};

function offsetPose(pose: BodyPose, dy: number): BodyPose {
  return {
    position: [pose.position[0], pose.position[1] + dy, pose.position[2]],
    rotation: pose.rotation,
  };
}

function withRoles(state: TrickState, held: BodyPose, free: BodyPose, contact: Contact): TrickState {
  return state.held === 'ken'
    ? { held: 'ken', ken: held, tama: free, contact }
    : { held: 'tama', ken: free, tama: held, contact };
}

/**
 * Where the string leaves the held body, and where it attaches on the free
 * one.
 *
 * The string always runs between the ken's drilled hole and the tama, so
 * which end is the anchor flips with who is holding what — that asymmetry is
 * the whole reason tama-held tricks were previously inexpressible.
 */
function stringEnds(state: TrickState): { anchorWorld: Vec3; freeAttachLocal: Vec3 } {
  return state.held === 'ken'
    ? {
        anchorWorld: localToWorld(KENDAMA_LAYOUT.stringHoleLocal, state.ken),
        freeAttachLocal: [0, 0, 0],
      }
    : {
        anchorWorld: state.tama.position,
        freeAttachLocal: KENDAMA_LAYOUT.stringHoleLocal,
      };
}

/** Poses the free body hanging plumb below the anchor at full string length. */
function hangingPose(state: TrickState, heldPose: BodyPose, freeRotation: Vec3): BodyPose {
  const { anchorWorld, freeAttachLocal } = stringEnds(
    withRoles(state, heldPose, poseAt(state, freeRole(state)), state.contact),
  );

  const target: Vec3 = [
    anchorWorld[0],
    anchorWorld[1] - KENDAMA_LAYOUT.stringRestLength,
    anchorWorld[2],
  ];

  const offset = new Vector3(...freeAttachLocal).applyQuaternion(
    poseQuaternion({ position: [0, 0, 0], rotation: freeRotation }),
  );

  return {
    position: [target[0] - offset.x, target[1] - offset.y, target[2] - offset.z],
    rotation: freeRotation,
  };
}

export type HangOptions = {
  seconds: number;
  /** Depth of the dip that precedes the pull. */
  load?: number;
  /** How the free body hangs. A ken dangles spike-up from its string hole. */
  freeRotation?: Vec3;
};

/**
 * The free body hanging on the string while the player loads.
 *
 * It tracks the anchor *as the anchor moves*, so the load shows up in the
 * hanging body automatically instead of being faked with a separate nudge
 * that the hand knows nothing about.
 */
export function hang({ seconds, load = 0, freeRotation = [0, 0, 0] }: HangOptions): Beat {
  return (state) => {
    const heldStart = poseAt(state, state.held);

    const at = (t: number) => {
      const held = offsetPose(heldStart, -load * easeInOutQuad(t / seconds));
      const free = hangingPose(state, held, freeRotation);
      return posesFor(state.held, held, free);
    };

    const endHeld = offsetPose(heldStart, -load);
    const out = withRoles(state, endHeld, hangingPose(state, endHeld, freeRotation), {
      kind: 'hanging',
    });

    return { samples: bakeSpan(seconds, at), durationSeconds: seconds, out };
  };
}

function posesFor(held: Role, heldPose: BodyPose, freePose: BodyPose) {
  return held === 'ken'
    ? { ken: heldPose, tama: freePose }
    : { ken: freePose, tama: heldPose };
}

/** What the free body is aimed at. */
export type TossTarget =
  | { kind: 'cup'; socket: Extract<KenSocketId, 'bigCup' | 'smallCup' | 'baseCup'> }
  | { kind: 'spike'; spin?: number };

export type TossOptions = {
  target: TossTarget;
  /** How far above the catch the free body peaks. */
  apexRise: number;
  /**
   * How far it swings clear of the held body on the way past.
   *
   * With the ken held horizontal, everything directly under the big cup is
   * occupied — the serato bar, then the small cup facing straight down — so
   * the tama cannot rise into the cup from below. It has to pass the ken's
   * level *beside* it and drop in from above, which is what the real trick
   * looks like. Zero for a straight vertical toss onto the spike.
   */
  clearance?: number;
  gesture?: Gesture;
  /** Extra whole turns the free body makes in flight, about the catch axis. */
  turns?: number;
};

function mateFor(state: TrickState, heldPose: BodyPose, target: TossTarget): BodyPose {
  const free = freeRole(state);
  const carried = poseAt(state, free).rotation;

  if (free === 'ken') {
    // Player holds the ball and swings the ken up into it — airplane and
    // friends. Only the spike rendezvous makes sense in that direction: a
    // held tama has no cup to catch anything in.
    if (target.kind !== 'spike') {
      throw new Error(
        `[trick-viz] cannot catch a thrown ken in ${target.socket}: the player is holding ` +
          `the tama, so the cups are on the moving body. Swap which body is held first.`,
      );
    }
    return spearKenIntoTama(heldPose, target.spin ?? 0);
  }

  const socket = toWorldSocket(
    target.kind === 'cup' ? KEN_SOCKETS[target.socket] : KEN_SOCKETS.spike,
    heldPose,
  );

  return target.kind === 'cup'
    ? seatTamaInCup(socket, carried)
    : spearTamaOnSpike(socket, target.spin ?? 0);
}

function contactFor(target: TossTarget): Contact {
  return target.kind === 'cup' ? { kind: 'seated', socket: target.socket } : { kind: 'spiked' };
}

/**
 * The pull, the flight, and the catch, as one beat.
 *
 * Deliberately not three. The hand's lift and the free body's arc overlap in
 * time, and splitting them into separate beats would put a boundary in the
 * middle of a single ballistic curve — which is where stalls come from. The
 * hand is a modifier layered over the flight, not a phase beside it.
 */
export function toss({
  target,
  apexRise,
  clearance = 0,
  gesture = {},
  turns = 0,
}: TossOptions): Beat {
  return (state) => {
    const free = freeRole(state);
    const heldStart = poseAt(state, state.held);
    const rise = gesture.rise ?? 0;

    // The hand's finishing height is known without knowing how long the
    // flight takes, so the catch can be solved first and the flight's
    // duration derived from it — no circularity.
    const heldEnd = offsetPose(heldStart, rise);
    const landing = mateFor(state, heldEnd, target);

    const launchPose = poseAt(state, free);

    // Which side to swing clear on is a fact about the *ken* — which face of
    // the shaft the string exits, and which way the shaft is pointing —
    // regardless of whether the ken is the thing being held or the thing
    // being thrown.
    const kenAxisWorld = localDirectionToWorld([0, 1, 0], state.ken);
    const stringHoleOffset = subtract(
      localToWorld(KENDAMA_LAYOUT.stringHoleLocal, state.ken),
      state.ken.position,
    );

    const arc = tossArc({
      launch: launchPose.position,
      land: landing.position,
      apexRise,
      swing:
        clearance === 0
          ? [0, 0, 0]
          : scaled(swingDirection(stringHoleOffset, kenAxisWorld), clearance),
    });

    const startQuaternion = poseQuaternion(launchPose);
    const endQuaternion = poseQuaternion(landing);
    const spinAxis = new Vector3(
      ...(free === 'ken'
        ? localDirectionToWorld(TAMA_LAYOUT.holeAxisLocal, state.tama)
        : [0, 1, 0]),
    ).normalize();

    const at = (t: number) => {
      const u = arc.duration === 0 ? 1 : t / arc.duration;

      // The hand lifts to meet the catch and then holds, arriving as the
      // free body peaks rather than racing it there. `rise` is measured from
      // wherever the hand already is, so a preceding load doesn't have to be
      // added back in by the author.
      const held = offsetPose(
        heldStart,
        rise * easeOutQuad(Math.min(u / Math.max(arc.apexU, 1e-6), 1)),
      );

      const quaternion = startQuaternion.clone().slerp(endQuaternion, smoothstep(u));
      if (turns !== 0) {
        quaternion.premultiply(
          new Quaternion().setFromAxisAngle(spinAxis, turns * 2 * Math.PI * smoothstep(u)),
        );
      }

      const freePose = fromQuaternion(quaternion, tossPositionAt(arc, u));
      return posesFor(state.held, held, freePose);
    };

    return {
      samples: bakeSpan(arc.duration, at),
      durationSeconds: arc.duration,
      out: withRoles(state, heldEnd, landing, contactFor(target)),
    };
  };
}

export type RideOptions = {
  seconds: number;
  gesture?: Gesture;
};

/** Where in the ride the hand is at the bottom of its give. */
const CUSHION_PEAK = 0.2;
const PULSE_TAIL = (1 / CUSHION_PEAK) * Math.exp(1 - 1 / CUSHION_PEAK);

/**
 * The free body stays mated to its contact while the hand keeps moving.
 *
 * Re-solving the mate every frame — rather than freezing the catch position
 * — is what keeps the tama glued into the cup through the cushion instead of
 * drifting out of it as the hand gives.
 */
export function ride({ seconds, gesture = {} }: RideOptions): Beat {
  return (state) => {
    const heldStart = poseAt(state, state.held);
    const cushion = gesture.cushion ?? 0;
    const settle = gesture.settle ?? 0;

    const target: TossTarget =
      state.contact.kind === 'seated'
        ? { kind: 'cup', socket: state.contact.socket as 'bigCup' | 'smallCup' | 'baseCup' }
        : { kind: 'spike' };

    // The give, as one impulse response rather than a dip followed by a
    // recovery. Two eased halves would bring the hand to a dead stop at the
    // bottom and start it again, which is the same stall that made the
    // original flight read as two steps — just smaller and easier to miss.
    const dip = (u: number) => {
      const pulse = (u / CUSHION_PEAK) * Math.exp(1 - u / CUSHION_PEAK);
      // Subtracting the pulse's own tail makes the beat finish exactly on
      // `settle` instead of wherever the decay happens to have got to.
      return -cushion * (pulse - PULSE_TAIL * smoothstep(u)) + settle * smoothstep(u);
    };

    const at = (t: number) => {
      const held = offsetPose(heldStart, dip(seconds === 0 ? 1 : t / seconds));
      return posesFor(state.held, held, mateFor(state, held, target));
    };

    const endHeld = offsetPose(heldStart, settle);

    return {
      samples: bakeSpan(seconds, at),
      durationSeconds: seconds,
      out: withRoles(state, endHeld, mateFor(state, endHeld, target), state.contact),
    };
  };
}

function subtract(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scaled(a: Vec3, k: number): Vec3 {
  return [a[0] * k, a[1] * k, a[2] * k];
}

/**
 * The state a trick opens in: the given grip, the other body hanging free.
 *
 * Sequence elements after the first are built from the previous element's
 * end state instead, which is what makes a compound trick one continuous run.
 */
export function startHanging(held: Role, grip: BodyPose, freeRotation: Vec3 = [0, 0, 0]): TrickState {
  const seed: TrickState = {
    held,
    ken: held === 'ken' ? grip : { position: [0, 0, 0], rotation: freeRotation },
    tama: held === 'tama' ? grip : { position: [0, 0, 0], rotation: freeRotation },
    contact: { kind: 'hanging' },
  };

  const free = hangingPose(seed, grip, freeRotation);
  return withRoles(seed, grip, free, { kind: 'hanging' });
}
