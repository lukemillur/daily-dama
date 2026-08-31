import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView } from 'react-native';
import { styled } from 'styled-components/native';

import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { BodyText, DisplayTitle, Eyebrow } from '@/components/ui/typography';
import { AppColors } from '@/constants/theme';
import { categorizeAuthError, type AuthErrorCategory } from '@/features/auth/model/auth-errors';
import { validateNewPassword } from '@/features/auth/model/password-policy';
import { PasswordInput } from '@/features/auth/components/password-input';
import { PasswordVisibilityProvider } from '@/features/auth/components/password-visibility-context';
import { useAuthActions, useAuthState } from '@/features/auth/state/auth-provider';

const SUBMIT_ERROR_COPY: Record<AuthErrorCategory, string> = {
  weakPassword: 'Choose a stronger password and try again.',
  expiredOrInvalidLink: 'This recovery link has expired. Request a new one and try again.',
  missingVerifier: 'Something went wrong. Please try again.',
  offline: "You're offline. Check your connection and try again.",
  rateLimited: 'Too many attempts. Wait a moment and try again.',
  invalidCredentials: 'Something went wrong. Please try again.',
  unverifiedEmail: 'Something went wrong. Please try again.',
  accountAlreadyExists: 'Something went wrong. Please try again.',
  unknown: 'Something went wrong. Please try again.',
};

export function ResetPasswordScreen() {
  const authState = useAuthState();
  const { completePasswordRecovery } = useAuthActions();
  const router = useRouter();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [submitCategory, setSubmitCategory] = useState<AuthErrorCategory | undefined>(undefined);

  const validation = validateNewPassword(password, confirmPassword);
  const errors = hasSubmitted && validation.status === 'invalid' ? validation.errors : {};

  const handleSubmit = async () => {
    if (isSubmitting || completed) return;

    setHasSubmitted(true);
    setSubmitCategory(undefined);

    const nextValidation = validateNewPassword(password, confirmPassword);
    if (nextValidation.status === 'invalid') return;

    setIsSubmitting(true);
    const { error } = await completePasswordRecovery(password);
    setIsSubmitting(false);

    if (error) {
      setSubmitCategory(categorizeAuthError(error));
      return;
    }

    setCompleted(true);
  };

  if (authState.status === 'initializing') {
    return (
      <Screen align="center">
        <Centered>
          <Eyebrow>Password reset</Eyebrow>
          <PageTitle>Checking your recovery link...</PageTitle>
        </Centered>
      </Screen>
    );
  }

  if (authState.status !== 'passwordRecovery') {
    return (
      <Screen align="center">
        <Centered>
          <Eyebrow>Password reset</Eyebrow>
          <PageTitle>This link is no longer valid.</PageTitle>
          <Introduction>
            Your password reset link has expired or was already used. Request a new one to continue.
          </Introduction>
          <FormActions>
            <Button accessibilityLabel="Back to home" onPress={() => router.replace('/')}>
              Back to home
            </Button>
          </FormActions>
        </Centered>
      </Screen>
    );
  }

  if (completed) {
    return (
      <Screen align="center">
        <Centered>
          <Eyebrow>Password reset</Eyebrow>
          <PageTitle>Your password has been updated.</PageTitle>
          <Introduction>You can now sign in with your new password.</Introduction>
          <FormActions>
            <Button accessibilityLabel="Back to home" onPress={() => router.replace('/')}>
              Back to home
            </Button>
          </FormActions>
        </Centered>
      </Screen>
    );
  }

  return (
    <Screen>
      <FormScroll keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 }}>
        <FormContent>
          <Eyebrow>Password reset</Eyebrow>
          <PageTitle>Choose a new password.</PageTitle>
          <Introduction>Enter and confirm a new password for your account.</Introduction>

          <PasswordVisibilityProvider>
            <PasswordInput
              error={errors.password}
              label="New password"
              onChangeText={setPassword}
              textContentType="newPassword"
              value={password}
            />

            <PasswordInput
              error={errors.confirmPassword}
              label="Confirm new password"
              onChangeText={setConfirmPassword}
              textContentType="newPassword"
              value={confirmPassword}
            />
          </PasswordVisibilityProvider>

          {submitCategory ? <ErrorText>{SUBMIT_ERROR_COPY[submitCategory]}</ErrorText> : null}

          <FormActions>
            <Button
              accessibilityLabel="Set new password"
              disabled={isSubmitting}
              fill
              onPress={handleSubmit}>
              {isSubmitting ? 'Setting password...' : 'Set new password'}
            </Button>
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
  margin-top: 7px;
`;
const FormActions = styled.View`
  gap: 10px;
  margin-top: 36px;
`;
