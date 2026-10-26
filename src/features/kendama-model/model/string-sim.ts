import { SARADO, TAMA } from './anatomy';
import { collideWithKen, createKenContact } from './collision';
import {
  STRING_LENGTH,
  STRING_RADIUS,
  stringExitLocal,
  TAMA_STRING_ATTACH,
  type Handedness,
  type Pose,
} from './stringing';
import { addRotation, multiply, normalizeQuat, rotate, slerpInto } from './vec';

/**
 * A strung kendama: the ken is held (kinematic, posed by the hand), the
 * string is a chain of particles, and the tama is a rigid ball tied to the
 * end of it.
 *
 * Solved with position-based dynamics (XPBD with zero compliance): each
 * substep predicts positions under gravity, then projects them back onto the
 * constraints, and derives velocity from how far things actually moved.
 * That is unconditionally stable for an inextensible string, which an
 * explicit spring model is not without very stiff springs and tiny steps.
 *
 * Everything is in millimetres, seconds and grams.
 */

/** mm/s². Real gravity: the point is to see how a strung tama really falls. */
export const GRAVITY = 9810;

const PARTICLES = 20;
const SEGMENT = STRING_LENGTH / PARTICLES;

const TAMA_MASS = 68;
/**
 * Per particle, so 30g of string in all, against about 1g in life.
 *
 * Deliberate. Lumping a gram of string into a handful of points puts a
 * 1000:1 mass ratio against the ball, and a position-based solve then
 * "fixes" stretch by swinging the near-weightless points sideways, which
 * only shortens the string at second order: it stretches, then bounces like
 * a spring. At about 45:1 per point the string holds its length, even as a
 * dropped ball snaps it taut. The cost is a string that carries a little
 * more momentum and settles a little faster than real string.
 */
const PARTICLE_MASS = 1.5;
/** Solid-sphere inertia. A real tama is a little hollower; close enough. */
const TAMA_INERTIA = 0.4 * TAMA_MASS * TAMA.radius ** 2;

const TAMA_INV_MASS = 1 / TAMA_MASS;
const TAMA_INV_INERTIA = 1 / TAMA_INERTIA;
const PARTICLE_INV_MASS = 1 / PARTICLE_MASS;

/** Fixed step. Each iteration re-solves the string exactly, then collisions. */
export const SUBSTEP = 1 / 480;
const ITERATIONS = 3;
/** Caps catch-up work after a long frame (tab switch, breakpoint) so it cannot spiral. */
const MAX_SUBSTEPS_PER_CALL = 64;

/** Per-second velocity decay: air drag on the string, and a little on the ball. */
const STRING_DRAG = 1.5;
const TAMA_DRAG = 0.25;
const TAMA_SPIN_DRAG = 1.2;

const TAMA_FRICTION = 0.35;
const TAMA_RESTITUTION = 0.3;
/** Below this approach speed a contact does not bounce, so a resting ball stays put. */
const BOUNCE_THRESHOLD = 250;
const STRING_FRICTION = 0.6;

export type StringSim = {
  handedness: Handedness;
  /** Particle 0 is pinned at the sarado's string hole. */
  positions: Float64Array;
  previous: Float64Array;
  tamaPosition: Float64Array;
  tamaPrevious: Float64Array;
  tamaVelocity: Float64Array;
  tamaQuaternion: Float64Array;
  tamaPreviousQuaternion: Float64Array;
  tamaSpin: Float64Array;
  kenPosition: Float64Array;
  kenQuaternion: Float64Array;
  kenPreviousPosition: Float64Array;
  /** Which particles touched the ken on the last collision pass. */
  touching: Uint8Array;
  /** Whether the ball touched the ken during the last substep: what the hand feels. */
  tamaTouching: boolean;
  /** Unconsumed time from the last call, carried so playback stays fixed-step. */
  accumulator: number;
};

export type InitialLayout =
  /** Hanging at rest below the string hole. */
  | { kind: 'hanging' }
  /** Held still at a world point, string slack, ready to be let go. */
  | { kind: 'held'; tamaCentre: readonly [number, number, number] };

export const PARTICLE_COUNT = PARTICLES;

/** The widest point of the sarado's cup bands, which the hanging string drapes over. */
const SARADO_BAND_RADIUS = 24.65;

const scratchQuat = new Float64Array(4);
const tamaNormal = new Float64Array(3);
const contact = createKenContact();

function kenPointWorld(sim: StringSim, local: readonly number[], out: Float64Array, offset = 0) {
  rotate(sim.kenQuaternion, local[0], local[1], local[2], out, offset);
  out[offset] += sim.kenPosition[0];
  out[offset + 1] += sim.kenPosition[1];
  out[offset + 2] += sim.kenPosition[2];
}

function tamaAttachWorld(sim: StringSim, out: Float64Array) {
  rotate(sim.tamaQuaternion, TAMA_STRING_ATTACH[0], TAMA_STRING_ATTACH[1], TAMA_STRING_ATTACH[2], out);
  out[0] += sim.tamaPosition[0];
  out[1] += sim.tamaPosition[1];
  out[2] += sim.tamaPosition[2];
}

export function createStringSim(handedness: Handedness, ken: Pose, layout: InitialLayout): StringSim {
  const sim: StringSim = {
    handedness,
    positions: new Float64Array(PARTICLES * 3),
    previous: new Float64Array(PARTICLES * 3),
    tamaPosition: new Float64Array(3),
    tamaPrevious: new Float64Array(3),
    tamaVelocity: new Float64Array(3),
    tamaQuaternion: new Float64Array([0, 0, 0, 1]),
    tamaPreviousQuaternion: new Float64Array([0, 0, 0, 1]),
    tamaSpin: new Float64Array(3),
    kenPosition: new Float64Array(ken.position),
    kenQuaternion: new Float64Array(ken.quaternion),
    kenPreviousPosition: new Float64Array(ken.position),
    touching: new Uint8Array(PARTICLES),
    tamaTouching: false,
    accumulator: 0,
  };

  const anchor = new Float64Array(3);
  kenPointWorld(sim, stringExitLocal(handedness), anchor);

  // Which way the string leaves the hole, so the initial lay starts clear of
  // the sarado instead of buried in it.
  const exit = new Float64Array(3);
  rotate(sim.kenQuaternion, 0, 0, handedness === 'right' ? 1 : -1, exit);

  if (layout.kind === 'hanging') {
    // Out of the hole just far enough to clear the small cup's band, which
    // the string drapes over, then plumb: the rest position, so it opens
    // still rather than swinging.
    const lead = SARADO_BAND_RADIUS + STRING_RADIUS - (SARADO.waistRadius + STRING_RADIUS);
    for (let i = 0; i < PARTICLES; i += 1) {
      const along = i * SEGMENT;
      const out = Math.min(along, lead);
      const down = Math.max(along - lead, 0);
      sim.positions[i * 3] = anchor[0] + exit[0] * out;
      sim.positions[i * 3 + 1] = anchor[1] + exit[1] * out - down;
      sim.positions[i * 3 + 2] = anchor[2] + exit[2] * out;
    }
    const last = (PARTICLES - 1) * 3;
    sim.tamaPosition[0] = sim.positions[last];
    sim.tamaPosition[1] = sim.positions[last + 1] - SEGMENT - TAMA.radius;
    sim.tamaPosition[2] = sim.positions[last + 2];
  } else {
    sim.tamaPosition.set(layout.tamaCentre);
    // Slack: out of the hole past the cup band, then straight to the ball.
    // That path is shorter than the string, which only resists stretching,
    // so the spare length simply falls. Laying it straight from the hole
    // instead would run it through the sarado.
    const attach = new Float64Array(3);
    tamaAttachWorld(sim, attach);
    const lead = SARADO_BAND_RADIUS - SARADO.waistRadius + 2;
    const clear = [anchor[0] + exit[0] * lead, anchor[1] + exit[1] * lead, anchor[2] + exit[2] * lead];
    const first = lead;
    const second = Math.hypot(attach[0] - clear[0], attach[1] - clear[1], attach[2] - clear[2]);
    for (let i = 0; i < PARTICLES; i += 1) {
      const along = ((first + second) * i) / PARTICLES;
      for (let k = 0; k < 3; k += 1) {
        sim.positions[i * 3 + k] =
          along <= first
            ? anchor[k] + exit[k] * along
            : clear[k] + ((attach[k] - clear[k]) * (along - first)) / second;
      }
    }
  }

  sim.previous.set(sim.positions);
  sim.tamaPrevious.set(sim.tamaPosition);
  return sim;
}

/** One constraint per segment: particle i to i+1, and the last particle to the ball. */
const CONSTRAINTS = PARTICLES;
const normals = new Float64Array(CONSTRAINTS * 3);
const violation = new Float64Array(CONSTRAINTS);
const diagonal = new Float64Array(CONSTRAINTS);
const upper = new Float64Array(CONSTRAINTS);
const rhs = new Float64Array(CONSTRAINTS);
const lambda = new Float64Array(CONSTRAINTS);
const active = new Uint8Array(CONSTRAINTS);

/**
 * mm. A segment shorter than its length by more than this is slack and
 * drops out of the solve, so folded spare string cannot stiffen the system.
 * A segment within it counts as taut: a loaded string sits at exactly its
 * length, and deciding on float noise would cut the ball loose at random.
 */
const SLACK_TOLERANCE = 0.3;
const attach = new Float64Array(3);

/**
 * A particle pressed against the ken solves as if heavy.
 *
 * The solve does not see the wood. Where the string bends over the sarado,
 * the cheapest way to take up a stretch is to pull those light particles
 * sideways, into the wood, rather than lift a 68g ball; collisions push them
 * back out and the stretch is never resolved. Pinning contact particles
 * this way, much as friction does, leaves lifting the ball as the cheap fix.
 */
const CONTACT_INV_MASS = TAMA_INV_MASS;

function particleWeight(sim: StringSim, i: number): number {
  if (i === 0) return 0;
  return sim.touching[i] ? CONTACT_INV_MASS : PARTICLE_INV_MASS;
}

/**
 * Projects the whole string onto its length in one direct solve.
 *
 * A string is a chain: each segment's constraint shares a particle only
 * with its neighbours, so the system `J W Jᵀ λ = -C` is tridiagonal and
 * solves exactly in linear time. Iterating segment by segment converges
 * badly with a 68g ball on a gram or two of string; the string stretches by
 * several percent and the ball bounces on it like a spring.
 *
 * Taut segments are fixed-length links with a free joint at each particle;
 * clearly slack ones drop out, so spare string folds and a dropped ball
 * falls free until the string snaps taut.
 *
 * The last constraint ends on the ball's string hole, off its centre, so
 * the ball's weighting includes its rotational inertia about that lever and
 * the correction turns the ball as well as moving it.
 */
function solveString(sim: StringSim) {
  const p = sim.positions;
  tamaAttachWorld(sim, attach);

  for (let i = 0; i < CONSTRAINTS; i += 1) {
    const a = i * 3;
    const end = i === CONSTRAINTS - 1;
    const dx = (end ? attach[0] : p[a + 3]) - p[a];
    const dy = (end ? attach[1] : p[a + 4]) - p[a + 1];
    const dz = (end ? attach[2] : p[a + 5]) - p[a + 2];
    const distance = Math.hypot(dx, dy, dz) || 1e-9;
    normals[a] = dx / distance;
    normals[a + 1] = dy / distance;
    normals[a + 2] = dz / distance;
    violation[i] = distance - SEGMENT;
    active[i] = violation[i] > -SLACK_TOLERANCE ? 1 : 0;
  }

  const last = (CONSTRAINTS - 1) * 3;
  const rx = attach[0] - sim.tamaPosition[0];
  const ry = attach[1] - sim.tamaPosition[1];
  const rz = attach[2] - sim.tamaPosition[2];
  const cx = ry * normals[last + 2] - rz * normals[last + 1];
  const cy = rz * normals[last] - rx * normals[last + 2];
  const cz = rx * normals[last + 1] - ry * normals[last];
  const tamaWeight = TAMA_INV_MASS + TAMA_INV_INERTIA * (cx * cx + cy * cy + cz * cz);

  for (let i = 0; i < CONSTRAINTS; i += 1) {
    if (!active[i]) {
      diagonal[i] = 1;
      upper[i] = 0;
      rhs[i] = 0;
      continue;
    }
    const downstream = i === CONSTRAINTS - 1 ? tamaWeight : particleWeight(sim, i + 1);
    diagonal[i] = particleWeight(sim, i) + downstream;
    rhs[i] = -violation[i];
    // Coupling through particle i + 1, shared with the next segment.
    const next = i + 1;
    upper[i] =
      next < CONSTRAINTS && active[next]
        ? -particleWeight(sim, next) *
          (normals[i * 3] * normals[next * 3] +
            normals[i * 3 + 1] * normals[next * 3 + 1] +
            normals[i * 3 + 2] * normals[next * 3 + 2])
        : 0;
  }

  // Thomas algorithm for the symmetric tridiagonal system.
  for (let i = 1; i < CONSTRAINTS; i += 1) {
    const factor = upper[i - 1] / diagonal[i - 1];
    diagonal[i] -= factor * upper[i - 1];
    rhs[i] -= factor * rhs[i - 1];
  }
  lambda[CONSTRAINTS - 1] = rhs[CONSTRAINTS - 1] / diagonal[CONSTRAINTS - 1];
  for (let i = CONSTRAINTS - 2; i >= 0; i -= 1) {
    lambda[i] = (rhs[i] - upper[i] * lambda[i + 1]) / diagonal[i];
  }

  // Δx_k = w_k (λ_{k-1} n_{k-1} − λ_k n_k)
  for (let k = 1; k < PARTICLES; k += 1) {
    const w = particleWeight(sim, k);
    const a = k * 3, b = a - 3;
    const before = lambda[k - 1], after = lambda[k];
    p[a] += w * (before * normals[b] - after * normals[a]);
    p[a + 1] += w * (before * normals[b + 1] - after * normals[a + 1]);
    p[a + 2] += w * (before * normals[b + 2] - after * normals[a + 2]);
  }

  const l = lambda[CONSTRAINTS - 1];
  if (l !== 0) {
    sim.tamaPosition[0] += TAMA_INV_MASS * l * normals[last];
    sim.tamaPosition[1] += TAMA_INV_MASS * l * normals[last + 1];
    sim.tamaPosition[2] += TAMA_INV_MASS * l * normals[last + 2];
    addRotation(sim.tamaQuaternion, TAMA_INV_INERTIA * l * cx, TAMA_INV_INERTIA * l * cy, TAMA_INV_INERTIA * l * cz);
  }
}

/** One fixed substep, with the ken already moved to its pose for this instant. */
function substep(sim: StringSim, h: number) {
  const p = sim.positions;
  const prev = sim.previous;

  // Predict.
  const stringKeep = 1 - STRING_DRAG * h;
  for (let i = 1; i < PARTICLES; i += 1) {
    for (let k = 0; k < 3; k += 1) {
      const index = i * 3 + k;
      const velocity = (p[index] - prev[index]) * stringKeep;
      prev[index] = p[index];
      p[index] += velocity + (k === 1 ? -GRAVITY * h * h : 0);
    }
  }
  kenPointWorld(sim, stringExitLocal(sim.handedness), p, 0);
  prev[0] = p[0];
  prev[1] = p[1];
  prev[2] = p[2];

  const v = sim.tamaVelocity;
  const tamaKeep = 1 - TAMA_DRAG * h;
  v[0] *= tamaKeep;
  v[1] = v[1] * tamaKeep - GRAVITY * h;
  v[2] *= tamaKeep;
  sim.tamaPrevious.set(sim.tamaPosition);
  sim.tamaPosition[0] += v[0] * h;
  sim.tamaPosition[1] += v[1] * h;
  sim.tamaPosition[2] += v[2] * h;

  const w = sim.tamaSpin;
  const spinKeep = 1 - TAMA_SPIN_DRAG * h;
  w[0] *= spinKeep;
  w[1] *= spinKeep;
  w[2] *= spinKeep;
  sim.tamaPreviousQuaternion.set(sim.tamaQuaternion);
  addRotation(sim.tamaQuaternion, w[0] * h, w[1] * h, w[2] * h);

  // Project.
  let tamaContact = false;
  for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
    solveString(sim);

    // String against the ken and the ball.
    for (let i = 1; i < PARTICLES; i += 1) {
      const a = i * 3;
      sim.touching[i] = 0;
      if (collideWithKen(sim.kenPosition, sim.kenQuaternion, p, a, STRING_RADIUS, contact)) {
        sim.touching[i] = 1;
        const n = contact.normal;
        p[a] += n[0] * contact.depth;
        p[a + 1] += n[1] * contact.depth;
        p[a + 2] += n[2] * contact.depth;
        applyStringFriction(sim, a, n);
      }
      if (i < PARTICLES - 3) {
        const dx = p[a] - sim.tamaPosition[0];
        const dy = p[a + 1] - sim.tamaPosition[1];
        const dz = p[a + 2] - sim.tamaPosition[2];
        const distance = Math.hypot(dx, dy, dz);
        const minimum = TAMA.radius + STRING_RADIUS;
        if (distance < minimum && distance > 1e-9) {
          const push = (minimum - distance) / distance;
          p[a] += dx * push;
          p[a + 1] += dy * push;
          p[a + 2] += dz * push;
        }
      }
    }

    // Ball against the ken. The ken is held, so it takes no correction.
    if (collideWithKen(sim.kenPosition, sim.kenQuaternion, sim.tamaPosition, 0, TAMA.radius, contact)) {
      const n = contact.normal;
      sim.tamaPosition[0] += n[0] * contact.depth;
      sim.tamaPosition[1] += n[1] * contact.depth;
      sim.tamaPosition[2] += n[2] * contact.depth;
      tamaNormal.set(n);
      tamaContact = true;
    }
  }

  // Velocities from what actually happened.
  for (let k = 0; k < 3; k += 1) v[k] = (sim.tamaPosition[k] - sim.tamaPrevious[k]) / h;

  const q = sim.tamaQuaternion;
  const qPrev = sim.tamaPreviousQuaternion;
  scratchQuat[0] = -qPrev[0];
  scratchQuat[1] = -qPrev[1];
  scratchQuat[2] = -qPrev[2];
  scratchQuat[3] = qPrev[3];
  multiply(q, scratchQuat, scratchQuat);
  const sign = scratchQuat[3] < 0 ? -1 : 1;
  w[0] = (2 * sign * scratchQuat[0]) / h;
  w[1] = (2 * sign * scratchQuat[1]) / h;
  w[2] = (2 * sign * scratchQuat[2]) / h;

  sim.tamaTouching = tamaContact;
  if (tamaContact) resolveTamaContactVelocity(sim, tamaNormal, h);
}

/** Drags a string particle along with the ken where they touch. */
function applyStringFriction(sim: StringSim, a: number, n: Float64Array) {
  const p = sim.positions;
  const prev = sim.previous;
  const kx = sim.kenPosition[0] - sim.kenPreviousPosition[0];
  const ky = sim.kenPosition[1] - sim.kenPreviousPosition[1];
  const kz = sim.kenPosition[2] - sim.kenPreviousPosition[2];
  const dx = p[a] - prev[a] - kx;
  const dy = p[a + 1] - prev[a + 1] - ky;
  const dz = p[a + 2] - prev[a + 2] - kz;
  const normal = dx * n[0] + dy * n[1] + dz * n[2];
  prev[a] += STRING_FRICTION * (dx - normal * n[0]);
  prev[a + 1] += STRING_FRICTION * (dy - normal * n[1]);
  prev[a + 2] += STRING_FRICTION * (dz - normal * n[2]);
}

/**
 * Bounce and friction for the ball against the ken, relative to the ken's
 * own motion so a moving cup carries the ball with it.
 */
function resolveTamaContactVelocity(sim: StringSim, n: Float64Array, h: number) {
  const v = sim.tamaVelocity;
  const rx = v[0] - (sim.kenPosition[0] - sim.kenPreviousPosition[0]) / h;
  const ry = v[1] - (sim.kenPosition[1] - sim.kenPreviousPosition[1]) / h;
  const rz = v[2] - (sim.kenPosition[2] - sim.kenPreviousPosition[2]) / h;
  const normalSpeed = rx * n[0] + ry * n[1] + rz * n[2];
  const tx = rx - normalSpeed * n[0];
  const ty = ry - normalSpeed * n[1];
  const tz = rz - normalSpeed * n[2];
  const tangentSpeed = Math.hypot(tx, ty, tz);

  if (normalSpeed < 0) {
    const restitution = -normalSpeed > BOUNCE_THRESHOLD ? TAMA_RESTITUTION : 0;
    const change = -(1 + restitution) * normalSpeed;
    v[0] += change * n[0];
    v[1] += change * n[1];
    v[2] += change * n[2];
  }

  // Coulomb friction caps the tangential change at mu times the normal
  // change. A resting ball's normal change per substep is about g·h, which
  // the approach speed alone misses once projection has already stopped it.
  if (tangentSpeed > 1e-6) {
    const reduction = Math.min(1, (TAMA_FRICTION * Math.abs(normalSpeed) + GRAVITY * h * TAMA_FRICTION) / tangentSpeed);
    v[0] -= tx * reduction;
    v[1] -= ty * reduction;
    v[2] -= tz * reduction;
  }
}

/**
 * Advances the simulation by `dt` seconds while the hand moves the ken to
 * `ken`. Runs whole fixed substeps and carries the remainder, so results do
 * not depend on the display's frame rate.
 */
export function stepStringSim(sim: StringSim, ken: Pose, dt: number): void {
  const steps = takeSubsteps(sim, dt);
  if (steps === 0) return;

  const startPosition = Float64Array.from(sim.kenPosition);
  const startQuaternion = Float64Array.from(sim.kenQuaternion);

  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps;
    sim.kenPreviousPosition.set(sim.kenPosition);
    for (let k = 0; k < 3; k += 1) {
      sim.kenPosition[k] = startPosition[k] + (ken.position[k] - startPosition[k]) * t;
    }
    slerpInto(startQuaternion, ken.quaternion, t, sim.kenQuaternion);
    normalizeQuat(sim.kenQuaternion);
    substep(sim, SUBSTEP);
  }
  sim.kenPreviousPosition.set(sim.kenPosition);
}

/**
 * Advances by `dt` seconds with the hand driven at the substep rate:
 * `drive` sees the simulation as it stands before each substep and returns
 * the ken's pose for it. A controller that reacts to the ball needs this;
 * one pose per display frame would make its reactions depend on the frame
 * rate.
 */
export function stepStringSimDriven(
  sim: StringSim,
  dt: number,
  drive: (sim: StringSim, h: number) => Pose,
): void {
  const steps = takeSubsteps(sim, dt);
  for (let step = 0; step < steps; step += 1) {
    const pose = drive(sim, SUBSTEP);
    sim.kenPreviousPosition.set(sim.kenPosition);
    sim.kenPosition.set(pose.position);
    sim.kenQuaternion.set(pose.quaternion);
    substep(sim, SUBSTEP);
  }
  sim.kenPreviousPosition.set(sim.kenPosition);
}

/** Whole substeps owed for `dt`, carrying the remainder in the accumulator. */
function takeSubsteps(sim: StringSim, dt: number): number {
  sim.accumulator += dt;
  // The epsilon absorbs float drift, so 1/60 s is exactly 8 substeps every
  // frame rather than occasionally 7.
  const steps = Math.min(Math.floor(sim.accumulator / SUBSTEP + 1e-6), MAX_SUBSTEPS_PER_CALL);
  sim.accumulator = steps === MAX_SUBSTEPS_PER_CALL ? 0 : Math.max(sim.accumulator - steps * SUBSTEP, 0);
  return steps;
}

/** The rope as world points, hole to ball, for rendering. */
export function stringPoints(sim: StringSim): number[][] {
  const points: number[][] = [];
  for (let i = 0; i < PARTICLES; i += 1) {
    points.push([sim.positions[i * 3], sim.positions[i * 3 + 1], sim.positions[i * 3 + 2]]);
  }
  const attach = new Float64Array(3);
  tamaAttachWorld(sim, attach);
  points.push([attach[0], attach[1], attach[2]]);
  return points;
}

/** How long the string currently is along its particles, for stretch checks. */
export function stringPathLength(sim: StringSim): number {
  const points = stringPoints(sim);
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += Math.hypot(
      points[i][0] - points[i - 1][0],
      points[i][1] - points[i - 1][1],
      points[i][2] - points[i - 1][2],
    );
  }
  return total;
}
