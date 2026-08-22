/**
 * Pure, dependency-free redaction for anything that might reach an application-owned console
 * call or an Analytics event. Every future Auth route must route sensitive values through this
 * module (via the auth-observability module) rather than logging or tracking raw Supabase
 * errors, callback URLs, or entered credentials directly.
 */

const MAX_DEPTH = 6;

const SENSITIVE_KEY_NAMES = new Set([
  'email',
  'password',
  'access_token',
  'refresh_token',
  'provider_token',
  'provider_refresh_token',
  'token',
  'token_hash',
  'code',
  'code_verifier',
  'apikey',
  'authorization',
]);

const EMAIL_PATTERN = /[\w.+-]+@[\w.-]+\.[\w-]+/g;
const JWT_PATTERN = /[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;
const LONG_TOKEN_PATTERN = /(?<![\w-])[A-Za-z0-9_-]{20,}(?![\w-])/g;

const redactString = (value: string): string =>
  value
    .replace(EMAIL_PATTERN, '[redacted-email]')
    .replace(JWT_PATTERN, '[redacted-jwt]')
    .replace(LONG_TOKEN_PATTERN, '[redacted-token]');

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function redactValue(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return '[redacted-nested]';

  if (typeof value === 'string') return redactString(value);

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, depth + 1));
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
      ...('code' in value ? { code: (value as { code: unknown }).code } : {}),
    };
  }

  if (isPlainObject(value)) {
    const result: Record<string, unknown> = {};
    for (const [key, entryValue] of Object.entries(value)) {
      if (SENSITIVE_KEY_NAMES.has(key.toLowerCase())) {
        result[key] = '[redacted]';
      } else {
        result[key] = redactValue(entryValue, depth + 1);
      }
    }
    return result;
  }

  return value;
}

function redactSearchParams(params: URLSearchParams): URLSearchParams {
  const redacted = new URLSearchParams(params);
  for (const key of Array.from(redacted.keys())) {
    if (SENSITIVE_KEY_NAMES.has(key.toLowerCase())) {
      redacted.set(key, '[redacted]');
    }
  }
  return redacted;
}

/**
 * Sanitizes a URL's query string and fragment (Supabase's implicit/error/PKCE flows place
 * `code`, `error`, `access_token`, `refresh_token`, etc. in either location) before it is safe to
 * log or send to Analytics. Falls back to a fixed placeholder for unparseable input rather than
 * passing raw, potentially sensitive text through.
 */
export function redactUrl(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return '[unparseable-url]';
  }

  const sanitizedSearchParams = redactSearchParams(url.searchParams);
  const hashBody = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
  const sanitizedHashParams = redactSearchParams(new URLSearchParams(hashBody));

  const search = sanitizedSearchParams.toString();
  const hash = sanitizedHashParams.toString();

  const reconstructed =
    url.origin + url.pathname + (search ? `?${search}` : '') + (hash ? `#${hash}` : '');

  // Defense-in-depth: a free-text param (e.g. error_description) can embed an email or token
  // inside a sentence rather than as its own param value, so run the regex pipeline over the
  // reconstructed string too.
  return redactString(reconstructed);
}
