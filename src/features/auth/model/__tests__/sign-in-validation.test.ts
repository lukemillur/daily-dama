import { describe, expect, it } from '@jest/globals';

import { validateSignInFields } from '@/features/auth/model/sign-in-validation';

describe('validateSignInFields', () => {
  it('flags an empty email', () => {
    const result = validateSignInFields('', 'somepassword');
    expect(result).toEqual({ status: 'invalid', errors: { email: 'Enter your email.' } });
  });

  it('flags a malformed email missing an @', () => {
    const result = validateSignInFields('notanemail.com', 'somepassword');
    expect(result.status).toBe('invalid');
    expect(result.status === 'invalid' && result.errors.email).toBe('Enter a valid email address.');
  });

  it('flags a malformed email missing a dot', () => {
    const result = validateSignInFields('person@example', 'somepassword');
    expect(result.status).toBe('invalid');
    expect(result.status === 'invalid' && result.errors.email).toBe('Enter a valid email address.');
  });

  it('flags an empty password', () => {
    const result = validateSignInFields('person@example.com', '');
    expect(result).toEqual({ status: 'invalid', errors: { password: 'Enter your password.' } });
  });

  it('accepts a valid email/password pair', () => {
    const result = validateSignInFields('person@example.com', 'anything');
    expect(result).toEqual({ status: 'valid' });
  });
});
