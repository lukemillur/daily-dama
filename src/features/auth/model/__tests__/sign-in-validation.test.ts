import { describe, expect, it } from '@jest/globals';

import { validateSignInFields } from '@/features/auth/model/sign-in-validation';

describe('validateSignInFields', () => {
  it('includes the shared email error in the flow-specific result', () => {
    expect(validateSignInFields('', 'somepassword')).toEqual({
      status: 'invalid',
      errors: { email: 'Enter your email.' },
    });
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
