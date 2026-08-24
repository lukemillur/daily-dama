// T157.7: proves `goal-sync-transport.ts`'s revision-guarded, idempotent,
// tombstone-aware push/pull semantics against a real, running local
// Postgrest/Supabase stack -- not just the hand-written fake transport used
// by `use-goal-domain-sync.test.tsx`. Built the same way
// `t157_5_custom_trick_sync_transport.test.mjs` / `t157_6_practice_history_sync_transport.test.mjs`
// are: `supabase-js` directly, a real confirmed/signed-in user, run under
// plain `node --test` via `yarn test:data-api`.
//
// The domain-specific case beyond every prior domain in this chain: `goals`
// deletion is a soft-delete UPDATE (no DELETE grant at all), and the
// mutation trigger unconditionally rejects any further UPDATE against an
// already-tombstoned row with a 23514 that's otherwise ambiguous with a
// genuine CHECK-constraint violation. Tests 5 and 6 below are the
// adapter-level proof of the same "even a revision-matching mutation is
// rejected" case `supabase/tests/t155_4_goals_and_notes.test.sql` already
// proves at the raw SQL layer.

import { register } from 'node:module';
import { before, after, describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { createClient } from '@supabase/supabase-js';

import { getLocalConfig, createConfirmedUser, deleteUser } from './lib/local-supabase.mjs';

register(new URL('./lib/alias-loader.mjs', import.meta.url));

const { createGoalSyncTransportAdapter } = await import('@/features/goals/persistence/goal-sync-transport');
const { createGoalCloudRepository } = await import('@/features/goals/persistence/goal-cloud-repository');

const PASSWORD = 'tencharacters';

describe('T157.7 goal sync transport against the real local stack', () => {
  let config;
  let userId;
  let client;
  let repository;
  let transport;

  before(async () => {
    config = getLocalConfig();
    const email = `t157-7-goal-sync-${Date.now()}@example.com`;
    userId = await createConfirmedUser(config, email, PASSWORD);

    client = createClient(config.apiUrl, config.anonKey, {
      db: { schema: 'api' },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: signInError } = await client.auth.signInWithPassword({ email, password: PASSWORD });
    assert.equal(signInError, null, `signInWithPassword failed: ${signInError?.message}`);

    repository = createGoalCloudRepository(client);
    transport = createGoalSyncTransportAdapter(client, userId);
  });

  after(async () => {
    await deleteUser(config, userId);
  });

  test('idempotent retry of a first-ever goal create (lost ack) does not duplicate the row', async () => {
    const payload = {
      user_id: userId,
      id: 't157-7-create-idempotent',
      trick_id: 'lighthouse',
      trick_name: 'Lighthouse',
      kind: 'count',
      target_count: 50,
      target_ms: null,
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
    assert.equal(second.row.target_count, 50);
    // The fallback path is a real UPDATE (same accepted limitation as
    // custom-trick-sync-transport.ts's own 23505 fallback: an unconditional
    // overwrite, not a revision-guarded no-op), so the mutation trigger
    // still bumps revision on this retry -- the guarantee this test proves
    // is "no duplicate row", not "no revision movement".
    assert.equal(second.row.revision, 2);

    const page = await repository.list({ limit: 100 });
    assert.equal(page.status, 'succeeded');
    const matching = page.page.items.filter((row) => row.id === payload.id);
    assert.equal(matching.length, 1, 'the retry must not have duplicated the goal row');
  });

  test('idempotent retry of a goal delete succeeds both times', async () => {
    const goalId = 't157-7-delete-retry';
    const created = await repository.insert({
      user_id: userId,
      id: goalId,
      trick_id: 'lighthouse',
      trick_name: 'Lighthouse',
      kind: 'count',
      target_count: 10,
      target_ms: null,
    });
    assert.equal(created.status, 'succeeded');

    const first = await transport.push({
      operationId: 'op-delete-1',
      recordId: goalId,
      operationType: 'delete',
      payload: null,
      expectedRevision: created.value.revision,
    });
    assert.equal(first.status, 'succeeded', `first delete failed: ${JSON.stringify(first)}`);

    const second = await transport.push({
      operationId: 'op-delete-1',
      recordId: goalId,
      operationType: 'delete',
      payload: null,
      expectedRevision: created.value.revision,
    });
    assert.equal(second.status, 'succeeded', `retry delete failed: ${JSON.stringify(second)}`);

    const page = await repository.list({ limit: 100 });
    assert.equal(page.status, 'succeeded');
    const row = page.page.items.find((item) => item.id === goalId);
    assert.ok(row, 'the tombstoned row must still be visible to list() (no hard delete)');
    assert.ok(row.deleted_at, 'the row must be tombstoned');
  });

  test('deleting a goal that was never created server-side succeeds as a no-op with a fabricated row', async () => {
    const result = await transport.push({
      operationId: 'op-delete-never-created',
      recordId: 't157-7-never-created',
      operationType: 'delete',
      payload: null,
      expectedRevision: null,
    });
    assert.equal(result.status, 'succeeded', `expected a no-op success, got: ${JSON.stringify(result)}`);
  });

  test('revision-guarded edit with a stale expectedRevision returns conflict and leaves the target untouched', async () => {
    const goalId = 't157-7-conflict-edit';
    const created = await repository.insert({
      user_id: userId,
      id: goalId,
      trick_id: 'lighthouse',
      trick_name: 'Lighthouse',
      kind: 'count',
      target_count: 10,
      target_ms: null,
    });
    assert.equal(created.status, 'succeeded');
    const staleRevision = created.value.revision;

    // A concurrent write from elsewhere (e.g. a second device) bumps the
    // server revision out from under this push -- done via a raw update
    // against the target column extended grant, same client/user.
    const { data: concurrent, error: concurrentError } = await client
      .from('goals')
      .update({ target_count: 20 })
      .eq('user_id', userId)
      .eq('id', goalId)
      .select('*')
      .single();
    assert.equal(concurrentError, null, `concurrent update failed: ${concurrentError?.message}`);
    assert.ok(concurrent.revision > staleRevision);

    const rejected = await transport.push({
      operationId: 'op-conflict-edit-1',
      recordId: goalId,
      operationType: 'upsert',
      payload: {
        user_id: userId,
        id: goalId,
        trick_id: 'lighthouse',
        trick_name: 'Lighthouse',
        kind: 'count',
        target_count: 30,
        target_ms: null,
      },
      expectedRevision: staleRevision,
    });
    assert.equal(rejected.status, 'conflict', `expected a conflict, got: ${JSON.stringify(rejected)}`);
    assert.equal(rejected.conflict.expectedRevision, staleRevision);
    assert.equal(rejected.conflict.serverRevision, concurrent.revision);

    const page = await repository.list({ limit: 100 });
    assert.equal(page.status, 'succeeded');
    const row = page.page.items.find((item) => item.id === goalId);
    assert.equal(row.target_count, 20, 'the rejected push must not have changed the target');
    assert.equal(row.revision, concurrent.revision);
  });

  test('a delete pushed against an already-tombstoned goal (at the tombstone\'s own revision) succeeds, idempotent', async () => {
    const goalId = 't157-7-tombstone-then-delete';
    const created = await repository.insert({
      user_id: userId,
      id: goalId,
      trick_id: 'lighthouse',
      trick_name: 'Lighthouse',
      kind: 'count',
      target_count: 10,
      target_ms: null,
    });
    assert.equal(created.status, 'succeeded');

    // Tombstone directly via the plain repository (not the sync transport).
    const tombstoned = await repository.update(goalId, { deleted_at: new Date().toISOString() });
    assert.equal(tombstoned.status, 'succeeded');
    const tombstoneRevision = tombstoned.value.revision;

    const result = await transport.push({
      operationId: 'op-delete-tombstoned-1',
      recordId: goalId,
      operationType: 'delete',
      payload: null,
      expectedRevision: tombstoneRevision,
    });
    assert.equal(result.status, 'succeeded', `expected idempotent success, got: ${JSON.stringify(result)}`);
  });

  test('an edit pushed against an already-tombstoned goal (at the tombstone\'s own revision) returns conflict, not failed', async () => {
    const goalId = 't157-7-tombstone-then-edit';
    const created = await repository.insert({
      user_id: userId,
      id: goalId,
      trick_id: 'lighthouse',
      trick_name: 'Lighthouse',
      kind: 'count',
      target_count: 10,
      target_ms: null,
    });
    assert.equal(created.status, 'succeeded');

    const tombstoned = await repository.update(goalId, { deleted_at: new Date().toISOString() });
    assert.equal(tombstoned.status, 'succeeded');
    const tombstoneRevision = tombstoned.value.revision;

    const result = await transport.push({
      operationId: 'op-edit-tombstoned-1',
      recordId: goalId,
      operationType: 'upsert',
      payload: {
        user_id: userId,
        id: goalId,
        trick_id: 'lighthouse',
        trick_name: 'Lighthouse',
        kind: 'count',
        target_count: 99,
        target_ms: null,
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
    const activeId = 't157-7-pull-active';
    const tombstonedId = 't157-7-pull-tombstoned';

    const active = await repository.insert({
      user_id: userId,
      id: activeId,
      trick_id: 'lighthouse',
      trick_name: 'Lighthouse',
      kind: 'count',
      target_count: 10,
      target_ms: null,
    });
    assert.equal(active.status, 'succeeded');

    const toTombstone = await repository.insert({
      user_id: userId,
      id: tombstonedId,
      trick_id: 'big-cup',
      trick_name: 'Big cup',
      kind: 'time',
      target_count: null,
      target_ms: 600000,
    });
    assert.equal(toTombstone.status, 'succeeded');
    const tombstoned = await repository.update(tombstonedId, { deleted_at: new Date().toISOString() });
    assert.equal(tombstoned.status, 'succeeded');

    const pulled = await transport.pull({ limit: 100 });
    assert.equal(pulled.status, 'succeeded', `pull failed: ${JSON.stringify(pulled)}`);
    assert.ok(pulled.page.items.some((row) => row.id === activeId && row.deleted_at === null));
    assert.ok(pulled.page.items.some((row) => row.id === tombstonedId && row.deleted_at !== null));
  });
});
