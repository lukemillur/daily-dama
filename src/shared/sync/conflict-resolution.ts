// Automatic most-recent-wins conflict resolution. Every
// domain sync driver resolves a detected write conflict inline, in the
// same push loop that discovered it, instead of parking it for a user to
// choose between in a dedicated screen.

/**
 * The single resolution rule for every mutable domain: local wins only when
 * it can PROVE it is strictly newer than the server's row. This one
 * comparison deliberately covers three cases at once:
 * - a genuine local-later write: 'local'
 * - an exact tie (e.g. two offline edits with clock skew produced the same
 *   millisecond) -- the documented deterministic tiebreak is "keep server",
 *   so ties never depend on argument order, floating point, or clock
 *   jitter to stay deterministic.
 * - an unknown/unparseable server timestamp -- keeping server is the safer
 *   default when this driver cannot establish that local is newer.
 */
export function resolveUpdatedAtConflict(
  localUpdatedAt: number,
  serverUpdatedAt: number | undefined,
): 'local' | 'server' {
  if (serverUpdatedAt === undefined) return 'server';
  return localUpdatedAt > serverUpdatedAt ? 'local' : 'server';
}

/**
 * Reads the `updated_at` string column off an untrusted conflict.serverRow
 * (row-shaped JSON already returned by the transport, not yet mapped
 * through a domain's own validator) and parses it. Returns `undefined` for
 * anything that isn't a finite-parseable string, so the caller's
 * `resolveUpdatedAtConflict` treats it identically to a genuinely-absent
 * server row.
 */
export function parseServerRowUpdatedAt(row: unknown): number | undefined {
  if (row === null || typeof row !== 'object') return undefined;
  const value = (row as Record<string, unknown>).updated_at;
  if (typeof value !== 'string') return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
