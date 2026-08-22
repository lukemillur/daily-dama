import { describe, expect, it } from '@jest/globals';

import { redactUrl, redactValue } from '@/features/auth/model/redact';

import {
  callbackUrl,
  EMAIL,
  JWT_LIKE,
  nestedIdentifierPayload,
  PASSWORD,
  PKCE_CODE,
  PKCE_CODE_VERIFIER,
  REFRESH_TOKEN,
} from '../auth-test-fixtures';

describe('redactValue', () => {
  it('redacts an email found in a plain string', () => {
    const result = redactValue(`contact ${EMAIL} for help`);
    expect(result).not.toContain(EMAIL);
    expect(result).toContain('contact');
    expect(result).toContain('[redacted-email]');
  });

  it('redacts a JWT-shaped string', () => {
    const result = redactValue(`token=${JWT_LIKE}`);
    expect(result).not.toContain(JWT_LIKE);
    expect(result).toContain('token=');
    expect(result).toContain('[redacted-jwt]');
  });

  it('redacts a long opaque refresh-token-shaped string', () => {
    const result = redactValue(`refresh=${REFRESH_TOKEN}`);
    expect(result).not.toContain(REFRESH_TOKEN);
    expect(result).toContain('refresh=');
    expect(result).toContain('[redacted-token]');
  });

  it('redacts a PKCE code and code_verifier pair by content', () => {
    const result = redactValue(`code=${PKCE_CODE} verifier=${PKCE_CODE_VERIFIER}`);
    expect(result).not.toContain(PKCE_CODE);
    expect(result).not.toContain(PKCE_CODE_VERIFIER);
    expect(result).toContain('code=');
    expect(result).toContain('verifier=');
  });

  it('redacts a short password by key name even though it fails every content regex', () => {
    const result = redactValue({ email: EMAIL, password: PASSWORD, context: 'sign-in' }) as Record<
      string,
      unknown
    >;
    expect(JSON.stringify(result)).not.toContain(PASSWORD);
    expect(JSON.stringify(result)).not.toContain(EMAIL);
    expect(result.context).toBe('sign-in');
  });

  it('redacts sensitive values nested two to three levels deep', () => {
    const result = redactValue(nestedIdentifierPayload()) as Record<string, unknown>;
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(EMAIL);
    expect(serialized).not.toContain(JWT_LIKE);
    expect(serialized).not.toContain(REFRESH_TOKEN);
    expect(result.context).toBe('sign-in');
    const session = (result as { session: Record<string, unknown> }).session;
    const user = session.user as Record<string, unknown>;
    expect(user.id).toBe('user-123');
  });

  it('collapses values deeper than the bounded depth instead of recursing unbounded', () => {
    let deep: unknown = 'bottom';
    for (let i = 0; i < 20; i += 1) {
      deep = { nested: deep };
    }
    const result = redactValue(deep);
    expect(JSON.stringify(result)).toContain('[redacted-nested]');
  });
});

describe('redactUrl', () => {
  it('redacts sensitive query and fragment params from a callback URL', () => {
    const result = redactUrl(callbackUrl());
    expect(result).not.toContain(PKCE_CODE);
    expect(result).not.toContain(JWT_LIKE);
    expect(result).not.toContain(REFRESH_TOKEN);
    expect(result).not.toContain(EMAIL);
    expect(result).toContain('https://dailydama.com/auth/callback');
    expect(result).toContain('code=%5Bredacted%5D');
    expect(result).toContain('access_token=%5Bredacted%5D');
    expect(result).toContain('refresh_token=%5Bredacted%5D');
  });

  it('redacts an email embedded inside a free-text param via the regex fallback', () => {
    const url = `https://dailydama.com/auth/callback?error_description=account+for+${encodeURIComponent(
      EMAIL,
    )}+already+exists`;
    const result = redactUrl(url);
    expect(result).not.toContain(EMAIL);
    expect(result).toContain('already');
  });

  it('returns a fixed placeholder for an unparseable URL rather than the raw input', () => {
    const result = redactUrl('not a url');
    expect(result).toBe('[unparseable-url]');
  });
});
