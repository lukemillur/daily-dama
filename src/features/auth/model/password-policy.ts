/**
 * Shared password policy for any Auth flow that accepts a new password (password reset and
 * signup both delegate here). Pure and synchronous -- no IO.
 */
export const MIN_PASSWORD_LENGTH = 8;

interface PasswordRule {
  readonly test: (password: string) => boolean;
  readonly description: string;
}

const PASSWORD_RULES: readonly PasswordRule[] = [
  { test: (password) => password.length >= MIN_PASSWORD_LENGTH, description: `at least ${MIN_PASSWORD_LENGTH} characters` },
  { test: (password) => /[A-Z]/.test(password), description: 'an uppercase letter' },
  { test: (password) => /[0-9]/.test(password), description: 'a number' },
  { test: (password) => /[^A-Za-z0-9]/.test(password), description: 'a symbol' },
];

// Shown as the signup password field's hint, ahead of any error -- states all four rules so a
// user can satisfy them before submitting.
export const PASSWORD_REQUIREMENTS_HINT =
  'Use at least 8 characters, with an uppercase letter, a number, and a symbol.';

function joinWithAnd(items: readonly string[]): string {
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

// Names exactly which rule(s) a password fails so the error can identify what's missing, rather
// than a generic "invalid password" message.
function describeMissingRules(password: string): string | undefined {
  const missing = PASSWORD_RULES.filter((rule) => !rule.test(password)).map((rule) => rule.description);
  if (missing.length === 0) return undefined;
  return `Password needs ${joinWithAnd(missing)}.`;
}

export interface ResetPasswordFieldErrors {
  readonly password?: string;
  readonly confirmPassword?: string;
}

export type ResetPasswordValidation =
  | { readonly status: 'valid' }
  | { readonly status: 'invalid'; readonly errors: ResetPasswordFieldErrors };

export function validateNewPassword(password: string, confirmPassword: string): ResetPasswordValidation {
  const errors: { password?: string; confirmPassword?: string } = {};

  const passwordError = describeMissingRules(password);
  if (passwordError) {
    errors.password = passwordError;
  }

  if (password !== confirmPassword) {
    errors.confirmPassword = 'Passwords do not match.';
  }

  return Object.keys(errors).length > 0 ? { status: 'invalid', errors } : { status: 'valid' };
}
