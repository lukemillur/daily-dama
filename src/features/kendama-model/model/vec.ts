/**
 * Allocation-free vector and quaternion helpers over plain arrays.
 *
 * The string simulation runs hundreds of collision queries per frame, so it
 * works on `Float64Array` slots rather than three.js objects. Quaternions are
 * `[x, y, z, w]`, matching three.js.
 */
export type V3 = Float64Array | number[];
export type Q4 = Float64Array | number[];
/** Read-only input, so authored `readonly` tuples can be passed without copying. */
export type ReadVec = ArrayLike<number>;

export function rotate(q: ReadVec, x: number, y: number, z: number, out: V3, offset = 0): void {
  const qx = q[0], qy = q[1], qz = q[2], qw = q[3];
  // t = 2 * cross(q.xyz, v); v' = v + w t + cross(q.xyz, t)
  const tx = 2 * (qy * z - qz * y);
  const ty = 2 * (qz * x - qx * z);
  const tz = 2 * (qx * y - qy * x);
  out[offset] = x + qw * tx + (qy * tz - qz * ty);
  out[offset + 1] = y + qw * ty + (qz * tx - qx * tz);
  out[offset + 2] = z + qw * tz + (qx * ty - qy * tx);
}

const conjugate = new Float64Array(4);

export function rotateInverse(q: ReadVec, x: number, y: number, z: number, out: V3): void {
  conjugate[0] = -q[0];
  conjugate[1] = -q[1];
  conjugate[2] = -q[2];
  conjugate[3] = q[3];
  rotate(conjugate, x, y, z, out);
}

/** `out = a ⊗ b`. Safe when `out` aliases either input. */
export function multiply(a: ReadVec, b: ReadVec, out: Q4): void {
  const ax = a[0], ay = a[1], az = a[2], aw = a[3];
  const bx = b[0], by = b[1], bz = b[2], bw = b[3];
  out[0] = aw * bx + ax * bw + ay * bz - az * by;
  out[1] = aw * by - ax * bz + ay * bw + az * bx;
  out[2] = aw * bz + ax * by - ay * bx + az * bw;
  out[3] = aw * bw - ax * bx - ay * by - az * bz;
}

export function normalizeQuat(q: Q4): void {
  const length = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  q[0] /= length;
  q[1] /= length;
  q[2] /= length;
  q[3] /= length;
}

/** Applies a small rotation vector `θ` to `q`: q += ½ [θ, 0] ⊗ q. */
export function addRotation(q: Q4, tx: number, ty: number, tz: number): void {
  const qx = q[0], qy = q[1], qz = q[2], qw = q[3];
  q[0] += 0.5 * (tx * qw + ty * qz - tz * qy);
  q[1] += 0.5 * (ty * qw + tz * qx - tx * qz);
  q[2] += 0.5 * (tz * qw + tx * qy - ty * qx);
  q[3] += 0.5 * (-tx * qx - ty * qy - tz * qz);
  normalizeQuat(q);
}

export function slerpInto(a: ReadVec, b: ReadVec, t: number, out: Q4): void {
  let cos = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const sign = cos < 0 ? -1 : 1;
  cos *= sign;
  if (cos > 0.9995) {
    for (let i = 0; i < 4; i += 1) out[i] = a[i] + (sign * b[i] - a[i]) * t;
    normalizeQuat(out);
    return;
  }
  const angle = Math.acos(cos);
  const sa = Math.sin((1 - t) * angle) / Math.sin(angle);
  const sb = (sign * Math.sin(t * angle)) / Math.sin(angle);
  for (let i = 0; i < 4; i += 1) out[i] = a[i] * sa + b[i] * sb;
}

const relative = new Float64Array(4);

/**
 * The rotation vector (axis × angle, radians) that turns `from` into `to`
 * the short way round, in world axes: the log of `to ⊗ from⁻¹`.
 */
export function rotationBetween(from: ReadVec, to: ReadVec, out: V3): void {
  conjugate[0] = -from[0];
  conjugate[1] = -from[1];
  conjugate[2] = -from[2];
  conjugate[3] = from[3];
  multiply(to, conjugate, relative);
  // q and -q are the same rotation; the positive-w one is the short way.
  const sign = relative[3] < 0 ? -1 : 1;
  const x = sign * relative[0], y = sign * relative[1], z = sign * relative[2];
  const w = Math.min(sign * relative[3], 1);
  const sine = Math.hypot(x, y, z);
  // angle / sin(angle / 2), which tends to 2 as the rotation vanishes.
  const scale = sine < 1e-9 ? 2 : (2 * Math.atan2(sine, w)) / sine;
  out[0] = x * scale;
  out[1] = y * scale;
  out[2] = z * scale;
}
