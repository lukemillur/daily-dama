import { Platform, ScrollView, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  Keyframe,
  ReduceMotion,
  ZoomIn,
} from 'react-native-reanimated';
import { styled } from 'styled-components/native';

import { Button } from '@/components/ui/button';
import { BodyText, Eyebrow } from '@/components/ui/typography';
import { AppColors } from '@/constants/theme';
import {
  selectRankRevealLayout,
  selectRankRevealMotion,
  type RankRevealMotion,
} from '@/features/onboarding/model/rank-reveal-motion';

const motion = selectRankRevealMotion(Platform.OS === 'web' ? 'web' : Platform.OS === 'ios' ? 'ios' : 'android');

// Builders are module constants so a re-render never restarts the entrance. Native builders carry
// ReduceMotion.System explicitly: with the OS setting on, the settled rank shows immediately.
function fade(config: RankRevealMotion, delayMs: number) {
  return FadeIn.duration(config.textFadeMs).delay(delayMs).reduceMotion(ReduceMotion.System);
}

const eyebrowEntering = FadeIn.duration(motion.eyebrowFadeMs).reduceMotion(ReduceMotion.System);
const titleEntering = fade(motion, motion.titleDelayMs);
const copyEntering = fade(motion, motion.copyDelayMs);
const buttonEntering = fade(motion, motion.buttonDelayMs);
const badgeEntering =
  motion.kind === 'spring'
    ? ZoomIn.duration(motion.badgeZoomMs).springify().damping(motion.badgeDamping)
    : new Keyframe({
        0: { opacity: 0, transform: [{ scale: motion.badgeStartScale }] },
        100: {
          opacity: 1,
          transform: [{ scale: 1 }],
          easing: Easing.out(Easing.quad),
        },
      })
        .duration(motion.badgeDurationMs)
        .reduceMotion(ReduceMotion.System);

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
  const { width, height } = useWindowDimensions();
  const layout = selectRankRevealLayout({ width, height });
  return (
    // The scroll view keeps the title, copy and button reachable when large text or a short
    // viewport makes the content taller than the screen.
    <ScrollView
      style={{ width: '100%' }}
      contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
      showsVerticalScrollIndicator={false}
    >
      <Content $bottomPadding={layout.bottomPadding}>
        <Animated.View entering={eyebrowEntering}>
          <Eyebrow>{eyebrow}</Eyebrow>
        </Animated.View>
        <RankStage entering={badgeEntering} $size={layout.badgeSize}>
          {/* Graphical numeral inside a fixed circle: OS font scaling would clip it. */}
          <RankNumber allowFontScaling={false} $size={layout.numeralSize}>
            {rank}
          </RankNumber>
        </RankStage>
        <Animated.View entering={titleEntering}>
          {/* Capped: the title is a display heading, and uncapped accessibility sizes split single
              words across lines. The copy and button still scale fully. */}
          <RevealTitle $size={layout.titleSize} maxFontSizeMultiplier={1.3}>
            {title}
          </RevealTitle>
        </Animated.View>
        <Animated.View entering={copyEntering}>
          <RevealCopy>{copy}</RevealCopy>
        </Animated.View>
        <Animated.View entering={buttonEntering}>
          <ContinueButton onPress={onContinue}>{buttonLabel}</ContinueButton>
        </Animated.View>
      </Content>
    </ScrollView>
  );
}

const Content = styled.View<{ $bottomPadding: number }>`
  width: 100%;
  max-width: 620px;
  align-self: center;
  align-items: center;
  justify-content: center;
  padding: 40px 22px ${({ $bottomPadding }) => $bottomPadding}px;
`;
const RankStage = styled(Animated.View)<{ $size: number }>`
  align-items: center;
  justify-content: center;
  width: ${({ $size }) => $size}px;
  height: ${({ $size }) => $size}px;
  margin-top: 18px;
  background-color: ${AppColors.ink};
  border-radius: ${({ $size }) => $size / 2}px;
`;
const RankNumber = styled.Text<{ $size: number }>`
  color: ${({ theme }) => theme.accent};
  font-size: ${({ $size }) => $size}px;
  line-height: ${({ $size }) => $size}px;
  font-weight: 900;
  letter-spacing: -4px;
`;
const RevealTitle = styled.Text<{ $size: number }>`
  color: ${AppColors.ink};
  font-size: ${({ $size }) => $size}px;
  font-weight: 900;
  letter-spacing: -1px;
  line-height: ${({ $size }) => Math.round($size * 1.075)}px;
  text-align: center;
  margin-top: 26px;
`;
const RevealCopy = styled(BodyText)`max-width: 440px; text-align: center; margin-top: 16px;`;
const ContinueButton = styled(Button)`margin-top: 28px;`;
