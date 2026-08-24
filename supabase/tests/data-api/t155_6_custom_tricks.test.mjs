// T155.6: Data API (real HTTP, real JWTs) proof of api.custom_tricks' JSON/
// domain invariants, including nested-sequence rejection in both directions.
// Case data is ported from
// supabase/tests/t155_3_custom_tricks_and_practice_sessions.test.sql (pgTAP,
// SQL-level) plus a few cases only observable at the HTTP layer (forged
// server-owned columns, unrecognized JSON keys, bulk-array atomicity). See
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

describe('T155.6 custom_tricks Data API JSON invariants', () => {
  let config;
  let userId;
  let client;

  before(async () => {
    config = getLocalConfig();
    const email = `t155-6-custom-tricks-${Date.now()}@example.com`;
    userId = await createConfirmedUser(config, email, PASSWORD);
    const { accessToken } = await signIn(config, email, PASSWORD);
    client = restClient(config, accessToken);
  });

  after(async () => {
    await deleteUser(config, userId);
  });

  test('valid: a minimal standalone custom trick', async () => {
    const { status } = await client.post('/custom_tricks', {
      user_id: userId,
      id: 'custom-1',
      kind: 'standalone',
      name: 'Lighthouse variant',
    });
    assert.equal(status, 201);
  });

  test('valid: a standalone custom trick with a kentei rank', async () => {
    const { status } = await client.post('/custom_tricks', {
      user_id: userId,
      id: 'custom-2',
      kind: 'standalone',
      name: 'Another one',
      kentei_rank: 7,
    });
    assert.equal(status, 201);
  });

  test('valid: a sequence referencing a standalone custom trick plus a customText step', async () => {
    const { status } = await client.post('/custom_tricks', {
      user_id: userId,
      id: 'custom-seq-1',
      kind: 'sequence',
      name: 'Combo one',
      steps: [
        { kind: 'existingTrick', sourceTrickId: 'custom-1', name: 'Lighthouse variant' },
        { kind: 'customText', name: 'Freehand spike' },
      ],
    });
    assert.equal(status, 201);
  });

  test('valid: a sequence referencing standard (non-custom) trick ids', async () => {
    const { status } = await client.post('/custom_tricks', {
      user_id: userId,
      id: 'custom-seq-2',
      kind: 'sequence',
      name: 'Combo two',
      steps: [
        { kind: 'existingTrick', sourceTrickId: 'lighthouse', name: 'Lighthouse' },
        { kind: 'existingTrick', sourceTrickId: 'big-cup', name: 'Big cup' },
      ],
    });
    assert.equal(status, 201);
  });

  const invalidInserts = [
    {
      name: 'a sequence with fewer than two steps is rejected',
      body: {
        id: 'custom-bad-1',
        kind: 'sequence',
        name: 'Too short',
        steps: [{ kind: 'customText', name: 'Only one step' }],
      },
    },
    {
      name: 'a standalone trick with steps is rejected',
      body: {
        id: 'custom-bad-2',
        kind: 'standalone',
        name: 'Has steps',
        steps: [
          { kind: 'customText', name: 'a' },
          { kind: 'customText', name: 'b' },
        ],
      },
    },
    {
      name: 'a sequence whose steps value is not a json array is rejected',
      body: {
        id: 'custom-bad-3',
        kind: 'sequence',
        name: 'Steps not array',
        steps: { kind: 'customText', name: 'a' },
      },
    },
    {
      name: 'a customText step missing name is rejected',
      body: {
        id: 'custom-bad-4',
        kind: 'sequence',
        name: 'Missing name',
        steps: [{ kind: 'customText' }, { kind: 'customText', name: 'b' }],
      },
    },
    {
      name: 'an existingTrick step missing sourceTrickId is rejected',
      body: {
        id: 'custom-bad-5',
        kind: 'sequence',
        name: 'Missing sourceTrickId',
        steps: [{ kind: 'existingTrick', name: 'a' }, { kind: 'customText', name: 'b' }],
      },
    },
    {
      name: 'a step with an unknown extra key is rejected',
      body: {
        id: 'custom-bad-6',
        kind: 'sequence',
        name: 'Unknown extra key',
        steps: [
          { kind: 'customText', name: 'a', extra: true },
          { kind: 'customText', name: 'b' },
        ],
      },
    },
    {
      name: 'a step with an unknown discriminant kind is rejected',
      body: {
        id: 'custom-bad-7',
        kind: 'sequence',
        name: 'Unknown step kind',
        steps: [{ kind: 'bogus', name: 'a' }, { kind: 'customText', name: 'b' }],
      },
    },
    {
      name: 'a sequence step referencing its own trick id is rejected',
      body: {
        id: 'custom-self',
        kind: 'sequence',
        name: 'Self reference',
        steps: [
          { kind: 'existingTrick', sourceTrickId: 'custom-self', name: 'itself' },
          { kind: 'customText', name: 'b' },
        ],
      },
    },
    {
      name: 'a sequence step directly referencing another sequence is rejected',
      body: {
        id: 'custom-nested-1',
        kind: 'sequence',
        name: 'Nests directly',
        steps: [
          { kind: 'existingTrick', sourceTrickId: 'custom-seq-1', name: 'Combo one' },
          { kind: 'customText', name: 'b' },
        ],
      },
    },
    {
      name: 'an unknown kind value is rejected',
      body: { id: 'custom-bad-kind', kind: 'bogus', name: 'Unknown kind' },
    },
    {
      name: 'a blank/untrimmed name is rejected',
      body: { id: 'custom-bad-name', kind: 'standalone', name: '   ' },
    },
    {
      name: 'a kentei_rank outside 1-12 is rejected',
      body: { id: 'custom-bad-rank', kind: 'standalone', name: 'Ranked', kentei_rank: 13 },
    },
  ];

  for (const { name, body } of invalidInserts) {
    test(`rejected: ${name}`, async () => {
      const { status, body: responseBody } = await client.post('/custom_tricks', {
        user_id: userId,
        ...body,
      });
      assert.equal(status, 400);
      assert.equal(responseBody.code, '23514');
    });
  }

  test('rejected: a duplicate custom trick id for the same user is rejected', async () => {
    const { status, body } = await client.post('/custom_tricks', {
      user_id: userId,
      id: 'custom-1',
      kind: 'standalone',
      name: 'Duplicate id',
    });
    assert.equal(status, 409);
    assert.equal(body.code, '23505');
  });

  test(
    'rejected: converting a standalone trick already referenced by another sequence into a ' +
      'sequence is rejected -- at the Data API layer this surfaces as a permission error (42501), ' +
      'not the 23514 domain check pgTAP observes directly, because T155.5\'s column-level UPDATE ' +
      'grant on custom_tricks never includes `kind` at all (kind is pinned immutable on UPDATE). ' +
      'This is stronger enforcement than the SQL-level test can see, not a gap: no HTTP client can ' +
      'even reach the domain trigger for this case.',
    async () => {
      const { status, body } = await client.patch(`/custom_tricks?user_id=eq.${userId}&id=eq.custom-1`, {
        kind: 'sequence',
        steps: [
          { kind: 'customText', name: 'a' },
          { kind: 'customText', name: 'b' },
        ],
      });
      assert.equal(status, 403);
      assert.equal(body.code, '42501');
    }
  );

  test('rejected: forging revision on insert is a permission error, not a stored value', async () => {
    const { status, body } = await client.post('/custom_tricks', {
      user_id: userId,
      id: 'custom-forge-revision',
      kind: 'standalone',
      name: 'Forged revision',
      revision: 99,
    });
    assert.equal(status, 403);
    assert.equal(body.code, '42501');
  });

  test('rejected: an unrecognized JSON key that is not any column is rejected pre-database', async () => {
    const { status, body } = await client.post('/custom_tricks', {
      user_id: userId,
      id: 'custom-bogus-column',
      kind: 'standalone',
      name: 'Bogus column',
      bogusField: true,
    });
    assert.equal(status, 400);
    assert.equal(body.code, 'PGRST204');
  });

  test('rejected: a bulk insert with one valid and one malformed element rolls back atomically', async () => {
    const { status } = await client.post('/custom_tricks', [
      { user_id: userId, id: 'custom-bulk-ok', kind: 'standalone', name: 'Bulk ok', steps: null },
      {
        user_id: userId,
        id: 'custom-bulk-bad',
        kind: 'sequence',
        name: 'Bulk bad',
        steps: [{ kind: 'customText', name: 'only one' }],
      },
    ]);
    assert.equal(status, 400);

    const { status: getStatus, body: rows } = await client.get(
      `/custom_tricks?user_id=eq.${userId}&id=eq.custom-bulk-ok`
    );
    assert.equal(getStatus, 200);
    assert.deepEqual(rows, [], 'the valid element from the failed bulk insert must not persist');
  });
});
