// T155.6: Data API (real HTTP, real JWTs) proof of api.profiles' JSON/domain
// invariants. Case data is ported from
// supabase/tests/t155_2_profiles_and_trick_states.test.sql (pgTAP, SQL-level)
// so the same truths are proven again through the actual client path
// (PostgREST), plus a few cases only observable at the HTTP layer (forged
// server-owned columns, unrecognized JSON keys). See supabase/README.md for
// how to run this suite against a local Supabase stack.

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

describe('T155.6 profiles Data API JSON invariants', () => {
  let config;
  let primaryUserId;
  let primaryClient;
  let probeUserId;
  let probeClient;

  before(async () => {
    config = getLocalConfig();

    const primaryEmail = `t155-6-profiles-primary-${Date.now()}@example.com`;
    primaryUserId = await createConfirmedUser(config, primaryEmail, PASSWORD);
    const primarySession = await signIn(config, primaryEmail, PASSWORD);
    primaryClient = restClient(config, primarySession.accessToken);

    // A second user used only for INSERT-time rejection cases: every case
    // below is expected to fail before a row is ever written, so this user's
    // id stays free for every repeated failing insert attempt.
    const probeEmail = `t155-6-profiles-probe-${Date.now()}@example.com`;
    probeUserId = await createConfirmedUser(config, probeEmail, PASSWORD);
    const probeSession = await signIn(config, probeEmail, PASSWORD);
    probeClient = restClient(config, probeSession.accessToken);
  });

  after(async () => {
    await deleteUser(config, primaryUserId);
    await deleteUser(config, probeUserId);
  });

  test('valid: minimal not-onboarded profile (insert)', async () => {
    const { status } = await primaryClient.post('/profiles', {
      user_id: primaryUserId,
      has_completed_onboarding: false,
    });
    assert.equal(status, 201);
  });

  const validPatches = [
    {
      name: 'onboarded + full theme + openEnded lastSesh with no target',
      patch: {
        has_completed_onboarding: true,
        kentei_rank: 5,
        last_sesh: { trickId: 'lighthouse', plan: { kind: 'openEnded' } },
        streak_threshold_ms: 300000,
        theme_background_color: '#ff00aa',
        theme_accent_color: '#00ff00',
        theme_text_color: '#0000ff',
      },
    },
    {
      name: 'openEnded lastSesh with boundary targetLandingCount=999',
      patch: { last_sesh: { trickId: 't1', plan: { kind: 'openEnded', targetLandingCount: 999 } } },
    },
    {
      name: 'timed lastSesh with boundary durationMinutes=60',
      patch: { last_sesh: { trickId: 't1', plan: { kind: 'timed', durationMinutes: 60 } } },
    },
  ];

  for (const { name, patch } of validPatches) {
    test(`valid: ${name}`, async () => {
      const { status } = await primaryClient.patch(`/profiles?user_id=eq.${primaryUserId}`, patch);
      assert.equal(status, 204);
    });
  }

  const invalidInserts = [
    {
      name: 'kentei_rank=0 is rejected',
      body: { has_completed_onboarding: true, kentei_rank: 0 },
    },
    {
      name: 'kentei_rank=13 is rejected',
      body: { has_completed_onboarding: true, kentei_rank: 13 },
    },
    {
      name: 'kentei_rank set while onboarding incomplete is rejected',
      body: { has_completed_onboarding: false, kentei_rank: 5 },
    },
  ];

  for (const { name, body } of invalidInserts) {
    test(`rejected: ${name}`, async () => {
      const { status, body: responseBody } = await probeClient.post('/profiles', {
        user_id: probeUserId,
        ...body,
      });
      assert.equal(status, 400);
      assert.equal(responseBody.code, '23514');
    });
  }

  const invalidPatches = [
    { name: 'onboarded profile missing kentei_rank is rejected', patch: { kentei_rank: null } },
    { name: 'theme color missing # is rejected', patch: { theme_background_color: 'ff00aa' } },
    { name: 'theme color with too few digits is rejected', patch: { theme_background_color: '#ff00' } },
    {
      name: 'streak threshold not a whole multiple of 60000ms is rejected',
      patch: { streak_threshold_ms: 90000 },
    },
    { name: 'streak threshold above 60 minutes is rejected', patch: { streak_threshold_ms: 3600001 } },
    {
      name: 'lastSesh with unknown plan kind is rejected',
      patch: { last_sesh: { trickId: 't1', plan: { kind: 'bogus' } } },
    },
    {
      name: 'lastSesh with unknown top-level key is rejected',
      patch: {
        last_sesh: { trickId: 't1', plan: { kind: 'openEnded' }, unknownTop: 'x' },
      },
    },
    {
      name: 'lastSesh openEnded with unknown extra key nested in plan is rejected',
      patch: { last_sesh: { trickId: 't1', plan: { kind: 'openEnded', extra: true } } },
    },
    {
      name: 'lastSesh openEnded targetLandingCount above 999 is rejected',
      patch: { last_sesh: { trickId: 't1', plan: { kind: 'openEnded', targetLandingCount: 1000 } } },
    },
    {
      name: 'lastSesh timed durationMinutes above 60 is rejected',
      patch: { last_sesh: { trickId: 't1', plan: { kind: 'timed', durationMinutes: 61 } } },
    },
    {
      name: 'lastSesh with empty trickId is rejected',
      patch: { last_sesh: { trickId: '', plan: { kind: 'timed', durationMinutes: 10 } } },
    },
  ];

  for (const { name, patch } of invalidPatches) {
    test(`rejected: ${name}`, async () => {
      const { status, body } = await primaryClient.patch(`/profiles?user_id=eq.${primaryUserId}`, patch);
      assert.equal(status, 400);
      assert.equal(body.code, '23514');
    });
  }

  test('rejected: forging revision on insert is a permission error, not a stored value', async () => {
    const { status, body } = await probeClient.post('/profiles', {
      user_id: probeUserId,
      has_completed_onboarding: false,
      revision: 99,
    });
    assert.equal(status, 403);
    assert.equal(body.code, '42501');
  });

  test('rejected: an unrecognized JSON key that is not any column is rejected pre-database', async () => {
    const { status, body } = await probeClient.post('/profiles', {
      user_id: probeUserId,
      has_completed_onboarding: false,
      bogusColumn: true,
    });
    assert.equal(status, 400);
    assert.equal(body.code, 'PGRST204');
  });
});
