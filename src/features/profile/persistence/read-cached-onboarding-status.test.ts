import { describe, expect, it, jest } from '@jest/globals';

// The mock is hoisted above these imports by babel-jest, so it runs before
// readCachedOnboardingStatus's transitive import chain ever reaches AsyncStorage. See
// read-cached-theme-background.test.ts for the same pattern.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { readCachedOnboardingStatus } from './read-cached-onboarding-status';

const DEFAULT_STATUS = { hasCompletedOnboarding: false, kenteiRank: undefined };

function validDocument(hasCompletedOnboarding: boolean, kenteiRank?: number): string {
  return JSON.stringify({
    version: 1,
    profile: {
      hasCompletedOnboarding,
      selectedTrickIds: [],
      ...(kenteiRank !== undefined ? { kenteiRank } : {}),
    },
  });
}

describe('readCachedOnboardingStatus', () => {
  it('returns the default status when no value is cached', () => {
    expect(readCachedOnboardingStatus(() => null)).toEqual(DEFAULT_STATUS);
  });

  it('returns hasCompletedOnboarding: false and no kenteiRank for a pre-onboarding profile', () => {
    const getItem = () => validDocument(false);
    expect(readCachedOnboardingStatus(getItem)).toEqual(DEFAULT_STATUS);
  });

  it('returns hasCompletedOnboarding: true and the saved kenteiRank when present', () => {
    const getItem = () => validDocument(true, 5);
    expect(readCachedOnboardingStatus(getItem)).toEqual({
      hasCompletedOnboarding: true,
      kenteiRank: 5,
    });
  });

  it('returns the default status for malformed JSON', () => {
    const getItem = () => 'not json';
    expect(readCachedOnboardingStatus(getItem)).toEqual(DEFAULT_STATUS);
  });

  it('returns the default status for the wrong document version', () => {
    const getItem = () => JSON.stringify({ version: 2, profile: {} });
    expect(readCachedOnboardingStatus(getItem)).toEqual(DEFAULT_STATUS);
  });

  it('returns the default status when getItem throws', () => {
    const getItem = (): string | null => {
      throw new Error('blocked');
    };
    expect(readCachedOnboardingStatus(getItem)).toEqual(DEFAULT_STATUS);
  });
});
