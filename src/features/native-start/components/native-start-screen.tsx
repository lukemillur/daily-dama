import { useRouter } from 'expo-router';
import { styled } from 'styled-components/native';

import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { BodyText, DisplayTitle } from '@/components/ui/typography';
import { CachedAppThemeProvider } from '@/features/profile/components/app-theme-provider';

/**
 * First screen on iOS and Android for anyone who has not finished onboarding. Get started opens
 * `/app/home`, which hosts guest onboarding. Actions share a gap column so a second action
 * (Sign in) can join Get started without a layout change.
 */
export function NativeStartScreen() {
  const router = useRouter();

  return (
    <CachedAppThemeProvider>
      <Screen align="center">
        <Content>
          <DisplayTitle accessibilityRole="header">Daily Dama</DisplayTitle>
          <BodyText>Pick a trick. Practice. Climb the Kentei ladder.</BodyText>
          <Actions>
            <Button
              fill
              accessibilityLabel="Get started"
              onPress={() => router.replace('/app/home')}>
              Get started
            </Button>
          </Actions>
        </Content>
      </Screen>
    </CachedAppThemeProvider>
  );
}

const Content = styled.View`
  flex: 1;
  width: 100%;
  max-width: 480px;
  justify-content: center;
  gap: 16px;
  padding: 24px;
`;

const Actions = styled.View`
  gap: 12px;
  margin-top: 16px;
`;
