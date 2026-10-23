// A `SyncTransportRepository<PracticeSessionRow>`-shaped adapter over
// the real `practice_sessions` table. Built directly on `supabase-js` for
// the push side (rather than wrapping `createPracticeHistoryCloudRepository`'s
// `insert`) because idempotent-retry-as-success handling is this file's own
// job; pull delegates straight to the existing repository's `list`.
//
// Structurally much simpler than `custom-trick-sync-transport.ts`:
// `practice_sessions` has no revision column and no UPDATE/DELETE grant at
// all, so there is no revision-guarded conditional-update branching, no
// `'conflict'` outcome is ever produced, and `expectedRevision` is accepted
// (part of the shared `SyncPushRequest` shape) but always ignored.

import type { SupabaseClient } from '@supabase/supabase-js';

import { createPracticeHistoryCloudRepository } from '@/features/stats/persistence/practice-history-cloud-repository';
import type {
  PracticeSessionInsert,
  PracticeSessionRow,
} from '@/features/stats/persistence/practice-history-cloud-repository';
import { isFiniteNonNegativeNumber } from '@/features/stats/persistence/practice-history-persistence';
import {
  mapNetworkError,
  mapPostgrestError,
  type CloudRepositoryError,
} from '@/shared/supabase/cloud-repository';
import type { Database } from '@/shared/supabase/database-types';
import type {
  SyncPushRequest,
  SyncTransportPushResult,
  SyncTransportRepository,
} from '@/shared/sync/transport';

function validationError(message: string): CloudRepositoryError {
  return { kind: 'validation', message };
}

// Defensive re-validation of `request.payload`: it round-tripped through
// AsyncStorage JSON, so it's treated as `unknown` at this boundary, same
// philosophy as custom-trick-sync-transport.ts's own payload validator.
// Reuses the existing persistence-layer predicate rather than re-deriving
// it, plus inline checks matching `PracticeSessionInsert`'s shape.
function validatePracticeSessionUpsertPayload(
  payload: Record<string, unknown> | null,
  userId: string,
  recordId: string,
): PracticeSessionInsert | undefined {
  if (payload === null) return undefined;

  const {
    user_id,
    id,
    trick_id,
    trick_name,
    started_at,
    completed_at,
    duration_ms,
    lace_count,
    planned_duration_ms,
    origin,
  } = payload;

  if (user_id !== userId || id !== recordId) return undefined;
  if (typeof trick_id !== 'string' || trick_id.length === 0) return undefined;
  if (typeof trick_name !== 'string' || trick_name.length === 0) return undefined;
  if (!isFiniteNonNegativeNumber(started_at) || started_at <= 0) return undefined;
  if (!isFiniteNonNegativeNumber(completed_at) || completed_at < started_at) return undefined;
  if (!isFiniteNonNegativeNumber(duration_ms) || duration_ms > completed_at - started_at) return undefined;
  if (typeof lace_count !== 'number' || !Number.isInteger(lace_count) || lace_count < 0) return undefined;
  if (
    planned_duration_ms !== null &&
    planned_duration_ms !== undefined &&
    (typeof planned_duration_ms !== 'number' || !(planned_duration_ms > 0))
  ) {
    return undefined;
  }
  if (origin !== null && origin !== undefined && origin !== 'assessment') return undefined;

  return payload as unknown as PracticeSessionInsert;
}

export function createPracticeHistorySyncTransportAdapter(
  client: SupabaseClient<Database, 'api'>,
  userId: string,
): SyncTransportRepository<PracticeSessionRow> {
  const repository = createPracticeHistoryCloudRepository(client);

  async function pushUpsert(request: SyncPushRequest): Promise<SyncTransportPushResult<PracticeSessionRow>> {
    const recordId = request.recordId;
    const input = validatePracticeSessionUpsertPayload(request.payload, userId, recordId);
    if (input === undefined) {
      return { status: 'failed', error: validationError('Malformed practice-session upsert payload.') };
    }

    try {
      const inserted = await client.from('practice_sessions').insert(input).select('*').single();
      if (!inserted.error) return { status: 'succeeded', row: inserted.data };

      if (inserted.error.code !== '23505') {
        // A genuine failure -- e.g. a still-malformed payload (23514) or a
        // misconfigured grant (42501). Surfaced plainly, parked in the
        // outbox, never silently retried into success.
        return { status: 'failed', error: mapPostgrestError(inserted.error) };
      }

      // Duplicate (user_id, id): a lost-ack retry of an insert that
      // actually landed server-side. No update grant exists at all for this
      // table, so unlike custom-tricks/profile there is no update fallback
      // -- re-fetch the existing row by (user_id, id) and treat it as a
      // success (the cloud repositories' insert-then-handle-23505 pattern,
      // adapted for a table with no update path).
      const { data: existing, error: fetchError } = await client
        .from('practice_sessions')
        .select('*')
        .eq('user_id', userId)
        .eq('id', recordId)
        .maybeSingle();
      if (fetchError) return { status: 'failed', error: mapPostgrestError(fetchError) };
      if (existing === null) {
        return {
          status: 'failed',
          error: { kind: 'unknown', message: 'Practice-session row disappeared during idempotent-retry lookup.' },
        };
      }
      return { status: 'succeeded', row: existing };
    } catch (cause) {
      return { status: 'failed', error: mapNetworkError(cause) };
    }
  }

  return {
    // Delegates directly -- `list`'s existing return shape is already
    // structurally identical to `SyncTransportPullResult`, so no
    // reimplementation is needed.
    async pull(request) {
      return repository.list(request) as unknown as ReturnType<
        SyncTransportRepository<PracticeSessionRow>['pull']
      >;
    },

    async push(request) {
      if (request.operationType === 'delete') {
        // Never emitted by this domain's diff (there is no local delete for
        // practice history at all) -- handled defensively since the shared
        // `push(request: SyncPushRequest)` signature can't statically rule
        // it out. This is the client-side half of "reject attempted remote
        // mutation": practice-session records are immutable by design, and
        // the table itself has no DELETE grant either.
        return {
          status: 'failed',
          error: validationError('practice-history records are immutable; delete is not supported.'),
        };
      }
      return pushUpsert(request);
    },
  };
}
