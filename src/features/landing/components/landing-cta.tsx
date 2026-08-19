import { useRouter } from 'expo-router';
import { styled } from 'styled-components/native';

import { Button } from '@/components/ui/button';
import { BodyText } from '@/components/ui/typography';
import { AppColors, Radii } from '@/constants/theme';
import { useUserProfile } from '@/features/profile/state/user-profile-provider';

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
  const profile = useUserProfile();
  const router = useRouter();
  const isReturning = profile.hasCompletedOnboarding;
  const copy = isReturning ? RETURNING_COPY : FIRST_TIME_COPY;

  return (
    <CtaPanel $variant={isReturning ? 'returning' : 'firstTime'}>
      <CtaTag>{copy.tag}</CtaTag>
      <CtaHeadline>{copy.headline}</CtaHeadline>
      <CtaBody>{copy.body}</CtaBody>
      <CtaButton onPress={() => router.push('/app/home')}>{copy.action}</CtaButton>
    </CtaPanel>
  );
}

const CtaPanel = styled.View<{ readonly $variant: 'firstTime' | 'returning' }>`
  margin-top: 36px;
  padding: 26px 22px;
  gap: 10px;
  align-items: flex-start;
  border: 2px solid ${AppColors.ink};
  border-radius: ${Radii.panel}px;
  background-color: ${({ $variant }) => ($variant === 'returning' ? AppColors.sage : AppColors.yellow)};
`;

const CtaTag = styled.Text`
  color: ${AppColors.inkSoft};
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
