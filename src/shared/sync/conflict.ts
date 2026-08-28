import type { OutboxOperationType } from '@/shared/sync/outbox-operation';
import type { SyncDomain } from '@/shared/sync/domain';

export type MutableConflictDomain = Exclude<SyncDomain, 'practiceHistory'>;

/** JSON-safe values are intentional: this record crosses AsyncStorage. */
export type ConflictSnapshot =
  | null
  | boolean
  | number
  | string
  | readonly ConflictSnapshot[]
  | { readonly [key: string]: ConflictSnapshot };

export interface SyncConflictRecord {
  readonly domain: MutableConflictDomain;
  readonly recordId: string;
  readonly operationId: string;
  readonly operationType: OutboxOperationType;
  readonly expectedRevision: number | null;
  readonly serverRevision: number;
  readonly localSnapshot: ConflictSnapshot;
  readonly serverSnapshot: ConflictSnapshot;
  readonly createdAt: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isConflictSnapshot(value: unknown): value is ConflictSnapshot {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isConflictSnapshot);
  return isRecord(value) && Object.values(value).every(isConflictSnapshot);
}

export function isSyncConflictRecord(value: unknown): value is SyncConflictRecord {
  if (!isRecord(value)) return false;
  return (
    value.domain !== 'practiceHistory' &&
    (value.domain === 'profile' || value.domain === 'customTricks' || value.domain === 'goals' || value.domain === 'notes') &&
    typeof value.recordId === 'string' && value.recordId.length > 0 &&
    typeof value.operationId === 'string' && value.operationId.length > 0 &&
    (value.operationType === 'upsert' || value.operationType === 'delete') &&
    (value.expectedRevision === null || (typeof value.expectedRevision === 'number' && Number.isInteger(value.expectedRevision) && value.expectedRevision >= 1)) &&
    typeof value.serverRevision === 'number' && Number.isInteger(value.serverRevision) && value.serverRevision >= 1 &&
    isConflictSnapshot(value.localSnapshot) && isConflictSnapshot(value.serverSnapshot) &&
    typeof value.createdAt === 'number' && Number.isFinite(value.createdAt)
  );
}

export function conflictKey(conflict: Pick<SyncConflictRecord, 'domain' | 'recordId'>): string {
  return `${conflict.domain}:${conflict.recordId}`;
}
