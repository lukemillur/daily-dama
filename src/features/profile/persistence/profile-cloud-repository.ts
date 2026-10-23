// Cloud repository for the profile domain (`api.profiles` +
// `api.user_trick_states`). Speaks only in generated row types
// (src/shared/supabase/database-types.ts) -- mapping to/from the local
// UserProfile domain model is explicitly out of scope here.
//
// The injected client is always already constructed and scoped to the
// `api` schema (see src/shared/supabase/supabase-client.ts); this file
// never resolves getSupabaseClient() itself, matching how local adapters
// take `storage` as a parameter rather than reaching for AsyncStorage
// themselves.

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  decodeCloudCursor,
  encodeCloudCursor,
  mapNetworkError,
  mapPostgrestError,
  type CloudMutationResult,
  type CloudPageRequest,
  type CloudReadResult,
} from '@/shared/supabase/cloud-repository';
import type { Database, TablesInsert } from '@/shared/supabase/database-types';

export type ProfileRow = Database['api']['Tables']['profiles']['Row'];
export type ProfileUpsertInput = TablesInsert<{ schema: 'api' }, 'profiles'>;
export type UserTrickStateRow = Database['api']['Tables']['user_trick_states']['Row'];
export type UserTrickStateUpsertInput = TablesInsert<{ schema: 'api' }, 'user_trick_states'>;

export interface ProfileCloudRepository {
  getProfile(): Promise<CloudReadResult<ProfileRow | null>>;
  upsertProfile(input: ProfileUpsertInput): Promise<CloudMutationResult<ProfileRow>>;
  listTrickStates(request: CloudPageRequest): Promise<CloudReadResult<UserTrickStateRow>>;
  upsertTrickState(input: UserTrickStateUpsertInput): Promise<CloudMutationResult<UserTrickStateRow>>;
  deleteTrickState(trickId: string): Promise<CloudMutationResult<{ readonly trickId: string }>>;
}

export function createProfileCloudRepository(
  client: SupabaseClient<Database, 'api'>,
): ProfileCloudRepository {
  return {
    async getProfile() {
      try {
        const { data, error } = await client.from('profiles').select('*').maybeSingle();
        if (error) return { status: 'failed', error: mapPostgrestError(error) };
        return { status: 'succeeded', page: { items: data ? [data] : [], nextCursor: null } };
      } catch (cause) {
        return { status: 'failed', error: mapNetworkError(cause) };
      }
    },

    // Not a native `.upsert()` call: the column-level grants only
    // UPDATE-grant profiles' editable fields, never `user_id` (pinned by
    // the mutation-invariant trigger). Postgrest's generated `INSERT ...
    // ON CONFLICT DO UPDATE` includes the conflict target column itself in
    // its SET clause, which a real local-stack run proved fails with 42501
    // against that narrower grant (confirmed live by
    // supabase/tests/data-api/t155_9_cloud_repositories.test.mjs -- this
    // is not a hypothetical). Insert-first, then fall back to an UPDATE
    // scoped to only the grantable columns on a real conflict (23505) is
    // the pattern that actually works against these grants.
    async upsertProfile(input) {
      try {
        const inserted = await client.from('profiles').insert(input).select('*').single();
        if (!inserted.error) return { status: 'succeeded', value: inserted.data };
        if (inserted.error.code !== '23505') {
          return { status: 'failed', error: mapPostgrestError(inserted.error) };
        }

        const { user_id: _userId, ...patch } = input;
        const updated = await client.from('profiles').update(patch).eq('user_id', input.user_id).select('*').single();
        if (updated.error) return { status: 'failed', error: mapPostgrestError(updated.error) };
        return { status: 'succeeded', value: updated.data };
      } catch (cause) {
        return { status: 'failed', error: mapNetworkError(cause) };
      }
    },

    async listTrickStates(request) {
      try {
        const offset = decodeCloudCursor(request.cursor);
        const { data, error } = await client
          .from('user_trick_states')
          .select('*')
          .order('created_at', { ascending: false })
          .order('id', { ascending: true })
          .range(offset, offset + request.limit - 1);
        if (error) return { status: 'failed', error: mapPostgrestError(error) };
        const items = data ?? [];
        const nextCursor = items.length < request.limit ? null : encodeCloudCursor(offset + items.length);
        return { status: 'succeeded', page: { items, nextCursor } };
      } catch (cause) {
        return { status: 'failed', error: mapNetworkError(cause) };
      }
    },

    // Same insert-first-then-update-on-conflict pattern as upsertProfile
    // above, for the same reason: `user_id`/`trick_id` (the conflict
    // target) are never UPDATE-granted (they are this row's identity), so a native `.upsert()` fails 42501 against a real
    // conflict.
    async upsertTrickState(input) {
      try {
        const inserted = await client.from('user_trick_states').insert(input).select('*').single();
        if (!inserted.error) return { status: 'succeeded', value: inserted.data };
        if (inserted.error.code !== '23505') {
          return { status: 'failed', error: mapPostgrestError(inserted.error) };
        }

        const patch = { is_selected: input.is_selected, is_manually_unlocked: input.is_manually_unlocked };
        const updated = await client
          .from('user_trick_states')
          .update(patch)
          .eq('user_id', input.user_id)
          .eq('trick_id', input.trick_id)
          .select('*')
          .single();
        if (updated.error) return { status: 'failed', error: mapPostgrestError(updated.error) };
        return { status: 'succeeded', value: updated.data };
      } catch (cause) {
        return { status: 'failed', error: mapNetworkError(cause) };
      }
    },

    async deleteTrickState(trickId) {
      try {
        const { error } = await client.from('user_trick_states').delete().eq('trick_id', trickId);
        if (error) return { status: 'failed', error: mapPostgrestError(error) };
        return { status: 'succeeded', value: { trickId } };
      } catch (cause) {
        return { status: 'failed', error: mapNetworkError(cause) };
      }
    },
  };
}
