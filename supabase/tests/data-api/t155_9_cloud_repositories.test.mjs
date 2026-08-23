// T155.9: a small smoke test proving the cloud repositories
// (src/features/*/persistence/*-cloud-repository.ts) work end-to-end
// against a real, running local Postgrest/Supabase stack -- not just
// against the hand-written fake client in each domain's unit tests. This
// complements, and deliberately does not re-run, T155.6/T155.7/T155.8's
// invariant/authorization/pagination coverage: it only proves this ticket's
// new data-access boundary (cursor/ordering wiring, and mapPostgrestError's
// classification of a real Postgrest error) is wired correctly end-to-end.
//
// Uses `supabase-js` directly (unlike the rest of this directory's raw
// `fetch`-based suite) so it exercises the exact client shape the
// repositories are constructed against.
//
// Runs the real domain repository/shared TypeScript modules under plain
// `node --test` via a small `node:module` resolve hook
// (./lib/alias-loader.mjs) that rewrites this repo's `@/` path alias to
// `src/...ts` -- Node's built-in loader already strips TypeScript types
// natively, the hook only supplies the path rewrite `@/` imports need.

import { register } from 'node:module';
import { before, after, describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { createClient } from '@supabase/supabase-js';

import { getLocalConfig, createConfirmedUser, deleteUser } from './lib/local-supabase.mjs';

register(new URL('./lib/alias-loader.mjs', import.meta.url));

const { createCustomTrickCloudRepository } = await import(
  '@/features/custom-tricks/persistence/custom-trick-cloud-repository'
);
const { createProfileCloudRepository } = await import('@/features/profile/persistence/profile-cloud-repository');

const PASSWORD = 'tencharacters';

describe('T155.9 cloud repositories against the real local stack', () => {
  let config;
  let userId;
  let client;

  before(async () => {
    config = getLocalConfig();
    const email = `t155-9-cloud-repos-${Date.now()}@example.com`;
    userId = await createConfirmedUser(config, email, PASSWORD);

    // A real SupabaseClient scoped to the `api` schema, matching how
    // src/shared/supabase/supabase-client.ts constructs it (minus AsyncStorage
    // persistence, irrelevant to a short-lived Node process). Signing in
    // through the client itself (rather than raw fetch + setSession) so RLS
    // sees an authenticated auth.uid() the same way a real client would get
    // it.
    client = createClient(config.apiUrl, config.anonKey, {
      db: { schema: 'api' },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: signInError } = await client.auth.signInWithPassword({ email, password: PASSWORD });
    assert.equal(signInError, null, `signInWithPassword failed: ${signInError?.message}`);
  });

  after(async () => {
    await deleteUser(config, userId);
  });

  test('custom_tricks repository list() paginates a 5-row fixture (page size 2) across 3 pages, real ordering/cursor wiring', async () => {
    const repo = createCustomTrickCloudRepository(client);

    for (let index = 0; index < 5; index += 1) {
      const result = await repo.upsert({
        user_id: userId,
        id: `t155-9-trick-${String(index).padStart(2, '0')}`,
        kind: 'standalone',
        name: `T155.9 Trick ${index}`,
      });
      assert.equal(result.status, 'succeeded', `fixture upsert ${index} failed: ${JSON.stringify(result)}`);
    }

    const pages = [];
    let cursor;
    do {
      const page = await repo.list({ limit: 2, cursor });
      assert.equal(page.status, 'succeeded', `list failed: ${JSON.stringify(page)}`);
      pages.push(page.page);
      cursor = page.page.nextCursor;
    } while (cursor !== null);

    assert.equal(pages.length, 3, `expected 3 pages, got ${pages.length}`);
    assert.equal(pages[0].items.length, 2);
    assert.equal(pages[1].items.length, 2);
    assert.equal(pages[2].items.length, 1);
    assert.equal(pages[2].nextCursor, null);

    const collectedIds = pages.flatMap((page) => page.items.map((item) => item.id));
    const expectedIds = Array.from({ length: 5 }, (_, index) => `t155-9-trick-${String(index).padStart(2, '0')}`);
    assert.deepEqual(new Set(collectedIds), new Set(expectedIds));
    assert.equal(collectedIds.length, new Set(collectedIds).size, 'a row id was duplicated across pages');
  });

  test('profile repository upsertProfile() succeeds for a valid row', async () => {
    const repo = createProfileCloudRepository(client);

    const result = await repo.upsertProfile({
      user_id: userId,
      has_completed_onboarding: true,
      kentei_rank: 5,
    });

    assert.equal(result.status, 'succeeded', `upsertProfile failed: ${JSON.stringify(result)}`);
    assert.equal(result.value.kentei_rank, 5);
  });

  test('profile repository upsertProfile() classifies a real out-of-range kentei_rank check-constraint violation as validation', async () => {
    const repo = createProfileCloudRepository(client);

    const result = await repo.upsertProfile({
      user_id: userId,
      has_completed_onboarding: true,
      kentei_rank: 999,
    });

    assert.equal(result.status, 'failed', `expected a failure, got: ${JSON.stringify(result)}`);
    assert.equal(result.error.kind, 'validation', `expected 'validation', got: ${JSON.stringify(result.error)}`);
  });
});
