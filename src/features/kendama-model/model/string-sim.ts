import { SARADO, TAMA } from './anatomy';
import {
  collideWithKen,
  collideWithTama,
  createKenContact,
  distanceToSpikeAxis,
  SPIKE_MAX_RADIUS,
  SPIKE_SPHERE_COUNT,
  spikeSphere,
} from './collision';
import {
  STRING_RADIUS,
  stringExitLocal,
  TAMA_STRING_ATTACH,
  type Handedness,
  type Pose,
} from './stringing';
import { TAMA_MASS } from './mass';
import { layPolyline, PARTICLES, SEGMENT, solveChain, type ChainEnd } from './string-chain';
import { addRotation, multiply, normalizeQuat, rotate, rotateInverse, slerpInto } from './vec';

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

/** Solid-sphere inertia. A real tama is a little hollower; close enough. */
const TAMA_INERTIA = 0.4 * TAMA_MASS * TAMA.radius ** 2;

const TAMA_INV_MASS = 1 / TAMA_MASS;
/** Share of a surface slip that a friction impulse takes out of the centre's velocity. */
const SURFACE_SHARE = 1 / (1 + TAMA_MASS * TAMA.radius ** 2 / TAMA_INERTIA);
const TAMA_INV_INERTIA = 1 / TAMA_INERTIA;

/** Fixed step. Each iteration re-solves the string, then collisions. */
export const SUBSTEP = 1 / 480;
export const ITERATIONS = 3;
/**
 * Exact solves of the string per iteration. Each one linearises the
 * segment directions, so a light string under a sudden load needs several
 * to converge; they are cheap next to the collision pass they precede.
 */
export const STRING_SOLVES = 5;
/** Caps catch-up work after a long frame (tab switch, breakpoint) so it cannot spiral. */
const MAX_SUBSTEPS_PER_CALL = 64;

/** Per-second velocity decay: air drag on the string, and a little on the ball. */
export const STRING_DRAG = 1.5;
const TAMA_DRAG = 0.25;
const TAMA_SPIN_DRAG = 1.2;

const TAMA_FRICTION = 0.35;
const TAMA_RESTITUTION = 0.3;
/** Below this approach speed a contact does not bounce, so a resting ball stays put. */
const BOUNCE_THRESHOLD = 250;
/**
 * Coulomb friction of string on wood. Bounded by how hard the string
 * presses, so a loaded wrap grips (capstan) while slack string draped over
 * the ken slides off as soon as the ball pulls it.
 */
const STRING_FRICTION = 0.5;

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
  /** The ken's pose one substep ago, so contacts know how its surface moved. */
  kenPreviousPosition: Float64Array;
  kenPreviousQuaternion: Float64Array;
  /** Which particles touched the ken on the last collision pass. */
  touching: Uint8Array;
  /** For each touching particle, the ken's outward surface normal there. */
  contactNormals: Float64Array;
  /** Whether the ball touched the ken during the last substep: what the hand feels. */
  tamaTouching: boolean;
  /** Unconsumed time from the last call, carried so playback stays fixed-step. */
  accumulator: number;
};

export type InitialLayout =
  /** Hanging at rest below the string hole. */
  | { kind: 'hanging' }
  /** Held still at a world point, string slack, ready to be let go. */
  | {
      kind: 'held';
      tamaCentre: readonly [number, number, number];
      /** How the ball is turned; upright (string hole up) when left out. */
      tamaQuaternion?: readonly [number, number, number, number];
    };

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
    kenPreviousQuaternion: new Float64Array(ken.quaternion),
    touching: new Uint8Array(PARTICLES),
    contactNormals: new Float64Array(PARTICLES * 3),
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
    if (layout.tamaQuaternion) sim.tamaQuaternion.set(layout.tamaQuaternion);
    sim.tamaPreviousQuaternion.set(sim.tamaQuaternion);
    // Slack: out of the hole past the cup band, round the ball's shoulder on
    // the near side, then into its string hole. That path is shorter than
    // the string, which only resists stretching, so the spare length simply
    // falls. A straight lay would run through the sarado, or through the
    // ball when it is held above the ken, and the collisions pushing it out
    // would snap the string taut.
    const attach = new Float64Array(3);
    tamaAttachWorld(sim, attach);
    const lead = SARADO_BAND_RADIUS - SARADO.waistRadius + 2;
    const clear = [anchor[0] + exit[0] * lead, anchor[1] + exit[1] * lead, anchor[2] + exit[2] * lead];
    const c = sim.tamaPosition;
    const pole = [0, 0, 0];
    rotate(sim.tamaQuaternion, 0, 1, 0, pole);
    const toward = [clear[0] - c[0], clear[1] - c[1], clear[2] - c[2]];
    const along = toward[0] * pole[0] + toward[1] * pole[1] + toward[2] * pole[2];
    const side = [toward[0] - along * pole[0], toward[1] - along * pole[1], toward[2] - along * pole[2]];
    const sideLength = Math.hypot(side[0], side[1], side[2]) || 1;
    const offset = TAMA.radius + 4;
    const shoulder = [0, 1, 2].map((k) => c[k] + (side[k] / sideLength) * offset + pole[k] * offset);
    layPolyline(sim.positions, [Array.from(anchor), clear, shoulder, Array.from(attach)]);
  }

  sim.previous.set(sim.positions);
  sim.tamaPrevious.set(sim.tamaPosition);
  return sim;
}

/** The ball's string hole as the free end of the string. */
let endSim: StringSim;
const lever = new Float64Array(3);
const tamaEnd: ChainEnd = {
  attach: new Float64Array(3),
  locate() {
    tamaAttachWorld(endSim, this.attach);
  },
  weightAlong(nx, ny, nz) {
    const c = endSim.tamaPosition;
    const rx = this.attach[0] - c[0];
    const ry = this.attach[1] - c[1];
    const rz = this.attach[2] - c[2];
    lever[0] = ry * nz - rz * ny;
    lever[1] = rz * nx - rx * nz;
    lever[2] = rx * ny - ry * nx;
    return TAMA_INV_MASS + TAMA_INV_INERTIA * (lever[0] * lever[0] + lever[1] * lever[1] + lever[2] * lever[2]);
  },
  pull(l, nx, ny, nz) {
    endSim.tamaPosition[0] += TAMA_INV_MASS * l * nx;
    endSim.tamaPosition[1] += TAMA_INV_MASS * l * ny;
    endSim.tamaPosition[2] += TAMA_INV_MASS * l * nz;
    addRotation(endSim.tamaQuaternion, TAMA_INV_INERTIA * l * lever[0], TAMA_INV_INERTIA * l * lever[1], TAMA_INV_INERTIA * l * lever[2]);
  },
};

function solveString(sim: StringSim) {
  endSim = sim;
  solveChain(sim, tamaEnd);
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
  let spikeContact = false;
  spikeOnShell.depth = 0;
  for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
    for (let solve = 0; solve < STRING_SOLVES; solve += 1) solveString(sim);

    // String against the ken and the ball.
    for (let i = 1; i < PARTICLES; i += 1) {
      const a = i * 3;
      sim.touching[i] = 0;
      if (collideWithKen(sim.kenPosition, sim.kenQuaternion, p, a, STRING_RADIUS, contact)) {
        sim.touching[i] = 1;
        const n = contact.normal;
        sim.contactNormals.set(n, a);
        p[a] += n[0] * contact.depth;
        p[a + 1] += n[1] * contact.depth;
        p[a + 2] += n[2] * contact.depth;
        applyStringFriction(sim, a, n, contact.depth);
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
    if (collideWithKen(sim.kenPosition, sim.kenQuaternion, sim.tamaPosition, 0, TAMA.radius, contact, true)) {
      const n = contact.normal;
      sim.tamaPosition[0] += n[0] * contact.depth;
      sim.tamaPosition[1] += n[1] * contact.depth;
      sim.tamaPosition[2] += n[2] * contact.depth;
      tamaNormal.set(n);
      tamaContact = true;
    }
    if (collideSpikeWithTama(sim)) spikeContact = true;
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

  sim.tamaTouching = tamaContact || spikeContact;
  if (tamaContact) resolveTamaContactVelocity(sim, tamaNormal, h);
  else if (spikeOnShell.depth > 0) resolveTamaContactVelocity(sim, spikeOnShell.normal, h);
}

const spikeCentre = new Float64Array(3);
const shellPoint = new Float64Array(3);
/**
 * The deepest spike contact this substep on the ball's painted outside,
 * with its normal pointing out of the spike: struck there, the ball
 * bounces and rubs as it does on any wood, rather than stopping dead on
 * the tip.
 */
const spikeOnShell = { depth: 0, normal: new Float64Array(3) };
/** A contact point this close to the ball's radius is on its outside, not in its hole, */
const ON_SHELL = 0.5;
/**
 * and this far beyond the countersink's lip: a spike landing a little off
 * centre rides the lip into the hole, which friction or a bounce would stop.
 */
const LIP_ROOM = 1;

/**
 * The spike against the ball's real solid, bore and all. Each contact is
 * off the ball's centre, so it is resolved like the string's pull on the
 * ball: the correction weighs the ball's mass and its inertia about the
 * contact's lever, and turns the ball as well as moving it. That is what
 * lets a countersink or bore wall struck off-axis tip the hole into line.
 *
 * Frictionless here, so a spike slides freely into a bore. A spike that
 * strikes the outside instead is noted in `spikeOnShell` for the velocity
 * step, which gives it the bounce and friction of any wood.
 */
function collideSpikeWithTama(sim: StringSim): boolean {
  const reach = TAMA.radius + SPIKE_MAX_RADIUS;
  if (distanceToSpikeAxis(sim.kenPosition, sim.kenQuaternion, sim.tamaPosition) > reach) return false;

  const c = sim.tamaPosition;
  let touched = false;
  for (let i = 0; i < SPIKE_SPHERE_COUNT; i += 1) {
    const radius = spikeSphere(sim.kenPosition, sim.kenQuaternion, i, spikeCentre);
    // Most of the spike is out of the ball's reach; skip the profile query.
    const dx = spikeCentre[0] - c[0], dy = spikeCentre[1] - c[1], dz = spikeCentre[2] - c[2];
    if (dx * dx + dy * dy + dz * dz > (TAMA.radius + radius) ** 2) continue;
    if (!collideWithTama(c, sim.tamaQuaternion, spikeCentre, 0, radius, contact)) continue;
    touched = true;
    const n = contact.normal;
    // Lever from the ball's centre to where its surface meets the sphere.
    const rx = spikeCentre[0] - n[0] * radius - c[0];
    const ry = spikeCentre[1] - n[1] * radius - c[1];
    const rz = spikeCentre[2] - n[2] * radius - c[2];
    const tx = ry * n[2] - rz * n[1];
    const ty = rz * n[0] - rx * n[2];
    const tz = rx * n[1] - ry * n[0];
    rotateInverse(sim.tamaQuaternion, rx, ry, rz, shellPoint);
    const onShell =
      Math.hypot(shellPoint[0], shellPoint[2]) > TAMA.bevelOuterRadius + LIP_ROOM &&
      Math.hypot(shellPoint[0], shellPoint[1], shellPoint[2]) > TAMA.radius - ON_SHELL;
    if (onShell && contact.depth > spikeOnShell.depth) {
      spikeOnShell.depth = contact.depth;
      spikeOnShell.normal[0] = -n[0];
      spikeOnShell.normal[1] = -n[1];
      spikeOnShell.normal[2] = -n[2];
    }
    const lambda = contact.depth / (TAMA_INV_MASS + TAMA_INV_INERTIA * (tx * tx + ty * ty + tz * tz));
    // The ball is pushed along -n, out of the spike, at the lever r.
    c[0] -= TAMA_INV_MASS * lambda * n[0];
    c[1] -= TAMA_INV_MASS * lambda * n[1];
    c[2] -= TAMA_INV_MASS * lambda * n[2];
    addRotation(
      sim.tamaQuaternion,
      -TAMA_INV_INERTIA * lambda * tx,
      -TAMA_INV_INERTIA * lambda * ty,
      -TAMA_INV_INERTIA * lambda * tz,
    );
  }
  return touched;
}

/** The ken's pose now and one substep ago: all a surface contact needs of it. */
export type KenMotion = Pick<StringSim, 'kenPosition' | 'kenQuaternion' | 'kenPreviousPosition' | 'kenPreviousQuaternion'>;

const surfaceLocal = new Float64Array(3);
const surfaceMotion = new Float64Array(3);

/**
 * How far the ken's surface at world point `(x, y, z)` moved over the last
 * substep: the point is carried back through the ken's previous pose, so a
 * turning ken moves its rim faster than its axis, exactly as a rigid body.
 */
export function kenSurfaceDisplacement(sim: KenMotion, x: number, y: number, z: number, out: Float64Array): void {
  rotateInverse(sim.kenQuaternion, x - sim.kenPosition[0], y - sim.kenPosition[1], z - sim.kenPosition[2], surfaceLocal);
  rotate(sim.kenPreviousQuaternion, surfaceLocal[0], surfaceLocal[1], surfaceLocal[2], out);
  out[0] = x - (out[0] + sim.kenPreviousPosition[0]);
  out[1] = y - (out[1] + sim.kenPreviousPosition[1]);
  out[2] = z - (out[2] + sim.kenPreviousPosition[2]);
}

/**
 * Position-based Coulomb friction: the slip cancelled is at most mu times
 * the penetration just corrected, the position-level stand-in for the
 * normal force. Slip within that sticks the particle to the ken's moving
 * surface.
 */
export function applyStringFriction(sim: KenMotion & Pick<StringSim, 'positions' | 'previous'>, a: number, n: Float64Array, depth: number) {
  const p = sim.positions;
  const prev = sim.previous;
  kenSurfaceDisplacement(sim, p[a], p[a + 1], p[a + 2], surfaceMotion);
  const dx = p[a] - prev[a] - surfaceMotion[0];
  const dy = p[a + 1] - prev[a + 1] - surfaceMotion[1];
  const dz = p[a + 2] - prev[a + 2] - surfaceMotion[2];
  const normal = dx * n[0] + dy * n[1] + dz * n[2];
  const tx = dx - normal * n[0];
  const ty = dy - normal * n[1];
  const tz = dz - normal * n[2];
  const slip = Math.hypot(tx, ty, tz);
  if (slip < 1e-12) return;
  const share = Math.min(1, (STRING_FRICTION * depth) / slip);
  prev[a] += share * tx;
  prev[a + 1] += share * ty;
  prev[a + 2] += share * tz;
}

/**
 * Bounce and friction for the ball against the ken, at the contact point.
 *
 * Slip is the ball's surface velocity there, its centre's velocity plus
 * spin × lever, relative to the ken's surface, so a moving or tilting cup
 * carries the ball. Friction acts at that point, so it changes the ball's
 * spin as well as its speed: a ball rolls rather than slides, and one
 * seated on a rim cannot be turned by a light tug of its string without
 * the rim slipping under it.
 */
function resolveTamaContactVelocity(sim: StringSim, n: Float64Array, h: number) {
  const v = sim.tamaVelocity;
  const w = sim.tamaSpin;
  const c = sim.tamaPosition;
  // Lever from the ball's centre to its surface at the contact.
  const lx = -n[0] * TAMA.radius;
  const ly = -n[1] * TAMA.radius;
  const lz = -n[2] * TAMA.radius;
  kenSurfaceDisplacement(sim, c[0] + lx, c[1] + ly, c[2] + lz, surfaceMotion);
  const rx = v[0] + (w[1] * lz - w[2] * ly) - surfaceMotion[0] / h;
  const ry = v[1] + (w[2] * lx - w[0] * lz) - surfaceMotion[1] / h;
  const rz = v[2] + (w[0] * ly - w[1] * lx) - surfaceMotion[2] / h;
  // Spin moves the surface across the normal only, so this is the
  // centre's approach speed.
  const normalSpeed = rx * n[0] + ry * n[1] + rz * n[2];
  const tx = rx - normalSpeed * n[0];
  const ty = ry - normalSpeed * n[1];
  const tz = rz - normalSpeed * n[2];
  const slip = Math.hypot(tx, ty, tz);

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
  if (slip > 1e-6) {
    // Stopping slip at a sphere's surface takes a centre-velocity change of
    // slip / (1 + mR²/I): the rest of the slip goes as spin.
    const stops = slip * SURFACE_SHARE;
    const allowed = TAMA_FRICTION * Math.abs(normalSpeed) + GRAVITY * h * TAMA_FRICTION;
    const scale = -SURFACE_SHARE * Math.min(1, allowed / stops);
    const dvx = tx * scale, dvy = ty * scale, dvz = tz * scale;
    v[0] += dvx;
    v[1] += dvy;
    v[2] += dvz;
    // The same impulse at the lever turns the ball: Δω = I⁻¹ (r × m Δv).
    const k = TAMA_MASS * TAMA_INV_INERTIA;
    w[0] += k * (ly * dvz - lz * dvy);
    w[1] += k * (lz * dvx - lx * dvz);
    w[2] += k * (lx * dvy - ly * dvx);
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
    rememberKenPose(sim);
    for (let k = 0; k < 3; k += 1) {
      sim.kenPosition[k] = startPosition[k] + (ken.position[k] - startPosition[k]) * t;
    }
    slerpInto(startQuaternion, ken.quaternion, t, sim.kenQuaternion);
    normalizeQuat(sim.kenQuaternion);
    substep(sim, SUBSTEP);
  }
  rememberKenPose(sim);
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
    rememberKenPose(sim);
    sim.kenPosition.set(pose.position);
    sim.kenQuaternion.set(pose.quaternion);
    substep(sim, SUBSTEP);
  }
  rememberKenPose(sim);
}

function rememberKenPose(sim: StringSim) {
  sim.kenPreviousPosition.set(sim.kenPosition);
  sim.kenPreviousQuaternion.set(sim.kenQuaternion);
}

/** Whole substeps owed for `dt`, carrying the remainder in the accumulator. */
export function takeSubsteps(sim: { accumulator: number }, dt: number): number {
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
