import type { SyncCoordinatorState } from '@/shared/sync/coordinator';

export interface SyncStatusFacts {
  readonly coordinator: SyncCoordinatorState['status'];
  readonly pendingCount: number;
  readonly retryableFailureCount: number;
  readonly conflictCount: number;
  readonly online: boolean;
  readonly lastSuccessfulSyncAt: number | undefined;
}

export type SyncStatusKind = 'no-sync-yet' | 'syncing' | 'offline' | 'conflict' | 'retryable-failure' | 'pending' | 'synced';

export interface SyncStatus extends SyncStatusFacts {
  readonly kind: SyncStatusKind;
  readonly isSynced: boolean;
}

/** Central precedence: the flags remain available for combined copy, while kind is the primary label. */
export function deriveSyncStatus(facts: SyncStatusFacts): SyncStatus {
  const pendingCount = Math.max(0, facts.pendingCount);
  const retryableFailureCount = Math.max(0, facts.retryableFailureCount);
  const conflictCount = Math.max(0, facts.conflictCount);
  const normalized = { ...facts, pendingCount, retryableFailureCount, conflictCount };
  let kind: SyncStatusKind;
  if (facts.coordinator === 'running') kind = 'syncing';
  else if (!facts.online) kind = 'offline';
  else if (conflictCount > 0) kind = 'conflict';
  else if (retryableFailureCount > 0) kind = 'retryable-failure';
  else if (pendingCount > 0) kind = 'pending';
  else if (facts.lastSuccessfulSyncAt === undefined) kind = 'no-sync-yet';
  else kind = 'synced';

  return { ...normalized, kind, isSynced: kind === 'synced' };
}

export function formatPendingCount(count: number): string {
  return `${count} pending ${count === 1 ? 'operation' : 'operations'}`;
}

export function formatConflictCount(count: number): string {
  return `${count} conflict${count === 1 ? '' : 's'}${count === 1 ? ' needs' : ' need'} resolution`;
}

export function formatSyncTimestamp(timestamp: number, options: Intl.DateTimeFormatOptions = {}): string {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC', ...options }).format(timestamp);
}
