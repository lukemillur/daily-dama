import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { AuthError } from '@supabase/supabase-js';

import { deriveAuthState, INITIALIZING_AUTH_STATE, type AuthState } from '@/features/auth/model/auth-state';
import { logAuthWarning } from '@/features/auth/observability/auth-observability';
import { getSupabaseClient } from '@/shared/supabase/supabase-client';

interface AuthActions {
  readonly signInWithPassword: (
    email: string,
    password: string,
  ) => Promise<{ error: AuthError | null }>;
  readonly signOut: () => Promise<{ error: AuthError | null }>;
  readonly completePasswordRecovery: (newPassword: string) => Promise<{ error: AuthError | null }>;
  readonly exchangeCodeForSession: (
    code: string,
  ) => Promise<{ redirectType: 'recovery' | null; error: AuthError | null }>;
  readonly requestPasswordReset: (email: string) => Promise<{ error: AuthError | null }>;
  readonly signUp: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  readonly resendSignupConfirmation: (email: string) => Promise<{ error: AuthError | null }>;
  readonly changePassword: (
    currentPassword: string,
    newPassword: string,
  ) => Promise<{ error: AuthError | null }>;
  readonly changeEmail: (newEmail: string) => Promise<{ error: AuthError | null }>;
}

const AuthStateContext = createContext<AuthState | undefined>(undefined);
const AuthActionsContext = createContext<AuthActions | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<AuthState>(INITIALIZING_AUTH_STATE);
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const client = getSupabaseClient();

    if (!client) {
      // Deferred one microtask tick so this isn't a direct synchronous
      // setState call in the effect body -- still no network round trip.
      Promise.resolve().then(() => setState({ status: 'guest', reason: 'unconfigured' }));
      return;
    }

    try {
      const {
        data: { subscription },
      } = client.auth.onAuthStateChange((event, session) => {
        setState((current) => deriveAuthState(event, session, current));
      });

      return () => {
        subscription.unsubscribe();
      };
    } catch (error) {
      logAuthWarning('Unable to subscribe to Supabase auth state.', error);
      Promise.resolve().then(() => setState({ status: 'guest', reason: 'error' }));
      return undefined;
    }
  }, []);

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    const client = getSupabaseClient();

    if (!client) {
      return { error: new AuthError('Supabase is not configured.') };
    }

    const { error } = await client.auth.signInWithPassword({ email, password });
    return { error };
  }, []);

  const signOut = useCallback(async () => {
    const client = getSupabaseClient();

    if (!client) {
      return { error: new AuthError('Supabase is not configured.') };
    }

    const { error } = await client.auth.signOut({ scope: 'local' });
    return { error };
  }, []);

  const completePasswordRecovery = useCallback(async (newPassword: string) => {
    if (stateRef.current.status !== 'passwordRecovery') {
      return { error: new AuthError('No active password recovery session.', 401, 'session_not_found') };
    }

    const client = getSupabaseClient();

    if (!client) {
      return { error: new AuthError('Supabase is not configured.') };
    }

    const { error } = await client.auth.updateUser({ password: newPassword });
    return { error };
  }, []);

  const exchangeCodeForSession = useCallback(async (code: string) => {
    const client = getSupabaseClient();

    if (!client) {
      return { redirectType: null, error: new AuthError('Supabase is not configured.') };
    }

    const { data, error } = await client.auth.exchangeCodeForSession(code);
    if (error) return { redirectType: null, error };

    // supabase-js's public TS signature under-declares this: exchangeCodeForSession's runtime
    // success payload includes `redirectType: 'recovery' | null`, used to distinguish a
    // password-recovery code from a signup-confirmation code, but the declared return type
    // (AuthTokenResponse) omits it. Confirmed against the installed 2.112.3 GoTrueClient source.
    const redirectType = (data as unknown as { redirectType: 'recovery' | null }).redirectType;
    return { redirectType, error: null };
  }, []);

  const requestPasswordReset = useCallback(async (email: string) => {
    const client = getSupabaseClient();

    if (!client) {
      return { error: new AuthError('Supabase is not configured.') };
    }

    if (typeof window === 'undefined') {
      return { error: new AuthError('Unable to resolve the callback URL.') };
    }

    // Fixed, non-attacker-influenceable redirect -- never accept a destination from a route
    // param or query string here (see the task's enumeration/redirect-safety requirement and
    // BACKEND_ROADMAP.md's "no wildcard production redirects" rule). Supabase's own server-side
    // redirect allowlist (T153.2) is the second layer of defense.
    const redirectTo = `${window.location.origin}/auth/callback`;
    const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });
    return { error };
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const client = getSupabaseClient();

    if (!client) {
      return { error: new AuthError('Supabase is not configured.') };
    }

    if (typeof window === 'undefined') {
      return { error: new AuthError('Unable to resolve the callback URL.') };
    }

    // Same fixed, non-attacker-influenceable redirect pattern as requestPasswordReset above.
    const redirectTo = `${window.location.origin}/auth/callback`;
    const { error } = await client.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } });
    return { error };
  }, []);

  const resendSignupConfirmation = useCallback(async (email: string) => {
    const client = getSupabaseClient();

    if (!client) {
      return { error: new AuthError('Supabase is not configured.') };
    }

    if (typeof window === 'undefined') {
      return { error: new AuthError('Unable to resolve the callback URL.') };
    }

    const redirectTo = `${window.location.origin}/auth/callback`;
    const { error } = await client.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: redirectTo },
    });
    return { error };
  }, []);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    if (stateRef.current.status !== 'authenticated') {
      return { error: new AuthError('No active session.', 401, 'session_not_found') };
    }

    const client = getSupabaseClient();

    if (!client) {
      return { error: new AuthError('Supabase is not configured.') };
    }

    const email = stateRef.current.session.user.email;
    if (!email) {
      // Defensive only -- this app is email/password-only, so an authenticated user should
      // always have an email. Kept as a generic session error rather than a crash.
      return { error: new AuthError('No account email on the current session.', 401, 'session_not_found') };
    }

    // Re-establish a brand-new, fully valid session immediately before updateUser -- this is
    // the app-level current-password verification (see the ticket's plan for why this is used
    // instead of GoTrue's own reauthenticate()/secure_password_change). Signing back in against
    // the account's own already-known email is not an enumeration risk: the caller is already
    // authenticated and already knows this email.
    const { error: signInError } = await client.auth.signInWithPassword({
      email,
      password: currentPassword,
    });
    if (signInError) {
      return { error: signInError };
    }

    const { error } = await client.auth.updateUser({ password: newPassword });
    return { error };
  }, []);

  const changeEmail = useCallback(async (newEmail: string) => {
    if (stateRef.current.status !== 'authenticated') {
      return { error: new AuthError('No active session.', 401, 'session_not_found') };
    }

    const client = getSupabaseClient();

    if (!client) {
      return { error: new AuthError('Supabase is not configured.') };
    }

    if (typeof window === 'undefined') {
      return { error: new AuthError('Unable to resolve the callback URL.') };
    }

    // Fixed, non-attacker-influenceable redirect, same pattern as requestPasswordReset/signUp
    // above -- plus a flow=email_change discriminator so AuthCallbackScreen can tell an
    // email-change confirmation link apart from a signup-confirmation link, neither of which
    // GoTrue itself distinguishes via redirectType or a stable field on the completing session
    // (confirmed live against local GoTrue: new_email is only present on the *first*-clicked
    // confirmation's redirect, which carries no code at all when double_confirm_changes is on --
    // the *second*-clicked link is the one that returns an exchangeable code, and by then
    // new_email has already been cleared from the returned session).
    const redirectTo = window.location.origin + '/auth/callback?flow=email_change';
    const { error } = await client.auth.updateUser({ email: newEmail }, { emailRedirectTo: redirectTo });
    return { error };
  }, []);

  const actions = useMemo(
    () => ({
      signInWithPassword,
      signOut,
      completePasswordRecovery,
      exchangeCodeForSession,
      requestPasswordReset,
      signUp,
      resendSignupConfirmation,
      changePassword,
      changeEmail,
    }),
    [
      signInWithPassword,
      signOut,
      completePasswordRecovery,
      exchangeCodeForSession,
      requestPasswordReset,
      signUp,
      resendSignupConfirmation,
      changePassword,
      changeEmail,
    ],
  );

  return (
    <AuthStateContext.Provider value={state}>
      <AuthActionsContext.Provider value={actions}>{children}</AuthActionsContext.Provider>
    </AuthStateContext.Provider>
  );
}

export function useAuthState() {
  const state = useContext(AuthStateContext);

  if (!state) {
    throw new Error('useAuthState must be used within AuthProvider.');
  }

  return state;
}

export function useAuthActions() {
  const actions = useContext(AuthActionsContext);

  if (!actions) {
    throw new Error('useAuthActions must be used within AuthProvider.');
  }

  return actions;
}
