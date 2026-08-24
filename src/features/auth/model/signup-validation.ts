/**
 * Client-side pre-flight validation for the sign-up form. Pure and synchronous -- no IO.
 *
 * This only catches obviously-empty/malformed input before a network round trip. It must never
 * infer or expose any account-specific fact (e.g. "that email is already registered") -- that
 * would reopen the enumeration surface signUp's identical-outcome handling is closing. Real
 * account existence is entirely Supabase's job, and the call site deliberately treats a
 * duplicate-account error the same as a fresh signup.
 *
 * Password/confirm rules delegate to validateNewPassword (password-policy.ts) rather than
 * duplicating the length constant or match check here.
 */
import { validateNewPassword } from '@/features/auth/model/password-policy';

const EMAIL_SHAPE_PATTERN = /^\S+@\S+\.\S+$/;

export interface SignUpFieldErrors {
  readonly email?: string;
  readonly password?: string;
  readonly confirmPassword?: string;
}

export type SignUpValidation =
  | { readonly status: 'valid' }
  | { readonly status: 'invalid'; readonly errors: SignUpFieldErrors };

export function validateSignUpFields(
  email: string,
  password: string,
  confirmPassword: string,
): SignUpValidation {
  const errors: { email?: string; password?: string; confirmPassword?: string } = {};

  const trimmedEmail = email.trim();
  if (trimmedEmail.length === 0) {
    errors.email = 'Enter your email.';
  } else if (!EMAIL_SHAPE_PATTERN.test(trimmedEmail)) {
    errors.email = 'Enter a valid email address.';
  }

  const passwordValidation = validateNewPassword(password, confirmPassword);
  if (passwordValidation.status === 'invalid') {
    if (passwordValidation.errors.password) {
      errors.password = passwordValidation.errors.password;
    }
    if (passwordValidation.errors.confirmPassword) {
      errors.confirmPassword = passwordValidation.errors.confirmPassword;
    }
  }

  return Object.keys(errors).length > 0 ? { status: 'invalid', errors } : { status: 'valid' };
}
