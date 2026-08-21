import type { AuthChangeEvent, Session } from '@supabase/supabase-js';

export type AuthStatus = 'initializing' | 'guest' | 'authenticated';

export type GuestReason = 'signedOut' | 'unconfigured' | 'error';

export type AuthState =
  { readonly status: 'initializing' }
  | { readonly status: 'guest'; readonly reason: GuestReason }
  | {
      readonly status: 'authenticated';
      readonly session: Session;
      readonly lastEvent: AuthChangeEvent;
    };

export const INITIALIZING_AUTH_STATE: AuthState = { status: 'initializing' };

/**
 * Maps a Supabase auth event/session pair to the app's three-state Auth
 * model. Pure and synchronous -- no IO, no SDK calls.
 */
export function deriveAuthState(event: AuthChangeEvent, session: Session | null): AuthState {
  if (event === 'SIGNED_OUT') {
    return { status: 'guest', reason: 'signedOut' };
  }

  if (session) {
    return { status: 'authenticated', session, lastEvent: event };
  }

  return { status: 'guest', reason: 'signedOut' };
}
