import {
  HANDLE_BODY,
  HANDLE_DISH,
  sampleProfile,
  SARADO,
  SARADO_BIG_BOWL,
  SARADO_BODY,
  SARADO_SMALL_BOWL,
  type ProfilePiece,
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
};

/** Collision resolution in mm. Finer buys nothing a 0.9mm string can feel. */
const KEEP_EVERY = 3;

function buildCollider(pieces: readonly ProfilePiece[]): LatheCollider {
  const sampled = sampleProfile(pieces);
  const kept = sampled.filter(
    (_, index) => index % KEEP_EVERY === 0 || index === sampled.length - 1,
  );

  // Close the polygon back along the axis from the last point to the first.
  const count = kept.length;
  const r = new Float64Array(count);
  const h = new Float64Array(count);
  const surface = new Uint8Array(count);
  for (const [index, [pr, ph]] of kept.entries()) {
    r[index] = pr;
    h[index] = ph;
    surface[index] = index < count - 1 ? 1 : 0;
  }

  return {
    r,
    h,
    surface,
    hMin: Math.min(...h),
    hMax: Math.max(...h),
    rMax: Math.max(...r),
  };
}

const HANDLE_COLLIDER = buildCollider([...HANDLE_DISH, ...HANDLE_BODY]);
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

  const { r, h, surface } = collider;
  const count = r.length;
  let best = Infinity;
  let bestR = 0;
  let bestH = 0;
  let inside = false;

  for (let i = 0; i < count; i += 1) {
    const j = i + 1 === count ? 0 : i + 1;
    const r0 = r[i], h0 = h[i], r1 = r[j], h1 = h[j];

    // Even-odd crossing test along +r.
    if (h0 > qh !== h1 > qh && qr < r0 + ((qh - h0) * (r1 - r0)) / (h1 - h0)) {
      inside = !inside;
    }

    if (!surface[i]) continue;
    const er = r1 - r0, eh = h1 - h0;
    const lengthSq = er * er + eh * eh;
    const t = lengthSq === 0 ? 0 : Math.min(Math.max(((qr - r0) * er + (qh - h0) * eh) / lengthSq, 0), 1);
    const cr = r0 + er * t, ch = h0 + eh * t;
    const distanceSq = (qr - cr) ** 2 + (qh - ch) ** 2;
    if (distanceSq < best) {
      best = distanceSq;
      bestR = cr;
      bestH = ch;
    }
  }

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
 */
export function collideWithKen(
  kenPosition: ReadVec,
  kenQuaternion: ReadVec,
  point: ReadVec,
  pointOffset: number,
  radius: number,
  out: KenContact,
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
    if (queryProfile(HANDLE_COLLIDER, radial, y, radius, hit)) {
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
