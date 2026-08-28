// T161.1: proves the delete-account Edge Function's own contract end to
// end over real HTTP against a local Supabase stack -- valid deletion
// cascades every application row and removes the Auth user; missing/
// invalid JWTs, malformed bodies, wrong confirmation, wrong passwords, and
// attempts to supply another identity are all rejected. Follows the exact
// structural conventions of ../data-api/t155_7_cross_user_isolation.test.mjs.
// See supabase/README.md for how to run this suite.

import { before, after, describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  getLocalConfig,
  createConfirmedUser,
  signIn,
  deleteUser,
  restClient,
} from '../data-api/lib/local-supabase.mjs';
import { callDeleteAccount } from './lib/call-delete-account.mjs';

const PASSWORD = 'tencharacters';
const WRONG_PASSWORD = 'wrongpassword';

async function seedAllTables(client, userId) {
  await client.post('/profiles', { user_id: userId, has_completed_onboarding: false });
  await client.post('/user_trick_states', { user_id: userId, trick_id: 'lighthouse', is_selected: true });
  await client.post('/custom_tricks', { user_id: userId, id: 'custom-1', kind: 'standalone', name: 'Original name' });
  await client.post('/practice_sessions', {
    user_id: userId,
    id: 'sess-1',
    trick_id: 'lighthouse',
    trick_name: 'Lighthouse',
    started_at: 1000,
    completed_at: 2000,
    duration_ms: 1000,
    lace_count: 3,
  });
  await client.post('/goals', {
    user_id: userId,
    id: 'goal-1',
    trick_id: 'lighthouse',
    trick_name: 'Lighthouse',
    kind: 'count',
    target_count: 50,
  });
  await client.post('/notes', {
    user_id: userId,
    id: 'note-1',
    trick_id: 'lighthouse',
    trick_name: 'Lighthouse',
    body: 'Original body',
  });
}

// Table-level PostgREST grants (see supabase/migrations/*) are scoped to
// `authenticated`, not `service_role` -- `service_role` bypasses RLS but
// still needs a table grant to be queried through PostgREST, which this
// schema deliberately does not give it. So cascade verification below
// queries with the deleted user's own (still cryptographically valid,
// pre-deletion) access token rather than the service-role key: PostgREST
// verifies JWTs by signature only and never checks `auth.users` existence,
// so this token still authenticates as that user's `authenticated` role and
// correctly sees zero rows once the cascade has actually removed them.
async function assertUserAndRowsGone(config, userId, accessToken) {
  const client = restClient(config, accessToken);
  const tables = ['profiles', 'user_trick_states', 'custom_tricks', 'practice_sessions', 'goals', 'notes'];
  for (const table of tables) {
    const result = await client.get('/' + table + '?user_id=eq.' + userId);
    assert.deepEqual(result.body, [], 'expected ' + table + ' to have zero rows for the deleted user');
  }

  const adminResponse = await fetch(config.apiUrl + '/auth/v1/admin/users/' + userId, {
    headers: { apikey: config.serviceRoleKey, Authorization: 'Bearer ' + config.serviceRoleKey },
  });
  assert.equal(adminResponse.status, 404);
}

describe('T161.1 delete-account Edge Function', () => {
  let config;

  before(() => {
    config = getLocalConfig();
  });

  describe('valid deletion', () => {
    let userId;
    let accessToken;

    before(async () => {
      const email = 't161-1-valid-' + Date.now() + '@example.com';
      userId = await createConfirmedUser(config, email, PASSWORD);
      const session = await signIn(config, email, PASSWORD);
      accessToken = session.accessToken;
      const client = restClient(config, accessToken);
      await seedAllTables(client, userId);
    });

    after(async () => {
      await deleteUser(config, userId);
    });

    test('returns 204, no-store, empty body, and cascades every table plus the Auth user', async () => {
      const rawBody = JSON.stringify({ currentPassword: PASSWORD, confirmation: 'DELETE' });
      const result = await callDeleteAccount(config, 'Bearer ' + accessToken, rawBody);

      assert.equal(result.status, 204);
      assert.equal(result.headers.get('cache-control'), 'no-store');
      assert.equal(result.body, null);
      await assertUserAndRowsGone(config, userId, accessToken);
    });
  });

  describe('JWT rejection', () => {
    test('missing Authorization header returns 401', async () => {
      const rawBody = JSON.stringify({ currentPassword: PASSWORD, confirmation: 'DELETE' });
      const result = await callDeleteAccount(config, undefined, rawBody);
      assert.equal(result.status, 401);
      assert.equal(result.headers.get('cache-control'), 'no-store');
    });

    test('invalid bearer token returns 401', async () => {
      const rawBody = JSON.stringify({ currentPassword: PASSWORD, confirmation: 'DELETE' });
      const result = await callDeleteAccount(config, 'Bearer not-a-real-token', rawBody);
      assert.equal(result.status, 401);
      assert.equal(result.headers.get('cache-control'), 'no-store');
    });
  });

  describe('malformed body rejection', () => {
    let userId;
    let accessToken;

    before(async () => {
      const email = 't161-1-malformed-' + Date.now() + '@example.com';
      userId = await createConfirmedUser(config, email, PASSWORD);
      const session = await signIn(config, email, PASSWORD);
      accessToken = session.accessToken;
    });

    after(async () => {
      await deleteUser(config, userId);
    });

    const cases = [
      ['non-JSON body', 'not json at all'],
      ['JSON array instead of object', JSON.stringify(['x'])],
      ['JSON string instead of object', JSON.stringify('x')],
      ['missing currentPassword', JSON.stringify({ confirmation: 'DELETE' })],
      ['missing confirmation', JSON.stringify({ currentPassword: PASSWORD })],
      ['currentPassword as a number', JSON.stringify({ currentPassword: 123, confirmation: 'DELETE' })],
      ['empty-string currentPassword', JSON.stringify({ currentPassword: '', confirmation: 'DELETE' })],
    ];

    for (const [name, rawBody] of cases) {
      test(name + ' returns 400', async () => {
        const result = await callDeleteAccount(config, 'Bearer ' + accessToken, rawBody);
        assert.equal(result.status, 400);
        assert.equal(result.headers.get('cache-control'), 'no-store');
      });
    }
  });

  describe('wrong confirmation rejection', () => {
    let userId;
    let accessToken;

    before(async () => {
      const email = 't161-1-confirm-' + Date.now() + '@example.com';
      userId = await createConfirmedUser(config, email, PASSWORD);
      const session = await signIn(config, email, PASSWORD);
      accessToken = session.accessToken;
    });

    after(async () => {
      await deleteUser(config, userId);
    });

    const wrongConfirmations = ['delete', 'Delete', 'DELETE ', 'CONFIRM'];
    for (const confirmation of wrongConfirmations) {
      test('confirmation ' + JSON.stringify(confirmation) + ' returns 400', async () => {
        const rawBody = JSON.stringify({ currentPassword: PASSWORD, confirmation: confirmation });
        const result = await callDeleteAccount(config, 'Bearer ' + accessToken, rawBody);
        assert.equal(result.status, 400);
      });
    }
  });

  describe('wrong password rejection', () => {
    let userId;
    let accessToken;

    before(async () => {
      const email = 't161-1-wrongpass-' + Date.now() + '@example.com';
      userId = await createConfirmedUser(config, email, PASSWORD);
      const session = await signIn(config, email, PASSWORD);
      accessToken = session.accessToken;
      const client = restClient(config, accessToken);
      await seedAllTables(client, userId);
    });

    after(async () => {
      await deleteUser(config, userId);
    });

    test('wrong currentPassword returns 401 and leaves the user and rows intact', async () => {
      const rawBody = JSON.stringify({ currentPassword: WRONG_PASSWORD, confirmation: 'DELETE' });
      const result = await callDeleteAccount(config, 'Bearer ' + accessToken, rawBody);
      assert.equal(result.status, 401);

      const client = restClient(config, accessToken);
      const profileResult = await client.get('/profiles?user_id=eq.' + userId);
      assert.equal(profileResult.body.length, 1);

      const adminResponse = await fetch(config.apiUrl + '/auth/v1/admin/users/' + userId, {
        headers: { apikey: config.serviceRoleKey, Authorization: 'Bearer ' + config.serviceRoleKey },
      });
      assert.equal(adminResponse.status, 200);
    });
  });

  describe('attempt to supply another identity', () => {
    let userAId;
    let accessTokenA;
    let userBId;

    before(async () => {
      const emailA = 't161-1-identity-a-' + Date.now() + '@example.com';
      userAId = await createConfirmedUser(config, emailA, PASSWORD);
      const sessionA = await signIn(config, emailA, PASSWORD);
      accessTokenA = sessionA.accessToken;

      const emailB = 't161-1-identity-b-' + Date.now() + '@example.com';
      userBId = await createConfirmedUser(config, emailB, PASSWORD);
    });

    after(async () => {
      await deleteUser(config, userAId);
      await deleteUser(config, userBId);
    });

    test('a body with an extra userId key naming another user returns 400 and leaves that user unaffected', async () => {
      const rawBody = JSON.stringify({
        currentPassword: PASSWORD,
        confirmation: 'DELETE',
        userId: userBId,
      });
      const result = await callDeleteAccount(config, 'Bearer ' + accessTokenA, rawBody);
      assert.equal(result.status, 400);

      const adminResponseB = await fetch(config.apiUrl + '/auth/v1/admin/users/' + userBId, {
        headers: { apikey: config.serviceRoleKey, Authorization: 'Bearer ' + config.serviceRoleKey },
      });
      assert.equal(adminResponseB.status, 200);
    });
  });
});
