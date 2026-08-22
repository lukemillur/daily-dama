import { describe, expect, it } from '@jest/globals';

import { categorizeAuthError } from '@/features/auth/model/auth-errors';

import { authApiErrorFixtures, networkFailure } from '../auth-test-fixtures';

describe('categorizeAuthError', () => {
  const expectedCategoryByCode: Record<string, string> = {
    invalid_credentials: 'invalidCredentials',
    email_not_confirmed: 'unverifiedEmail',
    user_already_exists: 'accountAlreadyExists',
    weak_password: 'weakPassword',
    over_request_rate_limit: 'rateLimited',
    otp_expired: 'expiredOrInvalidLink',
    session_not_found: 'expiredOrInvalidLink',
    session_expired: 'expiredOrInvalidLink',
    bad_code_verifier: 'missingVerifier',
    flow_state_not_found: 'missingVerifier',
  };

  it.each(authApiErrorFixtures)('maps code $code to its actionable category', (fixture) => {
    expect(categorizeAuthError(fixture)).toBe(expectedCategoryByCode[fixture.code]);
  });

  it('collapses an unknown-user code into the same category as a wrong password', () => {
    expect(categorizeAuthError({ code: 'user_not_found', status: 400 })).toBe(
      categorizeAuthError({ code: 'invalid_credentials', status: 400 }),
    );
  });

  it('categorizes a network failure as offline', () => {
    expect(categorizeAuthError(networkFailure())).toBe('offline');
  });

  it('categorizes an AuthRetryableFetchError-shaped object as offline', () => {
    expect(categorizeAuthError({ name: 'AuthRetryableFetchError', message: 'fetch failed' })).toBe(
      'offline',
    );
  });

  it('falls back to unknown for an unrecognized code', () => {
    expect(categorizeAuthError({ code: 'some_new_server_code', status: 500 })).toBe('unknown');
  });

  it('falls back to unknown for a non-error value', () => {
    expect(categorizeAuthError('just a string')).toBe('unknown');
    expect(categorizeAuthError(undefined)).toBe('unknown');
    expect(categorizeAuthError(null)).toBe('unknown');
  });

  it('never returns the original message or code -- only a closed category name', () => {
    const category = categorizeAuthError({ code: 'invalid_credentials', message: 'secret detail' });
    expect(category).not.toContain('secret');
    expect(typeof category).toBe('string');
  });
});
