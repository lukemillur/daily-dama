import { describe, expect, it } from '@jest/globals';

import { validateForgotPasswordEmail } from '@/features/auth/model/forgot-password-validation';

describe('validateForgotPasswordEmail', () => {
  it('includes the shared email error in the flow-specific result', () => {
    expect(validateForgotPasswordEmail('')).toEqual({
      status: 'invalid',
      errors: { email: 'Enter your email.' },
    });
  });

  it('accepts a valid email', () => {
    const result = validateForgotPasswordEmail('person@example.com');
    expect(result).toEqual({ status: 'valid' });
  });

});
