// Cloud repository for the goals domain (`api.goals`,
// select/insert/update-only, tombstoned). Speaks only in generated row types
// (src/shared/supabase/database-types.ts) -- mapping to/from the local Goal
// domain model is explicitly out of scope here.
//
// `list` deliberately does NOT filter out tombstoned (deleted_at is not
// null) rows. The migration's whole point is that other devices need to
// observe the deletion fact during future sync; filtering belongs to
// a future sync/selector layer, not this data-access boundary. Do not "fix"
// this into a silent filter.

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
import type { Database, TablesInsert, TablesUpdate } from '@/shared/supabase/database-types';

export type GoalRow = Database['api']['Tables']['goals']['Row'];
export type GoalInsert = TablesInsert<{ schema: 'api' }, 'goals'>;
export type GoalUpdate = TablesUpdate<{ schema: 'api' }, 'goals'>;

// The column-level UPDATE grant on api.goals only covers deleted_at
// (tombstoning) -- the public patch type mirrors that exactly, so an
// attempt to patch any other column fails at compile time, not only at
// runtime with a 42501.
export type GoalCloudPatch = Pick<GoalUpdate, 'deleted_at'>;

export interface GoalCloudRepository {
  list(request: CloudPageRequest): Promise<CloudReadResult<GoalRow>>;
  insert(row: GoalInsert): Promise<CloudMutationResult<GoalRow>>;
  update(id: string, patch: GoalCloudPatch): Promise<CloudMutationResult<GoalRow>>;
}

export function createGoalCloudRepository(client: SupabaseClient<Database, 'api'>): GoalCloudRepository {
  return {
    async list(request) {
      try {
        const offset = decodeCloudCursor(request.cursor);
        const { data, error } = await client
          .from('goals')
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

    async insert(row) {
      try {
        const { data, error } = await client.from('goals').insert(row).select('*').single();
        if (error) return { status: 'failed', error: mapPostgrestError(error) };
        return { status: 'succeeded', value: data };
      } catch (cause) {
        return { status: 'failed', error: mapNetworkError(cause) };
      }
    },

    async update(id, patch) {
      try {
        const { data, error } = await client.from('goals').update(patch).eq('id', id).select('*').single();
        if (error) return { status: 'failed', error: mapPostgrestError(error) };
        return { status: 'succeeded', value: data };
      } catch (cause) {
        return { status: 'failed', error: mapNetworkError(cause) };
      }
    },
  };
}
