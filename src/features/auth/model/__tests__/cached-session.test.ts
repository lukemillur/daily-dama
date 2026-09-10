import { describe, expect, it } from '@jest/globals';

import { parseCachedSession } from '@/features/auth/model/cached-session';

const REALISTIC_SESSION = JSON.stringify({
  access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig',
  refresh_token: 'a-refresh-token',
  expires_in: 3600,
  expires_at: 1234567890,
  token_type: 'bearer',
  user: {
    id: '11111111-1111-1111-1111-111111111111',
    email: 'person@example.com',
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
  },
});

describe('parseCachedSession', () => {
  it('returns undefined for a null raw value', () => {
    expect(parseCachedSession(null)).toBeUndefined();
  });

  it('returns undefined for invalid JSON', () => {
    expect(parseCachedSession('not-json{')).toBeUndefined();
  });

  it('returns undefined when access_token is missing', () => {
    const raw = JSON.stringify({ refresh_token: 'r', user: { id: 'u1' } });
    expect(parseCachedSession(raw)).toBeUndefined();
  });

  it('returns undefined when refresh_token is missing', () => {
    const raw = JSON.stringify({ access_token: 't', user: { id: 'u1' } });
    expect(parseCachedSession(raw)).toBeUndefined();
  });

  it('returns undefined when user is missing', () => {
    const raw = JSON.stringify({ access_token: 't', refresh_token: 'r' });
    expect(parseCachedSession(raw)).toBeUndefined();
  });

  it('returns undefined when user.id is missing', () => {
    const raw = JSON.stringify({ access_token: 't', refresh_token: 'r', user: {} });
    expect(parseCachedSession(raw)).toBeUndefined();
  });

  it('parses a valid minimal session', () => {
    const raw = JSON.stringify({ access_token: 't', refresh_token: 'r', user: { id: 'u1' } });
    expect(parseCachedSession(raw)).toEqual({ access_token: 't', refresh_token: 'r', user: { id: 'u1' } });
  });

  it('parses a realistic full GoTrue session payload shape', () => {
    const result = parseCachedSession(REALISTIC_SESSION);
    expect(result).toBeDefined();
    expect(result?.access_token).toBe('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig');
    expect(result?.refresh_token).toBe('a-refresh-token');
    expect(result?.user.id).toBe('11111111-1111-1111-1111-111111111111');
  });
});
