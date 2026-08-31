// A generic JSON-safe value guard, originally colocated with the (now
// removed, T187.2) manual sync-conflict machinery in
// `src/shared/sync/conflict.ts`. Kept here because
// `features/guest-import` still needs a JSON-safe snapshot type/guard for
// its own (unrelated, already-manual, already-shipped) guest-vs-account
// merge-conflict flow -- see that feature's own model for details.

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** JSON-safe values are intentional: this snapshot crosses AsyncStorage. */
export type ConflictSnapshot =
  | null
  | boolean
  | number
  | string
  | readonly ConflictSnapshot[]
  | { readonly [key: string]: ConflictSnapshot };

export function isConflictSnapshot(value: unknown): value is ConflictSnapshot {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isConflictSnapshot);
  return isRecord(value) && Object.values(value).every(isConflictSnapshot);
}
