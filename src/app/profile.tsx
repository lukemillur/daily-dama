import { useRouter } from 'expo-router';
import { styled } from 'styled-components/native';

import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { BodyText, DisplayTitle, Eyebrow } from '@/components/ui/typography';
import { AppColors } from '@/constants/theme';
import { useUserProfile, useUserProfileActions } from '@/features/profile/state/user-profile-provider';

export default function ProfileScreen() {
  const router = useRouter();
  const { hasCompletedOnboarding, kenteiRank, selectedTrickIds } = useUserProfile();
  const { restartOnboarding } = useUserProfileActions();

  const retakeAssessment = () => {
    restartOnboarding();
    router.push('/');
  };

  return (
    <Screen align="center" edges={['top', 'left', 'right']}>
      <Content>
        <Eyebrow>Your profile</Eyebrow>
        {hasCompletedOnboarding && kenteiRank ? (
          <>
            <RankLine>
              <RankNumber>{String(kenteiRank).padStart(2, '0')}</RankNumber>
              <RankIdentity>
                <RankLabel>Assessed Kentei rank</RankLabel>
                <RankContext>
                  Your current frontier, with {selectedTrickIds.length}{' '}
                  {selectedTrickIds.length === 1 ? 'trick' : 'tricks'} in rotation.
                </RankContext>
              </RankIdentity>
            </RankLine>
            <Divider />
            <SectionLabel>Assessment</SectionLabel>
            <Title>Ready to check{`\n`}your level again?</Title>
            <Copy>
              Retaking the assessment updates your rank and recommended starting point. Your
              custom tricks and practice history stay exactly where they are.
            </Copy>
            <RetakeButton onPress={retakeAssessment}>Retake assessment</RetakeButton>
          </>
        ) : (
          <>
            <Title>Assessment{`\n`}in progress.</Title>
            <Copy>Finish the Kentei assessment on Home to establish your current frontier.</Copy>
            <ReturnButton onPress={() => router.push('/')}>Return to assessment</ReturnButton>
          </>
        )}
      </Content>
    </Screen>
  );
}

const Content = styled.View`
  width: 100%;
  max-width: 760px;
  flex: 1;
  justify-content: center;
  padding: 40px 22px 130px;
`;
const RankLine = styled.View`flex-direction: row; align-items: center; gap: 22px; margin-top: 18px;`;
const RankNumber = styled.Text`color: ${AppColors.red}; font-size: 78px; font-weight: 900; letter-spacing: -5px; line-height: 84px;`;
const RankIdentity = styled.View`flex: 1;`;
const RankLabel = styled.Text`color: ${AppColors.ink}; font-size: 17px; font-weight: 900; text-transform: uppercase;`;
const RankContext = styled(BodyText)`font-size: 14px; line-height: 20px; margin-top: 5px;`;
const Divider = styled.View`height: 2px; background-color: ${AppColors.ink}; margin: 28px 0 30px;`;
const SectionLabel = styled(Eyebrow)`font-size: 11px;`;
const Title = styled(DisplayTitle)`margin-top: 10px;`;
const Copy = styled(BodyText)`max-width: 500px; margin-top: 16px; color: ${AppColors.textMuted};`;
const RetakeButton = styled(Button).attrs({ variant: 'secondary', size: 'medium' })`align-self: flex-start; margin-top: 26px;`;
const ReturnButton = styled(Button).attrs({ size: 'medium' })`align-self: flex-start; margin-top: 26px;`;
