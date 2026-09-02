/**
 * Shared password policy for any Auth flow that accepts a new password (password
 * reset today, signup later in T153.8). Pure and synchronous -- no IO.
 */
export const MIN_PASSWORD_LENGTH = 10; // BACKEND_ROADMAP.md: ten-character minimum

export interface ResetPasswordFieldErrors {
  readonly password?: string;
  readonly confirmPassword?: string;
}

export type ResetPasswordValidation =
  | { readonly status: 'valid' }
  | { readonly status: 'invalid'; readonly errors: ResetPasswordFieldErrors };

export function validateNewPassword(password: string, confirmPassword: string): ResetPasswordValidation {
  const errors: { password?: string; confirmPassword?: string } = {};

  if (password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }

  if (password !== confirmPassword) {
    errors.confirmPassword = 'Passwords do not match.';
  }

  return Object.keys(errors).length > 0 ? { status: 'invalid', errors } : { status: 'valid' };
}
