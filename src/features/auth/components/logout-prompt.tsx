// Full-screen overlay shown while a current-device logout is
// gated behind unsynced local changes. Follows RankUpCelebrationModal's
// precedent (no React Native <Modal> in this codebase) -- an
// absolute-fill <View> styled with the app's own Button/BodyText
// primitives.

import { StyleSheet, View } from 'react-native';
import { styled } from 'styled-components/native';

import { Button } from '@/components/ui/button';
import { BodyText } from '@/components/ui/typography';
import { AppColors } from '@/constants/theme';
import type { LogoutGuardState } from '@/features/auth/state/logout-guard';
import { describeDiscardFailure } from '@/features/auth/model/discard-failure-copy';

export interface LogoutPromptProps {
  readonly state: LogoutGuardState;
  readonly pendingCount: number;
  readonly onRetry: () => void;
  readonly onDiscard: () => void;
  readonly onCancel: () => void;
}

export function LogoutPrompt({ state, pendingCount, onRetry, onDiscard, onCancel }: LogoutPromptProps) {
  const busy = state.status === 'retrying' || state.status === 'discarding';

  return (
    <View style={styles.overlay} accessibilityLabel="Unsynced changes">
      <Content>
        <Title>Unsynced changes</Title>
        <Copy>
          {`You have ${pendingCount} unsynced ${pendingCount === 1 ? 'change' : 'changes'} on this device. Log out anyway, or try syncing them first.`}
        </Copy>
        {state.retryFailed ? (
          <RetryFailedCopy>{"Still couldn't sync. Check your connection or discard these changes."}</RetryFailedCopy>
        ) : null}
        {state.discardFailedDomains ? (
          <RetryFailedCopy>{describeDiscardFailure(state.discardFailedDomains)}</RetryFailedCopy>
        ) : null}
        <RetryButton
          accessibilityLabel="Retry sync"
          disabled={state.status !== 'prompt'}
          onPress={onRetry}
          variant="secondary">
          {state.status === 'retrying' ? 'Retrying...' : 'Retry'}
        </RetryButton>
        <DiscardButton
          accessibilityLabel="Discard and log out"
          disabled={busy}
          onPress={onDiscard}
          variant="primary">
          {state.status === 'discarding' ? 'Discarding...' : 'Discard and log out'}
        </DiscardButton>
        <CancelButton accessibilityLabel="Cancel logout" disabled={busy} onPress={onCancel} variant="secondary">
          Cancel
        </CancelButton>
      </Content>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: AppColors.yellow,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    zIndex: 1000,
  },
});

const Content = styled.View`
  width: 100%;
  max-width: 360px;
`;
const Title = styled.Text`
  color: ${AppColors.ink};
  font-size: 22px;
  font-weight: 900;
  letter-spacing: -0.4px;
`;
const Copy = styled(BodyText)`
  margin-top: 10px;
`;
const RetryFailedCopy = styled.Text`
  color: ${AppColors.red};
  font-size: 12px;
  font-weight: 800;
  margin-top: 12px;
`;
const RetryButton = styled(Button).attrs({ size: 'medium' })`
  align-self: stretch;
  margin-top: 22px;
`;
const DiscardButton = styled(Button).attrs({ size: 'medium' })`
  align-self: stretch;
  margin-top: 12px;
`;
const CancelButton = styled(Button).attrs({ size: 'medium' })`
  align-self: stretch;
  margin-top: 12px;
`;
