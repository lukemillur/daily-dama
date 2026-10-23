// Shared cloud-repository vocabulary. Every domain repository under
// `src/features/*/persistence/*-cloud-repository.ts` is built from these
// types and helpers, so "typed paginated reads and mutation results" is one
// vocabulary, not five ad hoc shapes. This file (and the domain repository
// files built on it) speaks only in generated row types
// (`src/shared/supabase/database-types.ts`) -- mapping to/from local domain
// models (UserProfile, CustomTrick, etc.) lives in each domain's
// `*-cloud-mapping.ts`.

export type CloudRepositoryErrorKind = 'notFound' | 'authorization' | 'validation' | 'network' | 'unknown';

export interface CloudRepositoryError {
  readonly kind: CloudRepositoryErrorKind;
  readonly message: string;
  readonly cause?: unknown;
}

export type CloudMutationResult<T> =
  | { readonly status: 'succeeded'; readonly value: T }
  | { readonly status: 'failed'; readonly error: CloudRepositoryError };

export interface CloudPage<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
}

export type CloudReadResult<T> =
  | { readonly status: 'succeeded'; readonly page: CloudPage<T> }
  | { readonly status: 'failed'; readonly error: CloudRepositoryError };

export interface CloudPageRequest {
  readonly limit: number;
  readonly cursor?: string | null;
}

/**
 * Encodes an offset-based pagination cursor as an opaque decimal string.
 * Callers must treat the result as opaque (never parse it) even though
 * today's encoding is a plain offset -- this keeps the door open to
 * switching to real keyset pagination later without an interface change.
 */
export function encodeCloudCursor(offset: number): string {
  return String(offset);
}

/**
 * Decodes an opaque cursor back into an offset. Throws on a malformed
 * cursor rather than silently falling back to 0 -- a corrupted cursor
 * should fail loudly, not silently restart pagination from the top.
 */
export function decodeCloudCursor(cursor: string | null | undefined): number {
  if (cursor === null || cursor === undefined) {
    return 0;
  }

  if (!/^\d+$/.test(cursor)) {
    throw new Error(`Malformed cloud pagination cursor: ${JSON.stringify(cursor)}`);
  }

  const offset = Number.parseInt(cursor, 10);
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new Error(`Malformed cloud pagination cursor: ${JSON.stringify(cursor)}`);
  }

  return offset;
}

/**
 * Classifies a Postgrest/Postgres error by its error code into a
 * `CloudRepositoryErrorKind`. See supabase/migrations/ for the tables that
 * raise 23514 (check constraint) / 23505 (unique constraint) violations,
 * and PostgREST's own docs for PGRST116 (no rows)/PGRST204/PGRST102.
 */
export function mapPostgrestError(
  error: { message: string; code?: string | null } | null | undefined,
): CloudRepositoryError {
  if (!error) {
    return { kind: 'unknown', message: 'Unknown Postgrest error (no error payload).' };
  }

  const code = error.code ?? undefined;

  switch (code) {
    case '42501':
      return { kind: 'authorization', message: error.message, cause: error };
    case 'PGRST116':
      return { kind: 'notFound', message: error.message, cause: error };
    case '23514':
    case '23505':
    case 'PGRST204':
    case 'PGRST102':
      return { kind: 'validation', message: error.message, cause: error };
    default:
      return { kind: 'unknown', message: error.message, cause: error };
  }
}

/** Wraps a thrown exception (fetch failure, abort, etc.) as a network error. */
export function mapNetworkError(cause: unknown): CloudRepositoryError {
  const message = cause instanceof Error ? cause.message : 'Unknown network error.';
  return { kind: 'network', message, cause };
}
