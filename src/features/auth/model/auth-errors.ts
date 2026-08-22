/**
 * Closed set of Auth error categories the UI is allowed to branch on. Every route that surfaces
 * an Auth failure must map through categorizeAuthError rather than rendering a raw Supabase
 * error/message, so copy stays actionable and no enumeration-sensitive or otherwise sensitive
 * detail (email, token, raw server message) ever reaches a UI string.
 */
export type AuthErrorCategory =
  | 'invalidCredentials'
  | 'unverifiedEmail'
  | 'accountAlreadyExists'
  | 'weakPassword'
  | 'expiredOrInvalidLink'
  | 'rateLimited'
  | 'offline'
  | 'unknown';

// Supabase's stable AuthApiError.code (see @supabase/auth-js ErrorCode) is preferred over
// parsing error.message, which is not a stable contract across SDK versions. Sign-in against
// both a wrong password and an unknown email already collapse to invalid_credentials /
// user_not_found server-side, and are intentionally kept collapsed into one UI category here
// (that dual mapping IS the enumeration defense for sign-in).
const INVALID_CREDENTIALS_CODES = new Set(['invalid_credentials', 'user_not_found']);
const UNVERIFIED_EMAIL_CODES = new Set(['email_not_confirmed']);
// NOTE for T153.8 (future ticket): accountAlreadyExists is intentionally its own category,
// not folded into invalidCredentials, so a signup call site can detect it and render the
// identical check-your-email UI a successful signup would show. Do not surface a distinct
// account-already-exists message at the call site or this category becomes an enumeration
// oracle.
const ACCOUNT_ALREADY_EXISTS_CODES = new Set(['user_already_exists', 'identity_already_exists']);
const WEAK_PASSWORD_CODES = new Set(['weak_password']);
const EXPIRED_OR_INVALID_LINK_CODES = new Set([
  'otp_expired',
  'flow_state_expired',
  'flow_state_not_found',
  'bad_code_verifier',
  'bad_oauth_callback',
  'bad_oauth_state',
  // T153.6: a password-recovery session that has expired or no longer exists (e.g. the
  // reset-password route revisited after the recovery link's session is gone) collapses
  // into the same "this link is no longer valid" copy as the OAuth/OTP cases above.
  'session_not_found',
  'session_expired',
]);
const RATE_LIMITED_CODES = new Set([
  'over_request_rate_limit',
  'over_email_send_rate_limit',
  'over_sms_send_rate_limit',
]);

function codeOf(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

function looksOffline(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const name = (error as { name?: unknown }).name;
  if (name === 'AuthRetryableFetchError') return true;
  if (error instanceof TypeError) {
    const message = error.message.toLowerCase();
    return message.includes('fetch') || message.includes('network');
  }
  return false;
}

export function categorizeAuthError(error: unknown): AuthErrorCategory {
  if (looksOffline(error)) return 'offline';

  const code = codeOf(error);
  if (code !== undefined) {
    if (INVALID_CREDENTIALS_CODES.has(code)) return 'invalidCredentials';
    if (UNVERIFIED_EMAIL_CODES.has(code)) return 'unverifiedEmail';
    if (ACCOUNT_ALREADY_EXISTS_CODES.has(code)) return 'accountAlreadyExists';
    if (WEAK_PASSWORD_CODES.has(code)) return 'weakPassword';
    if (EXPIRED_OR_INVALID_LINK_CODES.has(code)) return 'expiredOrInvalidLink';
    if (RATE_LIMITED_CODES.has(code)) return 'rateLimited';
  }

  return 'unknown';
}
