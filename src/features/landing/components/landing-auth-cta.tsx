import { useRouter } from 'expo-router';
import { styled } from 'styled-components/native';

import { Button } from '@/components/ui/button';
import { AppColors, Spacing } from '@/constants/theme';
import { useAuthState } from '@/features/auth/state/auth-provider';

interface LandingAuthCtaProps {
  /**
   * Whether the header bar is currently shown. Defaults to true so existing callers/tests
   * that dont pass it keep the bar visible. LandingPage drives this from scroll position.
   */
  readonly visible?: boolean;
}

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
 * LANDING_ARRIVAL_PARAM. It renders nothing once a visitor is authenticated, matching
 * GuestAccountSections mutually-exclusive render-null gating.
 *
 * Rendered as a sibling of the landing pages scrollable content (not inside it), absolutely
 * positioned across the top of the Screen. LandingPage toggles visible once the visitor
 * scrolls past a small threshold near the top, so the bar stays out of the way of the hero
 * content below it once scrolling begins.
 */
export function LandingAuthCta({ visible = true }: LandingAuthCtaProps) {
  const authState = useAuthState();
  const router = useRouter();
  const isGuest = authState.status === 'guest';

  if (!isGuest) {
    return null;
  }

  return (
    <HeaderBar testID="landing-header-bar" $visible={visible} pointerEvents={visible ? "auto" : "none"}>
      <Brand>Daily Dama</Brand>
      <ButtonRow>
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
      </ButtonRow>
    </HeaderBar>
  );
}

const HeaderBar = styled.View<{ readonly $visible: boolean }>`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 10;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: ${Spacing.three}px;
  padding: ${Spacing.three}px ${Spacing.four}px;
  background-color: ${AppColors.paper};
  border-bottom-width: 2px;
  border-bottom-color: ${AppColors.ink};
  opacity: ${({ $visible }) => ($visible ? 1 : 0)};
  transition: opacity 150ms ease;
`;

const Brand = styled.Text`
  color: ${AppColors.ink};
  font-size: 17px;
  font-weight: 900;
  letter-spacing: -0.3px;
`;

const ButtonRow = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: 12px;
`;

const SignUpButton = styled(Button)`
  align-self: flex-start;
`;

const SignInButton = styled(Button)`
  align-self: flex-start;
`;
