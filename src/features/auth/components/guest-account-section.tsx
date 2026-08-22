import { useRouter } from 'expo-router';
import { styled } from 'styled-components/native';

import { Button } from '@/components/ui/button';
import { BodyText } from '@/components/ui/typography';
import { AppColors } from '@/constants/theme';
import { useAuthState } from '@/features/auth/state/auth-provider';

/**
 * Optional sign-up/sign-in entry points for an unauthenticated Profile visitor.
 *
 * This is pure navigation -- it never gates, clears, or imports guest data, and it renders
 * nothing while `authState.status` is anything other than 'guest' (initializing, authenticated,
 * or passwordRecovery), mirroring AccountSection's own status-gated render-null pattern so the
 * two sections are mutually exclusive in Profile.
 */
export function GuestAccountSection() {
  const authState = useAuthState();
  const router = useRouter();

  if (authState.status !== 'guest') return null;

  return (
    <Section>
      <Divider />
      <SectionLabel>Account</SectionLabel>
      <Copy>
        Create an account to keep your progress backed up and sign in on other devices.
      </Copy>
      <ButtonRow>
        <SignUpButton
          accessibilityLabel="Sign up"
          onPress={() => router.push('/auth/sign-up')}>
          Sign up
        </SignUpButton>
        <SignInButton
          accessibilityLabel="Sign in"
          onPress={() => router.push('/auth/sign-in')}
          variant="secondary">
          Sign in
        </SignInButton>
      </ButtonRow>
    </Section>
  );
}

// Local copies of Profile's own section chrome (Divider/SectionLabel), matching
// AccountSection's precedent of owning its own styles rather than importing from
// src/app/app/profile/index.tsx, which doesn't export them.
const Section = styled.View`
  width: 100%;
`;
const Divider = styled.View`
  height: 2px;
  background-color: ${AppColors.ink};
  margin: 28px 0 30px;
`;
const SectionLabel = styled.Text`
  color: ${({ theme }) => theme.text};
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 1px;
  text-transform: uppercase;
`;
const Copy = styled(BodyText)`
  margin-top: 10px;
`;
const ButtonRow = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 18px;
`;
const SignUpButton = styled(Button).attrs({ size: 'medium' })`
  align-self: flex-start;
`;
const SignInButton = styled(Button).attrs({ size: 'medium' })`
  align-self: flex-start;
`;
