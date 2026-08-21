import { describe, expect, it } from '@jest/globals';
import type { Session } from '@supabase/supabase-js';

import { deriveAuthState } from '@/features/auth/model/auth-state';

const fakeSession = { access_token: 't', user: { id: 'u1' } } as unknown as Session;

describe('deriveAuthState', () => {
  it('maps INITIAL_SESSION with a null session to guest/signedOut', () => {
    expect(deriveAuthState('INITIAL_SESSION', null)).toEqual({ status: 'guest', reason: 'signedOut' });
  });

  it('maps INITIAL_SESSION with a cached session to authenticated', () => {
    expect(deriveAuthState('INITIAL_SESSION', fakeSession)).toEqual({
      status: 'authenticated',
      session: fakeSession,
      lastEvent: 'INITIAL_SESSION',
    });
  });

  it('maps SIGNED_IN to authenticated', () => {
    expect(deriveAuthState('SIGNED_IN', fakeSession)).toEqual({
      status: 'authenticated',
      session: fakeSession,
      lastEvent: 'SIGNED_IN',
    });
  });

  it('maps SIGNED_OUT to guest/signedOut regardless of session', () => {
    expect(deriveAuthState('SIGNED_OUT', null)).toEqual({ status: 'guest', reason: 'signedOut' });
  });

  it('reflects the new session on TOKEN_REFRESHED', () => {
    const refreshed = { ...fakeSession, access_token: 'new-token' } as unknown as Session;
    expect(deriveAuthState('TOKEN_REFRESHED', refreshed)).toEqual({
      status: 'authenticated',
      session: refreshed,
      lastEvent: 'TOKEN_REFRESHED',
    });
  });
});
