import { useRouter } from 'expo-router';
import { useEffect } from 'react';

import { useUserProfile } from '@/features/profile/state/user-profile-provider';

/**
 * Redirects to Home if onboarding isn't complete, for screens reached by direct
 * navigation (typed URL, deep link, stale link) rather than the tab bar, which
 * already hides these tabs (see src/components/app-tabs.tsx) until onboarding
 * is done.
 */
export function useRequireOnboarding() {
  const profile = useUserProfile();
  const router = useRouter();
  const isOnboardingComplete = profile.hasCompletedOnboarding && profile.kenteiRank !== undefined;

  useEffect(() => {
    if (!isOnboardingComplete) router.replace('/');
  }, [isOnboardingComplete, router]);

  return isOnboardingComplete;
}
