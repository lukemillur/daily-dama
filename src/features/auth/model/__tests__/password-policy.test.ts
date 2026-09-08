import { describe, expect, it } from '@jest/globals';

import { validateNewPassword } from '@/features/auth/model/password-policy';

const VALID_PASSWORD = 'Str0ng!Pass';

describe('validateNewPassword', () => {
  it('rejects a password missing only the minimum length', () => {
    const result = validateNewPassword('Sh0rt!', 'Sh0rt!');
    expect(result).toEqual({
      status: 'invalid',
      errors: { password: 'Password needs at least 8 characters.' },
    });
  });

  it('rejects a password missing only an uppercase letter', () => {
    const result = validateNewPassword('lowercase1!', 'lowercase1!');
    expect(result).toEqual({
      status: 'invalid',
      errors: { password: 'Password needs an uppercase letter.' },
    });
  });

  it('rejects a password missing only a number', () => {
    const result = validateNewPassword('NoNumbers!', 'NoNumbers!');
    expect(result).toEqual({
      status: 'invalid',
      errors: { password: 'Password needs a number.' },
    });
  });

  it('rejects a password missing only a symbol', () => {
    const result = validateNewPassword('NoSymbols1', 'NoSymbols1');
    expect(result).toEqual({
      status: 'invalid',
      errors: { password: 'Password needs a symbol.' },
    });
  });

  it('rejects a password missing every rule, naming all of them', () => {
    const result = validateNewPassword('short', 'short');
    expect(result).toEqual({
      status: 'invalid',
      errors: {
        password: 'Password needs at least 8 characters, an uppercase letter, a number, and a symbol.',
      },
    });
  });

  it('rejects mismatched passwords that both satisfy every rule', () => {
    const result = validateNewPassword(VALID_PASSWORD, 'Different1!');
    expect(result).toEqual({
      status: 'invalid',
      errors: { confirmPassword: 'Passwords do not match.' },
    });
  });

  it('reports both errors when the password fails a rule and is mismatched', () => {
    const result = validateNewPassword('short', 'other');
    expect(result).toEqual({
      status: 'invalid',
      errors: {
        password: 'Password needs at least 8 characters, an uppercase letter, a number, and a symbol.',
        confirmPassword: 'Passwords do not match.',
      },
    });
  });

  it('accepts a valid, matching pair satisfying all four rules', () => {
    expect(validateNewPassword(VALID_PASSWORD, VALID_PASSWORD)).toEqual({ status: 'valid' });
  });
});
