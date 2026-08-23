// T157.8: proves `note-sync-transport.ts`'s revision-guarded, idempotent,
// tombstone-aware push/pull semantics against a real, running local
// Postgrest/Supabase stack -- not just the hand-written fake transport used
// by `use-note-domain-sync.test.tsx`. Built the same way
// `t157_7_goal_sync_transport.test.mjs` is: `supabase-js` directly, a real
// confirmed/signed-in user, run under plain `node --test` via
// `yarn test:data-api`.
//
// `notes` shares goals' exact mutation trigger
// (`private.enforce_goal_note_mutation_invariants`): no DELETE grant at all,
// a delete pushes as an UPDATE that sets `deleted_at`, and any further
// UPDATE against an already-tombstoned row is unconditionally rejected with
// a 23514 that's otherwise ambiguous with a genuine CHECK-constraint
// violation. Tests 5 and 6 below are the adapter-level proof of the same
// "even a revision-matching mutation is rejected" case
// `supabase/tests/t155_4_goals_and_notes.test.sql` already proves at the raw
// SQL layer, mirrored for notes specifically.
//
// Test 8 is the note-specific addition: an optional `practice_session_id`
// association round-trips through push/pull unchanged, proving the
// FK-backed optional association survives sync, not just shape-validated
// locally.

import { register } from 'node:module';
import { before, after, describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { createClient } from '@supabase/supabase-js';

import { getLocalConfig, createConfirmedUser, deleteUser } from './lib/local-supabase.mjs';

register(new URL('./lib/alias-loader.mjs', import.meta.url));

const { createNoteSyncTransportAdapter } = await import('@/features/notes/persistence/note-sync-transport');
const { createNoteCloudRepository } = await import('@/features/notes/persistence/note-cloud-repository');

const PASSWORD = 'tencharacters';

describe('T157.8 note sync transport against the real local stack', () => {
  let config;
  let userId;
  let client;
  let repository;
  let transport;

  before(async () => {
    config = getLocalConfig();
    const email = `t157-8-note-sync-${Date.now()}@example.com`;
    userId = await createConfirmedUser(config, email, PASSWORD);

    client = createClient(config.apiUrl, config.anonKey, {
      db: { schema: 'api' },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: signInError } = await client.auth.signInWithPassword({ email, password: PASSWORD });
    assert.equal(signInError, null, `signInWithPassword failed: ${signInError?.message}`);

    repository = createNoteCloudRepository(client);
    transport = createNoteSyncTransportAdapter(client, userId);
  });

  after(async () => {
    await deleteUser(config, userId);
  });

  test('idempotent retry of a first-ever note create (lost ack) does not duplicate the row', async () => {
    const payload = {
      user_id: userId,
      id: 't157-8-create-idempotent',
      trick_id: 'lighthouse',
      trick_name: 'Lighthouse',
      body: 'Keep elbow tucked in.',
      practice_session_id: null,
    };

    const first = await transport.push({
      operationId: 'op-create-1',
      recordId: payload.id,
      operationType: 'upsert',
      payload,
      expectedRevision: null,
    });
    assert.equal(first.status, 'succeeded', `first push failed: ${JSON.stringify(first)}`);
    assert.equal(first.row.revision, 1);

    // Simulate a lost ack: the caller retries the same operation, still
    // believing it has never observed a revision.
    const second = await transport.push({
      operationId: 'op-create-1',
      recordId: payload.id,
      operationType: 'upsert',
      payload,
      expectedRevision: null,
    });
    assert.equal(second.status, 'succeeded', `retry push failed: ${JSON.stringify(second)}`);
    assert.equal(second.row.body, 'Keep elbow tucked in.');
    // The fallback path is a real UPDATE (unconditional overwrite, not a
    // revision-guarded no-op), so the mutation trigger still bumps revision
    // on this retry -- the guarantee this test proves is "no duplicate
    // row", not "no revision movement".
    assert.equal(second.row.revision, 2);

    const page = await repository.list({ limit: 100 });
    assert.equal(page.status, 'succeeded');
    const matching = page.page.items.filter((row) => row.id === payload.id);
    assert.equal(matching.length, 1, 'the retry must not have duplicated the note row');
  });

  test('idempotent retry of a note delete succeeds both times', async () => {
    const noteId = 't157-8-delete-retry';
    const created = await repository.insert({
      user_id: userId,
      id: noteId,
      trick_id: 'lighthouse',
      trick_name: 'Lighthouse',
      body: 'Landed it clean.',
      practice_session_id: null,
    });
    assert.equal(created.status, 'succeeded');

    const first = await transport.push({
      operationId: 'op-delete-1',
      recordId: noteId,
      operationType: 'delete',
      payload: null,
      expectedRevision: created.value.revision,
    });
    assert.equal(first.status, 'succeeded', `first delete failed: ${JSON.stringify(first)}`);

    const second = await transport.push({
      operationId: 'op-delete-1',
      recordId: noteId,
      operationType: 'delete',
      payload: null,
      expectedRevision: created.value.revision,
    });
    assert.equal(second.status, 'succeeded', `retry delete failed: ${JSON.stringify(second)}`);

    const page = await repository.list({ limit: 100 });
    assert.equal(page.status, 'succeeded');
    const row = page.page.items.find((item) => item.id === noteId);
    assert.ok(row, 'the tombstoned row must still be visible to list() (no hard delete)');
    assert.ok(row.deleted_at, 'the row must be tombstoned');
  });

  test('deleting a note that was never created server-side succeeds as a no-op with a fabricated row', async () => {
    const result = await transport.push({
      operationId: 'op-delete-never-created',
      recordId: 't157-8-never-created',
      operationType: 'delete',
      payload: null,
      expectedRevision: null,
    });
    assert.equal(result.status, 'succeeded', `expected a no-op success, got: ${JSON.stringify(result)}`);
  });

  test('revision-guarded edit with a stale expectedRevision returns conflict and leaves the target untouched', async () => {
    const noteId = 't157-8-conflict-edit';
    const created = await repository.insert({
      user_id: userId,
      id: noteId,
      trick_id: 'lighthouse',
      trick_name: 'Lighthouse',
      body: 'Original body.',
      practice_session_id: null,
    });
    assert.equal(created.status, 'succeeded');
    const staleRevision = created.value.revision;

    // A concurrent write from elsewhere (e.g. a second device) bumps the
    // server revision out from under this push -- done via a raw update
    // against the target column's extended grant, same client/user.
    const { data: concurrent, error: concurrentError } = await client
      .from('notes')
      .update({ body: 'Concurrent edit.' })
      .eq('user_id', userId)
      .eq('id', noteId)
      .select('*')
      .single();
    assert.equal(concurrentError, null, `concurrent update failed: ${concurrentError?.message}`);
    assert.ok(concurrent.revision > staleRevision);

    const rejected = await transport.push({
      operationId: 'op-conflict-edit-1',
      recordId: noteId,
      operationType: 'upsert',
      payload: {
        user_id: userId,
        id: noteId,
        trick_id: 'lighthouse',
        trick_name: 'Lighthouse',
        body: 'Stale edit.',
        practice_session_id: null,
      },
      expectedRevision: staleRevision,
    });
    assert.equal(rejected.status, 'conflict', `expected a conflict, got: ${JSON.stringify(rejected)}`);
    assert.equal(rejected.conflict.expectedRevision, staleRevision);
    assert.equal(rejected.conflict.serverRevision, concurrent.revision);

    const page = await repository.list({ limit: 100 });
    assert.equal(page.status, 'succeeded');
    const row = page.page.items.find((item) => item.id === noteId);
    assert.equal(row.body, 'Concurrent edit.', 'the rejected push must not have changed the body');
    assert.equal(row.revision, concurrent.revision);
  });

  test('a delete pushed against an already-tombstoned note (at the tombstone\'s own revision) succeeds, idempotent', async () => {
    const noteId = 't157-8-tombstone-then-delete';
    const created = await repository.insert({
      user_id: userId,
      id: noteId,
      trick_id: 'lighthouse',
      trick_name: 'Lighthouse',
      body: 'Original body.',
      practice_session_id: null,
    });
    assert.equal(created.status, 'succeeded');

    // Tombstone directly via the plain repository (not the sync transport).
    const tombstoned = await repository.update(noteId, { deleted_at: new Date().toISOString() });
    assert.equal(tombstoned.status, 'succeeded');
    const tombstoneRevision = tombstoned.value.revision;

    const result = await transport.push({
      operationId: 'op-delete-tombstoned-1',
      recordId: noteId,
      operationType: 'delete',
      payload: null,
      expectedRevision: tombstoneRevision,
    });
    assert.equal(result.status, 'succeeded', `expected idempotent success, got: ${JSON.stringify(result)}`);
  });

  test('an edit pushed against an already-tombstoned note (at the tombstone\'s own revision) returns conflict, not failed', async () => {
    const noteId = 't157-8-tombstone-then-edit';
    const created = await repository.insert({
      user_id: userId,
      id: noteId,
      trick_id: 'lighthouse',
      trick_name: 'Lighthouse',
      body: 'Original body.',
      practice_session_id: null,
    });
    assert.equal(created.status, 'succeeded');

    const tombstoned = await repository.update(noteId, { deleted_at: new Date().toISOString() });
    assert.equal(tombstoned.status, 'succeeded');
    const tombstoneRevision = tombstoned.value.revision;

    const result = await transport.push({
      operationId: 'op-edit-tombstoned-1',
      recordId: noteId,
      operationType: 'upsert',
      payload: {
        user_id: userId,
        id: noteId,
        trick_id: 'lighthouse',
        trick_name: 'Lighthouse',
        body: 'Resurrection attempt.',
        practice_session_id: null,
      },
      expectedRevision: tombstoneRevision,
    });
    assert.equal(
      result.status,
      'conflict',
      `expected a conflict (stale-device resurrection attempt), got: ${JSON.stringify(result)}`,
    );
    assert.equal(result.conflict.serverRevision, tombstoneRevision);
  });

  test('pull reads back both active and tombstoned rows (not filtered)', async () => {
    const activeId = 't157-8-pull-active';
    const tombstonedId = 't157-8-pull-tombstoned';

    const active = await repository.insert({
      user_id: userId,
      id: activeId,
      trick_id: 'lighthouse',
      trick_name: 'Lighthouse',
      body: 'Active note.',
      practice_session_id: null,
    });
    assert.equal(active.status, 'succeeded');

    const toTombstone = await repository.insert({
      user_id: userId,
      id: tombstonedId,
      trick_id: 'big-cup',
      trick_name: 'Big cup',
      body: 'Will be tombstoned.',
      practice_session_id: null,
    });
    assert.equal(toTombstone.status, 'succeeded');
    const tombstoned = await repository.update(tombstonedId, { deleted_at: new Date().toISOString() });
    assert.equal(tombstoned.status, 'succeeded');

    const pulled = await transport.pull({ limit: 100 });
    assert.equal(pulled.status, 'succeeded', `pull failed: ${JSON.stringify(pulled)}`);
    assert.ok(pulled.page.items.some((row) => row.id === activeId && row.deleted_at === null));
    assert.ok(pulled.page.items.some((row) => row.id === tombstonedId && row.deleted_at !== null));
  });

  test('a note carrying a valid practice_session_id round-trips the association through push/pull unchanged', async () => {
    const sessionId = 't157-8-session-for-note';
    const { error: sessionError } = await client.from('practice_sessions').insert({
      user_id: userId,
      id: sessionId,
      trick_id: 'lighthouse',
      trick_name: 'Lighthouse',
      started_at: 1_700_000_000_000,
      completed_at: 1_700_000_060_000,
      duration_ms: 60_000,
      lace_count: 5,
    });
    assert.equal(sessionError, null, `seeding the practice session failed: ${sessionError?.message}`);

    const noteId = 't157-8-note-with-session';
    const pushed = await transport.push({
      operationId: 'op-create-with-session-1',
      recordId: noteId,
      operationType: 'upsert',
      payload: {
        user_id: userId,
        id: noteId,
        trick_id: 'lighthouse',
        trick_name: 'Lighthouse',
        body: 'Practiced this during a real sesh.',
        practice_session_id: sessionId,
      },
      expectedRevision: null,
    });
    assert.equal(pushed.status, 'succeeded', `push failed: ${JSON.stringify(pushed)}`);
    assert.equal(pushed.row.practice_session_id, sessionId);

    const pulled = await transport.pull({ limit: 100 });
    assert.equal(pulled.status, 'succeeded', `pull failed: ${JSON.stringify(pulled)}`);
    const row = pulled.page.items.find((item) => item.id === noteId);
    assert.ok(row, 'the note with a practice_session_id must round-trip through pull');
    assert.equal(row.practice_session_id, sessionId);
  });
});
