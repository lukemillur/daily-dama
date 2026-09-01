import { useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { ScrollView, TextInput } from 'react-native';
import { styled } from 'styled-components/native';

import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { BodyText, DisplayTitle, Eyebrow } from '@/components/ui/typography';
import { categorizeAuthError, type AuthErrorCategory } from '@/features/auth/model/auth-errors';
import { validateForgotPasswordEmail } from '@/features/auth/model/forgot-password-validation';
import { validateNewPassword } from '@/features/auth/model/password-policy';
import { PasswordInput } from '@/features/auth/components/password-input';
import { PasswordVisibilityProvider } from '@/features/auth/components/password-visibility-context';
import { logAuthWarning, trackAuthEvent } from '@/features/auth/observability/auth-observability';
import { useAuthActions, useAuthState } from '@/features/auth/state/auth-provider';

const PASSWORD_ERROR_COPY: Record<AuthErrorCategory, string> = {
  invalidCredentials: 'Your current password is incorrect.',
  weakPassword: 'Choose a stronger password and try again.',
  offline: "You're offline. Check your connection and try again.",
  rateLimited: 'Too many attempts. Wait a moment and try again.',
  expiredOrInvalidLink: 'Something went wrong. Please try again.',
  missingVerifier: 'Something went wrong. Please try again.',
  unverifiedEmail: 'Something went wrong. Please try again.',
  accountAlreadyExists: 'Something went wrong. Please try again.',
  unknown: 'Something went wrong. Please try again.',
};

const EMAIL_ERROR_COPY: Record<AuthErrorCategory, string> = {
  offline: "You're offline. Check your connection and try again.",
  rateLimited: 'Too many attempts. Wait a moment and try again.',
  invalidCredentials: 'Your current password is incorrect.',
  weakPassword: 'Something went wrong. Please try again.',
  expiredOrInvalidLink: 'Something went wrong. Please try again.',
  missingVerifier: 'Something went wrong. Please try again.',
  unverifiedEmail: 'Something went wrong. Please try again.',
  accountAlreadyExists: 'Something went wrong. Please try again.',
  unknown: 'Something went wrong. Please try again.',
};

const EMAIL_CHANGE_PENDING_COPY =
  'Check both your current and new email inboxes to confirm this change. Nothing changes until ' +
  'you confirm both links.';

export function AccountSecurityScreen() {
  const authState = useAuthState();
  const { changePassword, changeEmail, signOut } = useAuthActions();
  const router = useRouter();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordHasSubmitted, setPasswordHasSubmitted] = useState(false);
  const [isSubmittingPassword, setIsSubmittingPassword] = useState(false);
  const [passwordSubmitCategory, setPasswordSubmitCategory] = useState<AuthErrorCategory | undefined>(
    undefined,
  );
  const [passwordChangeSucceeded, setPasswordChangeSucceeded] = useState(false);
  const isSubmittingPasswordRef = useRef(false);

  const [emailCurrentPassword, setEmailCurrentPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [emailHasSubmitted, setEmailHasSubmitted] = useState(false);
  const [isSubmittingEmail, setIsSubmittingEmail] = useState(false);
  const [emailSubmitCategory, setEmailSubmitCategory] = useState<AuthErrorCategory | undefined>(undefined);
  const [emailChangeRequested, setEmailChangeRequested] = useState(false);
  const isSubmittingEmailRef = useRef(false);

  const currentPasswordError =
    passwordHasSubmitted && currentPassword.length === 0 ? 'Enter your current password.' : undefined;
  const passwordValidation = validateNewPassword(newPassword, confirmNewPassword);
  const passwordErrors =
    passwordHasSubmitted && passwordValidation.status === 'invalid' ? passwordValidation.errors : {};

  const emailCurrentPasswordError =
    emailHasSubmitted && emailCurrentPassword.length === 0 ? 'Enter your current password.' : undefined;
  const emailValidation = validateForgotPasswordEmail(newEmail);
  const emailErrors = emailHasSubmitted && emailValidation.status === 'invalid' ? emailValidation.errors : {};

  const handlePasswordSubmit = async () => {
    if (isSubmittingPasswordRef.current) return;

    setPasswordHasSubmitted(true);
    setPasswordSubmitCategory(undefined);
    setPasswordChangeSucceeded(false);

    if (currentPassword.length === 0) return;
    const nextValidation = validateNewPassword(newPassword, confirmNewPassword);
    if (nextValidation.status === 'invalid') return;

    isSubmittingPasswordRef.current = true;
    setIsSubmittingPassword(true);
    const { error } = await changePassword(currentPassword, newPassword);
    isSubmittingPasswordRef.current = false;
    setIsSubmittingPassword(false);

    if (error) {
      const category = categorizeAuthError(error);
      setPasswordSubmitCategory(category);
      logAuthWarning('Password change failed.', error);
      trackAuthEvent('account_security_password_error', category);
      return;
    }

    setCurrentPassword('');
    setNewPassword('');
    setConfirmNewPassword('');
    setPasswordHasSubmitted(false);
    setPasswordChangeSucceeded(true);
    trackAuthEvent('account_security_password_success');
  };

  const handleBack = () => {
    router.push('/app/profile');
  };

  const handleForgotPassword = async () => {
    await signOut();
    router.push('/auth/forgot-password?from=account-security');
  };

  const handleEmailSubmit = async () => {
    if (isSubmittingEmailRef.current) return;

    setEmailHasSubmitted(true);
    setEmailSubmitCategory(undefined);

    if (emailCurrentPassword.length === 0) return;
    const nextValidation = validateForgotPasswordEmail(newEmail);
    if (nextValidation.status === 'invalid') return;

    isSubmittingEmailRef.current = true;
    setIsSubmittingEmail(true);
    const { error } = await changeEmail(newEmail.trim(), emailCurrentPassword);
    isSubmittingEmailRef.current = false;
    setIsSubmittingEmail(false);

    if (error) {
      const category = categorizeAuthError(error);
      setEmailSubmitCategory(category);
      logAuthWarning('Email change request failed.', error);
      trackAuthEvent('account_security_email_error', category);
      return;
    }

    setEmailCurrentPassword('');
    setEmailChangeRequested(true);
    trackAuthEvent('account_security_email_requested');
  };

  if (authState.status === 'initializing') {
    return (
      <Screen align="center">
        <Centered>
          <Eyebrow>Account security</Eyebrow>
          <PageTitle>Checking your session...</PageTitle>
        </Centered>
      </Screen>
    );
  }

  if (authState.status !== 'authenticated') {
    return (
      <Screen align="center">
        <Centered>
          <Eyebrow>Account security</Eyebrow>
          <PageTitle>Sign in to manage account security.</PageTitle>
          <Introduction>Sign in to change your password or email address.</Introduction>
          <FormActions>
            <Button
              accessibilityLabel="Go to sign in"
              fill
              variant="secondary"
              onPress={() => router.push('/auth/sign-in')}>
              Go to sign in
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
        <Eyebrow>Account security</Eyebrow>
        <PageTitle>Manage your account.</PageTitle>

        <FormActions>
          <Button accessibilityLabel="Back to Profile" fill variant="secondary" onPress={handleBack}>
            Back to Profile
          </Button>
        </FormActions>

        <SectionLabel>Change password</SectionLabel>

        <PasswordVisibilityProvider>
          <PasswordInput
            error={currentPasswordError}
            label="Current password"
            onChangeText={setCurrentPassword}
            textContentType="password"
            value={currentPassword}
          />

          <PasswordInput
            error={passwordErrors.password}
            label="New password"
            onChangeText={setNewPassword}
            textContentType="newPassword"
            value={newPassword}
          />

          <PasswordInput
            error={passwordErrors.confirmPassword}
            label="Confirm new password"
            onChangeText={setConfirmNewPassword}
            textContentType="newPassword"
            value={confirmNewPassword}
          />
        </PasswordVisibilityProvider>

        {passwordSubmitCategory ? (
          <ErrorText>{PASSWORD_ERROR_COPY[passwordSubmitCategory]}</ErrorText>
        ) : null}
        {passwordChangeSucceeded ? <SuccessText>Your password has been updated.</SuccessText> : null}

        {passwordSubmitCategory === 'invalidCredentials' ? (
          <ForgotPasswordNotice>
            Forgetting your current password? Using the link below will sign you out.
          </ForgotPasswordNotice>
        ) : null}

        <FormActions>
          <Button
            accessibilityLabel="Update password"
            disabled={isSubmittingPassword}
            fill
            variant="secondary"
            onPress={handlePasswordSubmit}>
            {isSubmittingPassword ? 'Updating...' : 'Update password'}
          </Button>
          {passwordSubmitCategory === 'invalidCredentials' ? (
            <Button
              accessibilityLabel="Forgot password?"
              fill
              variant="secondary"
              onPress={handleForgotPassword}>
              Forgot password?
            </Button>
          ) : null}
        </FormActions>

        <Divider />

        <SectionLabel>Change email</SectionLabel>
        <Introduction $align="left">
          Current email: {authState.session.user.email ?? 'unknown'}
        </Introduction>

        {emailChangeRequested ? (
          <SuccessText>{EMAIL_CHANGE_PENDING_COPY}</SuccessText>
        ) : (
          <>
            <PasswordInput
              error={emailCurrentPasswordError}
              label="Password"
              onChangeText={setEmailCurrentPassword}
              textContentType="password"
              value={emailCurrentPassword}
            />

            <Field>
              <FieldLabel>New email</FieldLabel>
              <FieldInput
                accessibilityLabel="New email"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="username"
                onChangeText={setNewEmail}
                placeholder="New email"
                value={newEmail}
              />
              {emailErrors.email ? <ErrorText>{emailErrors.email}</ErrorText> : null}
            </Field>

            {emailSubmitCategory ? <ErrorText>{EMAIL_ERROR_COPY[emailSubmitCategory]}</ErrorText> : null}

            <FormActions>
              <Button
                accessibilityLabel="Update email"
                disabled={isSubmittingEmail}
                fill
                variant="secondary"
                onPress={handleEmailSubmit}>
                {isSubmittingEmail ? 'Sending...' : 'Update email'}
              </Button>
            </FormActions>
          </>
        )}
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
const Introduction = styled(BodyText)<{ readonly $align?: 'left' | 'center' }>`
  max-width: 480px;
  margin-top: 16px;
  text-align: ${({ $align }) => $align ?? 'center'};
`;
const SectionLabel = styled.Text`
  color: ${({ theme }) => theme.text};
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 1px;
  text-transform: uppercase;
  margin-top: 30px;
`;
const Divider = styled.View`
  height: 2px;
  background-color: ${({ theme }) => theme.text};
  margin: 34px 0 6px;
`;
const Field = styled.View`
  margin-top: 22px;
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
  color: ${({ theme }) => theme.text};
  font-size: 12px;
  font-weight: 800;
  margin-top: 7px;
`;
const ForgotPasswordNotice = styled.Text`
  color: ${({ theme }) => theme.text};
  font-size: 12px;
  font-weight: 800;
  margin-top: 10px;
`;
const SuccessText = styled.Text`
  color: ${({ theme }) => theme.text};
  font-size: 13px;
  font-weight: 800;
  margin-top: 14px;
`;
const FormActions = styled.View`
  gap: 10px;
  margin-top: 24px;
`;
