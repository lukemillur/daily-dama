import { TAMA } from './anatomy';
import {
  collideWithKen,
  collideWithTama,
  createKenContact,
  distanceToSpikeAxis,
  SPIKE_MAX_RADIUS,
  SPIKE_SPHERE_COUNT,
  spikeSphere,
} from './collision';
import { KEN_MASS } from './mass';
import { layPolyline, PARTICLES, solveChain, type ChainEnd } from './string-chain';
import {
  applyStringFriction,
  GRAVITY,
  ITERATIONS,
  STRING_DRAG,
  STRING_SOLVES,
  SUBSTEP,
  takeSubsteps,
} from './string-sim';
import { STRING_LENGTH, STRING_RADIUS, stringExitLocal, TAMA_STRING_ATTACH, type Handedness, type Pose } from './stringing';
import { addRotation, multiply, rotate, rotateInverse } from './vec';

/**
 * A strung kendama held by the ball: the tama is kinematic, posed by the
 * hand, and the ken hangs from the string as a free rigid body. Airplane
 * and every other tama-held trick run here.
 *
 * It is `string-sim` with the roles swapped, and shares its string solve
 * (`string-chain`). The ken is no sphere, so it carries a full inertia
 * tensor about its centre of mass, integrated from its shape (`mass.ts`),
 * and turns about that centre rather than its base-cup origin.
 *
 * Contacts are position-based and frictionless: the spike meets the ball's
 * real bore, and the rest of the ken meets its shell. A spike in a bore
 * slides freely, and a ken seated spike-down is held upright by the bore,
 * not by friction.
 *
 * Millimetres, seconds and grams.
 */
export type TamaHeldSim = {
  handedness: Handedness;
  /** Particle 0 is pinned at the tama's string hole; the last segment ends at the ken's. */
  positions: Float64Array;
  previous: Float64Array;
  touching: Uint8Array;
  contactNormals: Float64Array;
  /** The held ball, posed by the hand. Its velocity is the hand's, for whoever watches it. */
  tamaPosition: Float64Array;
  tamaQuaternion: Float64Array;
  tamaVelocity: Float64Array;
  /** The free ken's centre of mass, which it moves and turns about. */
  kenCentre: Float64Array;
  kenCentrePrevious: Float64Array;
  kenVelocity: Float64Array;
  kenSpin: Float64Array;
  /** The ken's pose by its base-cup origin, like a held ken's, derived from its centre. */
  kenPosition: Float64Array;
  kenQuaternion: Float64Array;
  kenPreviousPosition: Float64Array;
  kenPreviousQuaternion: Float64Array;
  /** Whether the ken touched the ball during the last substep: what the hand feels. */
  kenTouching: boolean;
  accumulator: number;
};

/** Per-second decay of the ken's motion through the air. */
const KEN_DRAG = 0.25;
const KEN_SPIN_DRAG = 0.5;

const KEN_INV_MASS = 1 / KEN_MASS.mass;
const [CENTRE_X, CENTRE_Y, CENTRE_Z] = KEN_MASS.centre;

const scratch = new Float64Array(3);
const scratchQuat = new Float64Array(4);
const contact = createKenContact();

/** The tama's string hole in world space. */
function tamaAttachWorld(sim: TamaHeldSim, out: Float64Array, offset = 0) {
  rotate(sim.tamaQuaternion, TAMA_STRING_ATTACH[0], TAMA_STRING_ATTACH[1], TAMA_STRING_ATTACH[2], out, offset);
  out[offset] += sim.tamaPosition[0];
  out[offset + 1] += sim.tamaPosition[1];
  out[offset + 2] += sim.tamaPosition[2];
}

/** Sets the ken's origin from its centre and orientation. */
function placeKen(sim: TamaHeldSim) {
  rotate(sim.kenQuaternion, CENTRE_X, CENTRE_Y, CENTRE_Z, scratch);
  sim.kenPosition[0] = sim.kenCentre[0] - scratch[0];
  sim.kenPosition[1] = sim.kenCentre[1] - scratch[1];
  sim.kenPosition[2] = sim.kenCentre[2] - scratch[2];
}

const local = new Float64Array(3);

/** `out = I⁻¹ v` with the inverse inertia turned into world axes by the ken's orientation. */
function inverseInertiaTimes(q: ArrayLike<number>, x: number, y: number, z: number, out: Float64Array) {
  rotateInverse(q, x, y, z, local);
  const m = KEN_MASS.inverseInertia;
  const lx = m[0] * local[0] + m[1] * local[1] + m[2] * local[2];
  const ly = m[3] * local[0] + m[4] * local[1] + m[5] * local[2];
  const lz = m[6] * local[0] + m[7] * local[1] + m[8] * local[2];
  rotate(q, lx, ly, lz, out);
}

const torque = new Float64Array(3);
const turn = new Float64Array(3);

/** How heavy the ken is to a push along unit `n` at lever `r` from its centre: 1 / m + (r × n)ᵀ I⁻¹ (r × n). */
function kenWeight(sim: TamaHeldSim, rx: number, ry: number, rz: number, nx: number, ny: number, nz: number) {
  torque[0] = ry * nz - rz * ny;
  torque[1] = rz * nx - rx * nz;
  torque[2] = rx * ny - ry * nx;
  inverseInertiaTimes(sim.kenQuaternion, torque[0], torque[1], torque[2], turn);
  return KEN_INV_MASS + torque[0] * turn[0] + torque[1] * turn[1] + torque[2] * turn[2];
}

/** Moves and turns the ken by `lambda` along `n`, for the lever `kenWeight` last saw. */
function nudgeKen(sim: TamaHeldSim, lambda: number, nx: number, ny: number, nz: number) {
  sim.kenCentre[0] += KEN_INV_MASS * lambda * nx;
  sim.kenCentre[1] += KEN_INV_MASS * lambda * ny;
  sim.kenCentre[2] += KEN_INV_MASS * lambda * nz;
  addRotation(sim.kenQuaternion, turn[0] * lambda, turn[1] * lambda, turn[2] * lambda);
  placeKen(sim);
}

/**
 * Pushes the point of the ken at world `(px, py, pz)` out of an overlap of
 * `depth` along unit `n`. The ball is held, so the ken takes it all.
 */
function pushKen(sim: TamaHeldSim, px: number, py: number, pz: number, nx: number, ny: number, nz: number, depth: number) {
  const c = sim.kenCentre;
  const weight = kenWeight(sim, px - c[0], py - c[1], pz - c[2], nx, ny, nz);
  nudgeKen(sim, depth / weight, nx, ny, nz);
}

/** The ken's string hole as the free end of the string. */
let endSim: TamaHeldSim;
const kenEnd: ChainEnd = {
  attach: new Float64Array(3),
  locate() {
    const exit = stringExitLocal(endSim.handedness);
    rotate(endSim.kenQuaternion, exit[0], exit[1], exit[2], this.attach);
    this.attach[0] += endSim.kenPosition[0];
    this.attach[1] += endSim.kenPosition[1];
    this.attach[2] += endSim.kenPosition[2];
  },
  weightAlong(nx, ny, nz) {
    const c = endSim.kenCentre;
    return kenWeight(endSim, this.attach[0] - c[0], this.attach[1] - c[1], this.attach[2] - c[2], nx, ny, nz);
  },
  pull(lambda, nx, ny, nz) {
    nudgeKen(endSim, lambda, nx, ny, nz);
  },
};

/**
 * The tama held at `tama`, the ken hanging still below it: plumb string
 * from the ball's string hole, and the ken turned so its centre of mass
 * hangs straight under its own string hole. Of the ways to hang like that,
 * this is the one nearest spike-up with the sarado unturned.
 */
export function createTamaHeldSim(handedness: Handedness, tama: Pose): TamaHeldSim {
  const sim: TamaHeldSim = {
    handedness,
    positions: new Float64Array(PARTICLES * 3),
    previous: new Float64Array(PARTICLES * 3),
    touching: new Uint8Array(PARTICLES),
    contactNormals: new Float64Array(PARTICLES * 3),
    tamaPosition: new Float64Array(tama.position),
    tamaQuaternion: new Float64Array(tama.quaternion),
    tamaVelocity: new Float64Array(3),
    kenCentre: new Float64Array(3),
    kenCentrePrevious: new Float64Array(3),
    kenVelocity: new Float64Array(3),
    kenSpin: new Float64Array(3),
    kenPosition: new Float64Array(3),
    kenQuaternion: new Float64Array(hangingKenQuaternion(handedness)),
    kenPreviousPosition: new Float64Array(3),
    kenPreviousQuaternion: new Float64Array(4),
    kenTouching: false,
    accumulator: 0,
  };

  const top = new Float64Array(3);
  tamaAttachWorld(sim, top);
  const bottom = [top[0], top[1] - STRING_LENGTH, top[2]];
  layPolyline(sim.positions, [Array.from(top), bottom]);
  sim.previous.set(sim.positions);

  const exit = stringExitLocal(handedness);
  rotate(sim.kenQuaternion, exit[0], exit[1], exit[2], scratch);
  for (let k = 0; k < 3; k += 1) sim.kenPosition[k] = bottom[k] - scratch[k];
  rotate(sim.kenQuaternion, CENTRE_X, CENTRE_Y, CENTRE_Z, scratch);
  for (let k = 0; k < 3; k += 1) sim.kenCentre[k] = sim.kenPosition[k] + scratch[k];
  sim.kenCentrePrevious.set(sim.kenCentre);
  sim.kenPreviousPosition.set(sim.kenPosition);
  sim.kenPreviousQuaternion.set(sim.kenQuaternion);
  return sim;
}

/** The turn that stands the ken's centre-to-string-hole line straight up. */
export function hangingKenQuaternion(handedness: Handedness): [number, number, number, number] {
  const exit = stringExitLocal(handedness);
  const dx = exit[0] - CENTRE_X, dy = exit[1] - CENTRE_Y, dz = exit[2] - CENTRE_Z;
  const length = Math.hypot(dx, dy, dz);
  // The shortest arc from u to +Y: [u × Y, 1 + u · Y], normalised.
  const ux = dx / length, uy = dy / length, uz = dz / length;
  const q: [number, number, number, number] = [-uz, 0, ux, 1 + uy];
  const norm = Math.hypot(...q);
  return [q[0] / norm, q[1] / norm, q[2] / norm, q[3] / norm];
}

const spikeCentre = new Float64Array(3);

/** The spike's chain of spheres against the ball's solid, bore and all. */
function collideSpikeWithTama(sim: TamaHeldSim): boolean {
  const reach = TAMA.radius + SPIKE_MAX_RADIUS;
  if (distanceToSpikeAxis(sim.kenPosition, sim.kenQuaternion, sim.tamaPosition) > reach) return false;
  const c = sim.tamaPosition;
  let touched = false;
  for (let i = 0; i < SPIKE_SPHERE_COUNT; i += 1) {
    const radius = spikeSphere(sim.kenPosition, sim.kenQuaternion, i, spikeCentre);
    const dx = spikeCentre[0] - c[0], dy = spikeCentre[1] - c[1], dz = spikeCentre[2] - c[2];
    if (dx * dx + dy * dy + dz * dz > (TAMA.radius + radius) ** 2) continue;
    if (!collideWithTama(c, sim.tamaQuaternion, spikeCentre, 0, radius, contact)) continue;
    touched = true;
    const n = contact.normal;
    // The spike sphere's surface point nearest the ball, pushed out along n.
    pushKen(
      sim,
      spikeCentre[0] - n[0] * radius,
      spikeCentre[1] - n[1] * radius,
      spikeCentre[2] - n[2] * radius,
      n[0],
      n[1],
      n[2],
      contact.depth,
    );
  }
  return touched;
}

/** The rest of the ken, sarado and handle below the spike, against the ball's shell. */
function collideKenWithTama(sim: TamaHeldSim): boolean {
  if (!collideWithKen(sim.kenPosition, sim.kenQuaternion, sim.tamaPosition, 0, TAMA.radius, contact, true)) {
    return false;
  }
  const n = contact.normal;
  const c = sim.tamaPosition;
  // n points out of the ken toward the ball, so the ken moves along -n.
  pushKen(
    sim,
    c[0] - n[0] * (TAMA.radius - contact.depth),
    c[1] - n[1] * (TAMA.radius - contact.depth),
    c[2] - n[2] * (TAMA.radius - contact.depth),
    -n[0],
    -n[1],
    -n[2],
    contact.depth,
  );
  return true;
}

const gyro = new Float64Array(3);

/** One fixed substep, with the tama already posed for this instant. */
function substep(sim: TamaHeldSim, h: number) {
  const p = sim.positions;
  const prev = sim.previous;

  const stringKeep = 1 - STRING_DRAG * h;
  for (let i = 1; i < PARTICLES; i += 1) {
    for (let k = 0; k < 3; k += 1) {
      const index = i * 3 + k;
      const velocity = (p[index] - prev[index]) * stringKeep;
      prev[index] = p[index];
      p[index] += velocity + (k === 1 ? -GRAVITY * h * h : 0);
    }
  }
  tamaAttachWorld(sim, p, 0);
  prev[0] = p[0];
  prev[1] = p[1];
  prev[2] = p[2];

  const v = sim.kenVelocity;
  const keep = 1 - KEN_DRAG * h;
  v[0] *= keep;
  v[1] = v[1] * keep - GRAVITY * h;
  v[2] *= keep;
  sim.kenCentrePrevious.set(sim.kenCentre);
  sim.kenPreviousPosition.set(sim.kenPosition);
  sim.kenPreviousQuaternion.set(sim.kenQuaternion);
  sim.kenCentre[0] += v[0] * h;
  sim.kenCentre[1] += v[1] * h;
  sim.kenCentre[2] += v[2] * h;

  // Torque-free spin of a body that is not a sphere: angular momentum is
  // what is kept, so ω drifts by −I⁻¹ (ω × I ω). A ken flipped end over end
  // turns about a principal axis and barely feels it; one tumbling off-axis
  // wobbles, as a real one does.
  const w = sim.kenSpin;
  const spinKeep = 1 - KEN_SPIN_DRAG * h;
  rotateInverse(sim.kenQuaternion, w[0] * spinKeep, w[1] * spinKeep, w[2] * spinKeep, local);
  const I = KEN_MASS.inertia;
  const Lx = I[0] * local[0] + I[1] * local[1] + I[2] * local[2];
  const Ly = I[3] * local[0] + I[4] * local[1] + I[5] * local[2];
  const Lz = I[6] * local[0] + I[7] * local[1] + I[8] * local[2];
  const cx = local[1] * Lz - local[2] * Ly;
  const cy = local[2] * Lx - local[0] * Lz;
  const cz = local[0] * Ly - local[1] * Lx;
  const m = KEN_MASS.inverseInertia;
  gyro[0] = local[0] - h * (m[0] * cx + m[1] * cy + m[2] * cz);
  gyro[1] = local[1] - h * (m[3] * cx + m[4] * cy + m[5] * cz);
  gyro[2] = local[2] - h * (m[6] * cx + m[7] * cy + m[8] * cz);
  rotate(sim.kenQuaternion, gyro[0], gyro[1], gyro[2], w);
  addRotation(sim.kenQuaternion, w[0] * h, w[1] * h, w[2] * h);
  placeKen(sim);

  let touched = false;
  endSim = sim;
  for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
    for (let solve = 0; solve < STRING_SOLVES; solve += 1) solveChain(sim, kenEnd);

    for (let i = 1; i < PARTICLES; i += 1) {
      const a = i * 3;
      sim.touching[i] = 0;
      // The string is far lighter than the ken, so it gives way entirely.
      // It is not marked touching: the solve weighs a touching particle as
      // the wood behind it, right for the held ball but not for the free
      // ken, which would then be pulled along by a point on itself.
      if (collideWithKen(sim.kenPosition, sim.kenQuaternion, p, a, STRING_RADIUS, contact)) {
        const n = contact.normal;
        p[a] += n[0] * contact.depth;
        p[a + 1] += n[1] * contact.depth;
        p[a + 2] += n[2] * contact.depth;
        applyStringFriction(sim, a, n, contact.depth);
      }
      // Next to its knot the string runs along the ball's surface already.
      if (i > 2) {
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
          sim.touching[i] = 1;
          sim.contactNormals[a] = dx / distance;
          sim.contactNormals[a + 1] = dy / distance;
          sim.contactNormals[a + 2] = dz / distance;
        }
      }
    }

    if (collideKenWithTama(sim)) touched = true;
    if (collideSpikeWithTama(sim)) touched = true;
  }

  for (let k = 0; k < 3; k += 1) v[k] = (sim.kenCentre[k] - sim.kenCentrePrevious[k]) / h;
  const q = sim.kenQuaternion;
  const qPrev = sim.kenPreviousQuaternion;
  scratchQuat[0] = -qPrev[0];
  scratchQuat[1] = -qPrev[1];
  scratchQuat[2] = -qPrev[2];
  scratchQuat[3] = qPrev[3];
  multiply(q, scratchQuat, scratchQuat);
  const sign = scratchQuat[3] < 0 ? -1 : 1;
  w[0] = (2 * sign * scratchQuat[0]) / h;
  w[1] = (2 * sign * scratchQuat[1]) / h;
  w[2] = (2 * sign * scratchQuat[2]) / h;
  sim.kenTouching = touched;
}

/**
 * Advances by `dt` seconds with the hand driven at the substep rate:
 * `drive` sees the simulation before each substep and returns the tama's
 * pose for it.
 */
export function stepTamaHeldSimDriven(
  sim: TamaHeldSim,
  dt: number,
  drive: (sim: TamaHeldSim, h: number) => Pose,
): void {
  const steps = takeSubsteps(sim, dt);
  for (let step = 0; step < steps; step += 1) {
    const pose = drive(sim, SUBSTEP);
    for (let k = 0; k < 3; k += 1) sim.tamaVelocity[k] = (pose.position[k] - sim.tamaPosition[k]) / SUBSTEP;
    sim.tamaPosition.set(pose.position);
    sim.tamaQuaternion.set(pose.quaternion);
    substep(sim, SUBSTEP);
  }
}

/** The rope as world points, ken's hole to ball's, matching `stringPoints` for a held ken. */
export function tamaHeldStringPoints(sim: TamaHeldSim): number[][] {
  endSim = sim;
  kenEnd.locate();
  const points: number[][] = [[kenEnd.attach[0], kenEnd.attach[1], kenEnd.attach[2]]];
  for (let i = PARTICLES - 1; i >= 0; i -= 1) {
    points.push([sim.positions[i * 3], sim.positions[i * 3 + 1], sim.positions[i * 3 + 2]]);
  }
  return points;
}
