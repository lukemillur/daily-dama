import type { AuthStatus } from '@/features/auth/model/auth-state';

/**
 * Shared rule for the "leave the auth form" button on sign-in-screen.tsx and
 * sign-up-screen.tsx. Mirrors landing-cta.tsx's `isReturning` check (see T242/T243): an
 * `authenticated` session is itself sufficient proof of a returning visitor, and
 * `hasCompletedOnboarding` covers a guest who has already been through onboarding.
 * `initializing` deliberately does not count on its own.
 */
export function resolveGuestBackButtonLabel(
  authStatus: AuthStatus,
  hasCompletedOnboarding: boolean,
): 'Continue as guest' | 'Back to app' {
  const isReturning = authStatus === 'authenticated' || hasCompletedOnboarding;
  return isReturning ? 'Back to app' : 'Continue as guest';
}
