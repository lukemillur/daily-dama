export interface KeyValueStorage {
  readonly getItem: (key: string) => Promise<string | null>;
  readonly setItem: (key: string, value: string) => Promise<void>;
}

export type PersistenceLoadResult<T> =
  | { readonly status: 'loaded'; readonly value: T }
  | { readonly status: 'empty'; readonly value: T }
  | { readonly status: 'recovered'; readonly value: T; readonly error: unknown };

export type PersistenceSaveResult =
  | { readonly status: 'saved' }
  | { readonly status: 'failed'; readonly error: unknown };

/**
 * Hook-level write outcome for identity-scoped domain saves. Unlike
 * `PersistenceSaveResult`, this additionally distinguishes a write that was
 * superseded by an identity change (the disk write may have landed in the
 * correct, now-stale namespace, but the caller must not act on it) from a
 * genuine failure.
 */
export type ScopedSaveOutcome =
  | { readonly status: 'saved' }
  | { readonly status: 'failed'; readonly error: unknown }
  | { readonly status: 'superseded' };

/**
 * Serializes writes so an older, slower operation can never overwrite newer
 * state. Failures are contained so subsequent writes can still proceed. The
 * worker's resolved value is returned to its own caller so failure and
 * supersession outcomes reach the code that needs to react to them.
 */
export function createWriteQueue<T, R = void>(write: (value: T) => Promise<R>) {
  let pending: Promise<unknown> = Promise.resolve();

  return (value: T): Promise<R> => {
    const result = pending.then(() => write(value));
    pending = result.catch(() => undefined);
    return result;
  };
}
