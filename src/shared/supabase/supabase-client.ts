import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import { logAuthWarning } from '@/features/auth/observability/auth-observability';
import { resolveSupabaseConfig } from '@/features/auth/persistence/supabase-config';
import type { Database } from '@/shared/supabase/database-types';

let memoizedClient: SupabaseClient<Database, 'api'> | null | undefined;
let memoizedStorageKey: string | null | undefined;

/**
 * Replicates supabase-js 2.112.3's default GoTrue `storageKey` derivation
 * (`SupabaseClient`'s constructor, not independently configurable without
 * risk -- see the comment on `getGoTrueStorageKey` below for why this project
 * does not set `storageKey` explicitly). Pure and synchronous.
 *
 * A future supabase-js upgrade must re-verify this derivation against the
 * newly installed version's source before trusting it -- this is exactly the
 * version-sensitive-dependency case AGENTS.md flags.
 */
export function resolveGoTrueStorageKey(supabaseUrl: string): string {
  return `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;
}

/**
 * Lazily constructs and memoizes the browser-persistent Supabase client.
 * Must only ever be invoked from an effect (never at module scope or in a
 * render body) so Expo Router's Node static-render pass never runs it.
 */
export function getSupabaseClient(): SupabaseClient<Database, 'api'> | null {
  if (memoizedClient !== undefined) {
    return memoizedClient;
  }

  if (Platform.OS !== 'web') {
    memoizedClient = null;
    memoizedStorageKey = null;
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
    memoizedStorageKey = null;
    return memoizedClient;
  }

  memoizedStorageKey = resolveGoTrueStorageKey(config.url);
  memoizedClient = createClient<Database, 'api'>(config.url, config.publishableKey, {
    auth: {
      flowType: 'pkce',
      detectSessionInUrl: false,
      persistSession: true,
      autoRefreshToken: true,
      storage: AsyncStorage,
    },
    db: { schema: 'api' },
  });

  return memoizedClient;
}

/**
 * Returns the AsyncStorage key GoTrue itself persists the current session
 * under, or `null` when `getSupabaseClient()` would also return `null`
 * (unconfigured/malformed/non-web) -- shares the same memoization as
 * `getSupabaseClient()` so the two can never disagree.
 *
 * This is an undocumented supabase-js internal default, deliberately not
 * overridden via an explicit `storageKey` (doing so would force a local
 * sign-out for every currently-authenticated production user on next deploy
 * -- see `AuthProvider`'s init effect / T262's plan for the full reasoning).
 * If a future supabase-js upgrade changes that default algorithm, this
 * derivation silently stops matching and callers relying on it (the
 * optimistic cached-session read) silently degrade back to today's
 * behavior -- not a hard failure, but worth re-checking on upgrade.
 */
export function getGoTrueStorageKey(): string | null {
  getSupabaseClient();
  return memoizedStorageKey ?? null;
}

/** Test-only: clears the memoized client so each test scenario is isolated. */
export function resetSupabaseClientForTests(): void {
  memoizedClient = undefined;
  memoizedStorageKey = undefined;
}
