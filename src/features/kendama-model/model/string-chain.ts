import { TAMA_MASS } from './mass';
import { STRING_LENGTH } from './stringing';

/**
 * The string as a chain of particles, pinned at one end to whichever body
 * the hand holds and tied at the other to the body that is free. The two
 * strung simulations, ken held and tama held, share this solve; what
 * differs is only which body is on the end, which `ChainEnd` describes.
 *
 * Millimetres, seconds and grams.
 */

export const PARTICLES = 20;
export const SEGMENT = STRING_LENGTH / PARTICLES;

/**
 * Per particle, so 2g of string in all, against about 1g in life.
 *
 * Light matters. A heavy string drags on the ball through its string hole,
 * off the ball's centre, so a ball flying above the hand with slack string
 * behind it gets turned over: harmless in a cup, fatal to a spike. A light
 * one is harder to solve: lumping it into a few points puts a 680:1 mass
 * ratio against the ball, where one solve per pass leaves a snapped-taut
 * string stretched by a quarter. `STRING_SOLVES` repeats the exact solve
 * to converge it; halving the mass again breaks even that.
 */
const PARTICLE_MASS = 0.1;
export const PARTICLE_INV_MASS = 1 / PARTICLE_MASS;

/** The particles and what they last touched. Particle 0 is pinned to the held body. */
export type Chain = {
  positions: Float64Array;
  /** Which particles touched a body's surface on the last collision pass. */
  touching: Uint8Array;
  /** For each touching particle, the surface's outward normal there. */
  contactNormals: Float64Array;
};

/**
 * The free body the string's last segment ends on. The solve locates the
 * attachment once, asks how heavy the body is to a pull along the last
 * segment there (mass and rotational inertia about that lever), and hands
 * back the solved pull for the body to move and turn by.
 */
export type ChainEnd = {
  readonly attach: Float64Array;
  /** Writes the attachment's world position into `attach`. */
  locate(): void;
  /** Inverse effective mass for a pull along unit `n` at `attach`. */
  weightAlong(nx: number, ny: number, nz: number): number;
  /** Applies the solved correction `lambda` along `n` at `attach`. */
  pull(lambda: number, nx: number, ny: number, nz: number): void;
};

/** One constraint per segment: particle i to i+1, and the last particle to the free body. */
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

/**
 * A particle pressed against a body solves as if heavy, most of all into
 * the wood.
 *
 * The solve does not see the wood. Where the string bends over the sarado,
 * the cheapest way to take up a stretch is to pull those light particles
 * into the wood rather than lift a 68g ball; collisions push them back out
 * and the stretch is never resolved. So along the contact normal a touching
 * particle weighs as much as the ball, as the wood behind it effectively
 * does. Along the surface it is lighter (`CONTACT_SLIDE_INV_MASS`): string
 * slides over wood, and a particle ball-heavy every way is a knot tied to
 * the ken.
 */
const CONTACT_INV_MASS = 1 / TAMA_MASS;
/**
 * Along the surface a touching particle weighs about 20g: enough to hold a
 * string draped over the sarado through the jolt of a dropped ball snapping
 * it taut (lighter, and the snap stretches it), light enough that the string
 * slides off a cup moving under it (ball-heavy, and the cup yanks the ball
 * on its string hole hard enough to spin it at 15 rad/s).
 */
export const CONTACT_SLIDE_INV_MASS = 0.05;

/**
 * `aᵀ W_k b` for particle k's inverse-mass matrix: its own weight every
 * way, or for a touching particle `CONTACT_INV_MASS` along its contact
 * normal and `CONTACT_SLIDE_INV_MASS` across it. `a` and `b` are offsets of unit vectors in `normals`.
 */
function weighted(chain: Chain, k: number, a: number, b: number): number {
  if (k === 0) return 0;
  const dot = normals[a] * normals[b] + normals[a + 1] * normals[b + 1] + normals[a + 2] * normals[b + 2];
  if (!chain.touching[k]) return PARTICLE_INV_MASS * dot;
  const W = CONTACT_SLIDE_INV_MASS;
  const c = chain.contactNormals;
  const ca = c[k * 3] * normals[a] + c[k * 3 + 1] * normals[a + 1] + c[k * 3 + 2] * normals[a + 2];
  const cb = c[k * 3] * normals[b] + c[k * 3 + 1] * normals[b + 1] + c[k * 3 + 2] * normals[b + 2];
  return W * dot + (CONTACT_INV_MASS - W) * ca * cb;
}

/**
 * Projects the whole string onto its length in one direct solve.
 *
 * A string is a chain: each segment's constraint shares a particle only
 * with its neighbours, so the system `J W Jᵀ λ = -C` is tridiagonal and
 * solves exactly in linear time. Iterating segment by segment converges
 * badly with a heavy body on a gram or two of string; the string stretches
 * by several percent and the body bounces on it like a spring.
 *
 * Taut segments are fixed-length links with a free joint at each particle;
 * clearly slack ones drop out, so spare string folds and a dropped body
 * falls free until the string snaps taut.
 *
 * The last constraint ends on the free body's string hole, off its centre,
 * so its weighting includes rotational inertia about that lever and the
 * correction turns the body as well as moving it.
 */
export function solveChain(chain: Chain, end: ChainEnd): void {
  const p = chain.positions;
  end.locate();
  const attach = end.attach;

  for (let i = 0; i < CONSTRAINTS; i += 1) {
    const a = i * 3;
    const last = i === CONSTRAINTS - 1;
    const dx = (last ? attach[0] : p[a + 3]) - p[a];
    const dy = (last ? attach[1] : p[a + 4]) - p[a + 1];
    const dz = (last ? attach[2] : p[a + 5]) - p[a + 2];
    const distance = Math.hypot(dx, dy, dz) || 1e-9;
    normals[a] = dx / distance;
    normals[a + 1] = dy / distance;
    normals[a + 2] = dz / distance;
    violation[i] = distance - SEGMENT;
    active[i] = violation[i] > -SLACK_TOLERANCE ? 1 : 0;
  }

  const last = (CONSTRAINTS - 1) * 3;
  const endWeight = end.weightAlong(normals[last], normals[last + 1], normals[last + 2]);

  for (let i = 0; i < CONSTRAINTS; i += 1) {
    if (!active[i]) {
      diagonal[i] = 1;
      upper[i] = 0;
      rhs[i] = 0;
      continue;
    }
    const own = i * 3;
    const downstream = i === CONSTRAINTS - 1 ? endWeight : weighted(chain, i + 1, own, own);
    diagonal[i] = weighted(chain, i, own, own) + downstream;
    rhs[i] = -violation[i];
    // Coupling through particle i + 1, shared with the next segment.
    const next = i + 1;
    upper[i] = next < CONSTRAINTS && active[next] ? -weighted(chain, next, own, next * 3) : 0;
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

  // Δx_k = W_k (λ_{k-1} n_{k-1} − λ_k n_k)
  const c = chain.contactNormals;
  for (let k = 1; k < PARTICLES; k += 1) {
    const a = k * 3, b = a - 3;
    const before = lambda[k - 1], after = lambda[k];
    const dx = before * normals[b] - after * normals[a];
    const dy = before * normals[b + 1] - after * normals[a + 1];
    const dz = before * normals[b + 2] - after * normals[a + 2];
    const W = chain.touching[k] ? CONTACT_SLIDE_INV_MASS : PARTICLE_INV_MASS;
    p[a] += W * dx;
    p[a + 1] += W * dy;
    p[a + 2] += W * dz;
    if (chain.touching[k]) {
      const along = (CONTACT_INV_MASS - W) * (c[a] * dx + c[a + 1] * dy + c[a + 2] * dz);
      p[a] += along * c[a];
      p[a + 1] += along * c[a + 1];
      p[a + 2] += along * c[a + 2];
    }
  }

  const l = lambda[CONSTRAINTS - 1];
  if (l !== 0) end.pull(l, normals[last], normals[last + 1], normals[last + 2]);
}

/** Spaces the particles evenly along a polyline, the first on its start. */
export function layPolyline(positions: Float64Array, points: readonly (readonly number[])[]): void {
  const lengths = points.slice(1).map((p, i) => Math.hypot(p[0] - points[i][0], p[1] - points[i][1], p[2] - points[i][2]));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  for (let i = 0; i < PARTICLES; i += 1) {
    let along = (total * i) / PARTICLES;
    let leg = 0;
    while (leg < lengths.length - 1 && along > lengths[leg]) {
      along -= lengths[leg];
      leg += 1;
    }
    const t = lengths[leg] > 0 ? along / lengths[leg] : 0;
    for (let k = 0; k < 3; k += 1) {
      positions[i * 3 + k] = points[leg][k] + (points[leg + 1][k] - points[leg][k]) * t;
    }
  }
}
