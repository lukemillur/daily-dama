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

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthError } from '@supabase/supabase-js';

import { parseCachedSession } from '@/features/auth/model/cached-session';
import { deriveAuthState, INITIALIZING_AUTH_STATE, type AuthState } from '@/features/auth/model/auth-state';
import { logAuthWarning } from '@/features/auth/observability/auth-observability';
import { purgeIdentityNamespace } from '@/shared/persistence/account-purge';
import { createUserIdentity } from '@/shared/persistence/identity';
import { getGoTrueStorageKey, getSupabaseClient } from '@/shared/supabase/supabase-client';

// Comfortably above any realistic successful refresh round-trip, well under GoTrue's own
// internal ~30s retry ceiling (`AUTO_REFRESH_TICK_DURATION_MS`, auth-js 2.112.3
// `lib/constants.js`, confirmed against installed source -- see T262's plan). The goal is
// actionable feedback well before that ceiling, not racing it.
export const AUTH_INIT_TIMEOUT_MS = 10_000;

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
  readonly changeEmail: (
    newEmail: string,
    currentPassword: string,
  ) => Promise<{ error: AuthError | null }>;
  readonly deleteAccount: (
    currentPassword: string,
    confirmation: string,
  ) => Promise<{ error: unknown }>;
  // Escape hatch for the `refreshFailed` recovery screen (identity-provider.tsx). Deliberately
  // does NOT call `client.auth.signOut()` -- that also awaits GoTrue's `initializePromise`,
  // which is exactly what's stuck in this scenario, so it would hang identically. Instead this
  // removes the persisted session directly so the app proceeds as guest. Designed for the
  // `refreshFailed` screen but harmless to call from other states too.
  readonly abandonAuthAndContinueAsGuest: () => Promise<{ error: Error | null }>;
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
      // Flips true the moment a real `onAuthStateChange` event fires. Both the optimistic-read
      // branch below and the timeout branch check it before calling `setState`, so a
      // late-arriving real event is never clobbered by either -- and neither of them can stomp a
      // state the real subscription already resolved another way.
      let settled = false;
      // Declared before subscribing (as `let`, forward-assigned below) because some SDK/test
      // clients invoke the `onAuthStateChange` callback synchronously during subscription --
      // referencing a `const` declared after this point would hit the temporal dead zone.
      let timeoutId: ReturnType<typeof setTimeout> | undefined;

      const {
        data: { subscription },
      } = client.auth.onAuthStateChange((event, session) => {
        settled = true;
        clearTimeout(timeoutId);
        setState((current) => deriveAuthState(event, session, current));
      });

      // Optimistic direct read (exit criterion a): resolves in effectively one microtask tick,
      // fully independent of GoTrue's `initializePromise` / network refresh -- see T262's plan
      // for why this is the only way to surface a cached session ahead of a hung refresh.
      const storageKey = getGoTrueStorageKey();
      if (storageKey) {
        AsyncStorage.getItem(storageKey)
          .then((raw) => {
            if (settled) return;
            const cached = parseCachedSession(raw);
            if (!cached) return;
            setState((current) =>
              current.status === 'initializing'
                ? { status: 'authenticated', session: cached, lastEvent: 'INITIAL_SESSION' }
                : current,
            );
          })
          .catch((error) => {
            logAuthWarning('Unable to read the cached Supabase session.', error);
          });
      }

      // Bounded app-level timeout (exit criterion b): if neither a real event nor the optimistic
      // read has moved AuthState off 'initializing' by the deadline, force a visible recovery
      // state instead of hanging indefinitely. Never tears down `subscription` -- it keeps
      // listening for the rest of the component's lifetime, so a later real event still
      // self-corrects `refreshFailed` away, exactly like `deriveAuthState` already handles a
      // SIGNED_OUT arriving after an optimistic authenticated guess.
      timeoutId = setTimeout(() => {
        if (settled) return;
        setState((current) => (current.status === 'initializing' ? { status: 'refreshFailed' } : current));
      }, AUTH_INIT_TIMEOUT_MS);

      return () => {
        settled = true;
        clearTimeout(timeoutId);
        subscription.unsubscribe();
      };
    } catch (error) {
      logAuthWarning('Unable to subscribe to Supabase auth state.', error);
      Promise.resolve().then(() => setState({ status: 'guest', reason: 'error' }));
      return undefined;
    }
  }, []);

  // Escape hatch for the `refreshFailed` recovery screen -- fails closed per AGENTS.md's
  // destructive/identity-transition rule: on failure, state is left unchanged so the user stays
  // on the visible recovery screen with actionable copy rather than the app silently pretending
  // the transition happened.
  const abandonAuthAndContinueAsGuest = useCallback(async () => {
    const storageKey = getGoTrueStorageKey();

    try {
      if (storageKey) {
        await AsyncStorage.removeItem(storageKey);
      }
    } catch (error) {
      return { error: error instanceof Error ? error : new Error('Unable to clear the local session.') };
    }

    setState({ status: 'guest', reason: 'error' });
    return { error: null };
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

  const changeEmail = useCallback(async (newEmail: string, currentPassword: string) => {
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

    const email = stateRef.current.session.user.email;
    if (!email) {
      // Defensive only -- this app is email/password-only, so an authenticated user should
      // always have an email. Kept as a generic session error rather than a crash.
      return { error: new AuthError('No account email on the current session.', 401, 'session_not_found') };
    }

    // Same current-password re-sign-in verification as changePassword above; see its comment
    // for why.
    const { error: signInError } = await client.auth.signInWithPassword({
      email,
      password: currentPassword,
    });
    if (signInError) {
      return { error: signInError };
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

  const deleteAccount = useCallback(async (currentPassword: string, confirmation: string) => {
    if (stateRef.current.status !== 'authenticated') {
      return { error: new AuthError('No active session.', 401, 'session_not_found') };
    }

    // Captured now, while still inside the authenticated guard above, so it
    // stays defined through the rest of this call regardless of what Auth
    // reports afterward (including the local sign-out this function itself
    // triggers on success below).
    const userId = stateRef.current.session.user.id;

    const client = getSupabaseClient();
    if (!client) {
      return { error: new AuthError('Supabase is not configured.') };
    }

    const { error } = await client.functions.invoke('delete-account', {
      body: { currentPassword, confirmation },
    });

    if (error) {
      // Response loss with the user still present, and offline retry, both
      // surface here -- no purge, no sign-out, nothing destructive.
      return { error };
    }

    // A null error covers both a genuinely fresh success and a reconciled
    // lost-response retry: the delete-account Edge Function is idempotent
    // and returns success (no error) if Auth verification shows the user is
    // already gone. The two are indistinguishable to this client code, and
    // both get the same purge-then-sign-out treatment.
    const identity = createUserIdentity(userId);
    if (identity) {
      await purgeIdentityNamespace(AsyncStorage, identity);
    }

    // Purge before sign-out, so the purge always runs while the SDK still
    // considers the session nominally valid. Signing out locally is what
    // starts the already-tested reactive identity-generation invalidation
    // (IdentityProvider derives a fresh guest identity on SIGNED_OUT).
    await client.auth.signOut({ scope: 'local' });

    return { error: null };
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
      deleteAccount,
      abandonAuthAndContinueAsGuest,
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
      deleteAccount,
      abandonAuthAndContinueAsGuest,
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
