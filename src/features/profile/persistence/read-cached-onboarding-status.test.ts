import { describe, expect, it, jest } from '@jest/globals';

// The mock is hoisted above these imports by babel-jest, so it runs before
// readCachedOnboardingStatus's transitive import chain ever reaches AsyncStorage. See
// read-cached-theme-background.test.ts for the same pattern.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { GUEST_IDENTITY } from '@/shared/persistence/identity';
import { physicalKey } from '@/shared/persistence/scoped-storage';

import { readCachedOnboardingStatus } from './read-cached-onboarding-status';
import { USER_PROFILE_STORAGE_KEY } from './user-profile-persistence';

const DEFAULT_STATUS = { hasCompletedOnboarding: false, kenteiRank: undefined };

const GUEST_SCOPED_KEY = physicalKey(GUEST_IDENTITY, USER_PROFILE_STORAGE_KEY);

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

  it('falls back to the legacy bare key when the guest-scoped key is empty', () => {
    const store: Record<string, string> = {
      [USER_PROFILE_STORAGE_KEY]: validDocument(true, 4),
    };
    const result = readCachedOnboardingStatus((key) => store[key] ?? null);
    expect(result).toEqual({ hasCompletedOnboarding: true, kenteiRank: 4 });
  });

  it('prefers the guest-scoped key over the legacy bare key when both exist', () => {
    const store: Record<string, string> = {
      [GUEST_SCOPED_KEY]: validDocument(true, 9),
      [USER_PROFILE_STORAGE_KEY]: validDocument(true, 2),
    };
    const result = readCachedOnboardingStatus((key) => store[key] ?? null);
    expect(result).toEqual({ hasCompletedOnboarding: true, kenteiRank: 9 });
  });

  it('reads a fresh guest identity from the guest-scoped key even when a stale bare-key snapshot claims completed onboarding', () => {
    const store: Record<string, string> = {
      [GUEST_SCOPED_KEY]: validDocument(false),
      [USER_PROFILE_STORAGE_KEY]: validDocument(true, 7),
    };
    const result = readCachedOnboardingStatus((key) => store[key] ?? null);
    expect(result).toEqual(DEFAULT_STATUS);
  });
});
