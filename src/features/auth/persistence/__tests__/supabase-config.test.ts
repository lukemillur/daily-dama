import { describe, expect, it } from '@jest/globals';

import { resolveSupabaseConfig } from '@/features/auth/persistence/supabase-config';

describe('resolveSupabaseConfig', () => {
  it('is missing when both values are undefined', () => {
    expect(resolveSupabaseConfig(undefined, undefined)).toEqual({ status: 'missing' });
  });

  it('is missing when only the url is set', () => {
    expect(resolveSupabaseConfig('https://example.supabase.co', undefined)).toEqual({ status: 'missing' });
  });

  it('is missing when the publishable key is blank after trimming', () => {
    expect(resolveSupabaseConfig('https://example.supabase.co', '   ')).toEqual({ status: 'missing' });
  });

  it('is malformed when the url is not parseable', () => {
    const result = resolveSupabaseConfig('not-a-url', 'anon-key');
    expect(result.status).toBe('malformed');
  });

  it('is ready with trimmed url and key when both are valid', () => {
    expect(resolveSupabaseConfig(' https://example.supabase.co ', ' anon-key ')).toEqual({
      status: 'ready',
      url: 'https://example.supabase.co',
      publishableKey: 'anon-key',
    });
  });
});
