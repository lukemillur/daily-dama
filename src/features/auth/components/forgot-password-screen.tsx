import { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, TextInput } from 'react-native';
import { styled } from 'styled-components/native';

import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { BodyText, DisplayTitle, Eyebrow } from '@/components/ui/typography';
import { AppColors } from '@/constants/theme';
import { categorizeAuthError, type AuthErrorCategory } from '@/features/auth/model/auth-errors';
import { validateForgotPasswordEmail } from '@/features/auth/model/forgot-password-validation';
import { logAuthWarning, trackAuthEvent } from '@/features/auth/observability/auth-observability';
import { useAuthActions, useAuthState } from '@/features/auth/state/auth-provider';

// Every category resolves to one of two fixed strings. resetPasswordForEmail is deliberately
// enumeration-safe -- it resolves { error: null } identically for known and unknown addresses --
// so the *success* copy already never branches on the submitted value. On the error side, only
// offline and rateLimited are realistically returned by this endpoint and can safely be shown
// distinctly (neither depends on whether the address has an account). Every other category is
// unreachable here in practice, but the Record must stay exhaustive for tsc.
const SUBMIT_ERROR_COPY: Record<AuthErrorCategory, string> = {
  offline: "You're offline. Check your connection and try again.",
  rateLimited: 'Too many attempts. Wait a moment and try again.',
  invalidCredentials: 'Something went wrong. Please try again.',
  unverifiedEmail: 'Something went wrong. Please try again.',
  accountAlreadyExists: 'Something went wrong. Please try again.',
  weakPassword: 'Something went wrong. Please try again.',
  expiredOrInvalidLink: 'Something went wrong. Please try again.',
  missingVerifier: 'Something went wrong. Please try again.',
  unknown: 'Something went wrong. Please try again.',
};

const SAME_BROWSER_GUIDANCE =
  'Open the email on this same browser, on this device, to finish resetting your password. ' +
  "Supabase can't complete the reset if you open the link somewhere else.";

const CONFIRMATION_COPY =
  "If an account exists for that email, we've sent a link to reset the password.";

export function ForgotPasswordScreen() {
  const authState = useAuthState();
  const { requestPasswordReset } = useAuthActions();
  const router = useRouter();
  const params = useLocalSearchParams<{ from?: string }>();
  // T191: account-security-screen.tsx's gated "Forgot password?" link (T180) signs the user out
  // before navigating here, so `authState` is already back to guest by the time this renders --
  // the *origin* of the navigation, not the live auth status, is what distinguishes "came from the
  // authenticated Profile flow" from "a guest arrived here directly from sign-in".
  const cameFromAccountSecurity = params.from === 'account-security';

  const [email, setEmail] = useState('');
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [requested, setRequested] = useState(false);
  const [submitCategory, setSubmitCategory] = useState<AuthErrorCategory | undefined>(undefined);
  // Same-tick synchronous guard -- see sign-in-screen.tsx for why isSubmitting state alone can't
  // stop a same-tick double submit (initial submit and resend both go through this one guard).
  const isSubmittingRef = useRef(false);

  const validation = validateForgotPasswordEmail(email);
  const errors = hasSubmitted && validation.status === 'invalid' ? validation.errors : {};

  useEffect(() => {
    if (authState.status === 'authenticated') {
      router.replace('/app/home');
    }
  }, [authState.status, router]);

  const submit = async () => {
    if (isSubmittingRef.current) return;

    setHasSubmitted(true);
    setSubmitCategory(undefined);

    const nextValidation = validateForgotPasswordEmail(email);
    if (nextValidation.status === 'invalid') return;

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    const { error } = await requestPasswordReset(email.trim());
    isSubmittingRef.current = false;
    setIsSubmitting(false);

    if (error) {
      const category = categorizeAuthError(error);
      setSubmitCategory(category);
      logAuthWarning('Password reset request failed.', error);
      trackAuthEvent('forgot_password_error', category);
      return;
    }

    setRequested(true);
    trackAuthEvent('forgot_password_requested');
  };

  if (authState.status === 'initializing' || authState.status === 'authenticated') {
    return (
      <Screen align="center">
        <Centered>
          <Eyebrow>Forgot password</Eyebrow>
          <PageTitle>
            {authState.status === 'initializing' ? 'Checking your session...' : 'Redirecting...'}
          </PageTitle>
        </Centered>
      </Screen>
    );
  }

  if (requested) {
    return (
      <Screen align="center">
        <Centered>
          <Eyebrow>Forgot password</Eyebrow>
          <PageTitle>Check your email.</PageTitle>
          <Introduction>{CONFIRMATION_COPY}</Introduction>
          <Guidance>{SAME_BROWSER_GUIDANCE}</Guidance>
          <FormActions>
            <Button accessibilityLabel="Resend" disabled={isSubmitting} fill onPress={submit}>
              {isSubmitting ? 'Sending...' : 'Resend'}
            </Button>
            <Button
              accessibilityLabel="Back to sign in"
              variant="secondary"
              fill
              onPress={() => router.push('/auth/sign-in')}>
              Back to sign in
            </Button>
            {cameFromAccountSecurity ? (
              <BackLink
                accessibilityLabel="Back to Profile"
                accessibilityRole="link"
                onPress={() => router.push('/app/profile')}>
                <BackLinkText>← Back to Profile</BackLinkText>
              </BackLink>
            ) : null}
          </FormActions>
        </Centered>
      </Screen>
    );
  }

  return (
    <Screen>
      <FormScroll keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 }}>
        <FormContent>
          <Eyebrow>Forgot password</Eyebrow>
          <PageTitle>Reset your password.</PageTitle>
          <Introduction>
            Enter the email on your account and we&apos;ll send you a link to reset your password.
          </Introduction>
          <Guidance>{SAME_BROWSER_GUIDANCE}</Guidance>

          <Field>
            <FieldLabel>Email</FieldLabel>
            <FieldInput
              accessibilityLabel="Email"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="username"
              onChangeText={setEmail}
              placeholder="Email"
              value={email}
            />
            {errors.email ? <ErrorText>{errors.email}</ErrorText> : null}
          </Field>

          {submitCategory ? <ErrorText>{SUBMIT_ERROR_COPY[submitCategory]}</ErrorText> : null}

          <FormActions>
            <Button accessibilityLabel="Send reset link" disabled={isSubmitting} fill onPress={submit}>
              {isSubmitting ? 'Sending...' : 'Send reset link'}
            </Button>
            <Button
              accessibilityLabel="Back to sign in"
              variant="secondary"
              fill
              onPress={() => router.push('/auth/sign-in')}>
              Back to sign in
            </Button>
            {cameFromAccountSecurity ? (
              <BackLink
                accessibilityLabel="Back to Profile"
                accessibilityRole="link"
                onPress={() => router.push('/app/profile')}>
                <BackLinkText>← Back to Profile</BackLinkText>
              </BackLink>
            ) : null}
          </FormActions>
        </FormContent>
      </FormScroll>
    </Screen>
  );
}

const FormScroll = styled(ScrollView)`
  flex: 1;
  width: 100%;
`;
const FormContent = styled.View`
  width: 100%;
  max-width: 680px;
  align-self: center;
  padding: 38px 22px 0;
`;
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
`;
const Guidance = styled(BodyText)`
  max-width: 480px;
  margin-top: 8px;
`;
const Field = styled.View`
  margin-top: 28px;
`;
const FieldLabel = styled.Text`
  color: ${({ theme }) => theme.text};
  font-size: 13px;
  font-weight: 900;
  letter-spacing: 1px;
  text-transform: uppercase;
`;
const FieldInput = styled(TextInput).attrs(({ theme }) => ({
  placeholderTextColor: theme.textMuted,
}))`
  min-height: 56px;
  background-color: ${({ theme }) => theme.background};
  border: 2px solid ${({ theme }) => theme.text};
  color: ${({ theme }) => theme.text};
  font-size: 18px;
  font-weight: 800;
  margin-top: 8px;
  padding: 12px 14px;
`;
const ErrorText = styled.Text`
  color: ${AppColors.red};
  font-size: 12px;
  font-weight: 800;
  margin-top: 7px;
`;
const FormActions = styled.View`
  gap: 10px;
  margin-top: 36px;
`;
const BackLink = styled(Pressable)`
  align-self: flex-start;
  margin-top: 4px;
`;
const BackLinkText = styled.Text`
  padding: 8px 0;
  color: ${AppColors.ink};
  font-size: 13px;
  font-weight: 900;
  text-decoration-line: underline;
`;
