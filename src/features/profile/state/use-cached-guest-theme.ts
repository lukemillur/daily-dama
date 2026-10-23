import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import { readCachedGuestTheme } from '@/features/profile/persistence/read-cached-guest-theme';
import { USER_PROFILE_STORAGE_KEY } from '@/features/profile/persistence/user-profile-persistence';
import { resolveTheme, type ResolvedTheme } from '@/features/profile/state/use-resolved-theme';
import { GUEST_IDENTITY } from '@/shared/persistence/identity';
import { physicalKey } from '@/shared/persistence/scoped-storage';

const DEFAULT_THEME = resolveTheme({});
const GUEST_SCOPED_KEY = physicalKey(GUEST_IDENTITY, USER_PROFILE_STORAGE_KEY);

const emptySubscribe = () => () => {};

/**
 * Resolves the theme background, accent, and text colors synchronously, without waiting on
 * IdentityProvider or UserProfileProvider's async hydration. Used by the auth route group
 * (sign-up, sign-in, forgot-password, reset-password), which renders entirely outside both of
 * those providers and must not gate first paint on their hydration. Do not reintroduce that gate
 * here.
 *
 * Mirrors useCachedOnboardingStatus's pattern exactly: on web, localStorage is synchronous, so
 * this reads it directly once past the server or first-client-render hydration boundary (the
 * useSyncExternalStore hydration-mismatch gate also used by AnimatedSplashOverlay and
 * useCachedOnboardingStatus). Static export prerendering happens in Node, where there is no
 * window, so the prerendered HTML and the very first client render both use the fixed default;
 * only the render after that boundary reads the real cached value, so there is no visible flash.
 *
 * On native, there is no synchronous storage API, so this falls back to one non-blocking
 * AsyncStorage.getItem read that updates state once it resolves. Native is not an active
 * verification target for this task.
 *
 * Always reads the guest-scoped key (see read-cached-guest-theme.ts): the auth route group has
 * no live identity resolution available, and three of its four screens (sign-up, sign-in,
 * forgot-password) are strictly guest-only flows. The reset-password screen is a documented
 * approximation; see read-cached-guest-theme.ts's doc comment.
 */
export function useCachedGuestTheme(): ResolvedTheme {
  const hasHydrated = useSyncExternalStore(emptySubscribe, () => true, () => false);
  const [nativeTheme, setNativeTheme] = useState<ResolvedTheme>(DEFAULT_THEME);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    let isCurrent = true;
    AsyncStorage.getItem(GUEST_SCOPED_KEY).then((serialized) => {
      if (!isCurrent) return;
      setNativeTheme(readCachedGuestTheme(() => serialized));
    });

    return () => {
      isCurrent = false;
    };
  }, []);

  if (Platform.OS !== 'web') return nativeTheme;
  if (!hasHydrated) return DEFAULT_THEME;

  return readCachedGuestTheme((key) => window.localStorage.getItem(key));
}
