import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { ScrollView, TextInput } from 'react-native';
import { styled } from 'styled-components/native';

import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { BodyText, DisplayTitle, Eyebrow } from '@/components/ui/typography';
import { AppColors } from '@/constants/theme';
import { categorizeAuthError, type AuthErrorCategory } from '@/features/auth/model/auth-errors';
import { MIN_PASSWORD_LENGTH } from '@/features/auth/model/password-policy';
import { validateSignUpFields } from '@/features/auth/model/signup-validation';
import { logAuthWarning, trackAuthEvent } from '@/features/auth/observability/auth-observability';
import { useAuthActions, useAuthState } from '@/features/auth/state/auth-provider';
import { useSetPendingVerificationEmail } from '@/features/auth/state/pending-verification-email';

// accountAlreadyExists deliberately takes the identical success path as a true signup, see the
// submit handler below, so this Record entry is unreachable in practice -- kept only so the
// Record stays exhaustive for tsc, matching the forgot-password-screen.tsx precedent.
// expiredOrInvalidLink, missingVerifier, invalidCredentials, and unverifiedEmail are also
// unreachable from signUp, for the same reason.
const SUBMIT_ERROR_COPY: Record<AuthErrorCategory, string> = {
  weakPassword: 'Choose a stronger password and try again.',
  offline: 'You are offline. Check your connection and try again.',
  rateLimited: 'Too many attempts. Wait a moment and try again.',
  invalidCredentials: 'Something went wrong. Please try again.',
  unverifiedEmail: 'Something went wrong. Please try again.',
  accountAlreadyExists: 'Something went wrong. Please try again.',
  expiredOrInvalidLink: 'Something went wrong. Please try again.',
  missingVerifier: 'Something went wrong. Please try again.',
  unknown: 'Something went wrong. Please try again.',
};

export function SignUpScreen() {
  const authState = useAuthState();
  const { signUp } = useAuthActions();
  const setPendingVerificationEmail = useSetPendingVerificationEmail();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitCategory, setSubmitCategory] = useState<AuthErrorCategory | undefined>(undefined);
  // Same-tick synchronous guard, mirroring sign-in-screen.tsx: setIsSubmitting(true) does not
  // re-render before a second synchronous onPress can read the stale isSubmitting closure value,
  // so the state alone cannot stop a same-tick double submit.
  const isSubmittingRef = useRef(false);

  const validation = validateSignUpFields(email, password, confirmPassword);
  const errors = hasSubmitted && validation.status === 'invalid' ? validation.errors : {};

  useEffect(() => {
    if (authState.status === 'authenticated') {
      router.replace('/app/home');
    }
  }, [authState.status, router]);

  const handleSubmit = async () => {
    if (isSubmittingRef.current) return;

    setHasSubmitted(true);
    setSubmitCategory(undefined);

    const nextValidation = validateSignUpFields(email, password, confirmPassword);
    if (nextValidation.status === 'invalid') return;

    const trimmedEmail = email.trim();

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    const { error } = await signUp(trimmedEmail, password);
    isSubmittingRef.current = false;
    setIsSubmitting(false);

    // A duplicate account must take the identical path as a true success -- otherwise the
    // distinct branch itself becomes the enumeration oracle that categorizeAuthError's dedicated
    // accountAlreadyExists category exists to avoid. Same tracked event name, same navigation,
    // same rendered outcome for both cases.
    if (error === null || categorizeAuthError(error) === 'accountAlreadyExists') {
      setPendingVerificationEmail(trimmedEmail);
      trackAuthEvent('sign_up_success');
      router.replace('/auth/check-email');
      return;
    }

    const category = categorizeAuthError(error);
    setSubmitCategory(category);
    logAuthWarning('Sign-up failed.', error);
    trackAuthEvent('sign_up_error', category);
  };

  if (authState.status === 'initializing' || authState.status === 'authenticated') {
    return (
      <Screen align="center">
        <Centered>
          <Eyebrow>Sign up</Eyebrow>
          <PageTitle>
            {authState.status === 'initializing' ? 'Checking your session...' : 'Redirecting...'}
          </PageTitle>
        </Centered>
      </Screen>
    );
  }

  return (
    <FormScroll keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 }}>
      <FormContent>
        <Eyebrow>Sign up</Eyebrow>
        <PageTitle>Create your account.</PageTitle>
        <Introduction>
          Create an account to sync your practice history across devices.
        </Introduction>

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
            placeholderTextColor={AppColors.textSubtle}
            value={email}
          />
          {errors.email ? <ErrorText>{errors.email}</ErrorText> : null}
        </Field>

        <Field>
          <FieldLabel>Password</FieldLabel>
          <FieldHint>Use at least {MIN_PASSWORD_LENGTH} characters.</FieldHint>
          <FieldInput
            accessibilityLabel="Password"
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            textContentType="newPassword"
            onChangeText={setPassword}
            placeholder="Password"
            placeholderTextColor={AppColors.textSubtle}
            value={password}
          />
          {errors.password ? <ErrorText>{errors.password}</ErrorText> : null}
        </Field>

        <Field>
          <FieldLabel>Confirm password</FieldLabel>
          <FieldInput
            accessibilityLabel="Confirm password"
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            textContentType="newPassword"
            onChangeText={setConfirmPassword}
            placeholder="Confirm password"
            placeholderTextColor={AppColors.textSubtle}
            value={confirmPassword}
          />
          {errors.confirmPassword ? <ErrorText>{errors.confirmPassword}</ErrorText> : null}
        </Field>

        {submitCategory ? <ErrorText>{SUBMIT_ERROR_COPY[submitCategory]}</ErrorText> : null}

        <FormActions>
          <Button accessibilityLabel="Sign up" disabled={isSubmitting} fill onPress={handleSubmit}>
            {isSubmitting ? 'Creating account...' : 'Sign up'}
          </Button>
        </FormActions>
      </FormContent>
    </FormScroll>
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
  text-align: center;
`;
const Introduction = styled(BodyText)`
  max-width: 480px;
  margin-top: 16px;
  text-align: center;
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
const FieldHint = styled.Text`
  color: ${AppColors.textSubtle};
  font-size: 12px;
  font-weight: 700;
  margin-top: 4px;
`;
const FieldInput = styled(TextInput)`
  min-height: 56px;
  background-color: ${AppColors.paper};
  border: 2px solid ${AppColors.ink};
  color: ${AppColors.ink};
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
