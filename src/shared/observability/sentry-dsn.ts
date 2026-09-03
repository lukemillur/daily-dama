export type SentryDsnConfig =
  { readonly status: 'ready'; readonly dsn: string }
  | { readonly status: 'missing' }
  | { readonly status: 'malformed'; readonly reason: string };

/**
 * Validates the Sentry DSN env var without reading process.env itself, so this stays
 * trivially unit-testable. Mirrors resolveSupabaseConfig's missing/malformed split.
 */
export function resolveSentryDsn(dsn: string | undefined): SentryDsnConfig {
  const trimmedDsn = dsn?.trim();

  if (!trimmedDsn) {
    return { status: 'missing' };
  }

  try {
    new URL(trimmedDsn);
  } catch {
    return { status: 'malformed', reason: 'EXPO_PUBLIC_SENTRY_DSN is not a valid URL.' };
  }

  return { status: 'ready', dsn: trimmedDsn };
}
