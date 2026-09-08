import { describe, expect, it } from '@jest/globals';

import { validateSignUpFields } from '@/features/auth/model/signup-validation';

const VALID_PASSWORD = 'Str0ng!Pass';

describe('validateSignUpFields', () => {
  it('includes the shared email error in the flow-specific result', () => {
    expect(validateSignUpFields('not-an-email', VALID_PASSWORD, VALID_PASSWORD)).toEqual({
      status: 'invalid',
      errors: { email: 'Enter a valid email address.' },
    });
  });

  it('flags a too-short password', () => {
    const result = validateSignUpFields('person@example.com', 'short', 'short');
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.errors.password).toBe(
        'Password needs at least 8 characters, an uppercase letter, a number, and a symbol.',
      );
    }
  });

  it('flags a mismatched confirm password', () => {
    const result = validateSignUpFields('person@example.com', VALID_PASSWORD, 'Different1!');
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.errors.confirmPassword).toBe('Passwords do not match.');
    }
  });

  it('is valid when email, password, and confirm password all pass', () => {
    const result = validateSignUpFields('person@example.com', VALID_PASSWORD, VALID_PASSWORD);
    expect(result).toEqual({ status: 'valid' });
  });
});
