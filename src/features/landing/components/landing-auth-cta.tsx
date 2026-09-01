import { useRouter } from 'expo-router';
import { styled } from 'styled-components/native';

import { Button } from '@/components/ui/button';
import { BodyText } from '@/components/ui/typography';
import { AppColors } from '@/constants/theme';
import { useAuthState } from '@/features/auth/state/auth-provider';

/**
 * A parallel, landing-page sign-up/sign-in entry point for a not-yet-onboarded guest visitor.
 *
 * This exists because Profile -- the only other sign-up/sign-in entry point
 * (`GuestAccountSection`) -- is unreachable until onboarding completes (`app-tabs.tsx` hides
 * every tab until `hasCompletedOnboarding`). A guest who already has local data (or wants to
 * sign up before ever touching onboarding) otherwise has no way to reach `/auth/sign-up` /
 * `/auth/sign-in` directly.
 *
 * Deliberately gated only on `useAuthState()` -- never on onboarding status -- so this stays
 * completely decoupled from `useCachedOnboardingStatus` / `useRedirectOnboardedVisitorHome` /
 * `LANDING_ARRIVAL_PARAM`. It renders nothing once a visitor is authenticated, matching
 * `GuestAccountSection`'s mutually-exclusive render-null gating.
 */
export function LandingAuthCta() {
  const authState = useAuthState();
  const router = useRouter();

  if (authState.status !== 'guest') return null;

  return (
    <Section>
      <Copy>Already have an account, or ready to make one?</Copy>
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
    </Section>
  );
}

// Deliberately small, unpanelled framing (no border/boxShadow) -- this is a secondary, parallel
// entry point and must stay visually subordinate to LandingCta's bold sticker-card treatment.
const Section = styled.View`
  margin-top: 18px;
  gap: 10px;
  align-items: flex-start;
`;

const Copy = styled(BodyText)`
  color: ${AppColors.textMuted};
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
