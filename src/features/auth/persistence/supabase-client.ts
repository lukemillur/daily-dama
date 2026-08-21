import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import { logAuthWarning } from '@/features/auth/observability/auth-observability';
import { resolveSupabaseConfig } from '@/features/auth/persistence/supabase-config';

let memoizedClient: SupabaseClient | null | undefined;

/**
 * Lazily constructs and memoizes the browser-persistent Supabase client.
 * Must only ever be invoked from an effect (never at module scope or in a
 * render body) so Expo Router's Node static-render pass never runs it.
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (memoizedClient !== undefined) {
    return memoizedClient;
  }

  if (Platform.OS !== 'web') {
    memoizedClient = null;
    return memoizedClient;
  }

  const config = resolveSupabaseConfig(
    process.env.EXPO_PUBLIC_SUPABASE_URL,
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );

  if (config.status !== 'ready') {
    if (config.status === 'malformed') {
      logAuthWarning('Supabase configuration is malformed.', config.reason);
    }
    memoizedClient = null;
    return memoizedClient;
  }

  memoizedClient = createClient(config.url, config.publishableKey, {
    auth: {
      flowType: 'pkce',
      detectSessionInUrl: false,
      persistSession: true,
      autoRefreshToken: true,
      storage: AsyncStorage,
    },
  });

  return memoizedClient;
}

/** Test-only: clears the memoized client so each test scenario is isolated. */
export function resetSupabaseClientForTests(): void {
  memoizedClient = undefined;
}
