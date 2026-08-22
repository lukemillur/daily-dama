import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { Platform } from 'react-native';

import {
  logAuthWarning,
  sanitizeAnalyticsEvent,
  trackAuthEvent,
} from '@/features/auth/observability/auth-observability';

import {
  authApiErrorFixtures,
  EMAIL,
  JWT_LIKE,
  nestedIdentifierPayload,
  PASSWORD,
  REFRESH_TOKEN,
} from '../../model/auth-test-fixtures';

const mockTrack = jest.fn();
jest.mock('@vercel/analytics', () => ({ track: (...args: unknown[]) => mockTrack(...args) }));

afterEach(() => {
  jest.restoreAllMocks();
  mockTrack.mockClear();
});

describe('logAuthWarning', () => {
  it('redacts the sensitive code field of a raw Supabase error while keeping the message actionable', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    logAuthWarning('sign-in failed', authApiErrorFixtures[0]);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const serialized = JSON.stringify(warnSpy.mock.calls[0]);
    expect(serialized).not.toContain(authApiErrorFixtures[0].code);
    // The English description carries no email/token/credential -- it stays intact so the log
    // remains actionable for debugging (this is a console-only path, never Analytics).
    expect(serialized).toContain('Invalid login credentials');
  });

  it('redacts emails, tokens, and nested identifiers before printing', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    logAuthWarning('callback failed', nestedIdentifierPayload());
    const serialized = JSON.stringify(warnSpy.mock.calls[0]);
    expect(serialized).not.toContain(EMAIL);
    expect(serialized).not.toContain(JWT_LIKE);
    expect(serialized).not.toContain(REFRESH_TOKEN);
  });

  it('redacts a short password by key name', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    logAuthWarning('signup failed', { email: EMAIL, password: PASSWORD });
    const serialized = JSON.stringify(warnSpy.mock.calls[0]);
    expect(serialized).not.toContain(PASSWORD);
    expect(serialized).not.toContain(EMAIL);
  });

  it('logs the plain message even with no detail payload', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    logAuthWarning('config missing');
    expect(warnSpy).toHaveBeenCalledWith('config missing', undefined);
  });
});

describe('trackAuthEvent', () => {
  it('tracks a category-only payload on web, never a raw error/object', () => {
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
    trackAuthEvent('auth_sign_in_failed', 'invalidCredentials');
    expect(mockTrack).toHaveBeenCalledWith('auth_sign_in_failed', {
      category: 'invalidCredentials',
    });
  });

  it('tracks with no payload when no category is given', () => {
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
    trackAuthEvent('auth_sign_in_started');
    expect(mockTrack).toHaveBeenCalledWith('auth_sign_in_started', undefined);
  });

  it('is a no-op off web', () => {
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
    trackAuthEvent('auth_sign_in_failed', 'invalidCredentials');
    expect(mockTrack).not.toHaveBeenCalled();
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
  });
});

describe('sanitizeAnalyticsEvent', () => {
  it('redacts the event url while leaving other fields untouched', () => {
    const event = {
      type: 'pageview' as const,
      url: `https://dailydama.com/auth/callback?code=pkce_${'a'.repeat(24)}`,
    };
    const result = sanitizeAnalyticsEvent(event);
    expect(result.type).toBe('pageview');
    expect(result.url).not.toContain('pkce_');
    expect(result.url).toContain('https://dailydama.com/auth/callback');
  });
});
