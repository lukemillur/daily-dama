import { createURL } from 'expo-linking';
import { Platform } from 'react-native';

export type AuthCallbackOptions = {
  /** Discriminates an email-change confirmation from a sign-up confirmation in AuthCallbackScreen. */
  flow?: 'email_change';
};

const CALLBACK_PATH = 'auth/callback';
// Must equal the allow-list entry in supabase/config.toml (and the hosted project) exactly.
const NATIVE_SCHEME = 'dailydama';

/**
 * The single source of every email-link `redirectTo`. Fixed and non-attacker-influenceable: it
 * never accepts a destination from a route param or query string. Web uses the current origin;
 * native uses the app's custom scheme, so `window.location` is never read there (React Native
 * defines `window` but not `window.location`). Returns `undefined` only when web has no `window`
 * (server render), which callers surface as a typed "unable to resolve" error.
 */
export function buildAuthCallbackUrl(options: AuthCallbackOptions = {}): string | undefined {
  const { flow } = options;

  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') {
      return undefined;
    }
    const base = `${window.location.origin}/${CALLBACK_PATH}`;
    return flow ? `${base}?flow=${flow}` : base;
  }

  return createURL(CALLBACK_PATH, {
    scheme: NATIVE_SCHEME,
    queryParams: flow ? { flow } : undefined,
  });
}
