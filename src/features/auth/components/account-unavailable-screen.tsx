import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import type { Text } from 'react-native';
import { styled } from 'styled-components/native';

import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { BodyText, DisplayTitle } from '@/components/ui/typography';
import {
  ACCOUNT_UNAVAILABLE_BODY,
  ACCOUNT_UNAVAILABLE_TITLE,
} from '@/features/auth/model/account-availability';

/**
 * Stands in for every /auth/* route where accounts are unavailable. It runs no auth action:
 * the only control navigates back into the app.
 */
export function AccountUnavailableScreen() {
  const router = useRouter();
  const titleRef = useRef<Text>(null);

  useEffect(() => {
    // Move focus to the heading so assistive tech announces the screen change (web-only API).
    (titleRef.current as unknown as { focus?: () => void } | null)?.focus?.();
  }, []);

  return (
    <Screen align="center">
      <Content>
        <Title ref={titleRef} accessibilityRole="header">
          {ACCOUNT_UNAVAILABLE_TITLE}
        </Title>
        <Copy>{ACCOUNT_UNAVAILABLE_BODY}</Copy>
        <BackButton accessibilityLabel="Back to app" onPress={() => router.replace('/app/home')}>
          Back to app
        </BackButton>
      </Content>
    </Screen>
  );
}

const Content = styled.View`
  width: 100%;
  max-width: 480px;
  padding: 38px 22px;
`;
const Title = styled(DisplayTitle)``;
const Copy = styled(BodyText)`
  margin-top: 10px;
`;
const BackButton = styled(Button)`
  align-self: flex-start;
  margin-top: 18px;
`;
