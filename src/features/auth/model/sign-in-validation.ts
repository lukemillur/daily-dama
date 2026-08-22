/**
 * Client-side pre-flight validation for the sign-in form. Pure and synchronous -- no IO.
 *
 * This only catches obviously-empty/malformed input before a network round trip. It must never
 * infer or expose any account-specific fact (e.g. "that email doesn't exist", "your password is
 * too short for this account") -- that would reopen the enumeration surface categorizeAuthError's
 * invalidCredentials collapse is closing. Real credential validity is entirely Supabase's job.
 */
const EMAIL_SHAPE_PATTERN = /^\S+@\S+\.\S+$/;

export interface SignInFieldErrors {
  readonly email?: string;
  readonly password?: string;
}

export type SignInValidation =
  | { readonly status: 'valid' }
  | { readonly status: 'invalid'; readonly errors: SignInFieldErrors };

export function validateSignInFields(email: string, password: string): SignInValidation {
  const errors: { email?: string; password?: string } = {};

  const trimmedEmail = email.trim();
  if (trimmedEmail.length === 0) {
    errors.email = 'Enter your email.';
  } else if (!EMAIL_SHAPE_PATTERN.test(trimmedEmail)) {
    errors.email = 'Enter a valid email address.';
  }

  if (password.length === 0) {
    errors.password = 'Enter your password.';
  }

  return Object.keys(errors).length > 0 ? { status: 'invalid', errors } : { status: 'valid' };
}
