import { useContext } from 'react';
import { StyleSheet, View } from 'react-native';
import { ThemeContext } from 'styled-components/native';

import { AppColors } from '@/constants/theme';
import { OnboardingRankRevealStep } from '@/features/onboarding/components/onboarding-rank-reveal-step';

// App-level celebration shown whenever the user's assessed Kentei rank advances, wherever that
// promotion happens (sesh finish, laced-grid marking, assessment completion). Reuses the
// onboarding rank-reveal animation with copy rewritten for a promotion rather than a first-time
// reveal. Rendered as a full-screen absolute overlay (see AnimatedSplashOverlay for precedent) —
// there's no React Native <Modal> precedent in this codebase, and the web build target makes an
// absolute-fill overlay the consistent choice.
export function RankUpCelebrationModal({
  rank,
  onDismiss,
}: {
  readonly rank: number;
  readonly onDismiss: () => void;
}) {
  const theme = useContext(ThemeContext);
  return (
    <View style={[styles.overlay, { backgroundColor: theme?.accent ?? AppColors.yellow }]} accessibilityLabel="Rank up celebration">
      <OnboardingRankRevealStep
        rank={rank}
        onContinue={onDismiss}
        eyebrow="Rank up!"
        title={`You leveled up to\nRank ${rank}.`}
        copy={`Rank ${rank} tricks are ready whenever you're ready to raise the bar again.`}
        buttonLabel="Nice!"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: AppColors.yellow,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
});
