// T161.3: real local-Supabase acceptance proof for account-deletion cascade,
// old-session denial, row-recreation prevention, and lost-response retry.
// This deliberately uses raw HTTP against GoTrue, PostgREST, and the Edge
// Function; the handler-only security contract belongs to T161.2.

import { before, after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

import {
  getLocalConfig,
  createConfirmedUser,
  signIn,
  deleteUser,
  restClient,
} from '../data-api/lib/local-supabase.mjs';
import { callDeleteAccount } from './lib/call-delete-account.mjs';

const PASSWORD = 'tencharacters';
const TABLES = [
  'profiles',
  'user_trick_states',
  'custom_tricks',
  'practice_sessions',
  'goals',
  'notes',
];
const REPRESENT = { extraHeaders: { Prefer: 'return=representation' } };

function jwtPart(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function createExpiredToken(config, userId) {
  assert.ok(config.jwtSecret, 'supabase status -o json must expose JWT_SECRET for signed expiry proof');
  const header = jwtPart({ alg: 'HS256', typ: 'JWT' });
  const payload = jwtPart({
    aud: 'authenticated',
    exp: Math.floor(Date.now() / 1000) - 60,
    iat: Math.floor(Date.now() / 1000) - 120,
    iss: `${config.apiUrl}/auth/v1`,
    role: 'authenticated',
    sub: userId,
  });
  const unsigned = `${header}.${payload}`;
  const signature = createHmac('sha256', config.jwtSecret).update(unsigned).digest('base64url');
  return `${unsigned}.${signature}`;
}

function fixture(userId, label) {
  return {
    profile: { user_id: userId, has_completed_onboarding: false },
    trickState: { user_id: userId, trick_id: `${label.toLowerCase()}-lighthouse`, is_selected: true },
    customTrick: {
      user_id: userId,
      id: `${label.toLowerCase()}-custom-1`,
      kind: 'standalone',
      name: `${label} Original name`,
    },
    session: {
      user_id: userId,
      id: `${label.toLowerCase()}-session-1`,
      trick_id: `${label.toLowerCase()}-lighthouse`,
      trick_name: `${label} Lighthouse`,
      started_at: 1000,
      completed_at: 2000,
      duration_ms: 1000,
      lace_count: 3,
    },
    goal: {
      user_id: userId,
      id: `${label.toLowerCase()}-goal-1`,
      trick_id: `${label.toLowerCase()}-lighthouse`,
      trick_name: `${label} Lighthouse`,
      kind: 'count',
      target_count: 50,
    },
    note: {
      user_id: userId,
      id: `${label.toLowerCase()}-note-1`,
      trick_id: `${label.toLowerCase()}-lighthouse`,
      trick_name: `${label} Lighthouse`,
      body: `${label} Original body`,
      practice_session_id: `${label.toLowerCase()}-session-1`,
    },
  };
}

async function seedFixture(client, rows) {
  const inserts = [
    ['profiles', rows.profile],
    ['user_trick_states', rows.trickState],
    ['custom_tricks', rows.customTrick],
    ['practice_sessions', rows.session],
    ['goals', rows.goal],
    ['notes', rows.note],
  ];
  for (const [table, row] of inserts) {
    const result = await client.post(`/${table}`, row);
    assert.equal(result.status, 201, `seed ${table} should create one row: ${JSON.stringify(result.body)}`);
  }
}

async function rowsFor(client, userId, table) {
  const result = await client.get(`/${table}?user_id=eq.${userId}`);
  assert.equal(result.status, 200, `select ${table} should succeed: ${JSON.stringify(result.body)}`);
  return result.body;
}

async function assertExactlyOneFixture(client, userId, rows) {
  for (const table of TABLES) {
    const result = await rowsFor(client, userId, table);
    assert.equal(result.length, 1, `${table} must have exactly one fixture row`);
  }
  const profile = (await rowsFor(client, userId, 'profiles'))[0];
  assert.deepEqual(
    {
      user_id: profile.user_id,
      has_completed_onboarding: profile.has_completed_onboarding,
      kentei_rank: profile.kentei_rank,
      last_sesh: profile.last_sesh,
      streak_threshold_ms: profile.streak_threshold_ms,
      theme_background_color: profile.theme_background_color,
      theme_accent_color: profile.theme_accent_color,
      theme_text_color: profile.theme_text_color,
    },
    {
      ...rows.profile,
      kentei_rank: null,
      last_sesh: null,
      streak_threshold_ms: null,
      theme_background_color: null,
      theme_accent_color: null,
      theme_text_color: null,
    },
  );
  assert.equal((await rowsFor(client, userId, 'custom_tricks'))[0].name, rows.customTrick.name);
  assert.equal((await rowsFor(client, userId, 'practice_sessions'))[0].id, rows.session.id);
  assert.equal((await rowsFor(client, userId, 'goals'))[0].target_count, rows.goal.target_count);
  assert.equal((await rowsFor(client, userId, 'notes'))[0].body, rows.note.body);
}

async function assertUserRowsGone(client, userId) {
  for (const table of TABLES) assert.deepEqual(await rowsFor(client, userId, table), [], `${table} must be empty`);
}

async function assertAuthGone(config, userId) {
  const response = await fetch(`${config.apiUrl}/auth/v1/admin/users/${userId}`, {
    headers: { apikey: config.serviceRoleKey, Authorization: `Bearer ${config.serviceRoleKey}` },
  });
  assert.equal(response.status, 404, 'deleted Auth user must be absent');
}

describe('T161.3 delete-account real-stack acceptance', () => {
  let config;
  let userAId;
  let userBId;
  let tokenA;
  let clientA;
  let clientB;
  let rowsA;
  let rowsB;
  let emailA;
  let emailB;
  let userCId;

  before(async () => {
    config = getLocalConfig();
    const suffix = Date.now();
    emailA = `t161-3-a-${suffix}@example.com`;
    emailB = `t161-3-b-${suffix}@example.com`;
    userAId = await createConfirmedUser(config, emailA, PASSWORD);
    userBId = await createConfirmedUser(config, emailB, PASSWORD);
    const sessionA = await signIn(config, emailA, PASSWORD);
    const sessionB = await signIn(config, emailB, PASSWORD);
    tokenA = sessionA.accessToken;
    clientA = restClient(config, tokenA);
    clientB = restClient(config, sessionB.accessToken);
    rowsA = fixture(userAId, 'A');
    rowsB = fixture(userBId, 'B');
    await seedFixture(clientA, rowsA);
    await seedFixture(clientB, rowsB);
  });

  after(async () => {
    if (config) {
      if (userAId) await deleteUser(config, userAId);
      if (userBId) await deleteUser(config, userBId);
      if (userCId) await deleteUser(config, userCId);
    }
  });

  test('clean reset seeds six rows per user and deletion cascades only A', async () => {
    await assertExactlyOneFixture(clientA, userAId, rowsA);
    await assertExactlyOneFixture(clientB, userBId, rowsB);

    for (const table of TABLES) {
      assert.deepEqual(await rowsFor(clientB, userAId, table), [], `B cannot read A's ${table}`);
    }

    const anonymous = await callDeleteAccount(
      config,
      undefined,
      JSON.stringify({ currentPassword: PASSWORD, confirmation: 'DELETE' }),
    );
    assert.equal(anonymous.status, 401, 'anonymous delete must be unauthorized');

    const expiredToken = createExpiredToken(config, userAId);
    const expiredDelete = await callDeleteAccount(
      config,
      `Bearer ${expiredToken}`,
      JSON.stringify({ currentPassword: PASSWORD, confirmation: 'DELETE' }),
    );
    assert.equal(expiredDelete.status, 401, 'a genuinely signed expired JWT must be unauthorized');
    const expiredRead = await restClient(config, expiredToken).get(`/profiles?user_id=eq.${userAId}`);
    assert.equal(expiredRead.status, 401, 'expired JWT must be denied by the Data API');

    const wrongUser = await callDeleteAccount(
      config,
      `Bearer ${(await signIn(config, emailB, PASSWORD)).accessToken}`,
      JSON.stringify({ currentPassword: 'wrongpassword', confirmation: 'DELETE', user_id: userAId }),
    );
    assert.equal(wrongUser.status, 400, 'a body naming A is rejected before B can be targeted');
    await assertExactlyOneFixture(clientB, userBId, rowsB);

    const deletion = await callDeleteAccount(
      config,
      `Bearer ${tokenA}`,
      JSON.stringify({ currentPassword: PASSWORD, confirmation: 'DELETE' }),
    );
    assert.equal(deletion.status, 204, `valid deletion failed: ${JSON.stringify(deletion.body)}`);
    assert.equal(deletion.headers.get('cache-control'), 'no-store');
    assert.equal(deletion.body, null);

    await assertAuthGone(config, userAId);
    await assertUserRowsGone(clientA, userAId);
    await assertExactlyOneFixture(clientB, userBId, rowsB);
  });

  test('pre-deletion token is stale, cannot recreate any resource, and retry is idempotent', async () => {
    const staleFunction = await callDeleteAccount(
      config,
      `Bearer ${tokenA}`,
      JSON.stringify({ currentPassword: PASSWORD, confirmation: 'DELETE' }),
    );
    // The signed token remains cryptographically valid after Auth deletion;
    // delete-account intentionally treats the absent user as an idempotent
    // success. Data API reads still return no rows, never A's former data.
    assert.equal(staleFunction.status, 204);
    assert.equal(staleFunction.body, null);
    await assertUserRowsGone(clientA, userAId);

    const recreations = {
      profiles: rowsA.profile,
      user_trick_states: { ...rowsA.trickState, trick_id: 'a-recreated-trick' },
      custom_tricks: { ...rowsA.customTrick, id: 'a-recreated-custom' },
      practice_sessions: { ...rowsA.session, id: 'a-recreated-session' },
      goals: { ...rowsA.goal, id: 'a-recreated-goal' },
      notes: { ...rowsA.note, id: 'a-recreated-note', practice_session_id: null },
    };
    for (const table of TABLES) {
      const result = await clientA.post(`/${table}`, recreations[table], REPRESENT);
      assert.equal(result.status, 409, `old A JWT must fail FK recreation for ${table}`);
      assert.equal(result.body.code, '23503', `${table} recreation must fail at auth.users FK`);
    }

    const forgedB = await clientA.post(
      '/custom_tricks',
      { ...rowsB.customTrick, id: 'a-forged-b-custom' },
      REPRESENT,
    );
    assert.equal(forgedB.status, 403, 'old A JWT cannot claim a B row');
    assert.equal(forgedB.body.code, '42501');
    await assertExactlyOneFixture(clientB, userBId, rowsB);
  });

  test('discarded successful deletion response converges on the same empty result after retry', async () => {
    const suffix = Date.now();
    const emailC = `t161-3-retry-${suffix}@example.com`;
    userCId = await createConfirmedUser(config, emailC, PASSWORD);
    const sessionC = await signIn(config, emailC, PASSWORD);
    const tokenC = sessionC.accessToken;
    const clientC = restClient(config, tokenC);
    const rowsC = fixture(userCId, 'C');
    await seedFixture(clientC, rowsC);
    await assertExactlyOneFixture(clientC, userCId, rowsC);

    // The first response is deliberately discarded after the server has
    // committed. The second call models the client's recovery retry.
    await callDeleteAccount(
      config,
      `Bearer ${tokenC}`,
      JSON.stringify({ currentPassword: PASSWORD, confirmation: 'DELETE' }),
    );
    const retry = await callDeleteAccount(
      config,
      `Bearer ${tokenC}`,
      JSON.stringify({ currentPassword: PASSWORD, confirmation: 'DELETE' }),
    );
    assert.equal(retry.status, 204);
    assert.equal(retry.headers.get('cache-control'), 'no-store');
    assert.equal(retry.body, null);
    await assertAuthGone(config, userCId);
    await assertUserRowsGone(clientC, userCId);
    await assertExactlyOneFixture(clientB, userBId, rowsB);
  });
});
