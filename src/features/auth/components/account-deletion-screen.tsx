import { useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, TextInput } from 'react-native';
import { styled } from 'styled-components/native';

import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { BodyText, DisplayTitle, Eyebrow } from '@/components/ui/typography';
import { AppColors } from '@/constants/theme';
import { PasswordInput } from '@/features/auth/components/password-input';
import {
  categorizeAccountDeletionError,
  type AccountDeletionErrorCategory,
} from '@/features/auth/model/account-deletion-errors';
import { useAuthActions, useAuthState } from '@/features/auth/state/auth-provider';

const ERROR_COPY: Record<AccountDeletionErrorCategory, string> = {
  invalidCredentials: 'We could not verify your password or session. Check it and try again.',
  offline: "You're offline. Check your connection and try again.",
  rateLimited: 'Too many attempts. Wait a moment and try again.',
  expiredSession: 'Your session has expired. Sign in again and try again.',
  unknown: 'Something went wrong. Please try again.',
};

export function AccountDeletionScreen() {
  const authState = useAuthState();
  const { deleteAccount } = useAuthActions();
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorCategory, setErrorCategory] = useState<AccountDeletionErrorCategory>();
  const [succeeded, setSucceeded] = useState(false);
  const submittingRef = useRef(false);

  const handleBack = () => {
    router.push('/app/profile');
  };

  const isValid = currentPassword.length > 0 && confirmation === 'DELETE';
  const passwordError = hasSubmitted && currentPassword.length === 0 ? 'Enter your current password.' : undefined;
  const confirmationError =
    hasSubmitted && confirmation !== 'DELETE' ? 'Type DELETE exactly to confirm.' : undefined;

  const handleSubmit = async () => {
    if (submittingRef.current || succeeded) return;
    setHasSubmitted(true);
    setErrorCategory(undefined);
    if (!isValid) return;

    submittingRef.current = true;
    setIsSubmitting(true);
    const { error } = await deleteAccount(currentPassword, confirmation);
    submittingRef.current = false;
    setIsSubmitting(false);
    setCurrentPassword('');
    setConfirmation('');

    if (error) {
      setErrorCategory(categorizeAccountDeletionError(error));
      return;
    }

    setSucceeded(true);
    // T188: navigate out of the `/app/*` tabs tree immediately rather than
    // relying on staying mounted here. The post-sign-out guest identity's
    // own (unrelated) onboarding status flips AppTabs/AppTabs.web's tab
    // visibility, which unregisters every non-Home tab -- including this
    // route's own "profile" tab -- and resets the active tab back to Home
    // before a user could ever see the terminal message rendered in place.
    // `/account-deleted` lives outside that tree entirely, so it can't be
    // swept away by that reset. `succeeded` above still blocks resubmission
    // for the brief window before this navigation completes.
    router.replace('/account-deleted');
  };

  // Defensive fallback only: normally the `router.replace` above navigates
  // away before another render of this screen happens. Kept so a delayed
  // navigation, or any other reason this component stays mounted after
  // success, still can't show the form again or leak former-account state.
  if (succeeded) {
    return (
      <CenteredState title="Account deletion" message="Your account has been permanently deleted." />
    );
  }

  if (authState.status === 'initializing') {
    return <CenteredState title="Account deletion" message="Checking your session..." />;
  }

  if (authState.status !== 'authenticated') {
    return (
      <CenteredState title="Account deletion" message="Sign in to permanently delete your account.">
        <Button accessibilityLabel="Go to sign in" fill onPress={() => router.push('/auth/sign-in')} variant="secondary">
          Go to sign in
        </Button>
      </CenteredState>
    );
  }

  return (
    <Screen>
      <FormScroll keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 32 }}>
        <Content>
          <Eyebrow>Delete account</Eyebrow>
          <PageTitle>This is permanent.</PageTitle>

          <BackLink accessibilityLabel="Back to Profile" accessibilityRole="link" onPress={handleBack}>
            <BackLinkText>← Back to Profile</BackLinkText>
          </BackLink>

          <Introduction>
            Deleting your account happens immediately and permanently. Your account and cloud data will be removed.
          </Introduction>
          <Warning>There is no export or recovery step in this flow.</Warning>

          <PasswordInput
            error={passwordError}
            label="Current password"
            onChangeText={setCurrentPassword}
            textContentType="password"
            value={currentPassword}
          />
          <Field>
            <FieldLabel>Type DELETE to confirm</FieldLabel>
            <FieldInput
              accessibilityLabel="Type DELETE to confirm"
              autoCapitalize="characters"
              autoCorrect={false}
              onChangeText={setConfirmation}
              placeholder="DELETE"
              value={confirmation}
            />
            {confirmationError ? <ErrorText>{confirmationError}</ErrorText> : null}
          </Field>

          {errorCategory ? <ErrorText>{ERROR_COPY[errorCategory]}</ErrorText> : null}
          <Actions>
            <Button
              accessibilityLabel="Delete account permanently"
              disabled={!isValid || isSubmitting || succeeded}
              fill
              onPress={handleSubmit}
              variant="primary">
              {isSubmitting ? 'Deleting account...' : 'Delete account permanently'}
            </Button>
          </Actions>
        </Content>
      </FormScroll>
    </Screen>
  );
}

function CenteredState({ title, message, children }: { title: string; message: string; children?: ReactNode }) {
  return (
    <Screen align="center">
      <Centered>
        <Eyebrow>{title}</Eyebrow>
        <PageTitle>{message}</PageTitle>
        {children ? <Actions>{children}</Actions> : null}
      </Centered>
    </Screen>
  );
}

const FormScroll = styled(ScrollView)`flex: 1; width: 100%;`;
const Content = styled.View`width: 100%; max-width: 680px; align-self: center; padding: 38px 22px 0;`;
const Centered = styled.View`width: 100%; max-width: 480px; align-items: center; padding: 38px 22px;`;
const PageTitle = styled(DisplayTitle)`margin-top: 12px; text-align: center;`;
const Introduction = styled(BodyText)`max-width: 560px; margin-top: 16px;`;
const Warning = styled.Text`color: ${({ theme }) => theme.text}; font-size: 14px; font-weight: 900; margin-top: 18px;`;
const Field = styled.View`margin-top: 28px;`;
const FieldLabel = styled.Text`color: ${({ theme }) => theme.text}; font-size: 13px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase;`;
const FieldInput = styled(TextInput).attrs(({ theme }) => ({ placeholderTextColor: theme.textMuted }))`
  min-height: 56px; background-color: ${({ theme }) => theme.background}; border: 2px solid ${({ theme }) => theme.text};
  color: ${({ theme }) => theme.text}; font-size: 18px; font-weight: 800; margin-top: 8px; padding: 12px 14px;
`;
const ErrorText = styled.Text`color: ${AppColors.red}; font-size: 12px; font-weight: 800; margin-top: 10px;`;
const Actions = styled.View`width: 100%; margin-top: 24px;`;
const BackLink = styled(Pressable)`
  align-self: flex-start;
  margin-bottom: 10px;
`;
const BackLinkText = styled.Text`
  padding: 8px 0;
  color: ${AppColors.ink};
  font-size: 13px;
  font-weight: 900;
  text-decoration-line: underline;
`;
