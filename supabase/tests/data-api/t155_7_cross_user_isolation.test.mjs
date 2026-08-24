// T155.7: proves cross-user isolation, ownership-change rejection, and
// per-table operation matrices over real HTTP, for every exposed table.
// Complements the JSON/domain-invariant coverage already in t155_6_*.mjs --
// this file only asserts what those files do not already cover: that user
// B's SELECT/UPDATE/DELETE against user A's row is silently filtered to zero
// rows (not merely denied with an error), that an owner cannot reassign a
// row's user_id, and that server-declared no-op operations (practice-session
// updates/deletes, profile deletes, goal/note hard deletes) are rejected
// even for the owning user. See supabase/README.md for how to run this
// suite against a local Supabase stack.
//
// Pitfall (confirmed live): PostgREST returns 204 with an empty body for a
// PATCH/DELETE that matches zero rows by default -- that alone cannot
// distinguish "succeeded, touched 0 rows" from "succeeded, touched N rows."
// Every isolation probe below therefore sends `Prefer: return=representation`
// so the response is 200 with a JSON array whose length is the real signal.

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
const REPRESENT = { extraHeaders: { Prefer: 'return=representation' } };

describe('T155.7 cross-user isolation and operation matrix', () => {
  let config;
  let userAId;
  let clientA;
  let userBId;
  let clientB;

  before(async () => {
    config = getLocalConfig();

    const emailA = `t155-7-isolation-a-${Date.now()}@example.com`;
    userAId = await createConfirmedUser(config, emailA, PASSWORD);
    const sessionA = await signIn(config, emailA, PASSWORD);
    clientA = restClient(config, sessionA.accessToken);

    const emailB = `t155-7-isolation-b-${Date.now()}@example.com`;
    userBId = await createConfirmedUser(config, emailB, PASSWORD);
    const sessionB = await signIn(config, emailB, PASSWORD);
    clientB = restClient(config, sessionB.accessToken);
  });

  after(async () => {
    await deleteUser(config, userAId);
    await deleteUser(config, userBId);
  });

  describe('profiles', () => {
    const filter = () => `/profiles?user_id=eq.${userAId}`;

    test('A creates their profile', async () => {
      const { status } = await clientA.post('/profiles', {
        user_id: userAId,
        has_completed_onboarding: false,
      });
      assert.equal(status, 201);
    });

    test("B's filtered GET against A's row returns an empty array", async () => {
      const { status, body } = await clientB.get(filter());
      assert.equal(status, 200);
      assert.deepEqual(body, []);
    });

    test("B's filtered PATCH against A's row touches zero rows", async () => {
      const { status, body } = await clientB.patch(filter(), { has_completed_onboarding: true }, REPRESENT);
      assert.equal(status, 200);
      assert.deepEqual(body, []);
    });

    test("A's row is unchanged after B's probes", async () => {
      const { status, body } = await clientA.get(filter());
      assert.equal(status, 200);
      assert.equal(body.length, 1);
      assert.equal(body[0].has_completed_onboarding, false);
    });

    test("A's POST claiming B's user_id is rejected", async () => {
      const { status, body } = await clientA.post('/profiles', {
        user_id: userBId,
        has_completed_onboarding: false,
      });
      assert.equal(status, 403);
      assert.equal(body.code, '42501');
    });

    test("A's PATCH reassigning their own row's user_id is rejected", async () => {
      const { status, body } = await clientA.patch(filter(), { user_id: userBId });
      assert.equal(status, 403);
      assert.equal(body.code, '42501');
    });

    test("A's own-row DELETE is rejected (no client-initiated profile delete)", async () => {
      const { status, body } = await clientA.delete(filter());
      assert.equal(status, 403);
      assert.equal(body.code, '42501');
    });
  });

  describe('user_trick_states', () => {
    const filter = () => `/user_trick_states?user_id=eq.${userAId}&trick_id=eq.lighthouse`;

    test('A creates a trick-state row', async () => {
      const { status } = await clientA.post('/user_trick_states', {
        user_id: userAId,
        trick_id: 'lighthouse',
        is_selected: true,
      });
      assert.equal(status, 201);
    });

    test("B's filtered GET against A's row returns an empty array", async () => {
      const { status, body } = await clientB.get(filter());
      assert.equal(status, 200);
      assert.deepEqual(body, []);
    });

    test("B's filtered PATCH against A's row touches zero rows", async () => {
      const { status, body } = await clientB.patch(filter(), { is_manually_unlocked: true }, REPRESENT);
      assert.equal(status, 200);
      assert.deepEqual(body, []);
    });

    test("B's filtered DELETE against A's row touches zero rows", async () => {
      const { status, body } = await clientB.delete(filter(), REPRESENT);
      assert.equal(status, 200);
      assert.deepEqual(body, []);
    });

    test("A's row is unchanged after B's probes", async () => {
      const { status, body } = await clientA.get(filter());
      assert.equal(status, 200);
      assert.equal(body.length, 1);
      assert.equal(body[0].is_selected, true);
      assert.equal(body[0].is_manually_unlocked, false);
    });

    test("A's POST claiming B's user_id is rejected", async () => {
      const { status, body } = await clientA.post('/user_trick_states', {
        user_id: userBId,
        trick_id: 'big-cup',
        is_selected: true,
      });
      assert.equal(status, 403);
      assert.equal(body.code, '42501');
    });

    test("A's PATCH reassigning their own row's user_id is rejected", async () => {
      const { status, body } = await clientA.patch(filter(), { user_id: userBId });
      assert.equal(status, 403);
      assert.equal(body.code, '42501');
    });
  });

  describe('custom_tricks', () => {
    const filter = () => `/custom_tricks?user_id=eq.${userAId}&id=eq.custom-1`;

    test('A creates a custom trick', async () => {
      const { status } = await clientA.post('/custom_tricks', {
        user_id: userAId,
        id: 'custom-1',
        kind: 'standalone',
        name: 'Original name',
      });
      assert.equal(status, 201);
    });

    test("B's filtered GET against A's row returns an empty array", async () => {
      const { status, body } = await clientB.get(filter());
      assert.equal(status, 200);
      assert.deepEqual(body, []);
    });

    test("B's filtered PATCH against A's row touches zero rows", async () => {
      const { status, body } = await clientB.patch(filter(), { name: 'Hacked name' }, REPRESENT);
      assert.equal(status, 200);
      assert.deepEqual(body, []);
    });

    test("B's filtered DELETE against A's row touches zero rows", async () => {
      const { status, body } = await clientB.delete(filter(), REPRESENT);
      assert.equal(status, 200);
      assert.deepEqual(body, []);
    });

    test("A's row is unchanged after B's probes", async () => {
      const { status, body } = await clientA.get(filter());
      assert.equal(status, 200);
      assert.equal(body.length, 1);
      assert.equal(body[0].name, 'Original name');
    });

    test("A's POST claiming B's user_id is rejected", async () => {
      const { status, body } = await clientA.post('/custom_tricks', {
        user_id: userBId,
        id: 'custom-2',
        kind: 'standalone',
        name: 'Claimed',
      });
      assert.equal(status, 403);
      assert.equal(body.code, '42501');
    });

    test("A's PATCH reassigning their own row's user_id is rejected", async () => {
      const { status, body } = await clientA.patch(filter(), { user_id: userBId });
      assert.equal(status, 403);
      assert.equal(body.code, '42501');
    });
  });

  describe('practice_sessions', () => {
    const filter = () => `/practice_sessions?user_id=eq.${userAId}&id=eq.sess-1`;

    test('A records a completed session', async () => {
      const { status } = await clientA.post('/practice_sessions', {
        user_id: userAId,
        id: 'sess-1',
        trick_id: 'lighthouse',
        trick_name: 'Lighthouse',
        started_at: 1000,
        completed_at: 2000,
        duration_ms: 1000,
        lace_count: 3,
      });
      assert.equal(status, 201);
    });

    test("B's filtered GET against A's row returns an empty array", async () => {
      const { status, body } = await clientB.get(filter());
      assert.equal(status, 200);
      assert.deepEqual(body, []);
    });

    test("A's own-row PATCH is rejected (practice sessions are insert-only)", async () => {
      const { status, body } = await clientA.patch(filter(), { lace_count: 99 });
      assert.equal(status, 403);
      assert.equal(body.code, '42501');
    });

    test("A's own-row DELETE is rejected (practice sessions are insert-only)", async () => {
      const { status, body } = await clientA.delete(filter(), REPRESENT);
      assert.equal(status, 403);
      assert.equal(body.code, '42501');
    });

    test("A's row is unchanged after all probes", async () => {
      const { status, body } = await clientA.get(filter());
      assert.equal(status, 200);
      assert.equal(body.length, 1);
      assert.equal(body[0].lace_count, 3);
    });

    test("A's POST claiming B's user_id is rejected", async () => {
      const { status, body } = await clientA.post('/practice_sessions', {
        user_id: userBId,
        id: 'sess-2',
        trick_id: 'lighthouse',
        trick_name: 'Lighthouse',
        started_at: 1000,
        completed_at: 2000,
        duration_ms: 1000,
        lace_count: 1,
      });
      assert.equal(status, 403);
      assert.equal(body.code, '42501');
    });
  });

  describe('goals', () => {
    const filter = () => `/goals?user_id=eq.${userAId}&id=eq.goal-1`;

    test('A creates a goal', async () => {
      const { status } = await clientA.post('/goals', {
        user_id: userAId,
        id: 'goal-1',
        trick_id: 'lighthouse',
        trick_name: 'Lighthouse',
        kind: 'count',
        target_count: 50,
      });
      assert.equal(status, 201);
    });

    test("B's filtered GET against A's row returns an empty array", async () => {
      const { status, body } = await clientB.get(filter());
      assert.equal(status, 200);
      assert.deepEqual(body, []);
    });

    test("B's filtered PATCH (tombstone) against A's row touches zero rows", async () => {
      const { status, body } = await clientB.patch(
        filter(),
        { deleted_at: new Date().toISOString() },
        REPRESENT
      );
      assert.equal(status, 200);
      assert.deepEqual(body, []);
    });

    test("A's row is unchanged after B's probes", async () => {
      const { status, body } = await clientA.get(filter());
      assert.equal(status, 200);
      assert.equal(body.length, 1);
      assert.equal(body[0].deleted_at, null);
    });

    test("A's POST claiming B's user_id is rejected", async () => {
      const { status, body } = await clientA.post('/goals', {
        user_id: userBId,
        id: 'goal-2',
        trick_id: 'lighthouse',
        trick_name: 'Lighthouse',
        kind: 'count',
        target_count: 10,
      });
      assert.equal(status, 403);
      assert.equal(body.code, '42501');
    });

    test("A's PATCH reassigning their own row's user_id is rejected", async () => {
      const { status, body } = await clientA.patch(filter(), { user_id: userBId });
      assert.equal(status, 403);
      assert.equal(body.code, '42501');
    });

    test("A's own-row hard DELETE is rejected (no delete grant; tombstone only)", async () => {
      const { status, body } = await clientA.delete(filter(), REPRESENT);
      assert.equal(status, 403);
      assert.equal(body.code, '42501');
    });
  });

  describe('notes', () => {
    const filter = () => `/notes?user_id=eq.${userAId}&id=eq.note-1`;

    test('A creates a note', async () => {
      const { status } = await clientA.post('/notes', {
        user_id: userAId,
        id: 'note-1',
        trick_id: 'lighthouse',
        trick_name: 'Lighthouse',
        body: 'Original body',
      });
      assert.equal(status, 201);
    });

    test("B's filtered GET against A's row returns an empty array", async () => {
      const { status, body } = await clientB.get(filter());
      assert.equal(status, 200);
      assert.deepEqual(body, []);
    });

    test("B's filtered PATCH against A's row touches zero rows", async () => {
      const { status, body } = await clientB.patch(filter(), { body: 'Hacked body' }, REPRESENT);
      assert.equal(status, 200);
      assert.deepEqual(body, []);
    });

    test("A's row is unchanged after B's probes", async () => {
      const { status, body } = await clientA.get(filter());
      assert.equal(status, 200);
      assert.equal(body.length, 1);
      assert.equal(body[0].body, 'Original body');
    });

    test("A's POST claiming B's user_id is rejected", async () => {
      const { status, body } = await clientA.post('/notes', {
        user_id: userBId,
        id: 'note-2',
        trick_id: 'lighthouse',
        trick_name: 'Lighthouse',
        body: 'Claimed',
      });
      assert.equal(status, 403);
      assert.equal(body.code, '42501');
    });

    test("A's PATCH reassigning their own row's user_id is rejected", async () => {
      const { status, body } = await clientA.patch(filter(), { user_id: userBId });
      assert.equal(status, 403);
      assert.equal(body.code, '42501');
    });

    test("A's own-row hard DELETE is rejected (no delete grant; tombstone only)", async () => {
      const { status, body } = await clientA.delete(filter(), REPRESENT);
      assert.equal(status, 403);
      assert.equal(body.code, '42501');
    });
  });
});
