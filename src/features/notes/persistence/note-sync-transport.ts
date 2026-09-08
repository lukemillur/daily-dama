// T157.8: a `SyncTransportRepository<NoteRow>`-shaped adapter over the real
// `notes` table, built directly on `supabase-js` rather than wrapping
// `createNoteCloudRepository` -- that repository's own `update` method is
// typed to only ever patch `body`/`deleted_at` (`NoteCloudPatch`), and
// neither it nor `insert` support revision-guarded conditional updates or an
// operation-id-based idempotency mechanism, which is this file's whole job
// (same reasoning as `goal-sync-transport.ts`). See `.claude/plans/T157.8.md`
// "The adapter" section for the full design.
//
// One table, no `recordId === userId` routing in `push` (every `recordId`
// here is a note id, never the user's own uuid) -- same shape as
// `goal-sync-transport.ts`.
//
// SHARED WITH GOALS: `api.notes` uses the exact same mutation trigger
// (`private.enforce_goal_note_mutation_invariants`) as `api.goals` -- no
// DELETE grant at all, a delete pushes as an UPDATE that sets `deleted_at`,
// revision-guarded exactly like an edit, and any further UPDATE against an
// already-tombstoned row is unconditionally rejected with a 23514
// (`check_violation`), regardless of whether the WHERE clause's own revision
// filter matched. `classifyNoteUpdateFailure` below disambiguates that same
// 23514-vs-PGRST116-vs-genuine-CHECK-violation ambiguity
// `classifyGoalUpdateFailure` resolves for goals -- a parallel, colocated
// copy (not a shared/reused function) since the row shapes (`NoteRow` vs
// `GoalRow`) differ. Do not change the trigger itself (out of scope; already
// pgTAP-tested at the DB layer for both tables).
//
// STRUCTURAL DIFFERENCE FROM GOALS: notes' only UPDATE-grantable column is
// `body` (a single scalar), vs. goals' target_count/target_ms pair --
// simpler, not more complex. `trick_id`/`trick_name`/`practice_session_id`
// are insert-only and never part of an edit's patch.

import type { SupabaseClient } from '@supabase/supabase-js';

import type { NoteInsert, NoteRow } from '@/features/notes/persistence/note-cloud-repository';
import { createNoteCloudRepository } from '@/features/notes/persistence/note-cloud-repository';
import { isNormalizedText } from '@/features/notes/persistence/note-persistence';
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
// philosophy as `goal-sync-transport.ts`'s own payload validator.
function validateNoteUpsertPayload(
  payload: Record<string, unknown> | null,
  userId: string,
  noteId: string,
): NoteInsert | undefined {
  if (payload === null) return undefined;

  const { user_id, id, trick_id, trick_name, body, practice_session_id } = payload;
  if (user_id !== userId || id !== noteId) return undefined;
  if (!isNormalizedText(trick_id) || !isNormalizedText(trick_name) || !isNormalizedText(body)) {
    return undefined;
  }
  if (practice_session_id !== null && practice_session_id !== undefined && !isNormalizedText(practice_session_id)) {
    return undefined;
  }

  return payload as unknown as NoteInsert;
}

// Synthetic placeholder for a note delete that succeeded without ever
// finding a matching row (an idempotent no-op, or a retry of an
// already-applied delete/tombstone). No real row exists to meaningfully
// return, and the driver hook never reads timestamps/revision off a
// *delete* outcome -- on a successful delete it drops the noteId's cache
// entry outright. Flagged plainly so a future reader doesn't mistake this
// for real data.
function fabricateDeletedNoteRow(userId: string, noteId: string): NoteRow {
  const epoch = new Date(0).toISOString();
  return {
    id: noteId,
    user_id: userId,
    trick_id: `deleted:${noteId}`,
    trick_name: `deleted:${noteId}`,
    body: `deleted:${noteId}`,
    practice_session_id: null,
    revision: 0,
    created_at: epoch,
    updated_at: epoch,
    deleted_at: epoch,
  };
}

function isTombstoneRejection(error: { message: string; code?: string | null }): boolean {
  return error.code === '23514' && error.message.includes(TOMBSTONE_REJECTION_MESSAGE_FRAGMENT);
}

type NoteUpdateOperationType = 'delete' | 'upsert';

/**
 * Disambiguates a 23514 (`check_violation`) raised by an `.update()` call
 * against `api.notes` -- it can mean either the tombstone-rejection trigger
 * (a legitimate, reachable race: the row is already deleted, so ANY further
 * UPDATE against it is rejected regardless of the WHERE clause's own
 * revision filter) or a genuine CHECK-constraint violation (should be
 * unreachable here thanks to `validateNoteUpsertPayload`'s defensive
 * re-validation). Also handles `PGRST116` (0 rows matched the
 * revision-guarded WHERE clause, no trigger ever fired) with the same
 * fetch-then-classify shape every prior domain already established.
 *
 * `refetch` is a caller-supplied closure (not baked in here) so this stays
 * a plain, easily-unit-testable function over already-resolved values where
 * possible, and only actually hits the network when disambiguation truly
 * requires the current row.
 */
async function classifyNoteUpdateFailure(
  error: { message: string; code?: string | null },
  refetch: () => Promise<{ data: NoteRow | null; error: { message: string; code?: string | null } | null }>,
  operationType: NoteUpdateOperationType,
  request: SyncPushRequest,
  userId: string,
  noteId: string,
): Promise<SyncTransportPushResult<NoteRow>> {
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
      ? { status: 'succeeded', row: fabricateDeletedNoteRow(userId, noteId) }
      : {
          status: 'failed',
          error: { kind: 'unknown', message: 'Editing a note that was never created server-side.' },
        };
  }

  if (existing.deleted_at !== null) {
    // The row is (now) tombstoned. Deleting an already-deleted note
    // satisfies the operation's own intent -- succeeded, idempotent. An
    // edit against a tombstoned row is a genuine stale-device resurrection
    // attempt -- conflict, never silently dropped or crashed.
    return operationType === 'delete'
      ? { status: 'succeeded', row: existing }
      : {
          status: 'conflict',
          conflict: {
            operationId: request.operationId,
            recordId: noteId,
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
      recordId: noteId,
      expectedRevision: request.expectedRevision,
      serverRevision: existing.revision,
      serverRow: existing,
    },
  };
}

export function createNoteSyncTransportAdapter(
  client: SupabaseClient<Database, 'api'>,
  userId: string,
): SyncTransportRepository<NoteRow> {
  const repository = createNoteCloudRepository(client);

  function refetchNote(noteId: string) {
    return async () => {
      const { data, error } = await client
        .from('notes')
        .select('*')
        .eq('user_id', userId)
        .eq('id', noteId)
        .maybeSingle();
      return { data: data ?? null, error };
    };
  }

  async function pushDelete(request: SyncPushRequest): Promise<SyncTransportPushResult<NoteRow>> {
    const noteId = request.recordId;
    const patch = { deleted_at: new Date().toISOString() };

    try {
      let updateQuery = client.from('notes').update(patch).eq('user_id', userId).eq('id', noteId);
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
          return { status: 'succeeded', row: fabricateDeletedNoteRow(userId, noteId) };
        }
        return classifyNoteUpdateFailure(
          { message: 'no rows matched', code: 'PGRST116' },
          refetchNote(noteId),
          'delete',
          request,
          userId,
          noteId,
        );
      }

      return classifyNoteUpdateFailure(error, refetchNote(noteId), 'delete', request, userId, noteId);
    } catch (cause) {
      return { status: 'failed', error: mapNetworkError(cause) };
    }
  }

  async function pushUpsert(request: SyncPushRequest): Promise<SyncTransportPushResult<NoteRow>> {
    const noteId = request.recordId;
    const input = validateNoteUpsertPayload(request.payload, userId, noteId);
    if (input === undefined) {
      return { status: 'failed', error: validationError('Malformed note upsert payload.') };
    }

    // `body` is the only UPDATE-grantable column (T157.8) --
    // trick_id/trick_name/practice_session_id are never legitimately
    // editable in place.
    const patch = { body: input.body };

    try {
      if (request.expectedRevision === null) {
        const inserted = await client.from('notes').insert(input).select('*').single();
        if (!inserted.error) return { status: 'succeeded', row: inserted.data };
        if (inserted.error.code !== '23505') {
          return { status: 'failed', error: mapPostgrestError(inserted.error) };
        }

        // Deliberate, explicitly accepted limitation (matches
        // goal-sync-transport.ts's own first-push fallback exactly): a
        // device that has never pulled has no revision to guard against, so
        // this fallback path is an unconditional overwrite, not a bug --
        // except it must still route through classifyNoteUpdateFailure on
        // failure, since even this narrow "lost-ack create retry" can now
        // race a tombstone from elsewhere.
        const updated = await client
          .from('notes')
          .update(patch)
          .eq('user_id', userId)
          .eq('id', noteId)
          .select('*')
          .maybeSingle();
        if (!updated.error) {
          if (updated.data !== null) return { status: 'succeeded', row: updated.data };
          return classifyNoteUpdateFailure(
            { message: 'no rows matched', code: 'PGRST116' },
            refetchNote(noteId),
            'upsert',
            request,
            userId,
            noteId,
          );
        }
        return classifyNoteUpdateFailure(updated.error, refetchNote(noteId), 'upsert', request, userId, noteId);
      }

      const updated = await client
        .from('notes')
        .update(patch)
        .eq('user_id', userId)
        .eq('id', noteId)
        .eq('revision', request.expectedRevision)
        .select('*')
        .maybeSingle();

      if (!updated.error) {
        if (updated.data !== null) return { status: 'succeeded', row: updated.data };
        return classifyNoteUpdateFailure(
          { message: 'no rows matched', code: 'PGRST116' },
          refetchNote(noteId),
          'upsert',
          request,
          userId,
          noteId,
        );
      }

      return classifyNoteUpdateFailure(updated.error, refetchNote(noteId), 'upsert', request, userId, noteId);
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
    // active-only `NoteCollection`.
    async pull(request) {
      return repository.list(request) as unknown as ReturnType<SyncTransportRepository<NoteRow>['pull']>;
    },

    async push(request) {
      if (request.operationType === 'delete') {
        return pushDelete(request);
      }
      return pushUpsert(request);
    },
  };
}
