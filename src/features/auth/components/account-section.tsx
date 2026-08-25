import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { styled } from 'styled-components/native';

import { Button } from '@/components/ui/button';
import { BodyText } from '@/components/ui/typography';
import { AppColors } from '@/constants/theme';
import { categorizeAuthError, type AuthErrorCategory } from '@/features/auth/model/auth-errors';
import { logAuthWarning, trackAuthEvent } from '@/features/auth/observability/auth-observability';
import { useAuthActions, useAuthState } from '@/features/auth/state/auth-provider';

// Only 'offline' and 'unknown' are realistically reachable here per the signOut({ scope: 'local' })
// SDK trace in T154.2's plan (an already-expired/invalid session signs out silently, never
// surfacing as an error) -- the rest are filled with the same generic fallback for type
// completeness, mirroring SUBMIT_ERROR_COPY's shape in sign-in-screen.tsx.
const LOG_OUT_ERROR_COPY: Record<AuthErrorCategory, string> = {
  invalidCredentials: 'Something went wrong. Please try again.',
  unverifiedEmail: 'Something went wrong. Please try again.',
  accountAlreadyExists: 'Something went wrong. Please try again.',
  weakPassword: 'Something went wrong. Please try again.',
  expiredOrInvalidLink: 'Something went wrong. Please try again.',
  missingVerifier: 'Something went wrong. Please try again.',
  rateLimited: 'Something went wrong. Please try again.',
  offline: "You're offline. Check your connection and try again.",
  unknown: 'Something went wrong. Please try again.',
};

export function AccountSection() {
  const authState = useAuthState();
  const { signOut } = useAuthActions();
  const router = useRouter();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorCategory, setErrorCategory] = useState<AuthErrorCategory | undefined>(undefined);
  // Same-tick synchronous double-submit guard as sign-in-screen.tsx -- setIsSubmitting(true)
  // doesn't re-render before a second synchronous onPress can read the stale isSubmitting closure.
  const isSubmittingRef = useRef(false);

  if (authState.status !== 'authenticated') return null;

  const handleLogOut = async () => {
    if (isSubmittingRef.current) return;

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setErrorCategory(undefined);

    const { error } = await signOut();

    isSubmittingRef.current = false;
    setIsSubmitting(false);

    if (error) {
      const category = categorizeAuthError(error);
      setErrorCategory(category);
      logAuthWarning('Log out failed.', error);
      trackAuthEvent('log_out_error', category);
      return;
    }

    // Do not force a guest transition here -- AuthProvider's onAuthStateChange listener is the
    // single source of truth and will flip authState.status to 'guest' on its own, at which
    // point this component renders null on the next render.
    trackAuthEvent('log_out_success');
  };

  return (
    <Section>
      <Divider />
      <SectionLabel>Account</SectionLabel>
      <AccountEmail>{authState.session.user.email ?? 'Your account'}</AccountEmail>
      <SecurityLinkButton
        accessibilityLabel="Manage account security"
        onPress={() => router.push('/app/profile/account/security')}
        variant="secondary">
        Manage account security
      </SecurityLinkButton>
      {errorCategory ? <ErrorText>{LOG_OUT_ERROR_COPY[errorCategory]}</ErrorText> : null}
      <LogOutButton
        accessibilityLabel="Log out"
        disabled={isSubmitting}
        onPress={handleLogOut}
        variant="secondary">
        {isSubmitting ? 'Logging out...' : 'Log out'}
      </LogOutButton>
    </Section>
  );
}

// Local copies of Profile's own section chrome (Divider/SectionLabel) rather than importing
// from src/app/app/profile/index.tsx, which doesn't export them -- this keeps AccountSection
// self-contained, matching sign-in-screen.tsx's precedent of owning its own styles.
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
const AccountEmail = styled(BodyText)`
  margin-top: 10px;
`;
const ErrorText = styled.Text`
  color: ${AppColors.red};
  font-size: 12px;
  font-weight: 800;
  margin-top: 10px;
`;
const SecurityLinkButton = styled(Button).attrs({ size: 'medium' })`
  align-self: flex-start;
  margin-top: 18px;
`;
const LogOutButton = styled(Button).attrs({ size: 'medium' })`
  align-self: flex-start;
  margin-top: 18px;
`;
