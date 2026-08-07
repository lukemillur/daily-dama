import { Quaternion, Vector3 } from 'three';

import { toRigid, type BodyPose, type RigidPose, type Vec3 } from './body';
import type { KenSocketId } from './sockets';

/**
 * Which body the player is holding.
 *
 * The organizing idea of the whole trick model: at any moment one body is
 * *held* — its motion is authored, it is the player's hand — and the other
 * is *free*, flying ballistically or riding a contact. Big Cup holds the
 * ken; airplane and trapeze hold the tama and throw the ken. Without this
 * inversion, half the Kentei list is inexpressible.
 */
export type Role = 'ken' | 'tama';

/** Where the free body is relative to the held one. */
export type Contact =
  | { kind: 'hanging' }
  | { kind: 'seated'; socket: KenSocketId }
  | { kind: 'spiked' }
  | { kind: 'stalled'; socket: KenSocketId };

/**
 * The complete state of the two-body system at an instant.
 *
 * This is what makes tricks composable: a beat consumes one and produces
 * another, so a trick's ending state is literally a valid starting state for
 * whatever follows. "Big cup, Kenflip big cup, Spike" then runs as one
 * continuous performance rather than three clips cut together, because the
 * second element genuinely starts from a tama seated in the big cup.
 */
export type TrickState = {
  held: Role;
  ken: BodyPose;
  tama: BodyPose;
  contact: Contact;
};

export type Sample = {
  /** Seconds from the start of the trick. */
  t: number;
  ken: RigidPose;
  tama: RigidPose;
};

/** Where the camera should watch from, as of this moment. */
export type ViewKey = { t: number; direction: Vec3 };

export type Trick = {
  id: string;
  name: string;
  samples: readonly Sample[];
  views: readonly ViewKey[];
  durationSeconds: number;
  /**
   * Sample indices where one beat hands over to the next.
   *
   * Kept because a seam is the only place a stall can be *introduced* — the
   * inside of a beat is one continuous function by construction. Checking
   * anywhere else would flag a legitimate impulse seen from a few samples
   * away, which is how the check trains people to ignore it.
   */
  joins: readonly number[];
  /** State the trick ends in, so a sequence can check the next one fits. */
  end: TrickState;
};

export type BeatResult = {
  /** Samples at times relative to the beat's own start. */
  samples: Sample[];
  durationSeconds: number;
  out: TrickState;
};

export type Beat = (state: TrickState) => BeatResult;

/**
 * Samples per second every beat bakes at.
 *
 * Dense enough that linear interpolation between samples is
 * indistinguishable from the continuous function it came from, which is
 * what lets every beat be written as a formula and lets the renderer stay a
 * dumb lookup.
 */
export const SAMPLE_HZ = 60;

export function poseAt(state: TrickState, role: Role): BodyPose {
  return role === 'ken' ? state.ken : state.tama;
}

export function freeRole(state: TrickState): Role {
  return state.held === 'ken' ? 'tama' : 'ken';
}

/**
 * Bakes a beat's continuous pose function into samples. Always includes both
 * endpoints, so consecutive beats meet exactly on a shared instant.
 */
export function bakeSpan(
  durationSeconds: number,
  at: (t: number) => { ken: BodyPose; tama: BodyPose },
): Sample[] {
  const steps = Math.max(1, Math.round(durationSeconds * SAMPLE_HZ));
  const samples: Sample[] = [];

  for (let i = 0; i <= steps; i += 1) {
    const t = (durationSeconds * i) / steps;
    const { ken, tama } = at(t);
    samples.push({ t, ken: toRigid(ken), tama: toRigid(tama) });
  }

  return samples;
}

/**
 * What counts as a stall.
 *
 * Deliberately a *stall* detector rather than a general continuity check.
 * Some seams are legitimately discontinuous in velocity — the pull that
 * launches a toss is an impulse — and flagging those would train everyone to
 * ignore the warning. The failure that actually bites is the opposite:
 * chaining two eased segments drove velocity to zero at the join, so the
 * tama came to a complete stop twice mid-flight. Each segment looked fine
 * alone, which is exactly why it needs catching numerically.
 *
 * Measured as a fraction of the surrounding speed rather than an absolute,
 * because an easing sampled at 60Hz never quite reaches zero — its last
 * step is small in proportion to the movement, not small in units.
 */
const STALL_FRACTION = 0.25;
const MOVING_SPEED = 1;

/** Samples either side of a seam to look at for the surrounding speed. */
const STALL_WINDOW = 6;

function speedAcross(a: Sample | undefined, b: Sample | undefined): number | null {
  if (!a || !b) return null;
  const dt = b.t - a.t;
  if (dt <= 0) return null;

  const dKen = Math.hypot(
    b.ken.position[0] - a.ken.position[0],
    b.ken.position[1] - a.ken.position[1],
    b.ken.position[2] - a.ken.position[2],
  );
  const dTama = Math.hypot(
    b.tama.position[0] - a.tama.position[0],
    b.tama.position[1] - a.tama.position[1],
    b.tama.position[2] - a.tama.position[2],
  );

  return Math.max(dKen, dTama) / dt;
}

/**
 * Warns when a beat boundary brings the action to a halt and then starts it
 * again — motion on both sides, nothing at the join.
 */
function peakSpeed(samples: readonly Sample[], from: number, to: number): number {
  let peak = 0;
  for (let i = from; i <= to; i += 1) {
    const speed = speedAcross(samples[i], samples[i + 1]);
    if (speed !== null) peak = Math.max(peak, speed);
  }
  return peak;
}

/**
 * `join` is the index of the instant two beats share.
 *
 * Each side is judged against its *own* window, which is what separates a
 * stall from an impulse. A hang followed by a hard pull is slow before and
 * fast after, but the slow side was never moving to begin with — nothing
 * decelerated. A stall is a side that was moving and then wasn't.
 */
export function findStallAt(samples: readonly Sample[], join: number): number | null {
  const before = speedAcross(samples[join - 1], samples[join]);
  const after = speedAcross(samples[join], samples[join + 1]);

  const approachPeak = peakSpeed(samples, join - STALL_WINDOW, join - 1);
  if (before !== null && approachPeak > MOVING_SPEED && before < approachPeak * STALL_FRACTION) {
    return before;
  }

  const departurePeak = peakSpeed(samples, join, join + STALL_WINDOW);
  if (after !== null && departurePeak > MOVING_SPEED && after < departurePeak * STALL_FRACTION) {
    return after;
  }

  return null;
}

function warnOnStall(name: string, index: number, samples: Sample[], join: number) {
  const stalled = findStallAt(samples, join);
  if (stalled === null) return;

  console.warn(
    `[trick-viz] ${name}: motion stops (${stalled.toFixed(3)} units/s) entering beat ` +
      `${index}, then resumes. This reads as a step rather than one gesture — usually an ` +
      `easing that ends at zero velocity where the movement should carry through.`,
  );
}

export type BuildTrickOptions = {
  id: string;
  name: string;
  start: TrickState;
  beats: readonly Beat[];
  /** Where the camera watches from, given the state at a beat boundary. */
  viewFor?: (state: TrickState) => Vec3;
};

/**
 * Runs a trick's beats in order into one absolute-time track.
 *
 * Time is in **seconds**, not the normalized 0-1 the first implementation
 * used. Normalized time cannot be concatenated, and worse, it decouples a
 * toss's height from its length — a bigger toss just got crammed into the
 * same window. In seconds, `tossArc` derives duration from height, so a big
 * toss next to a small one in a sequence keeps the relative timing that
 * makes them read as one performance.
 */
export function buildTrick({ id, name, start, beats, viewFor }: BuildTrickOptions): Trick {
  const samples: Sample[] = [];
  const views: ViewKey[] = [];
  const joins: number[] = [];
  let state = start;
  let elapsed = 0;

  for (const [index, beat] of beats.entries()) {
    const result = beat(state);
    if (viewFor) views.push({ t: elapsed, direction: viewFor(state) });

    const seam = samples.length;
    for (const sample of result.samples) {
      // The first sample of a beat is the same instant as the last sample of
      // the previous one; keeping both would put a zero-length segment in
      // the track and divide by zero when sampling it.
      if (seam > 0 && sample.t === 0) continue;
      samples.push({ ...sample, t: elapsed + sample.t });
    }

    // `seam` is where this beat's samples begin, so the instant it shares
    // with the previous beat is the one just before it.
    if (seam > 0) {
      joins.push(seam - 1);
      if (__DEV__) warnOnStall(name, index, samples, seam - 1);
    }

    elapsed += result.durationSeconds;
    state = result.out;
  }

  if (viewFor) views.push({ t: elapsed, direction: viewFor(state) });

  return { id, name, samples, views, joins, durationSeconds: elapsed, end: state };
}

/**
 * Plays several tricks as one continuous run.
 *
 * The Kentei list is full of compound tricks ("Easy big cup, Spike"), and
 * they are one performance, not a playlist: the tama is already in the big
 * cup when the spike starts. Concatenation is only meaningful because each
 * part ends in a `TrickState` the next part can begin from, so this asserts
 * that rather than trusting it.
 */
export function concatTricks(id: string, name: string, parts: readonly Trick[]): Trick {
  if (parts.length === 0) throw new Error(`Sequence ${id} has no parts`);

  const samples: Sample[] = [];
  const views: ViewKey[] = [];
  const joins: number[] = [];
  let elapsed = 0;

  for (const [index, part] of parts.entries()) {
    if (index > 0) {
      const previousEnd = parts[index - 1].end;
      const startsFrom = part.samples[0];
      const gap = Math.hypot(
        startsFrom.tama.position[0] - previousEnd.tama.position[0],
        startsFrom.tama.position[1] - previousEnd.tama.position[1],
        startsFrom.tama.position[2] - previousEnd.tama.position[2],
      );

      if (gap > 1e-3) {
        throw new Error(
          `[trick-viz] ${name}: "${part.name}" starts ${gap.toFixed(3)} units from where ` +
            `"${parts[index - 1].name}" ended. Sequence parts must be built from the ` +
            `previous part's end state, not from a fresh hang.`,
        );
      }
    }

    const offset = samples.length;
    if (index > 0) joins.push(offset - 1);

    for (const sample of part.samples) {
      if (index > 0 && sample.t === 0) continue;
      samples.push({ ...sample, t: elapsed + sample.t });
    }
    for (const view of part.views) {
      views.push({ ...view, t: elapsed + view.t });
    }
    for (const join of part.joins) {
      joins.push(offset + (index > 0 ? join - 1 : join));
    }

    elapsed += part.durationSeconds;
  }

  return {
    id,
    name,
    samples,
    views,
    joins: joins.sort((a, b) => a - b),
    durationSeconds: elapsed,
    end: parts[parts.length - 1].end,
  };
}

function indexAt(samples: readonly Sample[], t: number): number {
  let low = 0;
  let high = samples.length - 1;

  while (low < high - 1) {
    const mid = (low + high) >> 1;
    if (samples[mid].t <= t) low = mid;
    else high = mid;
  }

  return low;
}

/**
 * Reads the track at time `t` into caller-owned three.js objects.
 *
 * Writes into the targets rather than returning new ones because this runs
 * every frame for both bodies, and rotation is **slerped**, not lerped
 * component-wise on Euler angles the way the first implementation did. That
 * was harmless while nothing rotated and is wrong the moment a ken flips:
 * component-wise interpolation takes a non-geodesic path and can gimbal.
 */
export function sampleTrackInto(
  samples: readonly Sample[],
  t: number,
  ken: { position: Vector3; quaternion: Quaternion },
  tama: { position: Vector3; quaternion: Quaternion },
): void {
  const clamped = Math.min(Math.max(t, samples[0].t), samples[samples.length - 1].t);
  const index = indexAt(samples, clamped);
  const from = samples[index];
  const to = samples[Math.min(index + 1, samples.length - 1)];

  const span = to.t - from.t;
  const local = span <= 0 ? 0 : (clamped - from.t) / span;

  applyInto(from.ken, to.ken, local, ken);
  applyInto(from.tama, to.tama, local, tama);
}

function applyInto(
  from: RigidPose,
  to: RigidPose,
  local: number,
  target: { position: Vector3; quaternion: Quaternion },
): void {
  target.position.set(
    from.position[0] + (to.position[0] - from.position[0]) * local,
    from.position[1] + (to.position[1] - from.position[1]) * local,
    from.position[2] + (to.position[2] - from.position[2]) * local,
  );

  target.quaternion.set(from.quaternion[0], from.quaternion[1], from.quaternion[2], from.quaternion[3]);
  scratchQuaternion.set(to.quaternion[0], to.quaternion[1], to.quaternion[2], to.quaternion[3]);
  target.quaternion.slerp(scratchQuaternion, local);
}

const scratchQuaternion = new Quaternion();

/** The camera direction at time `t`, eased between the beats' preferences. */
export function sampleView(views: readonly ViewKey[], t: number): Vec3 {
  if (views.length === 0) return [0, 0, 1];
  if (views.length === 1) return views[0].direction;

  let index = 0;
  while (index < views.length - 2 && views[index + 1].t <= t) index += 1;

  const from = views[index];
  const to = views[index + 1];
  const span = to.t - from.t;
  const local = span <= 0 ? 0 : Math.min(Math.max((t - from.t) / span, 0), 1);

  return [
    from.direction[0] + (to.direction[0] - from.direction[0]) * local,
    from.direction[1] + (to.direction[1] - from.direction[1]) * local,
    from.direction[2] + (to.direction[2] - from.direction[2]) * local,
  ];
}
