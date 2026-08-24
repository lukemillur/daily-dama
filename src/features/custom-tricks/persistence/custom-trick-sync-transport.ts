// T157.5: a `SyncTransportRepository<CustomTrickRow>`-shaped adapter over
// the real `custom_tricks` table, built directly on `supabase-js` rather
// than wrapping `createCustomTrickCloudRepository` -- that repository's
// `upsert`/`remove` methods don't (and per T157.3's plan, deliberately
// shouldn't) support revision-guarded conditional updates or an
// operation-id-based idempotency mechanism, which is this file's whole job.
// See `.claude/plans/T157.5.md` "The adapter" section for the full design.
//
// Structurally simpler than `profile-sync-transport.ts` in the two ways
// that plan calls out: one table (so `pull` is a single method, typed
// directly as `SyncTransportRepository<CustomTrickRow>`'s own `pull`), and
// no `recordId === userId` routing in `push` (every `recordId` here is a
// `custom-<...>` trick id, never the user's own uuid).

import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  CustomTrickInsert,
  CustomTrickRow,
} from '@/features/custom-tricks/persistence/custom-trick-cloud-repository';
import { createCustomTrickCloudRepository } from '@/features/custom-tricks/persistence/custom-trick-cloud-repository';
import {
  isNormalizedText,
  isOptionalKenteiRank,
  isSequenceStep,
} from '@/features/custom-tricks/persistence/custom-trick-persistence';
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
// philosophy as profile-sync-transport.ts's own payload validators. Reuses
// the existing persistence-layer predicates rather than re-deriving them.
function validateCustomTrickUpsertPayload(
  payload: Record<string, unknown> | null,
  userId: string,
  trickId: string,
): CustomTrickInsert | undefined {
  if (payload === null) return undefined;

  const { user_id, id, kind, name, kentei_rank, steps } = payload;
  if (user_id !== userId || id !== trickId) return undefined;
  if (kind !== 'standalone' && kind !== 'sequence') return undefined;
  if (!isNormalizedText(name)) return undefined;
  if (kentei_rank !== null && !isOptionalKenteiRank(kentei_rank)) return undefined;

  if (kind === 'standalone') {
    if (steps !== null) return undefined;
  } else {
    if (!Array.isArray(steps) || steps.length < 2 || !steps.every(isSequenceStep)) return undefined;
  }

  return payload as unknown as CustomTrickInsert;
}

// Synthetic placeholder for a custom-trick delete that succeeded without
// ever finding a matching row (an idempotent no-op, or a retry of an
// already-applied delete). No real row exists to return, and the driver
// hook never reads timestamps/id/revision off a *delete* outcome -- on a
// successful delete it drops the trickId's cache entry outright instead of
// reading a "new revision" off this row -- so these field values are
// deliberately inert placeholders, not meaningful data. Flagged plainly so
// a future reader doesn't mistake this for a real row.
function fabricateDeletedCustomTrickRow(userId: string, trickId: string): CustomTrickRow {
  const epoch = new Date(0).toISOString();
  return {
    id: trickId,
    user_id: userId,
    kind: 'standalone',
    name: `deleted:${trickId}`,
    kentei_rank: null,
    steps: null,
    revision: 0,
    created_at: epoch,
    updated_at: epoch,
  };
}

export function createCustomTrickSyncTransportAdapter(
  client: SupabaseClient<Database, 'api'>,
  userId: string,
): SyncTransportRepository<CustomTrickRow> {
  const repository = createCustomTrickCloudRepository(client);

  async function pushDelete(request: SyncPushRequest): Promise<SyncTransportPushResult<CustomTrickRow>> {
    const trickId = request.recordId;
    try {
      let deleteQuery = client.from('custom_tricks').delete().eq('user_id', userId).eq('id', trickId);
      if (request.expectedRevision !== null) {
        deleteQuery = deleteQuery.eq('revision', request.expectedRevision);
      }
      const { data, error } = await deleteQuery.select('*');
      if (error) return { status: 'failed', error: mapPostgrestError(error) };

      if (data.length > 0) {
        return { status: 'succeeded', row: data[0] };
      }

      // 0 rows matched the delete filter.
      if (request.expectedRevision === null) {
        // Unconditional delete matched nothing: the row was never created
        // server-side. Deleting something that never existed is a success,
        // not a conflict.
        return { status: 'succeeded', row: fabricateDeletedCustomTrickRow(userId, trickId) };
      }

      // Revision-guarded delete matched nothing: either the row is
      // genuinely already gone (idempotent retry of an earlier successful
      // delete) or it still exists at a different revision (a real
      // conflict).
      const { data: existing, error: fetchError } = await client
        .from('custom_tricks')
        .select('*')
        .eq('user_id', userId)
        .eq('id', trickId)
        .maybeSingle();
      if (fetchError) return { status: 'failed', error: mapPostgrestError(fetchError) };

      if (existing === null) {
        return { status: 'succeeded', row: fabricateDeletedCustomTrickRow(userId, trickId) };
      }

      return {
        status: 'conflict',
        conflict: {
          operationId: request.operationId,
          recordId: trickId,
          expectedRevision: request.expectedRevision,
          serverRevision: existing.revision,
        },
      };
    } catch (cause) {
      return { status: 'failed', error: mapNetworkError(cause) };
    }
  }

  async function pushUpsert(request: SyncPushRequest): Promise<SyncTransportPushResult<CustomTrickRow>> {
    const trickId = request.recordId;
    const input = validateCustomTrickUpsertPayload(request.payload, userId, trickId);
    if (input === undefined) {
      return { status: 'failed', error: validationError('Malformed custom-trick upsert payload.') };
    }

    // Only name/kentei_rank/steps are UPDATE-grantable columns (T155.5) --
    // the same set `createCustomTrickCloudRepository().upsert()`'s
    // conflict-fallback patch uses.
    const patch = { name: input.name, kentei_rank: input.kentei_rank, steps: input.steps };

    try {
      if (request.expectedRevision === null) {
        const inserted = await client.from('custom_tricks').insert(input).select('*').single();
        if (!inserted.error) return { status: 'succeeded', row: inserted.data };
        if (inserted.error.code !== '23505') {
          return { status: 'failed', error: mapPostgrestError(inserted.error) };
        }

        // Deliberate, explicitly accepted limitation (matches
        // createCustomTrickCloudRepository().upsert() exactly): a device
        // that has never pulled has no revision to guard against, so this
        // fallback path is an unconditional overwrite, not a bug.
        const updated = await client
          .from('custom_tricks')
          .update(patch)
          .eq('user_id', userId)
          .eq('id', trickId)
          .select('*')
          .single();
        if (updated.error) return { status: 'failed', error: mapPostgrestError(updated.error) };
        return { status: 'succeeded', row: updated.data };
      }

      const updated = await client
        .from('custom_tricks')
        .update(patch)
        .eq('user_id', userId)
        .eq('id', trickId)
        .eq('revision', request.expectedRevision)
        .select('*')
        .single();

      if (!updated.error) return { status: 'succeeded', row: updated.data };

      if (updated.error.code === 'PGRST116') {
        const { data: existing, error: fetchError } = await client
          .from('custom_tricks')
          .select('*')
          .eq('user_id', userId)
          .eq('id', trickId)
          .maybeSingle();
        if (fetchError) return { status: 'failed', error: mapPostgrestError(fetchError) };
        if (existing === null) {
          return {
            status: 'failed',
            error: { kind: 'unknown', message: 'Custom-trick row disappeared during conflict resolution.' },
          };
        }
        return {
          status: 'conflict',
          conflict: {
            operationId: request.operationId,
            recordId: trickId,
            expectedRevision: request.expectedRevision,
            serverRevision: existing.revision,
          },
        };
      }

      // A genuine 23514 (nested-sequence/malformed-step check-constraint
      // violation from `private.enforce_custom_trick_step_invariants`) falls
      // through here and classifies as `{ kind: 'validation' }` via
      // mapPostgrestError -- surfaced as a plain 'failed' push outcome, not
      // special-cased into 'conflict'. This is not a revision race, it's a
      // genuinely invalid write; the operation stays parked in the outbox.
      return { status: 'failed', error: mapPostgrestError(updated.error) };
    } catch (cause) {
      return { status: 'failed', error: mapNetworkError(cause) };
    }
  }

  return {
    // Delegates directly -- `list`'s existing return shape is already
    // structurally identical to `SyncTransportPullResult`, so no
    // reimplementation is needed.
    async pull(request) {
      return repository.list(request) as unknown as ReturnType<SyncTransportRepository<CustomTrickRow>['pull']>;
    },

    async push(request) {
      if (request.operationType === 'delete') {
        return pushDelete(request);
      }
      return pushUpsert(request);
    },
  };
}
