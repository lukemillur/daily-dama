import {
  HANDLE,
  HANDLE_BODY,
  HANDLE_DISH,
  sampleProfile,
  SARADO,
  SARADO_BIG_BOWL,
  SARADO_BODY,
  SARADO_SMALL_BOWL,
  saradoRadiusAt,
  TAMA,
  TAMA_BORE,
  TAMA_SHELL,
  type ProfilePiece,
  type ProfilePoint,
} from './anatomy';
import { rotate, rotateInverse, type ReadVec } from './vec';

/**
 * Collision against the ken, using the same lathe profiles it is rendered
 * from.
 *
 * The nearest point on a surface of revolution always lies in the meridian
 * half-plane through the query point, so the exact 3D distance to the ken is
 * a 2D distance from `(r, h)` to the profile polygon. That makes collision
 * exact to the rendered shape: a ball rests on the actual rim, and the string
 * drapes over the actual cup band, with no proxy capsules to drift from the
 * mesh.
 */
type LatheCollider = {
  r: Float64Array;
  h: Float64Array;
  /**
   * Whether edge i → i+1 is real surface. The polygon is closed along the
   * axis, and those closing edges are interior, so they must count for the
   * inside test but never as somewhere to be pushed out to.
   */
  surface: Uint8Array;
  hMin: number;
  hMax: number;
  rMax: number;
  /**
   * Edges bucketed by height, `binEdges[binStart[b]..binStart[b + 1]]` for
   * bin b, each listed in every bin its height span touches. A query only
   * needs the edges near its own height, which is a handful of the hundreds
   * in the profile.
   */
  binStart: Int32Array;
  binEdges: Int32Array;
};

/** Height of one edge bin, in mm. */
const BIN = 2;

/** Collision resolution in mm. Finer buys nothing a 0.9mm string can feel. */
const KEEP_EVERY = 3;

/**
 * `cutAt` keeps only the part below that height, capping it across with an
 * interior edge, so one shape can be split between two collision models.
 */
function buildCollider(pieces: readonly ProfilePiece[], cutAt = Infinity): LatheCollider {
  const sampled = sampleProfile(pieces);
  const kept: ProfilePoint[] = sampled.filter(
    (point, index) =>
      point[1] <= cutAt && (index % KEEP_EVERY === 0 || index === sampled.length - 1),
  );
  // Edge i joins point i to i + 1. The sampled run is surface, and so is
  // its continuation up to the cut; the cap across the cut and the edge
  // closing the polygon back along the axis are interior.
  let surfaceEdges = kept.length - 1;
  if (cutAt !== Infinity) {
    kept.push([saradoRadiusAt(cutAt, sampled), cutAt], [0, cutAt]);
    surfaceEdges += 1;
  }

  const count = kept.length;
  const r = new Float64Array(count);
  const h = new Float64Array(count);
  const surface = new Uint8Array(count);
  for (const [index, [pr, ph]] of kept.entries()) {
    r[index] = pr;
    h[index] = ph;
    surface[index] = index < surfaceEdges ? 1 : 0;
  }

  const hMin = Math.min(...h);
  const hMax = Math.max(...h);
  const bins: number[][] = Array.from({ length: Math.floor((hMax - hMin) / BIN) + 1 }, () => []);
  for (let i = 0; i < count; i += 1) {
    const j = i + 1 === count ? 0 : i + 1;
    const from = Math.floor((Math.min(h[i], h[j]) - hMin) / BIN);
    const to = Math.floor((Math.max(h[i], h[j]) - hMin) / BIN);
    for (let b = from; b <= to; b += 1) bins[b].push(i);
  }
  const binStart = new Int32Array(bins.length + 1);
  for (const [b, edges] of bins.entries()) binStart[b + 1] = binStart[b] + edges.length;

  return {
    r,
    h,
    surface,
    hMin,
    hMax,
    rMax: Math.max(...r),
    binStart,
    binEdges: Int32Array.from(bins.flat()),
  };
}

function binOf(collider: LatheCollider, height: number): number {
  const last = collider.binStart.length - 2;
  return Math.min(Math.max(Math.floor((height - collider.hMin) / BIN), 0), last);
}

/**
 * Where the spike begins, up the handle: inside the sarado's waist, so the
 * cut is hidden in wood. Above it the tama meets the spike through its bore
 * (`collideSpikeWithTama`), not as a solid ball.
 */
export const SPIKE_FROM = 100;

const HANDLE_COLLIDER = buildCollider([...HANDLE_DISH, ...HANDLE_BODY]);
const HANDLE_BELOW_SPIKE_COLLIDER = buildCollider([...HANDLE_DISH, ...HANDLE_BODY], SPIKE_FROM);
const SARADO_COLLIDER = buildCollider([...SARADO_SMALL_BOWL, ...SARADO_BODY, ...SARADO_BIG_BOWL]);

type ProfileHit = { distance: number; nr: number; nh: number };

/**
 * Signed distance from `(qr, qh)` to the profile, negative inside the wood,
 * with the outward normal in the `(r, h)` plane. Returns false when the point is
 * plainly further than `margin` from the part.
 */
function queryProfile(
  collider: LatheCollider,
  qr: number,
  qh: number,
  margin: number,
  out: ProfileHit,
): boolean {
  if (qh < collider.hMin - margin || qh > collider.hMax + margin || qr > collider.rMax + margin) {
    return false;
  }

  const { r, h, surface, binStart, binEdges } = collider;
  const count = r.length;
  nearest.best = Infinity;

  // Even-odd crossing test along +r. Only edges spanning qh can cross, and
  // they all sit in qh's own bin; each is listed there once.
  let inside = false;
  if (qh >= collider.hMin && qh <= collider.hMax) {
    const b = binOf(collider, qh);
    for (let k = binStart[b]; k < binStart[b + 1]; k += 1) {
      const i = binEdges[k];
      const j = i + 1 === count ? 0 : i + 1;
      const h0 = h[i], h1 = h[j];
      if (h0 > qh !== h1 > qh && qr < r[i] + ((qh - h0) * (r[j] - r[i])) / (h1 - h0)) inside = !inside;
    }
  }

  // Any edge within `margin` of the point lies within `margin` of its
  // height. Listing an edge in several bins only repeats a distance.
  const first = binOf(collider, qh - margin);
  const last = binOf(collider, qh + margin);
  for (let k = binStart[first]; k < binStart[last + 1]; k += 1) {
    nearestOnEdge(r, h, surface, count, binEdges[k], qr, qh, nearest);
  }
  // Deep in the wood, the nearest surface can be further than the window.
  if (inside && nearest.best > margin * margin) {
    for (let i = 0; i < count; i += 1) nearestOnEdge(r, h, surface, count, i, qr, qh, nearest);
  }
  const best = nearest.best;
  const bestR = nearest.r;
  const bestH = nearest.h;

  const distance = Math.sqrt(best);
  if (distance > margin && !inside) return false;

  const sign = inside ? -1 : 1;
  out.distance = sign * distance;
  if (distance < 1e-9) {
    out.nr = 1;
    out.nh = 0;
  } else {
    out.nr = (sign * (qr - bestR)) / distance;
    out.nh = (sign * (qh - bestH)) / distance;
  }
  return true;
}

/** The closest surface point found so far by a query; reused, as queries never nest. */
const nearest = { best: Infinity, r: 0, h: 0 };

function nearestOnEdge(
  r: Float64Array,
  h: Float64Array,
  surface: Uint8Array,
  count: number,
  i: number,
  qr: number,
  qh: number,
  nearest: { best: number; r: number; h: number },
) {
  if (!surface[i]) return;
  const j = i + 1 === count ? 0 : i + 1;
  const r0 = r[i], h0 = h[i];
  const er = r[j] - r0, eh = h[j] - h0;
  const lengthSq = er * er + eh * eh;
  const t = lengthSq === 0 ? 0 : Math.min(Math.max(((qr - r0) * er + (qh - h0) * eh) / lengthSq, 0), 1);
  const cr = r0 + er * t, ch = h0 + eh * t;
  const distanceSq = (qr - cr) ** 2 + (qh - ch) ** 2;
  if (distanceSq < nearest.best) {
    nearest.best = distanceSq;
    nearest.r = cr;
    nearest.h = ch;
  }
}

export type KenContact = {
  /** How far the sphere overlaps the wood, in mm. Positive means overlap. */
  depth: number;
  /** World-space unit normal pointing out of the wood. */
  normal: Float64Array;
};

export function createKenContact(): KenContact {
  return { depth: 0, normal: new Float64Array(3) };
}

const local = new Float64Array(3);
const localNormal = new Float64Array(3);
const hit: ProfileHit = { distance: 0, nr: 0, nh: 0 };

/**
 * Tests a sphere of `radius` at world `point` against the ken posed at
 * `kenPosition`/`kenQuaternion`. Writes the deepest overlap into `out`.
 *
 * `exceptSpike` leaves out the handle above `SPIKE_FROM`, for the tama: a
 * ball with a bore must meet the spike through `collideSpikeWithTama`, or
 * the spike would push it away instead of entering the hole.
 */
export function collideWithKen(
  kenPosition: ReadVec,
  kenQuaternion: ReadVec,
  point: ReadVec,
  pointOffset: number,
  radius: number,
  out: KenContact,
  exceptSpike = false,
): boolean {
  rotateInverse(
    kenQuaternion,
    point[pointOffset] - kenPosition[0],
    point[pointOffset + 1] - kenPosition[1],
    point[pointOffset + 2] - kenPosition[2],
    local,
  );
  let deepest = 0;

  // Handle: axis +Y through the origin.
  {
    const x = local[0], y = local[1], z = local[2];
    const radial = Math.hypot(x, z);
    const handle = exceptSpike ? HANDLE_BELOW_SPIKE_COLLIDER : HANDLE_COLLIDER;
    if (queryProfile(handle, radial, y, radius, hit)) {
      const depth = radius - hit.distance;
      if (depth > deepest) {
        deepest = depth;
        const ux = radial > 1e-9 ? x / radial : 0;
        const uz = radial > 1e-9 ? z / radial : 1;
        localNormal[0] = hit.nr * ux;
        localNormal[1] = hit.nh;
        localNormal[2] = hit.nr * uz;
      }
    }
  }

  // Sarado: axis +X through the handle at its seat height.
  {
    const x = local[0], y = local[1] - SARADO.heightOnHandle, z = local[2];
    const radial = Math.hypot(y, z);
    if (queryProfile(SARADO_COLLIDER, radial, x, radius, hit)) {
      const depth = radius - hit.distance;
      if (depth > deepest) {
        deepest = depth;
        const uy = radial > 1e-9 ? y / radial : 0;
        const uz = radial > 1e-9 ? z / radial : 1;
        localNormal[0] = hit.nh;
        localNormal[1] = hit.nr * uy;
        localNormal[2] = hit.nr * uz;
      }
    }
  }

  if (deepest <= 0) return false;
  out.depth = deepest;
  rotate(kenQuaternion, localNormal[0], localNormal[1], localNormal[2], out.normal);
  return true;
}

/**
 * The tama as the solid it is: shell, countersink, bore and string hole, a
 * lathe about its local +Y with the bore opening at -Y.
 */
const TAMA_COLLIDER = buildCollider([...TAMA_SHELL, ...TAMA_BORE]);

/**
 * Tests a sphere of `radius` at world `point` against the tama's solid.
 * The normal in `out` points out of the tama, toward the sphere.
 */
export function collideWithTama(
  tamaPosition: ReadVec,
  tamaQuaternion: ReadVec,
  point: ReadVec,
  pointOffset: number,
  radius: number,
  out: KenContact,
): boolean {
  rotateInverse(
    tamaQuaternion,
    point[pointOffset] - tamaPosition[0],
    point[pointOffset + 1] - tamaPosition[1],
    point[pointOffset + 2] - tamaPosition[2],
    local,
  );
  const x = local[0], y = local[1], z = local[2];
  const radial = Math.hypot(x, z);
  if (!queryProfile(TAMA_COLLIDER, radial, y, radius, hit)) return false;
  const depth = radius - hit.distance;
  if (depth <= 0) return false;
  const ux = radial > 1e-9 ? x / radial : 0;
  const uz = radial > 1e-9 ? z / radial : 1;
  out.depth = depth;
  rotate(tamaQuaternion, hit.nr * ux, hit.nh, hit.nr * uz, out.normal);
  return true;
}

/**
 * The spike as a chain of spheres along the handle axis, each as wide as
 * the handle where it sits. Close spacing keeps the scallops between them
 * far below the bore's clearance.
 */
const SPIKE_SPACING = 1.5;
const HANDLE_SAMPLES = sampleProfile(HANDLE_BODY);
const SPIKE_HEIGHTS: number[] = [];
const SPIKE_RADII: number[] = [];
for (let h = SPIKE_FROM; h < HANDLE.height; h += SPIKE_SPACING) {
  const r = saradoRadiusAt(h, HANDLE_SAMPLES);
  if (r < 0.5) break;
  SPIKE_HEIGHTS.push(h);
  SPIKE_RADII.push(r);
}
export const SPIKE_SPHERE_COUNT = SPIKE_HEIGHTS.length;
/** The widest spike sphere, for broad-phase rejection. */
export const SPIKE_MAX_RADIUS = Math.max(...SPIKE_RADII);

/** Writes spike sphere `index`'s world centre into `out` and returns its radius. */
export function spikeSphere(kenPosition: ReadVec, kenQuaternion: ReadVec, index: number, out: Float64Array): number {
  rotate(kenQuaternion, 0, SPIKE_HEIGHTS[index], 0, out);
  out[0] += kenPosition[0];
  out[1] += kenPosition[1];
  out[2] += kenPosition[2];
  return SPIKE_RADII[index];
}

/**
 * Distance from a world point to the spike's axis, between its base and
 * tip: anything further than the ball's radius plus the spike's cannot touch.
 */
export function distanceToSpikeAxis(kenPosition: ReadVec, kenQuaternion: ReadVec, point: ReadVec): number {
  rotateInverse(kenQuaternion, point[0] - kenPosition[0], point[1] - kenPosition[1], point[2] - kenPosition[2], local);
  const along = Math.min(Math.max(local[1], SPIKE_FROM), HANDLE.height);
  return Math.hypot(local[0], local[1] - along, local[2]);
}

/**
 * How far above the sarado's axis a spiked tama's centre comes to rest, as
 * this collision model rests it: the ball's shell on the sarado's waist.
 * The real ball sits a few mm lower, on its countersink's rim
 * (`spikedMouthRestHeight`), which the solid-sphere sarado test cannot see.
 */
export function spikedTamaRestHeight(): number {
  const contact = createKenContact();
  const point = [0, 0, 0];
  for (let h = 0; h < 80; h += 0.01) {
    point[1] = SARADO.heightOnHandle + h;
    if (!collideWithKen([0, 0, 0], [0, 0, 0, 1], point, 0, TAMA.radius, contact, true)) return h;
  }
  throw new Error('[kendama-model] a spiked tama never clears the sarado');
}
