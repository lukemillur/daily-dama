import { describe, expect, it } from '@jest/globals';
import type { Session } from '@supabase/supabase-js';

import type { AuthState } from '@/features/auth/model/auth-state';
import { deriveIdentityFromAuthState } from '@/features/auth/model/identity-from-auth-state';
import { GUEST_IDENTITY } from '@/shared/persistence/identity';

const UUID = '11111111-1111-1111-1111-111111111111';

function sessionWithUserId(id: string): Session {
  return { access_token: 't', user: { id } } as unknown as Session;
}

describe('deriveIdentityFromAuthState', () => {
  it('maps initializing to undefined', () => {
    const state: AuthState = { status: 'initializing' };
    expect(deriveIdentityFromAuthState(state)).toBeUndefined();
  });

  it('maps guest (any reason) to GUEST_IDENTITY', () => {
    const signedOut: AuthState = { status: 'guest', reason: 'signedOut' };
    const unconfigured: AuthState = { status: 'guest', reason: 'unconfigured' };
    const error: AuthState = { status: 'guest', reason: 'error' };

    expect(deriveIdentityFromAuthState(signedOut)).toEqual(GUEST_IDENTITY);
    expect(deriveIdentityFromAuthState(unconfigured)).toEqual(GUEST_IDENTITY);
    expect(deriveIdentityFromAuthState(error)).toEqual(GUEST_IDENTITY);
  });

  it('maps authenticated with a well-formed session.user.id to a user identity', () => {
    const state: AuthState = {
      status: 'authenticated',
      session: sessionWithUserId(UUID),
      lastEvent: 'SIGNED_IN',
    };
    expect(deriveIdentityFromAuthState(state)).toEqual({ kind: 'user', userId: UUID });
  });

  it('maps passwordRecovery with a well-formed session.user.id the same way', () => {
    const state: AuthState = { status: 'passwordRecovery', session: sessionWithUserId(UUID) };
    expect(deriveIdentityFromAuthState(state)).toEqual({ kind: 'user', userId: UUID });
  });

  it('rejects a malformed/empty session.user.id back to guest instead of throwing', () => {
    const malformed: AuthState = {
      status: 'authenticated',
      session: sessionWithUserId('not-a-uuid'),
      lastEvent: 'SIGNED_IN',
    };
    const empty: AuthState = {
      status: 'authenticated',
      session: sessionWithUserId(''),
      lastEvent: 'SIGNED_IN',
    };

    expect(() => deriveIdentityFromAuthState(malformed)).not.toThrow();
    expect(deriveIdentityFromAuthState(malformed)).toEqual(GUEST_IDENTITY);
    expect(deriveIdentityFromAuthState(empty)).toEqual(GUEST_IDENTITY);
  });
});
