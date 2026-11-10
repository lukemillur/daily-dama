import type { AuthStatus } from '@/features/auth/model/auth-state';
import type { CachedOnboardingStatus } from '@/features/profile/persistence/read-cached-onboarding-status';

export type NativeStartDecision = 'loading' | 'redirect-home' | 'show-start';

export interface NativeStartInputs {
  readonly authStatus: AuthStatus;
  /** The guest-scoped cached profile; `undefined` until it has been read. */
  readonly guestProfile: CachedOnboardingStatus | undefined;
}

/**
 * Decides what the native root route (`/`) shows. Pure: the caller passes auth state and the
 * guest-profile read in.
 *
 * Any signed-in status (including `refreshFailed`, whose recovery UI lives under Home) goes to
 * Home, which owns the identity-scoped onboarding decision and waits for the first profile
 * pull. The Start screen is for guests only, so an existing account never sees it. For guests,
 * `undefined` means the profile has not been read yet, which must not render the Start screen
 * (returning users would see it flash). A finished onboarding needs both the flag and a rank,
 * matching the web redirect and `useRequireOnboarding`.
 */
export function resolveNativeStartDecision({
  authStatus,
  guestProfile,
}: NativeStartInputs): NativeStartDecision {
  if (authStatus === 'initializing') return 'loading';
  if (authStatus !== 'guest') return 'redirect-home';
  if (guestProfile === undefined) return 'loading';
  return guestProfile.hasCompletedOnboarding && guestProfile.kenteiRank !== undefined
    ? 'redirect-home'
    : 'show-start';
}
