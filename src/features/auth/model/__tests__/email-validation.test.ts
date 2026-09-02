import { describe, expect, it } from '@jest/globals';

import { getEmailValidationError } from '@/features/auth/model/email-validation';

describe('getEmailValidationError', () => {
  const cases: readonly (readonly [email: string, expected: string | undefined])[] = [
    ['', 'Enter your email.'],
    ['   ', 'Enter your email.'],
    ['notanemail.com', 'Enter a valid email address.'],
    ['person@example', 'Enter a valid email address.'],
    ['person@example.com', undefined],
    ['  person@example.com  ', undefined],
  ];

  it.each(cases)('validates %j consistently across Auth flows', (email, expected) => {
    expect(getEmailValidationError(email)).toBe(expected);
  });
});
