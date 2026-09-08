// T155.7: proves anonymous access is denied for every exposed table over
// real HTTP. `anon` is never granted `USAGE ON SCHEMA api` (T155.1), so this
// is a schema-level denial (401, code 42501, "permission denied for schema
// api") rather than a per-table RLS denial -- verified live against a fresh
// local stack before writing this assertion, so the test doesn't mis-assert
// on the wrong layer. See supabase/README.md for how to run this suite
// against a local Supabase stack.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { getLocalConfig, anonClient } from './lib/local-supabase.mjs';

const EXPOSED_TABLES = [
  'profiles',
  'user_trick_states',
  'custom_tricks',
  'practice_sessions',
  'goals',
  'notes',
];

describe('T155.7 anonymous denial', () => {
  const config = getLocalConfig();
  const client = anonClient(config);

  for (const table of EXPOSED_TABLES) {
    test(`anon GET /${table} is denied at the schema layer`, async () => {
      const { status, body } = await client.get(`/${table}`);
      assert.equal(status, 401);
      assert.equal(body.code, '42501');
    });
  }
});
