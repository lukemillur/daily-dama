import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { ScrollView, TextInput } from 'react-native';
import { styled } from 'styled-components/native';

import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { BodyText, DisplayTitle, Eyebrow } from '@/components/ui/typography';
import { AppColors } from '@/constants/theme';
import { categorizeAuthError, type AuthErrorCategory } from '@/features/auth/model/auth-errors';
import { validateSignInFields } from '@/features/auth/model/sign-in-validation';
import { logAuthWarning, trackAuthEvent } from '@/features/auth/observability/auth-observability';
import { useAuthActions, useAuthState } from '@/features/auth/state/auth-provider';

// The one fixed copy string for both a wrong password and an unknown email -- categorizeAuthError
// already collapses invalid_credentials/user_not_found into invalidCredentials, and this screen
// must never branch further on the raw error or it would reopen that enumeration surface.
const SUBMIT_ERROR_COPY: Record<AuthErrorCategory, string> = {
  invalidCredentials: 'Incorrect email or password. Try again.',
  unverifiedEmail: 'Verify your email before signing in. Check your inbox for the confirmation link.',
  offline: "You're offline. Check your connection and try again.",
  rateLimited: 'Too many attempts. Wait a moment and try again.',
  // Sign-in specific interpretation of the shared "expired session" category -- see T153.9's
  // plan for why this reuses expiredOrInvalidLink rather than adding new model surface.
  expiredOrInvalidLink: 'Your session has expired. Sign in again to continue.',
  weakPassword: 'Something went wrong. Please try again.',
  accountAlreadyExists: 'Something went wrong. Please try again.',
  unknown: 'Something went wrong. Please try again.',
};

export function SignInScreen() {
  const authState = useAuthState();
  const { signInWithPassword } = useAuthActions();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitCategory, setSubmitCategory] = useState<AuthErrorCategory | undefined>(undefined);
  // A same-tick synchronous guard: setIsSubmitting(true) doesn't re-render before a second
  // synchronous onPress can read the stale `isSubmitting` closure value, so the state alone
  // (used to drive the button's disabled/label UI) can't stop a same-tick double submit.
  const isSubmittingRef = useRef(false);

  const validation = validateSignInFields(email, password);
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

    const nextValidation = validateSignInFields(email, password);
    if (nextValidation.status === 'invalid') return;

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    const { error } = await signInWithPassword(email.trim(), password);
    isSubmittingRef.current = false;
    setIsSubmitting(false);

    if (error) {
      const category = categorizeAuthError(error);
      setSubmitCategory(category);
      logAuthWarning('Sign-in failed.', error);
      trackAuthEvent('sign_in_error', category);
      return;
    }

    trackAuthEvent('sign_in_success');
    router.replace('/app/home');
  };

  if (authState.status === 'initializing' || authState.status === 'authenticated') {
    return (
      <Screen align="center">
        <Centered>
          <Eyebrow>Sign in</Eyebrow>
          <PageTitle>
            {authState.status === 'initializing' ? 'Checking your session...' : 'Signing you in...'}
          </PageTitle>
        </Centered>
      </Screen>
    );
  }

  return (
    <FormScroll keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 }}>
      <FormContent>
        <Eyebrow>Sign in</Eyebrow>
        <PageTitle>Welcome back.</PageTitle>
        <Introduction>Sign in with your email and password to sync your progress.</Introduction>

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
          <FieldInput
            accessibilityLabel="Password"
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            textContentType="password"
            onChangeText={setPassword}
            placeholder="Password"
            placeholderTextColor={AppColors.textSubtle}
            value={password}
          />
          {errors.password ? <ErrorText>{errors.password}</ErrorText> : null}
        </Field>

        {submitCategory ? <ErrorText>{SUBMIT_ERROR_COPY[submitCategory]}</ErrorText> : null}

        <FormActions>
          <Button accessibilityLabel="Sign in" disabled={isSubmitting} fill onPress={handleSubmit}>
            {isSubmitting ? 'Signing in...' : 'Sign in'}
          </Button>
          <Button
            accessibilityLabel="Continue as guest"
            variant="secondary"
            fill
            onPress={() => router.replace('/app/home')}>
            Continue as guest
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
