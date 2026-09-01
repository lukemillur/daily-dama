import { resolveTheme } from '@/features/profile/state/use-resolved-theme';
import { GUEST_IDENTITY } from '@/shared/persistence/identity';
import { physicalKey } from '@/shared/persistence/scoped-storage';

import { deserializeUserProfile, USER_PROFILE_STORAGE_KEY } from './user-profile-persistence';

const GUEST_SCOPED_KEY = physicalKey(GUEST_IDENTITY, USER_PROFILE_STORAGE_KEY);

/**
 * Synchronously resolves the theme background color from a raw key/value read,
 * for use before the async UserProfileProvider hydration path completes (e.g.
 * the web splash overlay). `getItem` is injected so this stays platform-agnostic
 * and unit-testable; callers on web pass `(key) => window.localStorage.getItem(key)`.
 *
 * Reads the identity-scoped guest key first, falling back to the bare legacy key only if the
 * scoped read is empty -- mirroring `read-cached-guest-theme.ts`'s `readCachedGuestTheme`, which
 * documents why this order matters (a stale bare-key snapshot from a different identity, e.g.
 * right after logout, must not be shown instead of the current guest's/default theme).
 */
export function readCachedThemeBackgroundColor(getItem: (key: string) => string | null): string {
  try {
    const serialized = getItem(GUEST_SCOPED_KEY) ?? getItem(USER_PROFILE_STORAGE_KEY);
    if (serialized === null) return resolveTheme({}).background;
    const profile = deserializeUserProfile(serialized);
    return resolveTheme({ themeBackgroundColor: profile?.themeBackgroundColor }).background;
  } catch {
    return resolveTheme({}).background;
  }
}
