import { describe, expect, it } from '@jest/globals';

import type { AuthStatus } from '@/features/auth/model/auth-state';

import { resolveNativeStartDecision } from './resolve-native-start-route';

const fresh = { hasCompletedOnboarding: false, kenteiRank: undefined };
const done = { hasCompletedOnboarding: true, kenteiRank: 3 };

describe('resolveNativeStartDecision', () => {
  it('waits while auth is initializing, whatever the guest profile says', () => {
    expect(resolveNativeStartDecision({ authStatus: 'initializing', guestProfile: done })).toBe('loading');
    expect(resolveNativeStartDecision({ authStatus: 'initializing', guestProfile: undefined })).toBe('loading');
  });

  it.each<AuthStatus>(['authenticated', 'passwordRecovery', 'refreshFailed'])(
    'sends %s identities Home regardless of the guest profile',
    (authStatus) => {
      for (const guestProfile of [undefined, fresh, done]) {
        expect(resolveNativeStartDecision({ authStatus, guestProfile })).toBe('redirect-home');
      }
    },
  );

  it('waits while the guest profile is unread', () => {
    expect(resolveNativeStartDecision({ authStatus: 'guest', guestProfile: undefined })).toBe('loading');
  });

  it('shows Start for a fresh guest install', () => {
    expect(resolveNativeStartDecision({ authStatus: 'guest', guestProfile: fresh })).toBe('show-start');
  });

  it('redirects a guest Home once onboarding is complete with a rank', () => {
    expect(resolveNativeStartDecision({ authStatus: 'guest', guestProfile: done })).toBe('redirect-home');
  });

  it('shows Start when the completed flag has no rank', () => {
    expect(
      resolveNativeStartDecision({
        authStatus: 'guest',
        guestProfile: { hasCompletedOnboarding: true, kenteiRank: undefined },
      }),
    ).toBe('show-start');
  });
});
