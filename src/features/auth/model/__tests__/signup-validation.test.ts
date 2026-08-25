import { describe, expect, it } from '@jest/globals';

import { validateSignUpFields } from '@/features/auth/model/signup-validation';

describe('validateSignUpFields', () => {
  it('includes the shared email error in the flow-specific result', () => {
    expect(validateSignUpFields('not-an-email', 'longenoughpassword', 'longenoughpassword')).toEqual({
      status: 'invalid',
      errors: { email: 'Enter a valid email address.' },
    });
  });

  it('flags a too-short password', () => {
    const result = validateSignUpFields('person@example.com', 'short', 'short');
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.errors.password).toBe('Use at least 10 characters.');
    }
  });

  it('flags a mismatched confirm password', () => {
    const result = validateSignUpFields(
      'person@example.com',
      'longenoughpassword',
      'different-password',
    );
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.errors.confirmPassword).toBe('Passwords do not match.');
    }
  });

  it('is valid when email, password, and confirm password all pass', () => {
    const result = validateSignUpFields(
      'person@example.com',
      'longenoughpassword',
      'longenoughpassword',
    );
    expect(result).toEqual({ status: 'valid' });
  });
});
