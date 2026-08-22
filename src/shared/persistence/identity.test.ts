import { describe, expect, it } from '@jest/globals';

import {
  createUserIdentity,
  GUEST_IDENTITY,
  identitiesEqual,
  identityNamespace,
  isValidVerifiedUserId,
} from '@/shared/persistence/identity';

const UUID_A = '11111111-1111-1111-1111-111111111111';
const UUID_B = '22222222-2222-2222-2222-222222222222';

describe('createUserIdentity', () => {
  it('accepts a well-formed UUID', () => {
    expect(createUserIdentity(UUID_A)).toEqual({ kind: 'user', userId: UUID_A });
  });

  it('rejects an empty string', () => {
    expect(createUserIdentity('')).toBeUndefined();
  });

  it('rejects a non-UUID string', () => {
    expect(createUserIdentity('not-a-uuid')).toBeUndefined();
  });

  it('rejects a string containing a colon (injection/collision case)', () => {
    expect(createUserIdentity(`${UUID_A}:extra`)).toBeUndefined();
    expect(createUserIdentity('user:someone-else')).toBeUndefined();
  });

  it('rejects undefined, numbers, and objects', () => {
    expect(createUserIdentity(undefined)).toBeUndefined();
    expect(createUserIdentity(12345)).toBeUndefined();
    expect(createUserIdentity({ id: UUID_A })).toBeUndefined();
  });
});

describe('isValidVerifiedUserId', () => {
  it('is true only for a well-formed UUID string', () => {
    expect(isValidVerifiedUserId(UUID_A)).toBe(true);
    expect(isValidVerifiedUserId('nope')).toBe(false);
    expect(isValidVerifiedUserId(42)).toBe(false);
  });
});

describe('identityNamespace', () => {
  it('produces distinct strings for guest and two different users', () => {
    const guestNs = identityNamespace(GUEST_IDENTITY);
    const userANs = identityNamespace({ kind: 'user', userId: UUID_A });
    const userBNs = identityNamespace({ kind: 'user', userId: UUID_B });

    expect(new Set([guestNs, userANs, userBNs]).size).toBe(3);
  });

  it('produces the same string for the same user id twice', () => {
    const first = identityNamespace({ kind: 'user', userId: UUID_A });
    const second = identityNamespace({ kind: 'user', userId: UUID_A });
    expect(first).toBe(second);
  });
});

describe('identitiesEqual', () => {
  it('is true for two guests', () => {
    expect(identitiesEqual(GUEST_IDENTITY, { kind: 'guest' })).toBe(true);
  });

  it('is true for the same user id', () => {
    expect(
      identitiesEqual({ kind: 'user', userId: UUID_A }, { kind: 'user', userId: UUID_A }),
    ).toBe(true);
  });

  it('is false for different user ids', () => {
    expect(
      identitiesEqual({ kind: 'user', userId: UUID_A }, { kind: 'user', userId: UUID_B }),
    ).toBe(false);
  });

  it('is false for guest vs. user', () => {
    expect(identitiesEqual(GUEST_IDENTITY, { kind: 'user', userId: UUID_A })).toBe(false);
  });
});
