import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { Platform } from 'react-native';
import { getSupabaseClient, resetSupabaseClientForTests } from '@/features/auth/persistence/supabase-client';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required by jest hoisting
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const mockCreateClient = jest.fn((..._args: unknown[]) => ({ auth: {} }));
jest.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}));

describe('getSupabaseClient', () => {
  const originalUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const originalPlatformOS = Platform.OS;

  afterEach(() => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = originalUrl;
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = originalKey;
    Platform.OS = originalPlatformOS;
    mockCreateClient.mockClear();
    resetSupabaseClientForTests();
  });

  it('never constructs a client on native platforms regardless of config', () => {
    Platform.OS = 'ios';
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'anon-key';

    expect(getSupabaseClient()).toBeNull();
    expect(mockCreateClient).not.toHaveBeenCalled();
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
      { auth: Record<string, unknown> },
    ];

    expect(url).toBe('https://example.supabase.co');
    expect(publishableKey).toBe('anon-key');
    expect(options.auth).toMatchObject({
      flowType: 'pkce',
      detectSessionInUrl: false,
      persistSession: true,
      autoRefreshToken: true,
    });

    // eslint-disable-next-line @typescript-eslint/no-require-imports -- match the module under test's import
    const AsyncStorage = require('@react-native-async-storage/async-storage');
    expect(options.auth.storage).toBe(AsyncStorage);
  });
});
