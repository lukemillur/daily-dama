import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import {
  type CachedOnboardingStatus,
  readCachedOnboardingStatus,
} from '@/features/profile/persistence/read-cached-onboarding-status';
import { USER_PROFILE_STORAGE_KEY } from '@/features/profile/persistence/user-profile-persistence';

const DEFAULT_STATUS: CachedOnboardingStatus = {
  hasCompletedOnboarding: false,
  kenteiRank: undefined,
};

const emptySubscribe = () => () => {};

/**
 * Resolves the onboarding-completion flag and assessed Kentei rank synchronously, without
 * waiting on UserProfileProvider's async AsyncStorage hydration -- for use on the landing route
 * (`/`), which must not block its first paint on any persistence provider (see T145).
 *
 * On web, `localStorage` is synchronous, so this reads it directly once past the
 * server/first-client-render hydration boundary (the same `useSyncExternalStore` gate
 * `AnimatedSplashOverlay` and `LandingHero` already use -- see read-cached-theme-background.ts
 * and landing-hero.tsx). Static export prerendering happens in Node, where there is no
 * `window`, so the prerendered HTML and the very first client render must both use the fixed
 * default; only the render *after* that boundary may read the real cached value, and
 * `useSyncExternalStore`'s hydration-mismatch check applies that boundary before the browser
 * paints, so there is no visible flip.
 *
 * On native, there is no synchronous storage API, so this falls back to one non-blocking
 * `AsyncStorage.getItem` read that updates state once it resolves. This preserves today's
 * native behavior (a brief delay before the correct value is known) rather than guaranteeing a
 * synchronous first paint there -- native is not an active verification target for this task.
 */
export function useCachedOnboardingStatus(): CachedOnboardingStatus {
  const hasHydrated = useSyncExternalStore(emptySubscribe, () => true, () => false);
  const [nativeStatus, setNativeStatus] = useState<CachedOnboardingStatus>(DEFAULT_STATUS);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    let isCurrent = true;
    AsyncStorage.getItem(USER_PROFILE_STORAGE_KEY).then((serialized) => {
      if (!isCurrent) return;
      setNativeStatus(readCachedOnboardingStatus(() => serialized));
    });

    return () => {
      isCurrent = false;
    };
  }, []);

  if (Platform.OS !== 'web') return nativeStatus;
  if (!hasHydrated) return DEFAULT_STATUS;

  return readCachedOnboardingStatus((key) => window.localStorage.getItem(key));
}
