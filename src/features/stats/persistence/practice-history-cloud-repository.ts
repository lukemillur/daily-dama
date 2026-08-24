// T155.9: cloud repository for the practice-history domain
// (`api.practice_sessions`, insert-only/immutable -- no update/remove method
// at all, matching the table's actual grants). Speaks only in generated row
// types (src/shared/supabase/database-types.ts) -- mapping to/from the
// local PracticeSessionRecord domain model is explicitly out of scope here
// (T155.12).

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

export type PracticeSessionRow = Database['api']['Tables']['practice_sessions']['Row'];
export type PracticeSessionInsert = TablesInsert<{ schema: 'api' }, 'practice_sessions'>;

export interface PracticeHistoryCloudRepository {
  list(request: CloudPageRequest): Promise<CloudReadResult<PracticeSessionRow>>;
  insertMany(
    rows: readonly PracticeSessionInsert[],
  ): Promise<CloudMutationResult<readonly PracticeSessionRow[]>>;
  insert(row: PracticeSessionInsert): Promise<CloudMutationResult<PracticeSessionRow>>;
}

export function createPracticeHistoryCloudRepository(
  client: SupabaseClient<Database, 'api'>,
): PracticeHistoryCloudRepository {
  return {
    // Ordered by completed_at desc, id asc -- this exact tiebreak is the
    // one supabase/tests/data-api/t155_8_pagination.test.mjs already proved
    // necessary and correct; reused as-is here.
    async list(request) {
      try {
        const offset = decodeCloudCursor(request.cursor);
        const { data, error } = await client
          .from('practice_sessions')
          .select('*')
          .order('completed_at', { ascending: false })
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

    async insertMany(rows) {
      try {
        const { data, error } = await client.from('practice_sessions').insert([...rows]).select('*');
        if (error) return { status: 'failed', error: mapPostgrestError(error) };
        return { status: 'succeeded', value: data ?? [] };
      } catch (cause) {
        return { status: 'failed', error: mapNetworkError(cause) };
      }
    },

    async insert(row) {
      const result = await this.insertMany([row]);
      if (result.status === 'failed') return result;
      const [value] = result.value;
      if (!value) {
        return {
          status: 'failed',
          error: { kind: 'unknown', message: 'Insert succeeded but returned no row.' },
        };
      }
      return { status: 'succeeded', value };
    },
  };
}
