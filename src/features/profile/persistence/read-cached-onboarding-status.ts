import { GUEST_IDENTITY } from '@/shared/persistence/identity';
import { physicalKey } from '@/shared/persistence/scoped-storage';

import { deserializeUserProfile, USER_PROFILE_STORAGE_KEY } from './user-profile-persistence';

export interface CachedOnboardingStatus {
  readonly hasCompletedOnboarding: boolean;
  readonly kenteiRank: number | undefined;
}

const DEFAULT_STATUS: CachedOnboardingStatus = {
  hasCompletedOnboarding: false,
  kenteiRank: undefined,
};

const GUEST_SCOPED_KEY = physicalKey(GUEST_IDENTITY, USER_PROFILE_STORAGE_KEY);

/**
 * Synchronously resolves the onboarding-completion flag and assessed Kentei rank from a raw
 * key/value read, for use before the async UserProfileProvider hydration path completes (e.g.
 * the landing route's CTA copy and redirect logic). `getItem` is injected so this stays
 * platform-agnostic and unit-testable; callers on web pass
 * `(key) => window.localStorage.getItem(key)`.
 *
 * Reads the identity-scoped guest key first, falling back to the bare legacy key only if the
 * scoped read is empty -- mirroring `read-cached-guest-theme.ts`'s `readCachedGuestTheme`, which
 * documents why this order matters (in short: `UserProfileProvider` has persisted through
 * `createGuestMigratingStorage` since T156.2, so the bare key can hold a stale snapshot from a
 * different identity, e.g. right after logout).
 */
export function readCachedOnboardingStatus(
  getItem: (key: string) => string | null,
): CachedOnboardingStatus {
  try {
    const serialized = getItem(GUEST_SCOPED_KEY) ?? getItem(USER_PROFILE_STORAGE_KEY);
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
