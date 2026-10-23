// Cloud repository for the custom-tricks domain (`api.custom_tricks`,
// full CRUD). Speaks only in generated row types
// (src/shared/supabase/database-types.ts) -- mapping to/from the local
// CustomTrick domain model is explicitly out of scope here.

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

export type CustomTrickRow = Database['api']['Tables']['custom_tricks']['Row'];
export type CustomTrickInsert = TablesInsert<{ schema: 'api' }, 'custom_tricks'>;

export interface CustomTrickCloudRepository {
  list(request: CloudPageRequest): Promise<CloudReadResult<CustomTrickRow>>;
  upsert(row: CustomTrickInsert): Promise<CloudMutationResult<CustomTrickRow>>;
  remove(id: string): Promise<CloudMutationResult<{ readonly id: string }>>;
}

export function createCustomTrickCloudRepository(
  client: SupabaseClient<Database, 'api'>,
): CustomTrickCloudRepository {
  return {
    async list(request) {
      try {
        const offset = decodeCloudCursor(request.cursor);
        const { data, error } = await client
          .from('custom_tricks')
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

    // Not a native `.upsert()` call: the column-level grants only
    // UPDATE-grant name/kentei_rank/steps -- never user_id/id (the conflict
    // target, this row's identity) or kind (pinned immutable by the
    // mutation-invariant trigger). Postgrest's generated `INSERT ... ON
    // CONFLICT DO UPDATE` sets every payload column including the conflict
    // target, which a real local-stack run proved fails with 42501 against
    // that narrower grant (confirmed live by
    // supabase/tests/data-api/t155_9_cloud_repositories.test.mjs). Insert
    // first, then fall back to an UPDATE scoped to only the grantable
    // columns on a real conflict (23505).
    async upsert(row) {
      try {
        const inserted = await client.from('custom_tricks').insert(row).select('*').single();
        if (!inserted.error) return { status: 'succeeded', value: inserted.data };
        if (inserted.error.code !== '23505') {
          return { status: 'failed', error: mapPostgrestError(inserted.error) };
        }

        const patch = { name: row.name, kentei_rank: row.kentei_rank, steps: row.steps };
        const updated = await client
          .from('custom_tricks')
          .update(patch)
          .eq('user_id', row.user_id)
          .eq('id', row.id)
          .select('*')
          .single();
        if (updated.error) return { status: 'failed', error: mapPostgrestError(updated.error) };
        return { status: 'succeeded', value: updated.data };
      } catch (cause) {
        return { status: 'failed', error: mapNetworkError(cause) };
      }
    },

    async remove(id) {
      try {
        const { error } = await client.from('custom_tricks').delete().eq('id', id);
        if (error) return { status: 'failed', error: mapPostgrestError(error) };
        return { status: 'succeeded', value: { id } };
      } catch (cause) {
        return { status: 'failed', error: mapNetworkError(cause) };
      }
    },
  };
}
