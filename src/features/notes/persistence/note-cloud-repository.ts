// Cloud repository for the notes domain (`api.notes`, same shape as
// goals plus editable `body`). Speaks only in generated row types
// (src/shared/supabase/database-types.ts) -- mapping to/from the local Note
// domain model is explicitly out of scope here.
//
// `list` deliberately does NOT filter out tombstoned (deleted_at is not
// null) rows -- see goal-cloud-repository.ts's comment; the same reasoning
// applies here.

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

export type NoteRow = Database['api']['Tables']['notes']['Row'];
export type NoteInsert = TablesInsert<{ schema: 'api' }, 'notes'>;
export type NoteUpdate = TablesUpdate<{ schema: 'api' }, 'notes'>;

// The column-level UPDATE grant on api.notes covers body and
// deleted_at only -- the public patch type mirrors that exactly.
export type NoteCloudPatch = Pick<NoteUpdate, 'body' | 'deleted_at'>;

export interface NoteCloudRepository {
  list(request: CloudPageRequest): Promise<CloudReadResult<NoteRow>>;
  insert(row: NoteInsert): Promise<CloudMutationResult<NoteRow>>;
  update(id: string, patch: NoteCloudPatch): Promise<CloudMutationResult<NoteRow>>;
}

export function createNoteCloudRepository(client: SupabaseClient<Database, 'api'>): NoteCloudRepository {
  return {
    async list(request) {
      try {
        const offset = decodeCloudCursor(request.cursor);
        const { data, error } = await client
          .from('notes')
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
        const { data, error } = await client.from('notes').insert(row).select('*').single();
        if (error) return { status: 'failed', error: mapPostgrestError(error) };
        return { status: 'succeeded', value: data };
      } catch (cause) {
        return { status: 'failed', error: mapNetworkError(cause) };
      }
    },

    async update(id, patch) {
      try {
        const { data, error } = await client.from('notes').update(patch).eq('id', id).select('*').single();
        if (error) return { status: 'failed', error: mapPostgrestError(error) };
        return { status: 'succeeded', value: data };
      } catch (cause) {
        return { status: 'failed', error: mapNetworkError(cause) };
      }
    },
  };
}
