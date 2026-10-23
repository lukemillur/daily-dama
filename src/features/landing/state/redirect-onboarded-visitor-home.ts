import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';

import { LANDING_ARRIVAL_FROM_APP, LANDING_ARRIVAL_PARAM } from './landing-navigation';
import { useCachedOnboardingStatus } from './use-cached-onboarding-status';

/**
 * Redirects a fresh arrival at `/` straight to `/app/home` when onboarding is
 * already complete. Skipped when the visit carries the in-app "exit to
 * landing" signal (see landing-navigation.ts) so that link isn't a dead
 * end.
 */
export function useRedirectOnboardedVisitorHome() {
  const { hasCompletedOnboarding, kenteiRank } = useCachedOnboardingStatus();
  const router = useRouter();
  const params = useLocalSearchParams();
  const isOnboardingComplete = hasCompletedOnboarding && kenteiRank !== undefined;
  const isInAppArrival = params[LANDING_ARRIVAL_PARAM] === LANDING_ARRIVAL_FROM_APP;
  const shouldRedirect = isOnboardingComplete && !isInAppArrival;

  useEffect(() => {
    if (shouldRedirect) router.replace('/app/home');
  }, [shouldRedirect, router]);

  return shouldRedirect;
}
