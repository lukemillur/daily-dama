import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { styled } from 'styled-components/native';

import { Button } from '@/components/ui/button';
import { BodyText, Eyebrow } from '@/components/ui/typography';
import { AppColors } from '@/constants/theme';

export function OnboardingRankRevealStep({
  rank,
  onContinue,
  eyebrow = 'Assessment complete',
  title = `Your current\nKentei rank.`,
  copy = `Next, choose a few Rank ${rank} tricks to start practicing.`,
  buttonLabel = 'Choose tricks',
}: {
  readonly rank: number;
  readonly onContinue: () => void;
  readonly eyebrow?: string;
  readonly title?: string;
  readonly copy?: string;
  readonly buttonLabel?: string;
}) {
  return (
    <Content>
      <Animated.View entering={FadeIn.duration(400)}>
        <Eyebrow>{eyebrow}</Eyebrow>
      </Animated.View>
      <RankStage entering={ZoomIn.duration(650).springify().damping(11)}>
        <RankNumber>{rank}</RankNumber>
      </RankStage>
      <Animated.View entering={FadeIn.duration(400).delay(350)}>
        <RevealTitle>{title}</RevealTitle>
      </Animated.View>
      <Animated.View entering={FadeIn.duration(400).delay(450)}>
        <RevealCopy>{copy}</RevealCopy>
      </Animated.View>
      <Animated.View entering={FadeIn.duration(400).delay(550)}>
        <ContinueButton onPress={onContinue}>{buttonLabel}</ContinueButton>
      </Animated.View>
    </Content>
  );
}

const Content = styled.View`
  width: 100%;
  max-width: 620px;
  flex: 1;
  align-self: center;
  align-items: center;
  justify-content: center;
  padding: 40px 22px 130px;
`;
const RankStage = styled(Animated.View)`
  align-items: center;
  justify-content: center;
  width: 220px;
  height: 220px;
  margin-top: 18px;
  background-color: ${AppColors.ink};
  border-radius: 110px;
`;
const RankNumber = styled.Text`color: ${({ theme }) => theme.accent}; font-size: 100px; font-weight: 900; letter-spacing: -4px;`;
const RevealTitle = styled.Text`
  color: ${AppColors.ink};
  font-size: 40px;
  font-weight: 900;
  letter-spacing: -1px;
  line-height: 43px;
  text-align: center;
  margin-top: 26px;
`;
const RevealCopy = styled(BodyText)`max-width: 440px; text-align: center; margin-top: 16px;`;
const ContinueButton = styled(Button)`margin-top: 28px;`;
