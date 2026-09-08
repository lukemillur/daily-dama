import { describe, expect, it } from '@jest/globals';

import { decodeCloudCursor, encodeCloudCursor, mapNetworkError, mapPostgrestError } from '@/shared/supabase/cloud-repository';

describe('cloud pagination cursor', () => {
  it('round-trips an offset through encode/decode', () => {
    expect(decodeCloudCursor(encodeCloudCursor(0))).toBe(0);
    expect(decodeCloudCursor(encodeCloudCursor(42))).toBe(42);
    expect(decodeCloudCursor(encodeCloudCursor(1337))).toBe(1337);
  });

  it('decodes a null/undefined cursor to offset 0 (first page)', () => {
    expect(decodeCloudCursor(null)).toBe(0);
    expect(decodeCloudCursor(undefined)).toBe(0);
  });

  it('throws on a malformed cursor rather than silently restarting from 0', () => {
    expect(() => decodeCloudCursor('not-a-number')).toThrow();
    expect(() => decodeCloudCursor('-5')).toThrow();
    expect(() => decodeCloudCursor('3.5')).toThrow();
    expect(() => decodeCloudCursor('')).toThrow();
  });
});

describe('mapPostgrestError', () => {
  it('maps 42501 to authorization', () => {
    expect(mapPostgrestError({ message: 'denied', code: '42501' }).kind).toBe('authorization');
  });

  it('maps PGRST116 to notFound', () => {
    expect(mapPostgrestError({ message: 'no rows', code: 'PGRST116' }).kind).toBe('notFound');
  });

  it.each(['23514', '23505', 'PGRST204', 'PGRST102'])('maps %s to validation', (code) => {
    expect(mapPostgrestError({ message: 'invalid', code }).kind).toBe('validation');
  });

  it('falls back to unknown for an unrecognized code', () => {
    expect(mapPostgrestError({ message: 'weird', code: '99999' }).kind).toBe('unknown');
  });

  it('falls back to unknown when no error is given', () => {
    expect(mapPostgrestError(null).kind).toBe('unknown');
    expect(mapPostgrestError(undefined).kind).toBe('unknown');
  });

  it('preserves the message and cause', () => {
    const error = { message: 'boom', code: '23505' };
    const mapped = mapPostgrestError(error);
    expect(mapped.message).toBe('boom');
    expect(mapped.cause).toBe(error);
  });
});

describe('mapNetworkError', () => {
  it('wraps a thrown Error as a network error', () => {
    const cause = new Error('fetch failed');
    const mapped = mapNetworkError(cause);
    expect(mapped.kind).toBe('network');
    expect(mapped.message).toBe('fetch failed');
    expect(mapped.cause).toBe(cause);
  });

  it('wraps a non-Error thrown value with a generic message', () => {
    const mapped = mapNetworkError('some string');
    expect(mapped.kind).toBe('network');
    expect(mapped.cause).toBe('some string');
  });
});
