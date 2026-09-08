// T155.6: Data API (real HTTP, real JWTs) proof of api.goals' JSON/domain
// invariants, including rejection of ambiguous count/time goal payloads.
// Case data is ported from supabase/tests/t155_4_goals_and_notes.test.sql
// (pgTAP, SQL-level) plus a few cases only observable at the HTTP layer
// (forged server-owned columns, unrecognized JSON keys). See
// supabase/README.md for how to run this suite against a local Supabase
// stack.

import { before, after, describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  getLocalConfig,
  createConfirmedUser,
  signIn,
  deleteUser,
  restClient,
} from './lib/local-supabase.mjs';

const PASSWORD = 'tencharacters';

describe('T155.6 goals Data API JSON invariants', () => {
  let config;
  let userId;
  let client;

  before(async () => {
    config = getLocalConfig();
    const email = `t155-6-goals-${Date.now()}@example.com`;
    userId = await createConfirmedUser(config, email, PASSWORD);
    const { accessToken } = await signIn(config, email, PASSWORD);
    client = restClient(config, accessToken);
  });

  after(async () => {
    await deleteUser(config, userId);
  });

  test('valid: a minimal count goal', async () => {
    const { status } = await client.post('/goals', {
      user_id: userId,
      id: 'goal-1',
      trick_id: 'lighthouse',
      trick_name: 'Lighthouse',
      kind: 'count',
      target_count: 50,
    });
    assert.equal(status, 201);
  });

  test('valid: a minimal time goal (10 minutes)', async () => {
    const { status } = await client.post('/goals', {
      user_id: userId,
      id: 'goal-2',
      trick_id: 'big-cup',
      trick_name: 'Big cup',
      kind: 'time',
      target_ms: 600000,
    });
    assert.equal(status, 201);
  });

  const invalidInserts = [
    {
      name: 'an unknown goal kind is rejected',
      body: { id: 'goal-bad-1', trick_id: 'lighthouse', trick_name: 'Lighthouse', kind: 'bogus', target_count: 50 },
    },
    {
      name: 'a count goal that also carries target_ms (ambiguous variant) is rejected',
      body: {
        id: 'goal-bad-2',
        trick_id: 'lighthouse',
        trick_name: 'Lighthouse',
        kind: 'count',
        target_count: 50,
        target_ms: 600000,
      },
    },
    {
      name: 'a time goal that also carries target_count (ambiguous variant, reversed order) is rejected',
      body: {
        id: 'goal-bad-3',
        trick_id: 'lighthouse',
        trick_name: 'Lighthouse',
        kind: 'time',
        target_ms: 600000,
        target_count: 50,
      },
    },
    {
      name: 'a count goal target_count below the minimum is rejected',
      body: { id: 'goal-bad-4', trick_id: 'lighthouse', trick_name: 'Lighthouse', kind: 'count', target_count: 0 },
    },
    {
      name: 'a count goal target_count above the maximum is rejected',
      body: {
        id: 'goal-bad-5',
        trick_id: 'lighthouse',
        trick_name: 'Lighthouse',
        kind: 'count',
        target_count: 100001,
      },
    },
    {
      name: 'a time goal target_ms that is not a whole-minute multiple is rejected',
      body: { id: 'goal-bad-6', trick_id: 'lighthouse', trick_name: 'Lighthouse', kind: 'time', target_ms: 90000 },
    },
    {
      name: 'a time goal target_ms below the minimum (60000) is rejected',
      body: { id: 'goal-bad-7', trick_id: 'lighthouse', trick_name: 'Lighthouse', kind: 'time', target_ms: 0 },
    },
    {
      name: 'a time goal target_ms above the maximum is rejected',
      body: {
        id: 'goal-bad-8',
        trick_id: 'lighthouse',
        trick_name: 'Lighthouse',
        kind: 'time',
        target_ms: 6000000060000,
      },
    },
    {
      name: 'a blank/untrimmed trick_name is rejected',
      body: { id: 'goal-bad-9', trick_id: 'lighthouse', trick_name: '   ', kind: 'count', target_count: 50 },
    },
  ];

  for (const { name, body } of invalidInserts) {
    test(`rejected: ${name}`, async () => {
      const { status, body: responseBody } = await client.post('/goals', {
        user_id: userId,
        ...body,
      });
      assert.equal(status, 400);
      assert.equal(responseBody.code, '23514');
    });
  }

  test('rejected: a duplicate goal id for the same user is rejected', async () => {
    const { status, body } = await client.post('/goals', {
      user_id: userId,
      id: 'goal-1',
      trick_id: 'lighthouse',
      trick_name: 'Lighthouse',
      kind: 'count',
      target_count: 1,
    });
    assert.equal(status, 409);
    assert.equal(body.code, '23505');
  });

  test('rejected: forging revision on insert is a permission error, not a stored value', async () => {
    const { status, body } = await client.post('/goals', {
      user_id: userId,
      id: 'goal-forge-revision',
      trick_id: 'lighthouse',
      trick_name: 'Lighthouse',
      kind: 'count',
      target_count: 10,
      revision: 99,
    });
    assert.equal(status, 403);
    assert.equal(body.code, '42501');
  });

  test('rejected: an unrecognized JSON key that is not any column is rejected pre-database', async () => {
    const { status, body } = await client.post('/goals', {
      user_id: userId,
      id: 'goal-bogus-column',
      trick_id: 'lighthouse',
      trick_name: 'Lighthouse',
      kind: 'count',
      target_count: 10,
      bogusField: true,
    });
    assert.equal(status, 400);
    assert.equal(body.code, 'PGRST204');
  });
});
