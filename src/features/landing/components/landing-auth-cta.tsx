import { useRouter } from 'expo-router';
import { useState } from 'react';
import { styled } from 'styled-components/native';

import { Button } from '@/components/ui/button';
import { AppColors, Spacing } from '@/constants/theme';
import type { AuthErrorCategory } from '@/features/auth/model/auth-errors';
import { categorizeAuthError } from '@/features/auth/model/auth-errors';
import { LOG_OUT_ERROR_COPY } from '@/features/auth/model/log-out-error-copy';
import { logAuthWarning, trackAuthEvent } from '@/features/auth/observability/auth-observability';
import { useAuthActions, useAuthState } from '@/features/auth/state/auth-provider';

/**
 * A persistent, scroll-aware header bar holding the sign-up/sign-in entry points for a
 * not-yet-onboarded guest visitor on the landing page.
 *
 * This exists because Profile -- the only other sign-up/sign-in entry point
 * (GuestAccountSection) -- is unreachable until onboarding completes (app-tabs.tsx hides
 * every tab until hasCompletedOnboarding). A guest who already has local data (or wants to
 * sign up before ever touching onboarding) otherwise has no way to reach /auth/sign-up /
 * /auth/sign-in directly.
 *
 * Deliberately gated only on useAuthState() -- never on onboarding status -- so this stays
 * completely decoupled from useCachedOnboardingStatus / useRedirectOnboardedVisitorHome /
 * LANDING_ARRIVAL_PARAM. For an authenticated visitor the same bar shows the brand plus a
 * Log out action; logout calls useAuthActions().signOut() directly rather than
 * useLogoutGuard, because SyncCoordinatorProvider and the five domain providers are mounted
 * only under /app and T145 forbids mounting persistence providers above the landing route --
 * so the unsynced-changes prompt is structurally unavailable here and Profile remains the
 * guarded logout surface.
 *
 * Rendered as the first element inside the landing page's own scrollable content (not
 * absolutely positioned above it), so it scrolls away with the rest of the page under normal
 * browser scrolling. The original T254 version used position: absolute plus a JS scroll
 * listener toggling opacity/display instead; T265 replaced it with this simpler in-flow
 * version, since normal document flow needs no scroll-position-driven show/hide logic at all.
 * (T265's actual reported bug turned out to be unrelated to this component -- see
 * `includeWebHeaderInset` on LandingPage's `Screen` -- but this simplification stands on its
 * own merits.)
 */
export function LandingAuthCta() {
  const authState = useAuthState();
  const router = useRouter();
  const { signOut } = useAuthActions();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [logOutError, setLogOutError] = useState<AuthErrorCategory | undefined>(undefined);

  const isGuest = authState.status === 'guest';
  const isAuthenticated = authState.status === 'authenticated';

  if (!isGuest && !isAuthenticated) {
    return null;
  }

  const handleLogOutPress = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    setLogOutError(undefined);
    const { error } = await signOut();
    if (error) {
      const category = categorizeAuthError(error);
      logAuthWarning('Log out failed.', error);
      trackAuthEvent('log_out_error', category);
      setLogOutError(category);
    } else {
      trackAuthEvent('log_out_success');
    }
    setIsSigningOut(false);
  };

  return (
    <HeaderBar testID="landing-header-bar">
      <Brand>Daily Dama</Brand>
      <ButtonRow>
        {isGuest ? (
          <>
            <SignUpButton
              accessibilityLabel="Sign up"
              size="medium"
              onPress={() => router.push('/auth/sign-up')}>
              Sign up
            </SignUpButton>
            <SignInButton
              accessibilityLabel="Sign in"
              size="medium"
              variant="secondary"
              onPress={() => router.push('/auth/sign-in')}>
              Sign in
            </SignInButton>
          </>
        ) : (
          <LogOutColumn>
            {logOutError ? <ErrorText>{LOG_OUT_ERROR_COPY[logOutError]}</ErrorText> : null}
            <LogOutButton
              accessibilityLabel="Log out"
              size="medium"
              variant="secondary"
              disabled={isSigningOut}
              onPress={() => {
                void handleLogOutPress();
              }}>
              {isSigningOut ? 'Logging out...' : 'Log out'}
            </LogOutButton>
          </LogOutColumn>
        )}
      </ButtonRow>
    </HeaderBar>
  );
}

const HeaderBar = styled.View`
  align-self: stretch;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: ${Spacing.two}px;
  padding: ${Spacing.three}px ${Spacing.three}px;
  background-color: ${AppColors.paper};
  border-bottom-width: 2px;
  border-bottom-color: ${AppColors.ink};
`;

const Brand = styled.Text`
  color: ${AppColors.ink};
  font-size: 28px;
  font-weight: 900;
  letter-spacing: -0.3px;
`;

const ButtonRow = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: 8px;
`;

const SignUpButton = styled(Button)`
  align-self: flex-start;
  padding: 10px 14px;
`;

const SignInButton = styled(Button)`
  align-self: flex-start;
  padding: 10px 14px;
`;

const LogOutColumn = styled.View`
  align-items: flex-end;
  gap: 6px;
`;

const LogOutButton = styled(Button)`
  align-self: flex-start;
  padding: 10px 14px;
`;

const ErrorText = styled.Text`
  color: ${AppColors.red};
  font-size: 12px;
  font-weight: 800;
`;
