// Version-tagged durable record wrapping GuestImportState, mirroring
// src/features/profile/persistence/user-profile-persistence.ts's shape
// (version + runtime validator + serialize/deserialize + load/save). This
// is a plain versioned document, not a SyncEnvelope -- guest import has no
// outbox of its own; the domains it eventually mutates each own their own
// envelope/outbox already.

import {
  INITIAL_GUEST_IMPORT_STATE,
  type GuestImportDomainCounts,
  type GuestImportDomainOutcome,
  type GuestImportState,
  type GuestImportStatus,
  type GuestImportTargetKind,
  type GuestImportProgress,
} from '@/features/guest-import/model/guest-import';
import { isSyncDomain, SYNC_DOMAINS } from '@/shared/sync/domain';
import type {
  KeyValueStorage,
  PersistenceLoadResult,
  PersistenceSaveResult,
} from '@/shared/persistence/storage';

export const GUEST_IMPORT_STORAGE_KEY = 'daily-dama:guest-import';
// Bumped from 1 to 2 -- the awaitingProfileChoice/conflicts states
// and their carried fields no longer exist. A pre-existing v1 record
// mid-flight across this deploy falls back cleanly to
// INITIAL_GUEST_IMPORT_STATE via loadGuestImportState's version-mismatch
// path: worst case, their import
// silently restarts from idle and re-inventories/re-resolves automatically.
export const GUEST_IMPORT_SCHEMA_VERSION = 2;

interface GuestImportDocumentV1 {
  readonly version: typeof GUEST_IMPORT_SCHEMA_VERSION;
  readonly state: GuestImportState;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const STATUSES: readonly GuestImportStatus[] = [
  'idle',
  'inventorying',
  'awaitingConfirmation',
  'uploading',
  'completed',
  'cancelled',
];

function isGuestImportStatus(value: unknown): value is GuestImportStatus {
  return typeof value === 'string' && (STATUSES as readonly string[]).includes(value);
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function isOptionalNumber(value: unknown): value is number | undefined {
  return value === undefined || (typeof value === 'number' && Number.isFinite(value));
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isGuestImportDomainCounts(value: unknown): value is GuestImportDomainCounts {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  return SYNC_DOMAINS.every((domain) => {
    const entry = value[domain];
    return isRecord(entry) && isNonNegativeInteger(entry.local) && isNonNegativeInteger(entry.cloud);
  });
}

function isGuestImportTargetKind(value: unknown): value is GuestImportTargetKind | undefined {
  return value === undefined || value === 'empty' || value === 'existing';
}

const DOMAIN_OUTCOME_STATUSES = ['pending', 'succeeded', 'failed', 'conflict'];

function isGuestImportDomainOutcome(value: unknown): value is GuestImportDomainOutcome {
  if (!isRecord(value)) return false;
  return DOMAIN_OUTCOME_STATUSES.includes(value.status as string) && isOptionalString(value.errorMessage);
}

function isDomainOutcomes(
  value: unknown,
): value is Readonly<Partial<Record<(typeof SYNC_DOMAINS)[number], GuestImportDomainOutcome>>> {
  if (!isRecord(value)) return false;
  return Object.entries(value).every(
    ([domain, outcome]) => isSyncDomain(domain) && isGuestImportDomainOutcome(outcome),
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value === value.trim();
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}

function isRecordReference(value: unknown): boolean {
  return isRecord(value) && isSyncDomain(value.domain) && isNonEmptyString(value.recordId);
}

function isGuestImportProgress(value: unknown): value is GuestImportProgress | undefined {
  if (value === undefined) return true;
  if (!isRecord(value) || value.sourceIdentityNamespace !== 'guest' || typeof value.destinationIdentityNamespace !== 'string') {
    return false;
  }
  if (!Array.isArray(value.operations)) return false;
  const seen = new Set<string>();
  return value.operations.every((operation) => {
    if (!isRecord(operation)) return false;
    if (typeof operation.operationId !== 'string' || operation.operationId.length === 0 || seen.has(operation.operationId) || !isSyncDomain(operation.domain)) return false;
    seen.add(operation.operationId);
    if (operation.operationType !== 'upsert' && operation.operationType !== 'delete') return false;
    if (typeof operation.recordId !== 'string' || typeof operation.createdAt !== 'number' ||
      typeof operation.attemptCount !== 'number' || !Number.isInteger(operation.attemptCount) || operation.attemptCount < 0 ||
      (operation.lastAttemptedAt !== null && (typeof operation.lastAttemptedAt !== 'number' || !Number.isFinite(operation.lastAttemptedAt))) ||
      (operation.lastErrorMessage !== null && typeof operation.lastErrorMessage !== 'string') ||
      (operation.expectedRevision !== null && !isPositiveInteger(operation.expectedRevision)) ||
      (operation.lastFailureKind !== null && operation.lastFailureKind !== 'retryable' && operation.lastFailureKind !== 'conflict')) return false;
    if (operation.operationType === 'delete' && operation.payload !== null) return false;
    if (operation.operationType === 'upsert' && !isRecord(operation.payload)) return false;
    const cleanup = operation.sourceCleanupStatus;
    return (operation.status === 'pending' || operation.status === 'acknowledged' || operation.status === 'rejected') &&
      (cleanup === undefined || cleanup === 'pending' || cleanup === 'completed' || cleanup === 'retained') &&
      (operation.acknowledgedAt === undefined || operation.acknowledgedAt === null || typeof operation.acknowledgedAt === 'number') &&
      (operation.sourceCleanupCompletedAt === undefined || operation.sourceCleanupCompletedAt === null || typeof operation.sourceCleanupCompletedAt === 'number');
  });
}

export function isGuestImportState(value: unknown): value is GuestImportState {
  if (!isRecord(value)) return false;

  const {
    status,
    importId,
    ownerIdentityNamespace,
    inventory,
    targetKind,
    domainOutcomes,
    errorMessage,
    startedAt,
    updatedAt,
    progress,
    deduplications,
  } = value;

  if (!isGuestImportStatus(status)) return false;
  if (!isOptionalString(importId)) return false;
  if (!isOptionalString(ownerIdentityNamespace)) return false;
  if (!isGuestImportDomainCounts(inventory)) return false;
  if (!isGuestImportTargetKind(targetKind)) return false;
  if (!isDomainOutcomes(domainOutcomes)) return false;
  if (!Array.isArray(deduplications) || !deduplications.every(isRecordReference)) return false;
  if (!isOptionalString(errorMessage)) return false;
  if (!isOptionalNumber(startedAt)) return false;
  if (!isOptionalNumber(updatedAt)) return false;
  if (!isGuestImportProgress(progress)) return false;

  return true;
}

export function serializeGuestImportState(state: GuestImportState): string {
  const document: GuestImportDocumentV1 = { version: GUEST_IMPORT_SCHEMA_VERSION, state };
  return JSON.stringify(document);
}

export function deserializeGuestImportState(serialized: string): GuestImportState | undefined {
  let document: unknown;
  try {
    document = JSON.parse(serialized);
  } catch {
    return undefined;
  }

  if (!isRecord(document) || document.version !== GUEST_IMPORT_SCHEMA_VERSION) {
    return undefined;
  }

  return isGuestImportState(document.state) ? document.state : undefined;
}

export async function loadGuestImportState(
  storage: KeyValueStorage,
): Promise<PersistenceLoadResult<GuestImportState>> {
  try {
    const serialized = await storage.getItem(GUEST_IMPORT_STORAGE_KEY);
    if (serialized === null) return { status: 'empty', value: INITIAL_GUEST_IMPORT_STATE };

    const state = deserializeGuestImportState(serialized);
    if (state) return { status: 'loaded', value: state };

    return {
      status: 'recovered',
      value: INITIAL_GUEST_IMPORT_STATE,
      error: new Error('The persisted guest-import record is malformed or uses an unsupported version.'),
    };
  } catch (error) {
    return { status: 'recovered', value: INITIAL_GUEST_IMPORT_STATE, error };
  }
}

export async function saveGuestImportState(
  storage: KeyValueStorage,
  state: GuestImportState,
): Promise<PersistenceSaveResult> {
  try {
    await storage.setItem(GUEST_IMPORT_STORAGE_KEY, serializeGuestImportState(state));
    return { status: 'saved' };
  } catch (error) {
    return { status: 'failed', error };
  }
}
