// Native builds have no Supabase client (see getSupabaseClient), so the
// feedback form could never succeed there. This screen says so honestly and
// offers the exit back to Profile. The platform choice is made in the route
// (src/app/feedback.tsx), not in FeedbackScreen.

import { useRouter } from 'expo-router';
import { styled } from 'styled-components/native';

import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { BodyText, DisplayTitle, Eyebrow } from '@/components/ui/typography';

export function FeedbackUnavailableScreen() {
  const router = useRouter();

  return (
    <Screen align="center">
      <Centered>
        <Eyebrow>Feedback</Eyebrow>
        <PageTitle>Feedback is not available in the app yet.</PageTitle>
        <Introduction>
          Sending feedback currently works only in the web version of Daily Dama. This app does not
          send feedback.
        </Introduction>
        <Button accessibilityLabel="Back to Profile" fill onPress={() => router.push('/app/profile')}>
          Back to Profile
        </Button>
      </Centered>
    </Screen>
  );
}

const Centered = styled.View`
  width: 100%;
  max-width: 480px;
  align-items: center;
  padding: 38px 22px;
`;
const PageTitle = styled(DisplayTitle)`
  margin-top: 12px;
`;
const Introduction = styled(BodyText)`
  max-width: 480px;
  margin-top: 16px;
  margin-bottom: 16px;
`;
