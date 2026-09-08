import { describe, expect, it } from '@jest/globals';

import { resolveGuestBackButtonLabel } from '@/features/auth/model/guest-back-button';

describe('resolveGuestBackButtonLabel', () => {
  it('reads "Continue as guest" for a guest who has not completed onboarding', () => {
    expect(resolveGuestBackButtonLabel('guest', false)).toBe('Continue as guest');
  });

  it('reads "Back to app" for a guest who has completed onboarding', () => {
    expect(resolveGuestBackButtonLabel('guest', true)).toBe('Back to app');
  });

  it('reads "Back to app" for an authenticated user, regardless of the cached onboarding flag', () => {
    expect(resolveGuestBackButtonLabel('authenticated', false)).toBe('Back to app');
    expect(resolveGuestBackButtonLabel('authenticated', true)).toBe('Back to app');
  });

  it('reads "Continue as guest" while initializing with an incomplete cached onboarding flag', () => {
    expect(resolveGuestBackButtonLabel('initializing', false)).toBe('Continue as guest');
  });
});
