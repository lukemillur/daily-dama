import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { AuthError } from '@supabase/supabase-js';

import { deriveAuthState, INITIALIZING_AUTH_STATE, type AuthState } from '@/features/auth/model/auth-state';
import { getSupabaseClient } from '@/features/auth/persistence/supabase-client';

interface AuthActions {
  readonly signInWithPassword: (
    email: string,
    password: string,
  ) => Promise<{ error: AuthError | null }>;
  readonly signOut: () => Promise<{ error: AuthError | null }>;
}

const AuthStateContext = createContext<AuthState | undefined>(undefined);
const AuthActionsContext = createContext<AuthActions | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<AuthState>(INITIALIZING_AUTH_STATE);

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
        setState(deriveAuthState(event, session));
      });

      return () => {
        subscription.unsubscribe();
      };
    } catch (error) {
      console.warn('Unable to subscribe to Supabase auth state.', error);
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

  const actions = useMemo(
    () => ({ signInWithPassword, signOut }),
    [signInWithPassword, signOut],
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
