import { describe, expect, it } from '@jest/globals';

import type { Identity } from '@/shared/persistence/identity';
import { createScopedKeyValueStorage } from '@/shared/persistence/scoped-storage';
import type { KeyValueStorage } from '@/shared/persistence/storage';

const USER_A_ID = '11111111-1111-1111-1111-111111111111';
const USER_B_ID = '22222222-2222-2222-2222-222222222222';

/** Tiny in-memory fake so isolation tests read as a direct proof, not an implementation-detail assertion. */
function createFakeStore(): KeyValueStorage & { readonly raw: Map<string, string> } {
  const raw = new Map<string, string>();
  return {
    raw,
    getItem: async (key) => raw.get(key) ?? null,
    setItem: async (key, value) => {
      raw.set(key, value);
    },
  };
}

function createFakeContext(initial: Identity) {
  let identity = initial;
  return {
    getIdentity: () => identity,
    setIdentity: (next: Identity) => {
      identity = next;
    },
  };
}

describe('createScopedKeyValueStorage', () => {
  it('isolates identical logical keys into distinct physical namespaces per identity', async () => {
    const store = createFakeStore();
    const context = createFakeContext({ kind: 'guest' });
    const storage = createScopedKeyValueStorage(store, context);

    await storage.setItem('user-profile', 'guest-value');

    context.setIdentity({ kind: 'user', userId: USER_A_ID });
    await storage.setItem('user-profile', 'user-a-value');

    context.setIdentity({ kind: 'user', userId: USER_B_ID });
    const userBRead = await storage.getItem('user-profile');
    expect(userBRead).toBeNull(); // never sees A's or guest's value

    context.setIdentity({ kind: 'guest' });
    const guestRead = await storage.getItem('user-profile');
    expect(guestRead).toBe('guest-value'); // original guest value still intact

    context.setIdentity({ kind: 'user', userId: USER_A_ID });
    const userARead = await storage.getItem('user-profile');
    expect(userARead).toBe('user-a-value');
  });

  it('never accepts identity from mutation payload data', async () => {
    const store = createFakeStore();
    const context = createFakeContext({ kind: 'guest' });
    const storage = createScopedKeyValueStorage(store, context);

    await storage.setItem('user-profile', JSON.stringify({ userId: 'user:someone-else' }));

    // The physical key reflects only the fixed guest namespace; payload content is inert.
    expect(store.raw.has('guest:user-profile')).toBe(true);
    expect(store.raw.has('user:someone-else:user-profile')).toBe(false);
    expect([...store.raw.keys()]).toEqual(['guest:user-profile']);
  });

  it('reads the identity fresh on every call rather than memoizing it at construction time', async () => {
    const store = createFakeStore();
    const context = createFakeContext({ kind: 'guest' });
    const storage = createScopedKeyValueStorage(store, context);

    await storage.setItem('same-logical-key', 'first');
    context.setIdentity({ kind: 'user', userId: USER_A_ID });
    await storage.setItem('same-logical-key', 'second');

    expect(store.raw.get('guest:same-logical-key')).toBe('first');
    expect(store.raw.get(`user:${USER_A_ID}:same-logical-key`)).toBe('second');
  });

  it('passes through the base storage getItem rejection', async () => {
    const failure = new Error('read failed');
    const failingBase: KeyValueStorage = {
      getItem: async () => {
        throw failure;
      },
      setItem: async () => undefined,
    };
    const storage = createScopedKeyValueStorage(failingBase, createFakeContext({ kind: 'guest' }));

    await expect(storage.getItem('key')).rejects.toBe(failure);
  });

  it('passes through the base storage setItem rejection', async () => {
    const failure = new Error('write failed');
    const failingBase: KeyValueStorage = {
      getItem: async () => null,
      setItem: async () => {
        throw failure;
      },
    };
    const storage = createScopedKeyValueStorage(failingBase, createFakeContext({ kind: 'guest' }));

    await expect(storage.setItem('key', 'value')).rejects.toBe(failure);
  });
});
