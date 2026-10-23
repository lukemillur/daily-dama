import { useContext, useEffect, useState } from 'react';
import { Animated, StyleSheet } from 'react-native';
import ReanimatedView, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { styled, ThemeContext } from 'styled-components/native';

import { BodyText, Eyebrow } from '@/components/ui/typography';
import { AppColors } from '@/constants/theme';

// A full-screen, auto-dismissing acknowledgment mounted at the root layout, above every route. Reuses
// RankUpCelebrationModal's presentation mechanism (theme-derived full-bleed overlay,
// OnboardingRankRevealStep-style layout rhythm) with this feature's own welcome/verified
// copy -- not the trick-lace celebration copy or component instance -- and sesh.tsx's
// CelebrationBanner fade/timer pattern for the enter/auto-exit animation instead of a
// manual-tap continue button.
export const NEW_ACCOUNT_WELCOME_AUTO_DISMISS_MS = 2600;

export function NewAccountWelcomeOverlay({ onDismiss }: { readonly onDismiss: () => void }) {
  const theme = useContext(ThemeContext);
  const [opacity] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [opacity]);

  useEffect(() => {
    const fadeTimer = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }).start();
    }, NEW_ACCOUNT_WELCOME_AUTO_DISMISS_MS);
    const removeTimer = setTimeout(() => {
      onDismiss();
    }, NEW_ACCOUNT_WELCOME_AUTO_DISMISS_MS + 250);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
    };
    // one-shot auto-dismiss timers, deliberately not re-armed by an onDismiss identity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View
      style={[styles.overlay, { backgroundColor: theme?.accent ?? AppColors.yellow, opacity }]}
      accessibilityLabel="Account verified">
      <Content>
        <ReanimatedView.View entering={FadeIn.duration(400)}>
          <Eyebrow>Welcome to Daily Dama</Eyebrow>
        </ReanimatedView.View>
        <CheckStage entering={ZoomIn.duration(650).springify().damping(11)}>
          <CheckGlyph>✓</CheckGlyph>
        </CheckStage>
        <ReanimatedView.View entering={FadeIn.duration(400).delay(350)}>
          <RevealTitle>Your account is verified{`\n`}and you&apos;re signed in.</RevealTitle>
        </ReanimatedView.View>
        <ReanimatedView.View entering={FadeIn.duration(400).delay(450)}>
          <RevealCopy>Enjoy your practice.</RevealCopy>
        </ReanimatedView.View>
      </Content>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
});

const Content = styled.View`
  width: 100%;
  max-width: 620px;
  align-items: center;
  justify-content: center;
  padding: 0 22px;
`;
const CheckStage = styled(ReanimatedView.View)`
  align-items: center;
  justify-content: center;
  width: 220px;
  height: 220px;
  margin-top: 18px;
  background-color: ${AppColors.ink};
  border-radius: 110px;
`;
const CheckGlyph = styled.Text`
  color: ${({ theme }) => theme.accent ?? AppColors.yellow};
  font-size: 100px;
  font-weight: 900;
`;
const RevealTitle = styled(BodyText)`
  color: ${AppColors.ink};
  font-size: 32px;
  font-weight: 900;
  letter-spacing: -1px;
  line-height: 37px;
  text-align: center;
  margin-top: 26px;
`;
const RevealCopy = styled(BodyText)`
  color: ${AppColors.ink};
  max-width: 440px;
  text-align: center;
  margin-top: 16px;
`;
