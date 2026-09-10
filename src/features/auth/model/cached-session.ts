import type { Session } from '@supabase/supabase-js';

/**
 * Parses a raw AsyncStorage value under GoTrue's own storage key into a
 * `Session`, without any IO -- pure and synchronous so it's trivially
 * unit-testable and safe to call from a render/effect body.
 *
 * Structural validation only (no expiry check): `AuthProvider`'s optimistic
 * read (see its init effect) trusts a structurally valid cached session
 * regardless of freshness, and the real `onAuthStateChange` subscription
 * corrects it moments later if the cached session actually turns out to be
 * invalid or expired.
 */
export function parseCachedSession(raw: string | null): Session | undefined {
  if (raw === null) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }

  if (typeof parsed !== 'object' || parsed === null) return undefined;

  const candidate = parsed as Record<string, unknown>;
  if (typeof candidate.access_token !== 'string' || !candidate.access_token) return undefined;
  if (typeof candidate.refresh_token !== 'string' || !candidate.refresh_token) return undefined;

  const user = candidate.user;
  if (typeof user !== 'object' || user === null) return undefined;
  if (typeof (user as Record<string, unknown>).id !== 'string' || !(user as Record<string, unknown>).id) {
    return undefined;
  }

  return candidate as unknown as Session;
}
