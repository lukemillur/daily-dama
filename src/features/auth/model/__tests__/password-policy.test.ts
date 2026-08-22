import { describe, expect, it } from '@jest/globals';

import { MIN_PASSWORD_LENGTH, validateNewPassword } from '@/features/auth/model/password-policy';

describe('validateNewPassword', () => {
  it('rejects a password shorter than the minimum length', () => {
    const result = validateNewPassword('short1', 'short1');
    expect(result).toEqual({
      status: 'invalid',
      errors: { password: `Use at least ${MIN_PASSWORD_LENGTH} characters.` },
    });
  });

  it('rejects mismatched passwords that both meet the minimum length', () => {
    const result = validateNewPassword('longenoughpass', 'differentpassword');
    expect(result).toEqual({
      status: 'invalid',
      errors: { confirmPassword: 'Passwords do not match.' },
    });
  });

  it('reports both errors when the password is too short and mismatched', () => {
    const result = validateNewPassword('short1', 'other');
    expect(result).toEqual({
      status: 'invalid',
      errors: {
        password: `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
        confirmPassword: 'Passwords do not match.',
      },
    });
  });

  it('accepts a valid, matching pair at or above the minimum length', () => {
    expect(validateNewPassword('longenoughpass', 'longenoughpass')).toEqual({ status: 'valid' });
  });
});
