import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { styled } from 'styled-components/native';

import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { BodyText, DisplayTitle, Eyebrow } from '@/components/ui/typography';
import { AppColors } from '@/constants/theme';
import { categorizeAuthError, type AuthErrorCategory } from '@/features/auth/model/auth-errors';
import { trackAuthEvent } from '@/features/auth/observability/auth-observability';
import { useAuthActions, useAuthState } from '@/features/auth/state/auth-provider';
import { usePendingVerificationEmail } from '@/features/auth/state/pending-verification-email';

const SAME_BROWSER_GUIDANCE =
  'Open the email on this same browser, on this device, to finish creating your account. ' +
  'Supabase cannot complete the confirmation if you open the link somewhere else.';

const CONFIRMATION_COPY =
  'If that email is available, we have sent a link to confirm your account.';

// Only offline and rateLimited are realistically returned by resend here; every other category
// is unreachable in practice, but the Record must stay exhaustive for tsc, matching the
// forgot-password-screen.tsx precedent.
const RESEND_ERROR_COPY: Record<AuthErrorCategory, string> = {
  offline: 'You are offline. Check your connection and try again.',
  rateLimited: 'Too many attempts. Wait a moment and try again.',
  invalidCredentials: 'Something went wrong. Please try again.',
  unverifiedEmail: 'Something went wrong. Please try again.',
  accountAlreadyExists: 'Something went wrong. Please try again.',
  weakPassword: 'Something went wrong. Please try again.',
  expiredOrInvalidLink: 'Something went wrong. Please try again.',
  missingVerifier: 'Something went wrong. Please try again.',
  unknown: 'Something went wrong. Please try again.',
};

export function CheckEmailScreen() {
  const authState = useAuthState();
  const { resendSignupConfirmation } = useAuthActions();
  const pendingEmail = usePendingVerificationEmail();
  const router = useRouter();

  const [isResending, setIsResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [resendCategory, setResendCategory] = useState<AuthErrorCategory | undefined>(undefined);
  // Same-tick synchronous guard, matching the resend pattern in forgot-password-screen.tsx.
  const isResendingRef = useRef(false);

  useEffect(() => {
    if (authState.status === 'authenticated') {
      router.replace('/app/home');
    }
  }, [authState.status, router]);

  const handleResend = async () => {
    if (isResendingRef.current || pendingEmail === undefined) return;

    setResendCategory(undefined);
    isResendingRef.current = true;
    setIsResending(true);
    const { error } = await resendSignupConfirmation(pendingEmail);
    isResendingRef.current = false;
    setIsResending(false);

    if (error) {
      const category = categorizeAuthError(error);
      setResendCategory(category);
      trackAuthEvent('sign_up_resend_error', category);
      return;
    }

    setResent(true);
    trackAuthEvent('sign_up_resend_success');
  };

  if (authState.status === 'initializing' || authState.status === 'authenticated') {
    return (
      <Screen align="center">
        <Centered>
          <Eyebrow>Check your email</Eyebrow>
          <PageTitle>
            {authState.status === 'initializing' ? 'Checking your session...' : 'Redirecting...'}
          </PageTitle>
        </Centered>
      </Screen>
    );
  }

  if (pendingEmail === undefined) {
    return (
      <Screen align="center">
        <Centered>
          <Eyebrow>Check your email</Eyebrow>
          <PageTitle>Check your email.</PageTitle>
          <Introduction>{CONFIRMATION_COPY}</Introduction>
          <Introduction>{SAME_BROWSER_GUIDANCE}</Introduction>
          <FormActions>
            <Button
              accessibilityLabel="Back to sign up"
              fill
              onPress={() => router.replace('/auth/sign-up')}>
              Back to sign up
            </Button>
          </FormActions>
        </Centered>
      </Screen>
    );
  }

  return (
    <Screen align="center">
      <Centered>
        <Eyebrow>Check your email</Eyebrow>
        <PageTitle>Check your email.</PageTitle>
        <Introduction>{CONFIRMATION_COPY}</Introduction>
        <Introduction>{SAME_BROWSER_GUIDANCE}</Introduction>

        {resendCategory ? <ErrorText>{RESEND_ERROR_COPY[resendCategory]}</ErrorText> : null}

        <FormActions>
          <Button accessibilityLabel="Resend" disabled={isResending} fill onPress={handleResend}>
            {isResending ? 'Sending...' : resent ? 'Sent' : 'Resend'}
          </Button>
          <Button
            accessibilityLabel="Back to sign in"
            variant="secondary"
            fill
            onPress={() => router.push('/auth/sign-in')}>
            Back to sign in
          </Button>
        </FormActions>
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
const Introduction = styled(BodyText)`
  max-width: 480px;
  margin-top: 16px;
  text-align: center;
`;
const ErrorText = styled.Text`
  color: ${AppColors.red};
  font-size: 12px;
  font-weight: 800;
  margin-top: 16px;
  text-align: center;
`;
const FormActions = styled.View`
  gap: 10px;
  margin-top: 36px;
  width: 100%;
`;
