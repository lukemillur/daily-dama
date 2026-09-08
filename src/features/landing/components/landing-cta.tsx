import { useRouter } from 'expo-router';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { styled } from 'styled-components/native';

import { Button } from '@/components/ui/button';
import { BodyText } from '@/components/ui/typography';
import { AppColors, Radii } from '@/constants/theme';
import { useAuthState } from '@/features/auth/state/auth-provider';
import { useCachedOnboardingStatus } from '@/features/landing/state/use-cached-onboarding-status';

interface CtaCopy {
  readonly tag: string;
  readonly headline: string;
  readonly body: string;
  readonly action: string;
}

const FIRST_TIME_COPY: CtaCopy = {
  tag: 'Ready when you are',
  headline: 'Start your first sesh.',
  body: 'Pick one trick, hold your focus on it, and see what a deliberate ten minutes does.',
  action: 'Start your first Sesh',
};

const RETURNING_COPY: CtaCopy = {
  tag: 'Welcome back',
  headline: 'Jump back into practice.',
  body: 'Your seshes, streak, and stats picked up right where you left them.',
  action: 'Back to practice',
};

export function LandingCta() {
  const authState = useAuthState();
  const { hasCompletedOnboarding } = useCachedOnboardingStatus();
  const router = useRouter();
  // `useCachedOnboardingStatus` only ever reads the guest-scoped profile key, so a signed-in
  // user's onboarding flag is invisible to it; an `authenticated` session is itself
  // sufficient proof of a returning visitor. `initializing` deliberately does not count, so
  // the prerendered/first-client render still matches today's output.
  const isReturning = authState.status === 'authenticated' || hasCompletedOnboarding;
  const copy = isReturning ? RETURNING_COPY : FIRST_TIME_COPY;

  return (
    <CtaPanel
      $variant={isReturning ? 'returning' : 'firstTime'}
      entering={FadeInUp.duration(1500).springify()}
      style={{ boxShadow: `8px 8px 0 ${AppColors.ink}` }}
    >
      <CtaMotif aria-hidden>●</CtaMotif>
      <CtaBadge>
        <CtaTag>{copy.tag}</CtaTag>
      </CtaBadge>
      <CtaHeadline>{copy.headline}</CtaHeadline>
      <CtaBody>{copy.body}</CtaBody>
      <CtaButton onPress={() => router.push('/app/home')}>{copy.action}</CtaButton>
    </CtaPanel>
  );
}

// `boxShadow` is passed as an explicit `style` prop at the JSX call site (not baked into
// `.attrs`), because styled-components/native's `.attrs({ style: {...} })` config is only
// used while resolving the CSS template literal's interpolations -- it is not concatenated
// into the component's final rendered style unless the caller also passes its own `style`
// prop, which is what happens here. Using the CSS `box-shadow` shorthand instead would get
// lowered by the css-to-react-native parser to the legacy `shadow*` RN style props, which
// react-native-web warns are deprecated in favor of `boxShadow`. See trick-card.tsx for the
// (currently inert) `.attrs`-based precedent this intentionally departs from.
const CtaPanel = styled(Animated.View)<{ readonly $variant: 'firstTime' | 'returning' }>`
  margin-top: 36px;
  padding: 26px 22px;
  gap: 10px;
  align-items: flex-start;
  overflow: hidden;
  border: 2px solid ${AppColors.ink};
  border-radius: ${Radii.panel}px;
  background-color: ${({ $variant }) => ($variant === 'returning' ? AppColors.sage : AppColors.yellow)};
`;

const CtaMotif = styled.Text`
  position: absolute;
  right: -30px;
  top: -60px;
  color: ${AppColors.ink}1f;
  font-size: 220px;
  font-weight: 900;
`;

const CtaBadge = styled.View`
  padding: 6px 14px;
  background-color: ${AppColors.red};
  border-radius: 999px;
  transform: rotate(-3deg);
`;

const CtaTag = styled.Text`
  color: ${AppColors.cream};
  font-size: 13px;
  font-weight: 900;
  letter-spacing: 1.6px;
  text-transform: uppercase;
`;

const CtaHeadline = styled.Text`
  color: ${AppColors.ink};
  font-size: 24px;
  font-weight: 900;
  letter-spacing: -0.6px;
`;

const CtaBody = styled(BodyText)`
  color: ${AppColors.inkSoft};
`;

const CtaButton = styled(Button)`
  margin-top: 6px;
`;
