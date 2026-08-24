// T157.4: proves `profile-sync-transport.ts`'s revision-guarded,
// idempotent push/pull semantics against a real, running local
// Postgrest/Supabase stack -- not just the hand-written fake transport used
// by `use-profile-domain-sync.test.tsx`. Built the same way
// `t155_9_cloud_repositories.test.mjs` is: `supabase-js` directly, a real
// confirmed/signed-in user, run under plain `node --test` via
// `yarn test:data-api`.

import { register } from 'node:module';
import { before, after, describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { createClient } from '@supabase/supabase-js';

import { getLocalConfig, createConfirmedUser, deleteUser } from './lib/local-supabase.mjs';

register(new URL('./lib/alias-loader.mjs', import.meta.url));

const { createProfileSyncTransportAdapter } = await import(
  '@/features/profile/persistence/profile-sync-transport'
);
const { createProfileCloudRepository } = await import('@/features/profile/persistence/profile-cloud-repository');

const PASSWORD = 'tencharacters';

describe('T157.4 profile sync transport against the real local stack', () => {
  let config;
  let userId;
  let client;
  let repository;
  let transport;

  before(async () => {
    config = getLocalConfig();
    const email = `t157-4-profile-sync-${Date.now()}@example.com`;
    userId = await createConfirmedUser(config, email, PASSWORD);

    client = createClient(config.apiUrl, config.anonKey, {
      db: { schema: 'api' },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: signInError } = await client.auth.signInWithPassword({ email, password: PASSWORD });
    assert.equal(signInError, null, `signInWithPassword failed: ${signInError?.message}`);

    repository = createProfileCloudRepository(client);
    transport = createProfileSyncTransportAdapter(client, userId);
  });

  after(async () => {
    await deleteUser(config, userId);
  });

  test('idempotent retry of the same profile-scalar upsert (lost ack) does not duplicate the row', async () => {
    const payload = { user_id: userId, has_completed_onboarding: true, kentei_rank: 4 };

    const first = await transport.push({
      operationId: 'op-profile-1',
      recordId: userId,
      operationType: 'upsert',
      payload,
      expectedRevision: null,
    });
    assert.equal(first.status, 'succeeded', `first push failed: ${JSON.stringify(first)}`);
    assert.equal(first.row.revision, 1);

    // Simulate a lost ack: the caller retries the same operation, still
    // believing it has never observed a revision.
    const second = await transport.push({
      operationId: 'op-profile-1',
      recordId: userId,
      operationType: 'upsert',
      payload,
      expectedRevision: null,
    });
    assert.equal(second.status, 'succeeded', `retry push failed: ${JSON.stringify(second)}`);
    assert.equal(second.row.user_id, userId);
    assert.equal(second.row.kentei_rank, 4);

    const current = await repository.getProfile();
    assert.equal(current.status, 'succeeded');
    assert.equal(current.page.items.length, 1, 'the retry must not have duplicated the profile row');
  });

  test('idempotent retry of a trick-state upsert does not duplicate the row', async () => {
    const trickId = 't157-4-trick-idempotent';
    const payload = { user_id: userId, trick_id: trickId, is_selected: true, is_manually_unlocked: false };

    const first = await transport.push({
      operationId: 'op-trick-1',
      recordId: trickId,
      operationType: 'upsert',
      payload,
      expectedRevision: null,
    });
    assert.equal(first.status, 'succeeded', `first push failed: ${JSON.stringify(first)}`);

    const second = await transport.push({
      operationId: 'op-trick-1',
      recordId: trickId,
      operationType: 'upsert',
      payload,
      expectedRevision: null,
    });
    assert.equal(second.status, 'succeeded', `retry push failed: ${JSON.stringify(second)}`);

    const page = await repository.listTrickStates({ limit: 100 });
    assert.equal(page.status, 'succeeded');
    const matching = page.page.items.filter((row) => row.trick_id === trickId);
    assert.equal(matching.length, 1, 'the retry must not have duplicated the trick-state row');
  });

  test('revision-guarded update returns conflict on a stale expectedRevision and leaves the row untouched', async () => {
    const created = await repository.upsertProfile({
      user_id: userId,
      has_completed_onboarding: true,
      kentei_rank: 2,
    });
    assert.equal(created.status, 'succeeded');
    const staleRevision = created.value.revision;

    // A concurrent write from elsewhere (e.g. another device) bumps the
    // server revision out from under this push.
    const concurrent = await repository.upsertProfile({
      user_id: userId,
      has_completed_onboarding: true,
      kentei_rank: 7,
    });
    assert.equal(concurrent.status, 'succeeded');
    assert.ok(concurrent.value.revision > staleRevision);

    const rejected = await transport.push({
      operationId: 'op-profile-conflict',
      recordId: userId,
      operationType: 'upsert',
      payload: { user_id: userId, has_completed_onboarding: true, kentei_rank: 9 },
      expectedRevision: staleRevision,
    });
    assert.equal(rejected.status, 'conflict', `expected a conflict, got: ${JSON.stringify(rejected)}`);
    assert.equal(rejected.conflict.expectedRevision, staleRevision);
    assert.equal(rejected.conflict.serverRevision, concurrent.value.revision);

    const current = await repository.getProfile();
    assert.equal(current.status, 'succeeded');
    assert.equal(current.page.items[0].kentei_rank, 7, 'the rejected push must not have changed the row');
    assert.equal(current.page.items[0].revision, concurrent.value.revision);
  });

  test('idempotent retry of a trick-state delete succeeds both times', async () => {
    const trickId = 't157-4-trick-delete-retry';
    const created = await repository.upsertTrickState({
      user_id: userId,
      trick_id: trickId,
      is_selected: true,
      is_manually_unlocked: false,
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

    const page = await repository.listTrickStates({ limit: 100 });
    assert.equal(page.status, 'succeeded');
    assert.equal(
      page.page.items.some((row) => row.trick_id === trickId),
      false,
      'the trick-state row must be gone after either delete attempt',
    );
  });

  test('deleting a trick-state row that was never created succeeds as a no-op', async () => {
    const result = await transport.push({
      operationId: 'op-delete-never-created',
      recordId: 't157-4-trick-never-created',
      operationType: 'delete',
      payload: null,
      expectedRevision: null,
    });
    assert.equal(result.status, 'succeeded', `expected a no-op success, got: ${JSON.stringify(result)}`);
  });

  test('pullProfileRow and pullTrickStatePage read back real seeded rows', async () => {
    const upserted = await repository.upsertProfile({
      user_id: userId,
      has_completed_onboarding: true,
      kentei_rank: 6,
    });
    assert.equal(upserted.status, 'succeeded');

    const trickId = 't157-4-trick-pull-smoke';
    const trickUpserted = await repository.upsertTrickState({
      user_id: userId,
      trick_id: trickId,
      is_selected: true,
      is_manually_unlocked: false,
    });
    assert.equal(trickUpserted.status, 'succeeded');

    const profilePull = await transport.pullProfileRow();
    assert.equal(profilePull.status, 'succeeded', `pullProfileRow failed: ${JSON.stringify(profilePull)}`);
    assert.equal(profilePull.page.items[0]?.user_id, userId);
    assert.equal(profilePull.page.items[0]?.kentei_rank, 6);

    const trickPull = await transport.pullTrickStatePage({ limit: 100 });
    assert.equal(trickPull.status, 'succeeded', `pullTrickStatePage failed: ${JSON.stringify(trickPull)}`);
    assert.ok(trickPull.page.items.some((row) => row.trick_id === trickId));
  });
});
