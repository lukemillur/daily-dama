// T155.8: proves the practice_sessions pagination path actually works past
// PostgREST's default `max_rows = 1000` page cap (see supabase/config.toml),
// not merely "small enough to never notice a missing page." Complements
// t155_7_cross_user_isolation.test.mjs's coverage of practice_sessions'
// insert-only/ownership rules -- this file only asserts pagination
// correctness over a fixture that exceeds the cap.
//
// The user-scoped index added in T155.2/T155.3 is
// `(user_id, completed_at desc, id)` -- `id` has no explicit direction, so
// its tiebreak order is ascending. The fixture deliberately seeds duplicate
// `completed_at` values (groups of 3, ~400 distinct timestamps) rather than
// all-unique timestamps, and pages with a size (137) that does not evenly
// divide the group size or the total, so page boundaries routinely fall
// mid-duplicate-group -- exactly the scenario that would silently drop or
// duplicate a row if the tiebreak direction were wrong.

import { before, after, describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { getLocalConfig, createConfirmedUser, signIn, deleteUser, restClient } from './lib/local-supabase.mjs';

const PASSWORD = 'tencharacters';
const TOTAL_ROWS = 1200;
const PAGE_SIZE = 137;
const GROUP_SIZE = 3;
const BASE_COMPLETED_AT = 1_700_000_000_000;

/**
 * Builds 1,200 practice_sessions rows for one user, in groups of 3 sharing a
 * `completed_at` value (so ~400 distinct timestamps), each row's
 * `started_at`/`duration_ms` satisfying the table's own check constraints.
 */
function buildFixtureRows(userId) {
  const rows = [];
  for (let index = 0; index < TOTAL_ROWS; index += 1) {
    const groupIndex = Math.floor(index / GROUP_SIZE);
    const completedAt = BASE_COMPLETED_AT + groupIndex * 1000;
    const startedAt = completedAt - 500;
    rows.push({
      user_id: userId,
      id: `t155-8-sess-${String(index).padStart(4, '0')}`,
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

describe('T155.8 practice_sessions pagination past the 1,000-row PostgREST cap', () => {
  let config;
  let userId;
  let client;
  let fixtureRows;

  before(async () => {
    config = getLocalConfig();
    const email = `t155-8-pagination-${Date.now()}@example.com`;
    userId = await createConfirmedUser(config, email, PASSWORD);
    const session = await signIn(config, email, PASSWORD);
    client = restClient(config, session.accessToken);

    fixtureRows = buildFixtureRows(userId);
    const { status, body } = await client.post('/practice_sessions', fixtureRows);
    assert.equal(status, 201, `bulk insert failed: ${JSON.stringify(body)}`);
  });

  after(async () => {
    await deleteUser(config, userId);
  });

  test('paginating with limit/offset collects every row exactly once, ordered by completed_at desc, id asc', async () => {
    const collected = [];
    for (let offset = 0; offset < TOTAL_ROWS; offset += PAGE_SIZE) {
      const path =
        `/practice_sessions?user_id=eq.${userId}` +
        `&order=completed_at.desc,id.asc&limit=${PAGE_SIZE}&offset=${offset}`;
      const { status, body } = await client.get(path);
      assert.equal(status, 200, `page at offset ${offset} failed: ${JSON.stringify(body)}`);
      assert.ok(Array.isArray(body), `page at offset ${offset} did not return an array`);
      collected.push(...body);
    }

    // Total rows collected across all pages equals the fixture size.
    assert.equal(collected.length, TOTAL_ROWS);

    // No duplicates, no gaps: the set of collected ids is exactly the set
    // inserted.
    const collectedIds = collected.map((row) => row.id);
    const expectedIds = fixtureRows.map((row) => row.id);
    assert.deepEqual(new Set(collectedIds), new Set(expectedIds));
    assert.equal(collectedIds.length, new Set(collectedIds).size, 'a row id was duplicated across pages');

    // The concatenated sequence is non-increasing by completed_at, and
    // within each completed_at group, non-decreasing by id (the index
    // tiebreak this fixture exists to exercise).
    for (let index = 1; index < collected.length; index += 1) {
      const previous = collected[index - 1];
      const current = collected[index];
      assert.ok(
        current.completed_at <= previous.completed_at,
        `completed_at increased at index ${index}: ${previous.completed_at} -> ${current.completed_at}`,
      );
      if (current.completed_at === previous.completed_at) {
        assert.ok(
          current.id >= previous.id,
          `id tiebreak went backwards within a completed_at group at index ${index}: ${previous.id} -> ${current.id}`,
        );
      }
    }
  });
});
