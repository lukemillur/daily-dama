// T157.4: a `SyncTransportRepository`-shaped adapter over the real
// `profiles`/`user_trick_states` tables, built directly on `supabase-js`
// rather than wrapping `createProfileCloudRepository` -- that repository's
// `upsertProfile`/`upsertTrickState`/`deleteTrickState` methods don't (and
// per T157.3's plan, deliberately shouldn't) support revision-guarded
// conditional updates or route on operationType, which is this file's whole
// job. See `.claude/plans/T157.4.md` "The adapter" section for the full
// design and the "Key finding" section for why the DB's own unique
// constraint (not a new idempotency ledger) is what makes retries safe.

import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  ProfileRow,
  ProfileUpsertInput,
  UserTrickStateRow,
  UserTrickStateUpsertInput,
} from '@/features/profile/persistence/profile-cloud-repository';
import { createProfileCloudRepository } from '@/features/profile/persistence/profile-cloud-repository';
import {
  mapNetworkError,
  mapPostgrestError,
  type CloudPageRequest,
  type CloudRepositoryError,
} from '@/shared/supabase/cloud-repository';
import type { Database } from '@/shared/supabase/database-types';
import type {
  SyncPushRequest,
  SyncTransportPullResult,
  SyncTransportPushResult,
} from '@/shared/sync/transport';

export interface ProfileSyncTransport {
  pullProfileRow(): Promise<SyncTransportPullResult<ProfileRow>>;
  pullTrickStatePage(request: CloudPageRequest): Promise<SyncTransportPullResult<UserTrickStateRow>>;
  push(request: SyncPushRequest): Promise<SyncTransportPushResult<ProfileRow | UserTrickStateRow>>;
}

function validationError(message: string): CloudRepositoryError {
  return { kind: 'validation', message };
}

// Defensive re-validation of `request.payload`: it round-tripped through
// AsyncStorage JSON, so it's treated as `unknown` at this boundary, same
// philosophy as profile-cloud-mapping.ts's row-mapping functions. Only the
// invariant-bearing identity fields are checked here -- the rest of the
// shape was already constructed by mapUserProfileToProfileUpsertInput and
// re-deriving its full validation would duplicate that mapping layer.
function validateProfileUpsertPayload(
  payload: Record<string, unknown> | null,
  userId: string,
): ProfileUpsertInput | undefined {
  if (payload === null) return undefined;
  const { user_id, has_completed_onboarding } = payload;
  if (user_id !== userId) return undefined;
  if (typeof has_completed_onboarding !== 'boolean') return undefined;
  return payload as unknown as ProfileUpsertInput;
}

function validateTrickStateUpsertPayload(
  payload: Record<string, unknown> | null,
  userId: string,
  trickId: string,
): UserTrickStateUpsertInput | undefined {
  if (payload === null) return undefined;
  const { user_id, trick_id, is_selected, is_manually_unlocked } = payload;
  if (user_id !== userId || trick_id !== trickId) return undefined;
  if (typeof is_selected !== 'boolean' || typeof is_manually_unlocked !== 'boolean') return undefined;
  return payload as unknown as UserTrickStateUpsertInput;
}

// Synthetic placeholder for a trick-state delete that succeeded without
// ever finding a matching row (an idempotent no-op, or a retry of an
// already-applied delete). No real row exists to return, and the driver
// hook never reads timestamps/id/revision off a *delete* outcome -- on a
// successful delete it drops the trickId's cache entry outright instead of
// reading a "new revision" off this row -- so these field values are
// deliberately inert placeholders, not meaningful data. Flagged plainly so
// a future reader doesn't mistake this for a real row.
function fabricateDeletedTrickStateRow(userId: string, trickId: string): UserTrickStateRow {
  const epoch = new Date(0).toISOString();
  return {
    id: `deleted:${trickId}`,
    user_id: userId,
    trick_id: trickId,
    is_selected: false,
    is_manually_unlocked: false,
    revision: 0,
    created_at: epoch,
    updated_at: epoch,
  };
}

export function createProfileSyncTransportAdapter(
  client: SupabaseClient<Database, 'api'>,
  userId: string,
): ProfileSyncTransport {
  const repository = createProfileCloudRepository(client);

  async function pushProfileScalar(
    request: SyncPushRequest,
  ): Promise<SyncTransportPushResult<ProfileRow>> {
    if (request.operationType !== 'upsert') {
      // This domain never deletes the whole profile row -- that's account
      // deletion (T161.5), out of scope here.
      return { status: 'failed', error: validationError('The profile row can only be upserted, never deleted.') };
    }

    const input = validateProfileUpsertPayload(request.payload, userId);
    if (input === undefined) {
      return { status: 'failed', error: validationError('Malformed profile upsert payload.') };
    }

    try {
      if (request.expectedRevision === null) {
        // Deliberate, explicitly accepted limitation (matches the existing,
        // already-shipped createProfileCloudRepository().upsertProfile()
        // exactly): a device that has never pulled has no revision to
        // guard against, so this fallback path is an unconditional
        // overwrite, not a bug.
        const inserted = await client.from('profiles').insert(input).select('*').single();
        if (!inserted.error) return { status: 'succeeded', row: inserted.data };
        if (inserted.error.code !== '23505') {
          return { status: 'failed', error: mapPostgrestError(inserted.error) };
        }

        const { user_id: _userId, ...patch } = input;
        const updated = await client.from('profiles').update(patch).eq('user_id', userId).select('*').single();
        if (updated.error) return { status: 'failed', error: mapPostgrestError(updated.error) };
        return { status: 'succeeded', row: updated.data };
      }

      const { user_id: _userId, ...patch } = input;
      const updated = await client
        .from('profiles')
        .update(patch)
        .eq('user_id', userId)
        .eq('revision', request.expectedRevision)
        .select('*')
        .single();

      if (!updated.error) return { status: 'succeeded', row: updated.data };

      if (updated.error.code === 'PGRST116') {
        const current = await repository.getProfile();
        if (current.status === 'failed') return { status: 'failed', error: current.error };
        const row = current.page.items[0];
        if (row === undefined || row === null) {
          return { status: 'failed', error: { kind: 'unknown', message: 'Profile row disappeared during conflict resolution.' } };
        }
        return {
          status: 'conflict',
          conflict: {
            operationId: request.operationId,
            recordId: request.recordId,
            expectedRevision: request.expectedRevision,
            serverRevision: row.revision,
          },
        };
      }

      return { status: 'failed', error: mapPostgrestError(updated.error) };
    } catch (cause) {
      return { status: 'failed', error: mapNetworkError(cause) };
    }
  }

  async function pushTrickStateDelete(
    request: SyncPushRequest,
  ): Promise<SyncTransportPushResult<UserTrickStateRow>> {
    const trickId = request.recordId;
    try {
      let deleteQuery = client.from('user_trick_states').delete().eq('user_id', userId).eq('trick_id', trickId);
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
        // server-side (e.g. an offline select-then-deselect before ever
        // syncing). Deleting something that never existed is a success, not
        // a conflict.
        return { status: 'succeeded', row: fabricateDeletedTrickStateRow(userId, trickId) };
      }

      // Revision-guarded delete matched nothing: either the row is
      // genuinely already gone (idempotent retry of an earlier successful
      // delete) or it still exists at a different revision (a real
      // conflict).
      const { data: existing, error: fetchError } = await client
        .from('user_trick_states')
        .select('*')
        .eq('user_id', userId)
        .eq('trick_id', trickId)
        .maybeSingle();
      if (fetchError) return { status: 'failed', error: mapPostgrestError(fetchError) };

      if (existing === null) {
        return { status: 'succeeded', row: fabricateDeletedTrickStateRow(userId, trickId) };
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

  async function pushTrickStateUpsert(
    request: SyncPushRequest,
  ): Promise<SyncTransportPushResult<UserTrickStateRow>> {
    const trickId = request.recordId;
    const input = validateTrickStateUpsertPayload(request.payload, userId, trickId);
    if (input === undefined) {
      return { status: 'failed', error: validationError('Malformed trick-state upsert payload.') };
    }

    try {
      if (request.expectedRevision === null) {
        const inserted = await client.from('user_trick_states').insert(input).select('*').single();
        if (!inserted.error) return { status: 'succeeded', row: inserted.data };
        if (inserted.error.code !== '23505') {
          return { status: 'failed', error: mapPostgrestError(inserted.error) };
        }

        const patch = { is_selected: input.is_selected, is_manually_unlocked: input.is_manually_unlocked };
        const updated = await client
          .from('user_trick_states')
          .update(patch)
          .eq('user_id', userId)
          .eq('trick_id', trickId)
          .select('*')
          .single();
        if (updated.error) return { status: 'failed', error: mapPostgrestError(updated.error) };
        return { status: 'succeeded', row: updated.data };
      }

      const patch = { is_selected: input.is_selected, is_manually_unlocked: input.is_manually_unlocked };
      const updated = await client
        .from('user_trick_states')
        .update(patch)
        .eq('user_id', userId)
        .eq('trick_id', trickId)
        .eq('revision', request.expectedRevision)
        .select('*')
        .single();

      if (!updated.error) return { status: 'succeeded', row: updated.data };

      if (updated.error.code === 'PGRST116') {
        const { data: existing, error: fetchError } = await client
          .from('user_trick_states')
          .select('*')
          .eq('user_id', userId)
          .eq('trick_id', trickId)
          .maybeSingle();
        if (fetchError) return { status: 'failed', error: mapPostgrestError(fetchError) };
        if (existing === null) {
          return { status: 'failed', error: { kind: 'unknown', message: 'Trick-state row disappeared during conflict resolution.' } };
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

      return { status: 'failed', error: mapPostgrestError(updated.error) };
    } catch (cause) {
      return { status: 'failed', error: mapNetworkError(cause) };
    }
  }

  return {
    // Both pull methods delegate directly -- `getProfile`/`listTrickStates`
    // already return shapes structurally identical to
    // `SyncTransportPullResult`, so no reimplementation is needed.
    async pullProfileRow() {
      return repository.getProfile() as unknown as Promise<SyncTransportPullResult<ProfileRow>>;
    },
    async pullTrickStatePage(request) {
      return repository.listTrickStates(request) as unknown as Promise<SyncTransportPullResult<UserTrickStateRow>>;
    },

    async push(request) {
      if (request.recordId === userId) {
        return pushProfileScalar(request);
      }
      if (request.operationType === 'delete') {
        return pushTrickStateDelete(request);
      }
      return pushTrickStateUpsert(request);
    },
  };
}
