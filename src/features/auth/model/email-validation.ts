const EMAIL_SHAPE_PATTERN = /^\S+@\S+\.\S+$/;

/**
 * Shared pre-flight email validation. It deliberately validates shape only;
 * account existence remains a server concern so callers cannot reopen an
 * enumeration surface with flow-specific behavior.
 */
export function getEmailValidationError(email: string): string | undefined {
  const trimmedEmail = email.trim();
  if (trimmedEmail.length === 0) return 'Enter your email.';
  if (!EMAIL_SHAPE_PATTERN.test(trimmedEmail)) return 'Enter a valid email address.';
  return undefined;
}
