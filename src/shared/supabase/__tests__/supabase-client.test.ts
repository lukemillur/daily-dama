import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { Platform } from 'react-native';
import {
  discardSupabaseClient,
  getGoTrueStorageKey,
  getSupabaseClient,
  getSupabaseSessionStorage,
  resetSupabaseClientForTests,
  resolveGoTrueStorageKey,
} from '@/shared/supabase/supabase-client';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required by jest hoisting
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const mockCreateClient = jest.fn((..._args: unknown[]) => ({ auth: {} }));
jest.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}));

const originalUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const originalKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const originalPlatformOS = Platform.OS;

describe('getSupabaseClient', () => {
  afterEach(() => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = originalUrl;
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = originalKey;
    Platform.OS = originalPlatformOS;
    mockCreateClient.mockClear();
    resetSupabaseClientForTests();
  });

  it.each(['ios', 'android'] as const)(
    '(a) constructs the client on %s with the native storage adapter, pkce, no url detection, and no explicit storageKey',
    (os) => {
      Platform.OS = os;
      process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
      process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'anon-key';

      expect(getSupabaseClient()).not.toBeNull();

      const options = mockCreateClient.mock.calls[0]?.[2] as { auth: Record<string, unknown> };
      expect(options.auth).toMatchObject({ flowType: 'pkce', detectSessionInUrl: false });
      expect('storageKey' in options.auth).toBe(false);
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- match the module under test's import
      const AsyncStorage = require('@react-native-async-storage/async-storage');
      expect(options.auth.storage).not.toBe(AsyncStorage);
      expect(options.auth.storage).toBe(getSupabaseSessionStorage());
    },
  );

  it('discardSupabaseClient stops auto-refresh and lets the next call build a fresh client', () => {
    Platform.OS = 'ios';
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'anon-key';
    const stopAutoRefresh = jest.fn(async () => undefined);
    mockCreateClient.mockReturnValueOnce({ auth: { stopAutoRefresh } });

    const first = getSupabaseClient();
    discardSupabaseClient();
    const second = getSupabaseClient();

    expect(stopAutoRefresh).toHaveBeenCalledTimes(1);
    expect(second).not.toBe(first);
    expect(mockCreateClient).toHaveBeenCalledTimes(2);
  });

  it('never constructs a client when configuration is missing', () => {
    Platform.OS = 'web';
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    delete process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    expect(getSupabaseClient()).toBeNull();
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it('never constructs a client when the url is malformed', () => {
    Platform.OS = 'web';
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'not-a-url';
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'anon-key';

    expect(getSupabaseClient()).toBeNull();
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it('constructs the client exactly once with pkce, no url detection, and AsyncStorage', () => {
    Platform.OS = 'web';
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'anon-key';

    const first = getSupabaseClient();
    const second = getSupabaseClient();

    expect(first).toBe(second);
    expect(mockCreateClient).toHaveBeenCalledTimes(1);

    const [url, publishableKey, options] = mockCreateClient.mock.calls[0] as unknown as [
      string,
      string,
      { auth: Record<string, unknown>; db: Record<string, unknown> },
    ];

    expect(url).toBe('https://example.supabase.co');
    expect(publishableKey).toBe('anon-key');
    expect(options.auth).toMatchObject({
      flowType: 'pkce',
      detectSessionInUrl: false,
      persistSession: true,
      autoRefreshToken: true,
    });
    expect(options.db).toEqual({ schema: 'api' });

    // eslint-disable-next-line @typescript-eslint/no-require-imports -- match the module under test's import
    const AsyncStorage = require('@react-native-async-storage/async-storage');
    expect(options.auth.storage).toBe(AsyncStorage);
    expect('storageKey' in options.auth).toBe(false);
  });
});

describe('resolveGoTrueStorageKey', () => {
  it('derives the key from the project ref subdomain of a realistic project URL', () => {
    expect(resolveGoTrueStorageKey('https://abcdefghijklmno.supabase.co')).toBe(
      'sb-abcdefghijklmno-auth-token',
    );
  });

  it('(b) keeps the web key stable for the production project URL (changing it signs every web user out)', () => {
    // Representative production-shaped ref: DEPLOYMENT_HANDOFF.md does not record the real ref.
    // The derivation is pinned, which is what protects existing sessions.
    expect(resolveGoTrueStorageKey('https://wxyzabcdefghijklmnop.supabase.co')).toBe(
      'sb-wxyzabcdefghijklmnop-auth-token',
    );
  });

  it('derives the key from a local Supabase URL', () => {
    expect(resolveGoTrueStorageKey('http://127.0.0.1:54321')).toBe('sb-127-auth-token');
  });
});

describe('getGoTrueStorageKey', () => {
  afterEach(() => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = originalUrl;
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = originalKey;
    Platform.OS = originalPlatformOS;
    mockCreateClient.mockClear();
    resetSupabaseClientForTests();
  });

  it('returns null when unconfigured', () => {
    Platform.OS = 'web';
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    delete process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    expect(getGoTrueStorageKey()).toBeNull();
  });

  it('returns the correct key when configured, matching getSupabaseClient', () => {
    Platform.OS = 'web';
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'anon-key';

    expect(getSupabaseClient()).not.toBeNull();
    expect(getGoTrueStorageKey()).toBe('sb-example-auth-token');
  });
});
