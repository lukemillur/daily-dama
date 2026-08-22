/** Shared fixtures reused across redact.test.ts and auth-observability.test.ts. */

export const EMAIL = 'user@example.com';
export const PASSWORD = 'p4ssw0rd!';
export const JWT_LIKE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PYRR2FyMorQI';
export const REFRESH_TOKEN = 'vJv8bZ0kL3nQ7wR2xY9dC1mF4hT6sA8u';
export const PKCE_CODE = 'pkce_ZxK9mQ3vR7hL2wN8tY5jF6dC1sA4bE0uG';
export const PKCE_CODE_VERIFIER = 'V8sA4bE0uGpkce_ZxK9mQ3vR7hL2wN8tY5jF6dC1';

export const authApiErrorFixtures = [
  { code: 'invalid_credentials', status: 400, message: 'Invalid login credentials' },
  { code: 'email_not_confirmed', status: 400, message: 'Email not confirmed' },
  { code: 'user_already_exists', status: 422, message: 'User already registered' },
  { code: 'weak_password', status: 422, message: 'Password is too weak' },
  { code: 'over_request_rate_limit', status: 429, message: 'Rate limit exceeded' },
  { code: 'otp_expired', status: 403, message: 'Token has expired or is invalid' },
  { code: 'session_not_found', status: 403, message: 'Session not found' },
  { code: 'session_expired', status: 403, message: 'Session expired' },
  { code: 'bad_code_verifier', status: 403, message: 'code challenge does not match previously saved code verifier' },
  { code: 'flow_state_not_found', status: 403, message: 'PKCE flow state not found' },
];

export function networkFailure(): TypeError {
  return new TypeError('Failed to fetch');
}

export function nestedIdentifierPayload(): Record<string, unknown> {
  return {
    context: 'sign-in',
    session: {
      user: { email: EMAIL, id: 'user-123' },
      access_token: JWT_LIKE,
      refresh_token: REFRESH_TOKEN,
    },
  };
}

export function callbackUrl(): string {
  return (
    `https://dailydama.com/auth/callback?code=${PKCE_CODE}&error=access_denied` +
    `#access_token=${JWT_LIKE}&refresh_token=${REFRESH_TOKEN}` +
    `&error_description=Email+link+is+invalid+or+has+expired+for+${encodeURIComponent(EMAIL)}`
  );
}
