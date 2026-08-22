import { describe, expect, it } from '@jest/globals';

import { validateForgotPasswordEmail } from '@/features/auth/model/forgot-password-validation';

describe('validateForgotPasswordEmail', () => {
  it('flags an empty email', () => {
    const result = validateForgotPasswordEmail('');
    expect(result).toEqual({ status: 'invalid', errors: { email: 'Enter your email.' } });
  });

  it('flags a malformed email missing an @', () => {
    const result = validateForgotPasswordEmail('notanemail.com');
    expect(result.status).toBe('invalid');
    expect(result.status === 'invalid' && result.errors.email).toBe('Enter a valid email address.');
  });

  it('flags a malformed email missing a dot', () => {
    const result = validateForgotPasswordEmail('person@example');
    expect(result.status).toBe('invalid');
    expect(result.status === 'invalid' && result.errors.email).toBe('Enter a valid email address.');
  });

  it('accepts a valid email', () => {
    const result = validateForgotPasswordEmail('person@example.com');
    expect(result).toEqual({ status: 'valid' });
  });

  it('accepts a valid email with surrounding whitespace', () => {
    const result = validateForgotPasswordEmail('  person@example.com  ');
    expect(result).toEqual({ status: 'valid' });
  });
});
