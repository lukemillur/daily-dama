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

  it('maps PASSWORD_RECOVERY to passwordRecovery', () => {
    expect(deriveAuthState('PASSWORD_RECOVERY', fakeSession)).toEqual({
      status: 'passwordRecovery',
      session: fakeSession,
    });
  });

  it('keeps passwordRecovery across a later TOKEN_REFRESHED for the same session', () => {
    const previous = deriveAuthState('PASSWORD_RECOVERY', fakeSession);
    const refreshed = { ...fakeSession, access_token: 'new-token' } as unknown as Session;
    expect(deriveAuthState('TOKEN_REFRESHED', refreshed, previous)).toEqual({
      status: 'passwordRecovery',
      session: refreshed,
    });
  });

  it('drops passwordRecovery back to guest on SIGNED_OUT', () => {
    const previous = deriveAuthState('PASSWORD_RECOVERY', fakeSession);
    expect(deriveAuthState('SIGNED_OUT', null, previous)).toEqual({ status: 'guest', reason: 'signedOut' });
  });

  it('drops passwordRecovery back to guest when the session becomes null', () => {
    const previous = deriveAuthState('PASSWORD_RECOVERY', fakeSession);
    expect(deriveAuthState('TOKEN_REFRESHED', null, previous)).toEqual({ status: 'guest', reason: 'signedOut' });
  });

  it('maps USER_UPDATED to authenticated with no previous state', () => {
    expect(deriveAuthState('USER_UPDATED', fakeSession)).toEqual({
      status: 'authenticated',
      session: fakeSession,
      lastEvent: 'USER_UPDATED',
    });
  });

  it('promotes passwordRecovery to authenticated on USER_UPDATED (T274)', () => {
    const previous = deriveAuthState('PASSWORD_RECOVERY', fakeSession);
    const updated = { ...fakeSession, access_token: 'updated-token' } as unknown as Session;
    expect(deriveAuthState('USER_UPDATED', updated, previous)).toEqual({
      status: 'authenticated',
      session: updated,
      lastEvent: 'USER_UPDATED',
    });
  });
});
