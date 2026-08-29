import { describe, expect, it, jest } from '@jest/globals';

import { purgeIdentityNamespace } from '@/shared/persistence/account-purge';
import { createUserIdentity, type Identity } from '@/shared/persistence/identity';

function mustCreateUserIdentity(userId: string): Identity & { kind: 'user' } {
  const identity = createUserIdentity(userId);
  if (identity === undefined || identity.kind !== 'user') {
    throw new Error('Expected a valid user identity in this test fixture.');
  }
  return identity;
}

const USER_A = mustCreateUserIdentity('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1');
const USER_B = mustCreateUserIdentity('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2');

function createFakeStorage(initialKeys: readonly string[]) {
  let keys: readonly string[] = initialKeys.slice();
  const multiRemove = jest.fn(async (removed: readonly string[]) => {
    const removedSet = new Set(removed);
    keys = keys.filter((key) => !removedSet.has(key));
  });
  return {
    getAllKeys: jest.fn(async () => keys),
    multiRemove,
    remaining: () => keys,
  };
}

describe('purgeIdentityNamespace', () => {
  it('removes only keys under the given user identity namespace', async () => {
    const storage = createFakeStorage([
      'user:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1:daily-dama:user-profile',
      'user:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1:daily-dama:custom-tricks',
      'guest:daily-dama:user-profile',
    ]);

    await purgeIdentityNamespace(storage, USER_A);

    expect(storage.multiRemove).toHaveBeenCalledWith([
      'user:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1:daily-dama:user-profile',
      'user:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1:daily-dama:custom-tricks',
    ]);
    expect(storage.remaining()).toEqual(['guest:daily-dama:user-profile']);
  });

  it('leaves a guest key and a different user namespace untouched', async () => {
    const storage = createFakeStorage([
      'user:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1:daily-dama:user-profile',
      'user:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2:daily-dama:user-profile',
      'guest:daily-dama:user-profile',
    ]);

    await purgeIdentityNamespace(storage, USER_A);

    expect(storage.remaining()).toEqual([
      'user:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2:daily-dama:user-profile',
      'guest:daily-dama:user-profile',
    ]);
  });

  it('no-ops cleanly when nothing matches', async () => {
    const storage = createFakeStorage(['guest:daily-dama:user-profile']);

    await purgeIdentityNamespace(storage, USER_A);

    expect(storage.multiRemove).not.toHaveBeenCalled();
    expect(storage.remaining()).toEqual(['guest:daily-dama:user-profile']);
  });

  it('does not treat one user id as a prefix-collision match for another user id differing only in the last character', async () => {
    const storage = createFakeStorage([
      'user:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1:daily-dama:user-profile',
      'user:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2:daily-dama:user-profile',
    ]);

    await purgeIdentityNamespace(storage, USER_B);

    expect(storage.remaining()).toEqual([
      'user:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1:daily-dama:user-profile',
    ]);
  });
});
