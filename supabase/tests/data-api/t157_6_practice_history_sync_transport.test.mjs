// T157.6: proves `practice-history-sync-transport.ts`'s idempotent-insert,
// immutable-record semantics against a real, running local
// Postgrest/Supabase stack -- not just the hand-written fake transport used
// by `use-practice-history-domain-sync.test.tsx`. Built the same way
// `t157_5_custom_trick_sync_transport.test.mjs` is: `supabase-js` directly,
// a real confirmed/signed-in user, run under plain `node --test` via
// `yarn test:data-api`.
//
// Simpler than T157.5's file: no revision/conflict machinery exists for
// this domain at all (see `.claude/plans/T157.6.md`), so there is no
// conflict test here -- only idempotent-retry, defensive-delete-rejection,
// remote-mutation-rejection (the sync-path-specific proof beyond T155.7's
// own raw grant tests), a paused-session push (the concrete proof the
// duration CHECK-constraint fix actually unblocks this domain), pagination
// past PostgREST's 1,000-row cap through the sync transport specifically,
// and a basic pull smoke test.

import { register } from 'node:module';
import { before, after, describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { createClient } from '@supabase/supabase-js';

import { getLocalConfig, createConfirmedUser, deleteUser } from './lib/local-supabase.mjs';

register(new URL('./lib/alias-loader.mjs', import.meta.url));

const { createPracticeHistorySyncTransportAdapter } = await import(
  '@/features/stats/persistence/practice-history-sync-transport'
);
const { createPracticeHistoryCloudRepository } = await import(
  '@/features/stats/persistence/practice-history-cloud-repository'
);
const { pullAllPages } = await import('@/shared/sync/transport');

const PASSWORD = 'tencharacters';
const TOTAL_ROWS = 1200;
const PAGE_SIZE = 137;
const GROUP_SIZE = 3;
const BASE_COMPLETED_AT = 1_700_000_000_000;

/**
 * Same fixture shape as t155_8_pagination.test.mjs's `buildFixtureRows`:
 * groups of 3 sharing a `completed_at` value (so page boundaries routinely
 * fall mid-duplicate-group), a page size that doesn't evenly divide the
 * total.
 */
function buildFixtureRows(userId) {
  const rows = [];
  for (let index = 0; index < TOTAL_ROWS; index += 1) {
    const groupIndex = Math.floor(index / GROUP_SIZE);
    const completedAt = BASE_COMPLETED_AT + groupIndex * 1000;
    const startedAt = completedAt - 500;
    rows.push({
      user_id: userId,
      id: `t157-6-sess-${String(index).padStart(4, '0')}`,
      trick_id: 'lighthouse',
      trick_name: 'Lighthouse',
      started_at: startedAt,
      completed_at: completedAt,
      duration_ms: completedAt - startedAt,
      lace_count: 1,
    });
  }
  return rows;
}

describe('T157.6 practice-history sync transport against the real local stack', () => {
  let config;
  let userId;
  let client;
  let repository;
  let transport;

  before(async () => {
    config = getLocalConfig();
    const email = `t157-6-practice-history-sync-${Date.now()}@example.com`;
    userId = await createConfirmedUser(config, email, PASSWORD);

    client = createClient(config.apiUrl, config.anonKey, {
      db: { schema: 'api' },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: signInError } = await client.auth.signInWithPassword({ email, password: PASSWORD });
    assert.equal(signInError, null, `signInWithPassword failed: ${signInError?.message}`);

    repository = createPracticeHistoryCloudRepository(client);
    transport = createPracticeHistorySyncTransportAdapter(client, userId);
  });

  after(async () => {
    await deleteUser(config, userId);
  });

  test('idempotent retry of the same session upsert (simulated lost ack) does not duplicate the row', async () => {
    const payload = {
      user_id: userId,
      id: 't157-6-sess-idempotent',
      trick_id: 'lighthouse',
      trick_name: 'Lighthouse',
      started_at: 1_000_000,
      completed_at: 1_030_000,
      duration_ms: 30_000,
      lace_count: 12,
      planned_duration_ms: null,
      origin: null,
    };

    const first = await transport.push({
      operationId: 'op-idempotent-1',
      recordId: payload.id,
      operationType: 'upsert',
      payload,
      expectedRevision: null,
    });
    assert.equal(first.status, 'succeeded', `first push failed: ${JSON.stringify(first)}`);
    assert.equal(first.row.duration_ms, 30_000);

    // Simulate a lost ack: the caller retries the same operation.
    const second = await transport.push({
      operationId: 'op-idempotent-1',
      recordId: payload.id,
      operationType: 'upsert',
      payload,
      expectedRevision: null,
    });
    assert.equal(second.status, 'succeeded', `retry push failed: ${JSON.stringify(second)}`);
    assert.equal(second.row.id, payload.id);
    assert.equal(second.row.duration_ms, 30_000);

    const page = await repository.list({ limit: 100 });
    assert.equal(page.status, 'succeeded');
    const matching = page.page.items.filter((row) => row.id === payload.id);
    assert.equal(matching.length, 1, 'the retry must not have duplicated the practice-session row');
  });

  test('a push with operationType "delete" returns failed/validation without ever reaching the network', async () => {
    const recordId = 't157-6-sess-never-created';

    const result = await transport.push({
      operationId: 'op-delete-1',
      recordId,
      operationType: 'delete',
      payload: null,
      expectedRevision: null,
    });
    assert.equal(result.status, 'failed', `expected a failed outcome, got: ${JSON.stringify(result)}`);
    assert.equal(result.error.kind, 'validation');

    const page = await repository.list({ limit: 100 });
    assert.equal(page.status, 'succeeded');
    assert.equal(
      page.page.items.some((row) => row.id === recordId),
      false,
      'a defensively-rejected delete must never create a row',
    );
  });

  test('reject attempted remote mutation: a raw update/delete against a synced row fails with 42501 and the row is unchanged', async () => {
    const payload = {
      user_id: userId,
      id: 't157-6-sess-immutable',
      trick_id: 'lighthouse',
      trick_name: 'Lighthouse',
      started_at: 2_000_000,
      completed_at: 2_030_000,
      duration_ms: 30_000,
      lace_count: 7,
      planned_duration_ms: null,
      origin: null,
    };

    const pushed = await transport.push({
      operationId: 'op-immutable-1',
      recordId: payload.id,
      operationType: 'upsert',
      payload,
      expectedRevision: null,
    });
    assert.equal(pushed.status, 'succeeded', `push failed: ${JSON.stringify(pushed)}`);

    // Same authenticated client/user this transport was constructed with --
    // proves the sync adapter's own code path never accidentally routes
    // around the DB's grants (T155.7 already proves the raw Data API
    // boundary in isolation; this is the sync-path-specific proof).
    const updateResult = await client
      .from('practice_sessions')
      .update({ lace_count: 999 })
      .eq('user_id', userId)
      .eq('id', payload.id);
    assert.ok(updateResult.error, 'expected the raw update to fail');
    assert.equal(updateResult.error.code, '42501');

    const deleteResult = await client
      .from('practice_sessions')
      .delete()
      .eq('user_id', userId)
      .eq('id', payload.id);
    assert.ok(deleteResult.error, 'expected the raw delete to fail');
    assert.equal(deleteResult.error.code, '42501');

    const page = await repository.list({ limit: 100 });
    assert.equal(page.status, 'succeeded');
    const row = page.page.items.find((item) => item.id === payload.id);
    assert.ok(row, 'the row must still exist after the rejected mutation attempts');
    assert.equal(row.lace_count, 7, 'the row content must be unchanged after the rejected update attempt');
  });

  test('a paused-session payload (duration_ms < completed_at - started_at) pushes successfully', async () => {
    const payload = {
      user_id: userId,
      id: 't157-6-sess-paused',
      trick_id: 'lighthouse',
      trick_name: 'Lighthouse',
      started_at: 3_000_000,
      completed_at: 3_030_000,
      // Active practice time (20s) is strictly less than wall-clock elapsed
      // time (30s) -- the concrete, executable proof that the migration
      // fix actually unblocks this task's own exit criteria, not just the
      // pgTAP suite.
      duration_ms: 20_000,
      lace_count: 3,
      planned_duration_ms: null,
      origin: null,
    };

    const result = await transport.push({
      operationId: 'op-paused-1',
      recordId: payload.id,
      operationType: 'upsert',
      payload,
      expectedRevision: null,
    });
    assert.equal(result.status, 'succeeded', `paused-session push failed: ${JSON.stringify(result)}`);
    assert.equal(result.row.duration_ms, 20_000);
  });

  test('pull reads back real seeded rows', async () => {
    const inserted = await repository.insert({
      user_id: userId,
      id: 't157-6-sess-pull-smoke',
      trick_id: 'lighthouse',
      trick_name: 'Lighthouse',
      started_at: 4_000_000,
      completed_at: 4_030_000,
      duration_ms: 30_000,
      lace_count: 9,
      planned_duration_ms: null,
      origin: null,
    });
    assert.equal(inserted.status, 'succeeded');

    const pulled = await transport.pull({ limit: 100 });
    assert.equal(pulled.status, 'succeeded', `pull failed: ${JSON.stringify(pulled)}`);
    assert.ok(pulled.page.items.some((row) => row.id === 't157-6-sess-pull-smoke'));
  });

  test('synchronize more than 1,000 records: pullAllPages returns every row exactly once past the PostgREST page cap', async () => {
    const fixtureRows = buildFixtureRows(userId);
    const bulk = await repository.insertMany(fixtureRows);
    assert.equal(bulk.status, 'succeeded', `bulk insert failed: ${JSON.stringify(bulk)}`);

    const result = await pullAllPages(transport, { pageSize: PAGE_SIZE, startCursor: null });
    assert.equal(result.status, 'succeeded', `pullAllPages failed: ${JSON.stringify(result)}`);

    const expectedIds = new Set(fixtureRows.map((row) => row.id));
    const pulledIds = result.rows.filter((row) => expectedIds.has(row.id)).map((row) => row.id);
    assert.equal(pulledIds.length, TOTAL_ROWS, `expected exactly ${TOTAL_ROWS} fixture rows, got ${pulledIds.length}`);
    assert.deepEqual(new Set(pulledIds), expectedIds);
    assert.equal(pulledIds.length, new Set(pulledIds).size, 'a row id was duplicated across pages');
  });
});
