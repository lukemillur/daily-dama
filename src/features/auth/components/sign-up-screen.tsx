import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { Platform, ScrollView, TextInput } from 'react-native';
import { styled } from 'styled-components/native';

import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { BodyText, DisplayTitle, Eyebrow } from '@/components/ui/typography';
import { AppColors } from '@/constants/theme';
import { categorizeAuthError, type AuthErrorCategory } from '@/features/auth/model/auth-errors';
import { PASSWORD_REQUIREMENTS_HINT } from '@/features/auth/model/password-policy';
import { PasswordInput } from '@/features/auth/components/password-input';
import { PasswordVisibilityProvider } from '@/features/auth/components/password-visibility-context';
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
  const passwordInputRef = useRef<TextInput>(null);
  const confirmPasswordInputRef = useRef<TextInput>(null);

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

  // Web-only: let Enter submit the form from anywhere in it, the same way clicking the primary
  // button would. handleSubmit already re-validates and guards re-entrancy via isSubmittingRef,
  // matching the button's own disabled-while-submitting gate, so this listener does not duplicate
  // that check.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window?.addEventListener !== 'function') return;

    const handleKeyDown = (event: { key?: string; preventDefault?: () => void }) => {
      if (event.key !== 'Enter') return;
      event.preventDefault?.();
      void handleSubmit();
    };

    // Capture phase: react-native-web's TextInput calls stopPropagation() on every keydown
    // (to avoid duplicate handling of its own onKeyPress/onSubmitEditing), which would otherwise
    // stop this from ever seeing Enter presses made from inside a field during the bubble phase.
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  });

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
    <Screen>
      <FormScroll keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 }}>
        <FormContent>
          <Eyebrow>Sign up</Eyebrow>
          <PageTitle>Create your account.</PageTitle>
          <Introduction>
            Create an account to sync your practice history across devices.
          </Introduction>

          <TextField
            accessibilityLabel="Email"
            autoCapitalize="none"
            autoCorrect={false}
            blurOnSubmit={false}
            error={errors.email}
            keyboardType="email-address"
            label="Email"
            onChangeText={setEmail}
            onSubmitEditing={() => passwordInputRef.current?.focus()}
            placeholder="Email"
            returnKeyType="next"
            textContentType="username"
            value={email}
          />

          <PasswordVisibilityProvider>
            <PasswordInput
              ref={passwordInputRef}
              blurOnSubmit={false}
              error={errors.password}
              hint={PASSWORD_REQUIREMENTS_HINT}
              label="Password"
              textContentType="newPassword"
              onChangeText={setPassword}
              onSubmitEditing={() => confirmPasswordInputRef.current?.focus()}
              returnKeyType="next"
              value={password}
            />

            <PasswordInput
              ref={confirmPasswordInputRef}
              error={errors.confirmPassword}
              label="Confirm password"
              textContentType="newPassword"
              onChangeText={setConfirmPassword}
              onSubmitEditing={() => void handleSubmit()}
              returnKeyType="done"
              value={confirmPassword}
            />
          </PasswordVisibilityProvider>

          {submitCategory ? <ErrorText>{SUBMIT_ERROR_COPY[submitCategory]}</ErrorText> : null}

          <FormActions>
            <Button accessibilityLabel="Sign up" disabled={isSubmitting} fill onPress={handleSubmit}>
              {isSubmitting ? 'Creating account...' : 'Sign up'}
            </Button>
            <Button
              accessibilityLabel="Sign in"
              variant="secondary"
              fill
              onPress={() => router.push('/auth/sign-in')}>
              Already have an account? Sign in
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
`;
const Introduction = styled(BodyText)`
  max-width: 480px;
  margin-top: 16px;
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
