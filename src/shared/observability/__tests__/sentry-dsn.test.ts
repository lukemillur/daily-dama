import { describe, expect, it } from '@jest/globals';
import { resolveSentryDsn } from '@/shared/observability/sentry-dsn';

describe('resolveSentryDsn', () => {
  it('returns missing for an undefined DSN', () => {
    expect(resolveSentryDsn(undefined)).toEqual({ status: 'missing' });
  });

  it('returns missing for an empty/whitespace-only DSN', () => {
    expect(resolveSentryDsn('   ')).toEqual({ status: 'missing' });
  });

  it('returns malformed for a DSN that is not a valid URL', () => {
    const result = resolveSentryDsn('not-a-url');
    expect(result.status).toBe('malformed');
  });

  it('returns ready with the trimmed DSN for a valid URL', () => {
    expect(resolveSentryDsn('  https://examplePublicKey@o0.ingest.sentry.io/0  ')).toEqual({
      status: 'ready',
      dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
    });
  });
});
