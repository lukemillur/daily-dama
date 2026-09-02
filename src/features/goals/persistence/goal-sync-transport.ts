// T157.7: a `SyncTransportRepository<GoalRow>`-shaped adapter over the real
// `goals` table, built directly on `supabase-js` rather than wrapping
// `createGoalCloudRepository` -- that repository's own `update` method is
// typed to only ever patch `deleted_at` (`GoalCloudPatch`), and neither it
// nor `insert` support revision-guarded conditional updates or an
// operation-id-based idempotency mechanism, which is this file's whole job
// (same reasoning as `custom-trick-sync-transport.ts`). See
// `.claude/plans/T157.7.md` "The adapter" section for the full design.
//
// One table, no `recordId === userId` routing in `push` (every `recordId`
// here is a goal id, never the user's own uuid) -- same shape as
// `custom-trick-sync-transport.ts`.
//
// GENUINELY NEW VERSUS EVERY PRIOR DOMAIN IN THIS CHAIN: `api.goals` has no
// DELETE grant at all -- a delete pushes as an UPDATE that sets
// `deleted_at`, revision-guarded exactly like an edit. And the mutation
// trigger (`private.enforce_goal_note_mutation_invariants`) makes a
// tombstoned row's `deleted_at` terminal: ANY further UPDATE against an
// already-tombstoned row -- another delete, an edit, or an attempted
// "undelete" -- is unconditionally rejected with a 23514
// (`check_violation`), regardless of whether the WHERE clause's own
// revision filter matched. That same 23514 code is also raised by genuine
// CHECK-constraint violations (goals_count_shape/goals_time_shape/
// ambiguous-variant), which this adapter's own defensive payload
// re-validation should make unreachable in practice. `classifyGoalUpdateFailure`
// below disambiguates the two by checking the trigger's own fixed message
// text -- never by changing the trigger itself (out of scope; already
// pgTAP-tested at the DB layer).

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  isValidGoalTargetCount,
  isValidGoalTargetMinutes,
} from '@/features/goals/model/goal';
import type { GoalInsert, GoalRow } from '@/features/goals/persistence/goal-cloud-repository';
import { createGoalCloudRepository } from '@/features/goals/persistence/goal-cloud-repository';
import { isNormalizedText } from '@/features/goals/persistence/goal-persistence';
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

// The trigger's own fixed message text (private.enforce_goal_note_mutation_invariants,
// supabase/migrations/20260822201500_add_goals_and_notes.sql). Do not change
// the trigger to make this matching easier -- see the file header.
const TOMBSTONE_REJECTION_MESSAGE_FRAGMENT = 'cannot modify a tombstoned';

function validationError(message: string): CloudRepositoryError {
  return { kind: 'validation', message };
}

// Defensive re-validation of `request.payload`: it round-tripped through
// AsyncStorage JSON, so it's treated as `unknown` at this boundary, same
// philosophy as `custom-trick-sync-transport.ts`'s own payload validator.
function validateGoalUpsertPayload(
  payload: Record<string, unknown> | null,
  userId: string,
  goalId: string,
): GoalInsert | undefined {
  if (payload === null) return undefined;

  const { user_id, id, trick_id, trick_name, kind, target_count, target_ms } = payload;
  if (user_id !== userId || id !== goalId) return undefined;
  if (!isNormalizedText(trick_id) || !isNormalizedText(trick_name)) return undefined;

  if (kind === 'count') {
    if (target_ms !== null && target_ms !== undefined) return undefined;
    if (typeof target_count !== 'number' || !isValidGoalTargetCount(target_count)) return undefined;
  } else if (kind === 'time') {
    if (target_count !== null && target_count !== undefined) return undefined;
    if (
      typeof target_ms !== 'number' ||
      target_ms % 60_000 !== 0 ||
      !isValidGoalTargetMinutes(target_ms / 60_000)
    ) {
      return undefined;
    }
  } else {
    return undefined;
  }

  return payload as unknown as GoalInsert;
}

// Synthetic placeholder for a goal delete that succeeded without ever
// finding a matching row (an idempotent no-op, or a retry of an
// already-applied delete/tombstone). No real row exists to meaningfully
// return, and the driver hook never reads timestamps/revision off a
// *delete* outcome -- on a successful delete it drops the goalId's cache
// entry outright. Flagged plainly so a future reader doesn't mistake this
// for real data.
function fabricateDeletedGoalRow(userId: string, goalId: string): GoalRow {
  const epoch = new Date(0).toISOString();
  return {
    id: goalId,
    user_id: userId,
    trick_id: `deleted:${goalId}`,
    trick_name: `deleted:${goalId}`,
    kind: 'count',
    target_count: 1,
    target_ms: null,
    revision: 0,
    created_at: epoch,
    updated_at: epoch,
    deleted_at: epoch,
  };
}

function isTombstoneRejection(error: { message: string; code?: string | null }): boolean {
  return error.code === '23514' && error.message.includes(TOMBSTONE_REJECTION_MESSAGE_FRAGMENT);
}

type GoalUpdateOperationType = 'delete' | 'upsert';

/**
 * Disambiguates a 23514 (`check_violation`) raised by an `.update()` call
 * against `api.goals` -- it can mean either the tombstone-rejection trigger
 * (a legitimate, reachable race: the row is already deleted, so ANY further
 * UPDATE against it is rejected regardless of the WHERE clause's own
 * revision filter) or a genuine CHECK-constraint violation (should be
 * unreachable here thanks to `validateGoalUpsertPayload`'s defensive
 * re-validation). Also handles `PGRST116` (0 rows matched the
 * revision-guarded WHERE clause, no trigger ever fired) with the same
 * fetch-then-classify shape every prior domain already established.
 *
 * `refetch` is a caller-supplied closure (not baked in here) so this stays
 * a plain, easily-unit-testable function over already-resolved values where
 * possible, and only actually hits the network when disambiguation truly
 * requires the current row.
 */
async function classifyGoalUpdateFailure(
  error: { message: string; code?: string | null },
  refetch: () => Promise<{ data: GoalRow | null; error: { message: string; code?: string | null } | null }>,
  operationType: GoalUpdateOperationType,
  request: SyncPushRequest,
  userId: string,
  goalId: string,
): Promise<SyncTransportPushResult<GoalRow>> {
  const isPgrst116 = error.code === 'PGRST116';
  const isTombstone = isTombstoneRejection(error);

  if (!isPgrst116 && !isTombstone) {
    // A genuine CHECK-constraint violation (or any other error) -- falls
    // through to the generic classification, unchanged from every other
    // domain's posture on a real validation failure. Not a revision race;
    // the operation stays parked in the outbox.
    return { status: 'failed', error: mapPostgrestError(error) };
  }

  const { data: existing, error: fetchError } = await refetch();
  if (fetchError) return { status: 'failed', error: mapPostgrestError(fetchError) };

  if (existing === null) {
    // 0 rows matched, and the row doesn't exist at all: never created
    // server-side. Only reachable via PGRST116 (a genuine tombstone-trigger
    // rejection always means a real row exists).
    return operationType === 'delete'
      ? { status: 'succeeded', row: fabricateDeletedGoalRow(userId, goalId) }
      : {
          status: 'failed',
          error: { kind: 'unknown', message: 'Editing a goal that was never created server-side.' },
        };
  }

  if (existing.deleted_at !== null) {
    // The row is (now) tombstoned. Deleting an already-deleted goal
    // satisfies the operation's own intent -- succeeded, idempotent. An
    // edit against a tombstoned row is a genuine stale-device resurrection
    // attempt -- conflict, never silently dropped or crashed.
    return operationType === 'delete'
      ? { status: 'succeeded', row: existing }
      : {
          status: 'conflict',
          conflict: {
            operationId: request.operationId,
            recordId: goalId,
            expectedRevision: request.expectedRevision,
            serverRevision: existing.revision,
            serverRow: existing,
          },
        };
  }

  // Found, live, at a different revision: the standard conflict case for
  // both branches.
  return {
    status: 'conflict',
    conflict: {
      operationId: request.operationId,
      recordId: goalId,
      expectedRevision: request.expectedRevision,
      serverRevision: existing.revision,
      serverRow: existing,
    },
  };
}

export function createGoalSyncTransportAdapter(
  client: SupabaseClient<Database, 'api'>,
  userId: string,
): SyncTransportRepository<GoalRow> {
  const repository = createGoalCloudRepository(client);

  function refetchGoal(goalId: string) {
    return async () => {
      const { data, error } = await client
        .from('goals')
        .select('*')
        .eq('user_id', userId)
        .eq('id', goalId)
        .maybeSingle();
      return { data: data ?? null, error };
    };
  }

  async function pushDelete(request: SyncPushRequest): Promise<SyncTransportPushResult<GoalRow>> {
    const goalId = request.recordId;
    const patch = { deleted_at: new Date().toISOString() };

    try {
      let updateQuery = client.from('goals').update(patch).eq('user_id', userId).eq('id', goalId);
      if (request.expectedRevision !== null) {
        updateQuery = updateQuery.eq('revision', request.expectedRevision);
      }
      const { data, error } = await updateQuery.select('*').maybeSingle();

      if (!error) {
        if (data !== null) return { status: 'succeeded', row: data };
        // 0 rows matched.
        if (request.expectedRevision === null) {
          // Unconditional delete matched nothing: the row was never
          // created server-side. Deleting something that never existed is
          // a success, not a conflict.
          return { status: 'succeeded', row: fabricateDeletedGoalRow(userId, goalId) };
        }
        return classifyGoalUpdateFailure(
          { message: 'no rows matched', code: 'PGRST116' },
          refetchGoal(goalId),
          'delete',
          request,
          userId,
          goalId,
        );
      }

      return classifyGoalUpdateFailure(error, refetchGoal(goalId), 'delete', request, userId, goalId);
    } catch (cause) {
      return { status: 'failed', error: mapNetworkError(cause) };
    }
  }

  async function pushUpsert(request: SyncPushRequest): Promise<SyncTransportPushResult<GoalRow>> {
    const goalId = request.recordId;
    const input = validateGoalUpsertPayload(request.payload, userId, goalId);
    if (input === undefined) {
      return { status: 'failed', error: validationError('Malformed goal upsert payload.') };
    }

    // Only target_count/target_ms are UPDATE-grantable columns (T157.7) --
    // trick_id/trick_name/kind are never legitimately editable in place.
    const patch = { target_count: input.target_count, target_ms: input.target_ms };

    try {
      if (request.expectedRevision === null) {
        const inserted = await client.from('goals').insert(input).select('*').single();
        if (!inserted.error) return { status: 'succeeded', row: inserted.data };
        if (inserted.error.code !== '23505') {
          return { status: 'failed', error: mapPostgrestError(inserted.error) };
        }

        // Deliberate, explicitly accepted limitation (matches
        // custom-trick-sync-transport.ts's own first-push fallback exactly):
        // a device that has never pulled has no revision to guard against,
        // so this fallback path is an unconditional overwrite, not a bug --
        // except it must still route through classifyGoalUpdateFailure on
        // failure, since even this narrow "lost-ack create retry" can now
        // race a tombstone from elsewhere.
        const updated = await client
          .from('goals')
          .update(patch)
          .eq('user_id', userId)
          .eq('id', goalId)
          .select('*')
          .maybeSingle();
        if (!updated.error) {
          if (updated.data !== null) return { status: 'succeeded', row: updated.data };
          return classifyGoalUpdateFailure(
            { message: 'no rows matched', code: 'PGRST116' },
            refetchGoal(goalId),
            'upsert',
            request,
            userId,
            goalId,
          );
        }
        return classifyGoalUpdateFailure(updated.error, refetchGoal(goalId), 'upsert', request, userId, goalId);
      }

      const updated = await client
        .from('goals')
        .update(patch)
        .eq('user_id', userId)
        .eq('id', goalId)
        .eq('revision', request.expectedRevision)
        .select('*')
        .maybeSingle();

      if (!updated.error) {
        if (updated.data !== null) return { status: 'succeeded', row: updated.data };
        return classifyGoalUpdateFailure(
          { message: 'no rows matched', code: 'PGRST116' },
          refetchGoal(goalId),
          'upsert',
          request,
          userId,
          goalId,
        );
      }

      return classifyGoalUpdateFailure(updated.error, refetchGoal(goalId), 'upsert', request, userId, goalId);
    } catch (cause) {
      return { status: 'failed', error: mapNetworkError(cause) };
    }
  }

  return {
    // Delegates directly -- `list`'s existing return shape is already
    // structurally identical to `SyncTransportPullResult`, so no
    // reimplementation is needed. Deliberately pulls tombstoned rows too
    // (the repository's own `list` already doesn't filter them) -- the
    // driver hook's pull-composition step is what turns that into an
    // active-only `GoalCollection`.
    async pull(request) {
      return repository.list(request) as unknown as ReturnType<SyncTransportRepository<GoalRow>['pull']>;
    },

    async push(request) {
      if (request.operationType === 'delete') {
        return pushDelete(request);
      }
      return pushUpsert(request);
    },
  };
}
