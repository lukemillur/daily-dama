import type { AuthState } from '@/features/auth/model/auth-state';
import { createUserIdentity, GUEST_IDENTITY, type Identity } from '@/shared/persistence/identity';

/**
 * Maps the app's actual Auth state to an Identity. Pure and synchronous.
 *
 * Returns `undefined` for `'initializing'` — the identity is genuinely
 * unresolved at that point (Supabase hasn't reported a session yet), not
 * safely assumed to be `guest`. T156.2 decides what a provider does with an
 * unresolved identity; this function only refuses to guess.
 *
 * `authenticated` / `passwordRecovery` sessions always resolve to a
 * `user:<verified-user-id>` identity derived from `session.user.id` — the
 * only place a verified id can come from. If that id is somehow malformed
 * (defensive case; the Supabase SDK controls this in practice), the identity
 * is rejected back to `guest` rather than exposing a broken partial identity.
 */
export function deriveIdentityFromAuthState(state: AuthState): Identity | undefined {
  if (state.status === 'initializing') return undefined;
  if (state.status === 'guest') return GUEST_IDENTITY;

  // 'authenticated' | 'passwordRecovery'
  return createUserIdentity(state.session.user.id) ?? GUEST_IDENTITY;
}
