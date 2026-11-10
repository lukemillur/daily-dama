import { styled } from 'styled-components/native';

import { Button } from '@/components/ui/button';
import { BodyText, DisplayTitle } from '@/components/ui/typography';

/**
 * Shown instead of onboarding when a signed-in account's first profile pull fails. Onboarding
 * must not run before the pull settles (the account may already have a rank), so the only way
 * forward is to retry.
 */
export function FirstPullRetry({ onRetry }: { readonly onRetry: () => void }) {
  return (
    <Content accessibilityRole="alert">
      <DisplayTitle accessibilityRole="header">We could not load your account yet.</DisplayTitle>
      <BodyText>Check your connection, then try again.</BodyText>
      <Button fill accessibilityLabel="Retry" onPress={onRetry}>
        Retry
      </Button>
    </Content>
  );
}

const Content = styled.View`
  flex: 1;
  width: 100%;
  max-width: 480px;
  align-self: center;
  justify-content: center;
  gap: 16px;
  padding: 24px;
`;
