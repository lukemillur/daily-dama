import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { styled } from 'styled-components/native';

import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { BodyText, DisplayTitle, Eyebrow } from '@/components/ui/typography';
import { categorizeAuthError, type AuthErrorCategory } from '@/features/auth/model/auth-errors';
import { logAuthWarning, trackAuthEvent } from '@/features/auth/observability/auth-observability';
import { useAuthActions } from '@/features/auth/state/auth-provider';

const ERROR_COPY: Record<AuthErrorCategory, string> = {
  expiredOrInvalidLink: 'This link has expired or was already used. Request a new one and try again.',
  missingVerifier:
    'This link only works in the browser and device you requested it from. Open your email there, or go back and request a new link from that same browser.',
  offline: "You're offline. Check your connection and try again.",
  rateLimited: 'Too many attempts. Wait a moment and try again.',
  weakPassword: 'Something went wrong. Please try again.',
  invalidCredentials: 'Something went wrong. Please try again.',
  unverifiedEmail: 'Something went wrong. Please try again.',
  accountAlreadyExists: 'Something went wrong. Please try again.',
  unknown: 'Something went wrong. Please try again.',
};

type CallbackParams = {
  code?: string | string[];
  error?: string | string[];
  error_code?: string | string[];
  // A fixed, app-chosen discriminator appended only by changeEmail's redirectTo -- see
  // auth-provider.tsx's changeEmail for why GoTrue itself doesn't expose a reliable signal for
  // "this is an email-change confirmation" (neither redirectType nor a stable session field).
  flow?: string | string[];
  // GoTrue's own mid-flow signal for double_confirm_changes: set (with no `code` and no
  // `error`) on the *first* of the two email-change confirmation links to be opened, meaning
  // the change isn't complete yet and the other inbox's link still needs to be opened.
  message?: string | string[];
};

function firstStringOrUndefined(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function readHashErrorCode(): string | undefined {
  if (Platform.OS !== 'web') return undefined;
  if (typeof window === 'undefined') return undefined;

  const hash = window.location.hash;
  if (!hash || hash.length <= 1) return undefined;

  const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  return params.get('error_code') ?? params.get('error') ?? undefined;
}

export function AuthCallbackScreen() {
  const params = useLocalSearchParams<CallbackParams>();
  const router = useRouter();
  const { exchangeCodeForSession } = useAuthActions();

  const [errorCategory, setErrorCategory] = useState<AuthErrorCategory | undefined>(undefined);
  // True when GoTrue's double_confirm_changes redirected back with only a `message` param (the
  // first of the two email-change confirmation links was just opened) -- distinct from the
  // errorCategory states below, since this is expected mid-flow progress, not a failure.
  const [awaitingOtherEmailConfirmation, setAwaitingOtherEmailConfirmation] = useState(false);
  const processedCodeRef = useRef<string | null>(null);
  // True only until the component actually unmounts -- deliberately separate from the main
  // effect below, so a dep-change re-run of that effect (which always runs its own cleanup
  // first, even without a real unmount) can't poison an in-flight exchange for the *same*
  // instance. Only a genuine unmount should stop a late resolution from navigating/setting state.
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const code = firstStringOrUndefined(params.code);
    const queryErrorCode = firstStringOrUndefined(params.error_code) ?? firstStringOrUndefined(params.error);
    const hashErrorCode = readHashErrorCode();
    const errorCode = queryErrorCode ?? hashErrorCode;

    if (errorCode) {
      const category = categorizeAuthError({ code: errorCode });
      // Deferred one microtask tick so this isn't a direct synchronous setState call in the
      // effect body (matches the pattern in auth-provider.tsx).
      Promise.resolve().then(() => setErrorCategory(category));
      trackAuthEvent('auth_callback_error', category);
      return;
    }

    // GoTrue's double_confirm_changes mid-flow redirect: no code, no error, just a `message`
    // saying the other inbox's link still needs to be opened. This must be checked before the
    // generic "missing code" fallback below, or it would incorrectly show "this link is no
    // longer valid" for what is actually expected progress.
    if (!code && firstStringOrUndefined(params.message)) {
      Promise.resolve().then(() => setAwaitingOtherEmailConfirmation(true));
      trackAuthEvent('auth_callback_email_change_pending');
      return;
    }

    if (!code) {
      const category = categorizeAuthError({ code: 'flow_state_not_found' });
      Promise.resolve().then(() => setErrorCategory(category));
      trackAuthEvent('auth_callback_error', category);
      return;
    }

    if (processedCodeRef.current === code) {
      return;
    }
    processedCodeRef.current = code;

    void (async () => {
      const { redirectType, error } = await exchangeCodeForSession(code);
      if (!isMountedRef.current) return;

      if (error) {
        const category = categorizeAuthError(error);
        setErrorCategory(category);
        logAuthWarning('Auth callback exchange failed.', error);
        trackAuthEvent('auth_callback_error', category);
        return;
      }

      trackAuthEvent('auth_callback_success');
      // A closed, three-way destination switch -- never derived from an arbitrary param. The
      // `flow` discriminator is app-chosen (set only by changeEmail's own redirectTo) and is
      // checked against exactly one recognized value; anything else falls through to the
      // existing recovery/home behavior (fail closed, not fail open).
      const flow = firstStringOrUndefined(params.flow);
      if (flow === 'email_change') {
        router.replace('/app/profile/account/security');
      } else if (redirectType === 'recovery') {
        router.replace('/auth/reset-password');
      } else {
        router.replace('/app/home');
      }
    })();
    // Deliberately depend on the whole params object (not just its extracted fields): expo-router
    // can hand back a new params object identity on a re-render even when its values are
    // unchanged, which would otherwise re-fire this effect. processedCodeRef is the guard that
    // makes that safe -- see its check above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  if (awaitingOtherEmailConfirmation) {
    return (
      <Screen align="center">
        <Centered>
          <Eyebrow>Sign-in</Eyebrow>
          <PageTitle>One more step.</PageTitle>
          <Introduction>
            Check both your current and new email inboxes to confirm this change. This link
            confirmed one of the two -- open the link in the other inbox to finish.
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

  if (errorCategory) {
    return (
      <Screen align="center">
        <Centered>
          <Eyebrow>Sign-in</Eyebrow>
          <PageTitle>This link is no longer valid.</PageTitle>
          <Introduction>{ERROR_COPY[errorCategory]}</Introduction>
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
    <Screen align="center">
      <Centered>
        <Eyebrow>Sign-in</Eyebrow>
        <PageTitle>Finishing sign-in...</PageTitle>
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
const FormActions = styled.View`
  gap: 10px;
  margin-top: 36px;
`;
