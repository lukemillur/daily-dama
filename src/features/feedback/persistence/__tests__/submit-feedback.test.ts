import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { Platform } from 'react-native';

import { submitFeedback } from '@/features/feedback/persistence/submit-feedback';

const mockGetSupabaseClient = jest.fn<() => unknown>();
jest.mock('@/shared/supabase/supabase-client', () => ({
  getSupabaseClient: () => mockGetSupabaseClient(),
}));



type Insert = jest.Mock<(row: unknown) => Promise<{ error: unknown }>>;

function clientWith(insert: Insert) {
  const from = jest.fn((_table: string) => ({ insert }));
  mockGetSupabaseClient.mockReturnValue({ from });
  return from;
}

describe('submitFeedback on the native client path', () => {
  const originalOS = Platform.OS;
  afterEach(() => {
    Platform.OS = originalOS;
    mockGetSupabaseClient.mockReset();
  });

  it('inserts trimmed fields and never sends email', async () => {
    Platform.OS = 'ios';
    const insert: Insert = jest.fn<(row: unknown) => Promise<{ error: unknown }>>().mockResolvedValue({ error: null });
    const from = clientWith(insert);
    const result = await submitFeedback({ name: '  Sam ', message: '  hello  ' });
    expect(result).toEqual({ status: 'succeeded', value: undefined });
    expect(from).toHaveBeenCalledWith('feedback');
    expect(insert).toHaveBeenCalledWith({ name: 'Sam', message: 'hello' });
  });

  it('stores a blank name as null', async () => {
    Platform.OS = 'ios';
    const insert: Insert = jest.fn<(row: unknown) => Promise<{ error: unknown }>>().mockResolvedValue({ error: null });
    clientWith(insert);
    await submitFeedback({ name: '   ', message: 'hi' });
    expect(insert).toHaveBeenCalledWith({ name: null, message: 'hi' });
  });

  it('returns a failure when PostgREST reports an error', async () => {
    Platform.OS = 'ios';
    const insert: Insert = jest
      .fn<(row: unknown) => Promise<{ error: unknown }>>()
      .mockResolvedValue({ error: { message: 'nope', code: '42501', details: '', hint: '' } });
    clientWith(insert);
    const result = await submitFeedback({ message: 'hi' });
    expect(result.status).toBe('failed');
  });

  it('returns a failure when the request rejects', async () => {
    Platform.OS = 'ios';
    const insert: Insert = jest
      .fn<(row: unknown) => Promise<{ error: unknown }>>()
      .mockRejectedValue(new TypeError('Network request failed'));
    clientWith(insert);
    const result = await submitFeedback({ message: 'hi' });
    expect(result.status).toBe('failed');
  });

  it('returns a failure when no client exists', async () => {
    mockGetSupabaseClient.mockReturnValue(null);
    const result = await submitFeedback({ message: 'hi' });
    expect(result.status).toBe('failed');
  });
});
