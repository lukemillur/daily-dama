import type { AuthState } from '@/features/auth/model/auth-state';
import { createUserIdentity, GUEST_IDENTITY, type Identity } from '@/shared/persistence/identity';

/**
 * Maps the app's actual Auth state to an Identity. Pure and synchronous.
 *
 * Returns `undefined` for `'initializing'` and `'refreshFailed'` — the
 * identity is genuinely unresolved in both (Supabase hasn't reported a
 * session yet, or a bounded refresh attempt failed with no usable cached
 * session), not safely assumed to be `guest`. T156.2 decides what a provider
 * does with an unresolved identity; this function only refuses to guess. A
 * domain provider must keep blocking under `refreshFailed` so nothing
 * hydrates under a guessed identity while the user is on the recovery screen.
 *
 * `authenticated` / `passwordRecovery` sessions always resolve to a
 * `user:<verified-user-id>` identity derived from `session.user.id` — the
 * only place a verified id can come from. If that id is somehow malformed
 * (defensive case; the Supabase SDK controls this in practice), the identity
 * is rejected back to `guest` rather than exposing a broken partial identity.
 */
export function deriveIdentityFromAuthState(state: AuthState): Identity | undefined {
  if (state.status === 'initializing' || state.status === 'refreshFailed') return undefined;
  if (state.status === 'guest') return GUEST_IDENTITY;

  // 'authenticated' | 'passwordRecovery'
  return createUserIdentity(state.session.user.id) ?? GUEST_IDENTITY;
}
