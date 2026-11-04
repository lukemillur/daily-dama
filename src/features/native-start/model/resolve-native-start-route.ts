import type { CachedOnboardingStatus } from '@/features/profile/persistence/read-cached-onboarding-status';

export type NativeStartDecision = 'loading' | 'redirect-home' | 'show-start';

/**
 * Decides what the native root route (`/`) shows. `undefined` means the guest profile has not
 * been read yet, which must not render the Start screen (returning users would see it flash).
 * A finished onboarding needs both the flag and a rank, matching the web redirect and
 * `useRequireOnboarding`.
 */
export function resolveNativeStartDecision(
  status: CachedOnboardingStatus | undefined,
): NativeStartDecision {
  if (status === undefined) return 'loading';
  return status.hasCompletedOnboarding && status.kenteiRank !== undefined
    ? 'redirect-home'
    : 'show-start';
}
