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
 * Serializes writes so an older, slower operation can never overwrite newer
 * state. Failures are contained so subsequent writes can still proceed.
 */
export function createWriteQueue<T>(write: (value: T) => Promise<void>) {
  let pending = Promise.resolve();

  return (value: T) => {
    const result = pending.then(() => write(value));
    pending = result.catch(() => undefined);
    return result;
  };
}
