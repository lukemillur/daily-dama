import type { AuthChangeEvent, Session } from '@supabase/supabase-js';

export type AuthStatus = 'initializing' | 'guest' | 'authenticated' | 'passwordRecovery' | 'refreshFailed';

export type GuestReason = 'signedOut' | 'unconfigured' | 'error';

export type AuthState =
  { readonly status: 'initializing' }
  | { readonly status: 'guest'; readonly reason: GuestReason }
  | {
      readonly status: 'authenticated';
      readonly session: Session;
      readonly lastEvent: AuthChangeEvent;
    }
  | { readonly status: 'passwordRecovery'; readonly session: Session }
  // Purely a local, timeout-driven transition owned by `AuthProvider` -- GoTrue never reports
  // this status, so `deriveAuthState` below (which only maps real `onAuthStateChange` events)
  // deliberately does not produce or handle it. See AuthProvider's init effect for how a bound
  // client-side timeout with no usable cached session reaches this state.
  | { readonly status: 'refreshFailed' };

export const INITIALIZING_AUTH_STATE: AuthState = { status: 'initializing' };

/**
 * Maps a Supabase auth event/session pair to the app's Auth model. Pure and
 * synchronous -- no IO, no SDK calls.
 *
 * `previous` lets a `PASSWORD_RECOVERY` session survive a later `TOKEN_REFRESHED`
 * for the same session (autoRefreshToken is on) without being silently promoted
 * to plain `authenticated` mid password-reset flow. `SIGNED_OUT` and a null
 * session both still unconditionally win over that carry-forward.
 */
export function deriveAuthState(
  event: AuthChangeEvent,
  session: Session | null,
  previous: AuthState = INITIALIZING_AUTH_STATE,
): AuthState {
  if (event === 'SIGNED_OUT') {
    return { status: 'guest', reason: 'signedOut' };
  }

  if (!session) {
    return { status: 'guest', reason: 'signedOut' };
  }

  if (event === 'PASSWORD_RECOVERY') {
    return { status: 'passwordRecovery', session };
  }

  if (previous.status === 'passwordRecovery') {
    return { status: 'passwordRecovery', session };
  }

  return { status: 'authenticated', session, lastEvent: event };
}
