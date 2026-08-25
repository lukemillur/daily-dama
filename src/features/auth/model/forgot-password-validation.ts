/**
 * Client-side pre-flight validation for the forgot-password form. Pure and synchronous -- no IO.
 *
 * This only catches obviously-empty/malformed input before a network round trip. It must never
 * infer or expose any account-specific fact (e.g. "no account uses that email") -- that would
 * reopen the enumeration surface resetPasswordForEmail's uniform success response is closing.
 * Real account existence is entirely Supabase's job, and it deliberately never reports it back.
 */
import { getEmailValidationError } from '@/features/auth/model/email-validation';

export interface ForgotPasswordFieldErrors {
  readonly email?: string;
}

export type ForgotPasswordValidation =
  | { readonly status: 'valid' }
  | { readonly status: 'invalid'; readonly errors: ForgotPasswordFieldErrors };

export function validateForgotPasswordEmail(email: string): ForgotPasswordValidation {
  const errors: { email?: string } = {};

  const emailError = getEmailValidationError(email);
  if (emailError) errors.email = emailError;

  return Object.keys(errors).length > 0 ? { status: 'invalid', errors } : { status: 'valid' };
}
