import { describe, expect, it } from '@jest/globals';

import { categorizeAccountDeletionError } from '@/features/auth/model/account-deletion-errors';

describe('categorizeAccountDeletionError', () => {
  it.each([
    [{ status: 401 }, 'invalidCredentials'],
    [{ status: 429 }, 'rateLimited'],
    [{ name: 'FunctionsFetchError' }, 'offline'],
    [new TypeError('Failed to fetch'), 'offline'],
    [{ code: 'session_expired' }, 'expiredSession'],
    [{ status: 500, message: 'raw server detail' }, 'unknown'],
  ])('maps %p to %s without exposing error details', (error, category) => {
    expect(categorizeAccountDeletionError(error)).toBe(category);
  });
});
