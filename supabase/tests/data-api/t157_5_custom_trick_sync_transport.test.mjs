// T157.5: proves `custom-trick-sync-transport.ts`'s revision-guarded,
// idempotent push/pull semantics against a real, running local
// Postgrest/Supabase stack -- not just the hand-written fake transport used
// by `use-custom-trick-domain-sync.test.tsx`. Built the same way
// `t157_4_profile_sync_transport.test.mjs` is: `supabase-js` directly, a
// real confirmed/signed-in user, run under plain `node --test` via
// `yarn test:data-api`.

import { register } from 'node:module';
import { before, after, describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { createClient } from '@supabase/supabase-js';

import { getLocalConfig, createConfirmedUser, deleteUser } from './lib/local-supabase.mjs';

register(new URL('./lib/alias-loader.mjs', import.meta.url));

const { createCustomTrickSyncTransportAdapter } = await import(
  '@/features/custom-tricks/persistence/custom-trick-sync-transport'
);
const { createCustomTrickCloudRepository } = await import(
  '@/features/custom-tricks/persistence/custom-trick-cloud-repository'
);

const PASSWORD = 'tencharacters';

describe('T157.5 custom-trick sync transport against the real local stack', () => {
  let config;
  let userId;
  let client;
  let repository;
  let transport;

  before(async () => {
    config = getLocalConfig();
    const email = `t157-5-custom-trick-sync-${Date.now()}@example.com`;
    userId = await createConfirmedUser(config, email, PASSWORD);

    client = createClient(config.apiUrl, config.anonKey, {
      db: { schema: 'api' },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: signInError } = await client.auth.signInWithPassword({ email, password: PASSWORD });
    assert.equal(signInError, null, `signInWithPassword failed: ${signInError?.message}`);

    repository = createCustomTrickCloudRepository(client);
    transport = createCustomTrickSyncTransportAdapter(client, userId);
  });

  after(async () => {
    await deleteUser(config, userId);
  });

  test('idempotent retry of a standalone-trick upsert (lost ack) does not duplicate the row', async () => {
    const payload = {
      user_id: userId,
      id: 't157-5-standalone-1',
      kind: 'standalone',
      name: 'Lighthouse variant',
      kentei_rank: 4,
      steps: null,
    };

    const first = await transport.push({
      operationId: 'op-standalone-1',
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
      operationId: 'op-standalone-1',
      recordId: payload.id,
      operationType: 'upsert',
      payload,
      expectedRevision: null,
    });
    assert.equal(second.status, 'succeeded', `retry push failed: ${JSON.stringify(second)}`);
    assert.equal(second.row.name, 'Lighthouse variant');

    const page = await repository.list({ limit: 100 });
    assert.equal(page.status, 'succeeded');
    const matching = page.page.items.filter((row) => row.id === payload.id);
    assert.equal(matching.length, 1, 'the retry must not have duplicated the custom-trick row');
  });

  test('idempotent retry of a sequence-trick upsert round-trips steps correctly and does not duplicate', async () => {
    const payload = {
      user_id: userId,
      id: 't157-5-sequence-1',
      kind: 'sequence',
      name: 'Combo one',
      kentei_rank: null,
      steps: [
        { kind: 'existingTrick', sourceTrickId: 'big-cup', name: 'Big cup' },
        { kind: 'customText', name: 'Freehand spike' },
      ],
    };

    const first = await transport.push({
      operationId: 'op-sequence-1',
      recordId: payload.id,
      operationType: 'upsert',
      payload,
      expectedRevision: null,
    });
    assert.equal(first.status, 'succeeded', `first push failed: ${JSON.stringify(first)}`);
    assert.deepEqual(first.row.steps, payload.steps);

    const second = await transport.push({
      operationId: 'op-sequence-1',
      recordId: payload.id,
      operationType: 'upsert',
      payload,
      expectedRevision: null,
    });
    assert.equal(second.status, 'succeeded', `retry push failed: ${JSON.stringify(second)}`);
    assert.deepEqual(second.row.steps, payload.steps);

    const page = await repository.list({ limit: 100 });
    assert.equal(page.status, 'succeeded');
    const matching = page.page.items.filter((row) => row.id === payload.id);
    assert.equal(matching.length, 1, 'the retry must not have duplicated the sequence row');
  });

  test('revision-guarded update returns conflict on a stale expectedRevision and leaves the row untouched', async () => {
    const trickId = 't157-5-conflict-1';
    const created = await repository.upsert({
      user_id: userId,
      id: trickId,
      kind: 'standalone',
      name: 'Original',
      kentei_rank: null,
      steps: null,
    });
    assert.equal(created.status, 'succeeded');
    const staleRevision = created.value.revision;

    // A concurrent write from elsewhere (e.g. another device) bumps the
    // server revision out from under this push.
    const concurrent = await repository.upsert({
      user_id: userId,
      id: trickId,
      kind: 'standalone',
      name: 'Concurrent edit',
      kentei_rank: null,
      steps: null,
    });
    assert.equal(concurrent.status, 'succeeded');
    assert.ok(concurrent.value.revision > staleRevision);

    const rejected = await transport.push({
      operationId: 'op-conflict-1',
      recordId: trickId,
      operationType: 'upsert',
      payload: { user_id: userId, id: trickId, kind: 'standalone', name: 'Stale edit', kentei_rank: null, steps: null },
      expectedRevision: staleRevision,
    });
    assert.equal(rejected.status, 'conflict', `expected a conflict, got: ${JSON.stringify(rejected)}`);
    assert.equal(rejected.conflict.expectedRevision, staleRevision);
    assert.equal(rejected.conflict.serverRevision, concurrent.value.revision);

    const page = await repository.list({ limit: 100 });
    assert.equal(page.status, 'succeeded');
    const row = page.page.items.find((item) => item.id === trickId);
    assert.equal(row.name, 'Concurrent edit', 'the rejected push must not have changed the row');
    assert.equal(row.revision, concurrent.value.revision);
  });

  test('idempotent retry of a delete succeeds both times', async () => {
    const trickId = 't157-5-delete-retry';
    const created = await repository.upsert({
      user_id: userId,
      id: trickId,
      kind: 'standalone',
      name: 'To delete',
      kentei_rank: null,
      steps: null,
    });
    assert.equal(created.status, 'succeeded');

    const first = await transport.push({
      operationId: 'op-delete-1',
      recordId: trickId,
      operationType: 'delete',
      payload: null,
      expectedRevision: created.value.revision,
    });
    assert.equal(first.status, 'succeeded', `first delete failed: ${JSON.stringify(first)}`);

    const second = await transport.push({
      operationId: 'op-delete-1',
      recordId: trickId,
      operationType: 'delete',
      payload: null,
      expectedRevision: created.value.revision,
    });
    assert.equal(second.status, 'succeeded', `retry delete failed: ${JSON.stringify(second)}`);

    const page = await repository.list({ limit: 100 });
    assert.equal(page.status, 'succeeded');
    assert.equal(
      page.page.items.some((row) => row.id === trickId),
      false,
      'the custom-trick row must be gone after either delete attempt',
    );
  });

  test('deleting a custom trick that was never created succeeds as a no-op', async () => {
    const result = await transport.push({
      operationId: 'op-delete-never-created',
      recordId: 't157-5-never-created',
      operationType: 'delete',
      payload: null,
      expectedRevision: null,
    });
    assert.equal(result.status, 'succeeded', `expected a no-op success, got: ${JSON.stringify(result)}`);
  });

  test('a sequence upsert referencing another row that is kind=sequence is rejected as failed (validation), never persisted', async () => {
    const sourceSequenceId = 't157-5-nested-source-seq';
    const seedSequence = await repository.upsert({
      user_id: userId,
      id: sourceSequenceId,
      kind: 'sequence',
      name: 'Source sequence',
      kentei_rank: null,
      steps: [
        { kind: 'customText', name: 'a' },
        { kind: 'customText', name: 'b' },
      ],
    });
    assert.equal(seedSequence.status, 'succeeded');

    const nestedId = 't157-5-nests-into-seq';
    const result = await transport.push({
      operationId: 'op-nested-1',
      recordId: nestedId,
      operationType: 'upsert',
      payload: {
        user_id: userId,
        id: nestedId,
        kind: 'sequence',
        name: 'Nests directly',
        kentei_rank: null,
        steps: [
          { kind: 'existingTrick', sourceTrickId: sourceSequenceId, name: 'Source sequence' },
          { kind: 'customText', name: 'b' },
        ],
      },
      expectedRevision: null,
    });

    assert.equal(result.status, 'failed', `expected a failed validation outcome, got: ${JSON.stringify(result)}`);
    assert.equal(result.error.kind, 'validation');

    const page = await repository.list({ limit: 100 });
    assert.equal(page.status, 'succeeded');
    assert.equal(
      page.page.items.some((row) => row.id === nestedId),
      false,
      'the malformed nested-sequence row must never have been persisted',
    );
  });

  test('pull reads back real seeded standalone and sequence rows', async () => {
    const standaloneId = 't157-5-pull-standalone';
    const sequenceId = 't157-5-pull-sequence';

    const standalone = await repository.upsert({
      user_id: userId,
      id: standaloneId,
      kind: 'standalone',
      name: 'Pull smoke standalone',
      kentei_rank: 2,
      steps: null,
    });
    assert.equal(standalone.status, 'succeeded');

    const sequence = await repository.upsert({
      user_id: userId,
      id: sequenceId,
      kind: 'sequence',
      name: 'Pull smoke sequence',
      kentei_rank: null,
      steps: [
        { kind: 'customText', name: 'a' },
        { kind: 'customText', name: 'b' },
      ],
    });
    assert.equal(sequence.status, 'succeeded');

    const pulled = await transport.pull({ limit: 100 });
    assert.equal(pulled.status, 'succeeded', `pull failed: ${JSON.stringify(pulled)}`);
    assert.ok(pulled.page.items.some((row) => row.id === standaloneId));
    assert.ok(pulled.page.items.some((row) => row.id === sequenceId));
  });
});
