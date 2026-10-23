import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { styled } from 'styled-components/native';

import { Screen } from '@/components/ui/screen';
import { BodyText, DisplayTitle, Eyebrow } from '@/components/ui/typography';

const REDIRECT_DELAY_MS = 3000;

/**
 * Terminal confirmation for a completed account deletion. Deliberately
 * a top-level route outside the `/app/*` tabs tree, not a render branch
 * inside `AccountDeletionScreen`: the tab-hiding logic in
 * `AppTabs`/`AppTabs.web` conditionally unregisters every non-Home
 * `TabTrigger` once the post-sign-out guest identity's own (unrelated)
 * onboarding status reads incomplete, which resets the active tab back to
 * Home the instant that happens -- silently wiping any in-place "deleted"
 * message rendered inside a `/app/profile/...` route before a user could
 * ever see it. Living outside the tabs navigator sidesteps that entirely.
 *
 * Auto-redirects to the landing page after a brief delay since there
 * is otherwise no way to leave this screen.
 */
export function AccountDeletedScreen() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace('/');
    }, REDIRECT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <Screen align="center">
      <Centered>
        <Eyebrow>Account deletion</Eyebrow>
        <PageTitle>Your account has been permanently deleted.</PageTitle>
        <Subtitle>You&rsquo;ll be returned to the landing page shortly.</Subtitle>
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
  text-align: center;
`;
const Subtitle = styled(BodyText)`
  margin-top: 12px;
  text-align: center;
`;
