export type AccountDeletionErrorCategory =
  | 'invalidCredentials'
  | 'offline'
  | 'rateLimited'
  | 'expiredSession'
  | 'unknown';

function propertyOf(error: unknown, property: string): unknown {
  if (typeof error !== 'object' || error === null) return undefined;
  return (error as Record<string, unknown>)[property];
}

export function categorizeAccountDeletionError(error: unknown): AccountDeletionErrorCategory {
  const name = propertyOf(error, 'name');
  if (name === 'FunctionsFetchError' || error instanceof TypeError) return 'offline';

  const status = propertyOf(error, 'status');
  if (status === 429) return 'rateLimited';
  if (status === 401) return 'invalidCredentials';

  const code = propertyOf(error, 'code');
  if (code === 'session_not_found' || code === 'session_expired') return 'expiredSession';

  return 'unknown';
}
