import { describe, expect, it } from '@jest/globals';

import { resolveNativeStartDecision } from './resolve-native-start-route';

describe('resolveNativeStartDecision', () => {
  it('waits while the stored profile is unread', () => {
    expect(resolveNativeStartDecision(undefined)).toBe('loading');
  });

  it('shows Start for a fresh install', () => {
    expect(
      resolveNativeStartDecision({ hasCompletedOnboarding: false, kenteiRank: undefined }),
    ).toBe('show-start');
  });

  it('redirects Home once onboarding is complete with a rank', () => {
    expect(resolveNativeStartDecision({ hasCompletedOnboarding: true, kenteiRank: 3 })).toBe(
      'redirect-home',
    );
  });

  it('shows Start when the completed flag has no rank', () => {
    expect(
      resolveNativeStartDecision({ hasCompletedOnboarding: true, kenteiRank: undefined }),
    ).toBe('show-start');
  });
});
