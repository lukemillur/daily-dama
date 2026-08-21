import { deserializeUserProfile, USER_PROFILE_STORAGE_KEY } from './user-profile-persistence';

export interface CachedOnboardingStatus {
  readonly hasCompletedOnboarding: boolean;
  readonly kenteiRank: number | undefined;
}

const DEFAULT_STATUS: CachedOnboardingStatus = {
  hasCompletedOnboarding: false,
  kenteiRank: undefined,
};

/**
 * Synchronously resolves the onboarding-completion flag and assessed Kentei rank from a raw
 * key/value read, for use before the async UserProfileProvider hydration path completes (e.g.
 * the landing route's CTA copy and redirect logic). `getItem` is injected so this stays
 * platform-agnostic and unit-testable; callers on web pass
 * `(key) => window.localStorage.getItem(key)`. Mirrors read-cached-theme-background.ts.
 */
export function readCachedOnboardingStatus(
  getItem: (key: string) => string | null,
): CachedOnboardingStatus {
  try {
    const serialized = getItem(USER_PROFILE_STORAGE_KEY);
    if (serialized === null) return DEFAULT_STATUS;

    const profile = deserializeUserProfile(serialized);
    if (!profile) return DEFAULT_STATUS;

    return {
      hasCompletedOnboarding: profile.hasCompletedOnboarding,
      kenteiRank: profile.hasCompletedOnboarding ? profile.kenteiRank : undefined,
    };
  } catch {
    return DEFAULT_STATUS;
  }
}
