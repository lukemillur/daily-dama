import { describe, expect, it } from '@jest/globals';
import { parseServerRowUpdatedAt, resolveUpdatedAtConflict } from '@/shared/sync/conflict-resolution';

describe('resolveUpdatedAtConflict', () => {
  it('keeps local when local is strictly later', () => {
    expect(resolveUpdatedAtConflict(200, 100)).toBe('local');
  });

  it('keeps server when server is strictly later', () => {
    expect(resolveUpdatedAtConflict(100, 200)).toBe('server');
  });

  it('keeps server on an exact tie (documented deterministic tiebreak)', () => {
    expect(resolveUpdatedAtConflict(100, 100)).toBe('server');
  });

  it('keeps server when the server timestamp is unknown', () => {
    expect(resolveUpdatedAtConflict(100, undefined)).toBe('server');
  });
});

describe('parseServerRowUpdatedAt', () => {
  it('parses a valid ISO updated_at string', () => {
    expect(parseServerRowUpdatedAt({ updated_at: '2026-01-01T00:00:00.000Z' })).toBe(Date.parse('2026-01-01T00:00:00.000Z'));
  });

  it('returns undefined for a null row', () => {
    expect(parseServerRowUpdatedAt(null)).toBeUndefined();
  });

  it('returns undefined for an undefined row', () => {
    expect(parseServerRowUpdatedAt(undefined)).toBeUndefined();
  });

  it('returns undefined for a non-object row', () => {
    expect(parseServerRowUpdatedAt('not-a-row')).toBeUndefined();
  });

  it('returns undefined when updated_at is missing', () => {
    expect(parseServerRowUpdatedAt({})).toBeUndefined();
  });

  it('returns undefined when updated_at is not a string', () => {
    expect(parseServerRowUpdatedAt({ updated_at: 12345 })).toBeUndefined();
  });

  it('returns undefined when updated_at is an unparseable string', () => {
    expect(parseServerRowUpdatedAt({ updated_at: 'not-a-date' })).toBeUndefined();
  });
});
