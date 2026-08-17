import { resolveTheme } from '@/features/profile/state/use-resolved-theme';

import { deserializeUserProfile, USER_PROFILE_STORAGE_KEY } from './user-profile-persistence';

/**
 * Synchronously resolves the theme background color from a raw key/value read,
 * for use before the async UserProfileProvider hydration path completes (e.g.
 * the web splash overlay). `getItem` is injected so this stays platform-agnostic
 * and unit-testable; callers on web pass `(key) => window.localStorage.getItem(key)`.
 */
export function readCachedThemeBackgroundColor(getItem: (key: string) => string | null): string {
  try {
    const serialized = getItem(USER_PROFILE_STORAGE_KEY);
    if (serialized === null) return resolveTheme({}).background;
    const profile = deserializeUserProfile(serialized);
    return resolveTheme({ themeBackgroundColor: profile?.themeBackgroundColor }).background;
  } catch {
    return resolveTheme({}).background;
  }
}
