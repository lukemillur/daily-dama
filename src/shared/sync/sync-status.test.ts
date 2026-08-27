import { createInitialCoordinatorState } from '@/shared/sync/coordinator';
import { deriveSyncStatus, formatConflictCount, formatPendingCount, formatSyncTimestamp, type SyncStatusFacts } from '@/shared/sync/sync-status';
import { describe, expect, test } from '@jest/globals';

const idle = createInitialCoordinatorState(1);
const facts = (overrides: Partial<Parameters<typeof deriveSyncStatus>[0]> = {}) => ({
  coordinator: idle.status,
  pendingCount: 0,
  retryableFailureCount: 0,
  conflictCount: 0,
  online: true,
  lastSuccessfulSyncAt: 1000,
  ...overrides,
});

describe('deriveSyncStatus', () => {
  test.each([
    [{ lastSuccessfulSyncAt: undefined }, 'no-sync-yet'],
    [{}, 'synced'],
    [{ coordinator: 'running' }, 'syncing'],
    [{ online: false }, 'offline'],
    [{ pendingCount: 1 }, 'pending'],
    [{ pendingCount: 2 }, 'pending'],
    [{ retryableFailureCount: 1 }, 'retryable-failure'],
    [{ conflictCount: 1 }, 'conflict'],
    [{ online: false, pendingCount: 2 }, 'offline'],
    [{ pendingCount: 2, conflictCount: 1 }, 'conflict'],
  ])('returns %s', (override, expected) => {
    const result = deriveSyncStatus(facts(override as Partial<SyncStatusFacts>));
    expect(result.kind).toBe(expected);
    if (result.pendingCount > 0 || result.conflictCount > 0 || result.retryableFailureCount > 0) {
      expect(result.isSynced).toBe(false);
    }
  });
});

test('formats counts and deterministic timestamps', () => {
  expect(formatPendingCount(1)).toBe('1 pending operation');
  expect(formatPendingCount(2)).toBe('2 pending operations');
  expect(formatConflictCount(1)).toBe('1 conflict needs resolution');
  expect(formatConflictCount(2)).toBe('2 conflicts need resolution');
  expect(formatSyncTimestamp(Date.UTC(2025, 0, 2, 3, 4))).toBe('Jan 2, 2025, 3:04 AM');
});
