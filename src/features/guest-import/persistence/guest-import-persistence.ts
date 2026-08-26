// T159.1: version-tagged durable record wrapping GuestImportState, mirroring
// src/features/profile/persistence/user-profile-persistence.ts's shape
// (version + runtime validator + serialize/deserialize + load/save). This
// is a plain versioned document, not a SyncEnvelope -- guest import has no
// outbox of its own; the domains it eventually mutates each own their own
// envelope/outbox already (T157.4-T157.8).

import {
  INITIAL_GUEST_IMPORT_STATE,
  type GuestImportConflict,
  type GuestImportDomainCounts,
  type GuestImportDomainOutcome,
  type GuestImportState,
  type GuestImportStatus,
  type GuestImportTargetKind,
} from '@/features/guest-import/model/guest-import';
import { isSyncDomain, SYNC_DOMAINS } from '@/shared/sync/domain';
import type {
  KeyValueStorage,
  PersistenceLoadResult,
  PersistenceSaveResult,
} from '@/shared/persistence/storage';

export const GUEST_IMPORT_STORAGE_KEY = 'daily-dama:guest-import';
export const GUEST_IMPORT_SCHEMA_VERSION = 1;

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
  'awaitingProfileChoice',
  'conflicts',
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
  return value === undefined || typeof value === 'number';
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

function isGuestImportConflict(value: unknown): value is GuestImportConflict {
  return isRecord(value) && isSyncDomain(value.domain) && typeof value.recordId === 'string';
}

function isConflictsArray(value: unknown): value is readonly GuestImportConflict[] {
  return Array.isArray(value) && value.every(isGuestImportConflict);
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
    profileChoice,
    conflicts,
    errorMessage,
    startedAt,
    updatedAt,
  } = value;

  if (!isGuestImportStatus(status)) return false;
  if (!isOptionalString(importId)) return false;
  if (!isOptionalString(ownerIdentityNamespace)) return false;
  if (!isGuestImportDomainCounts(inventory)) return false;
  if (!isGuestImportTargetKind(targetKind)) return false;
  if (!isDomainOutcomes(domainOutcomes)) return false;
  if (profileChoice !== undefined && profileChoice !== 'guest' && profileChoice !== 'cloud') return false;
  if (!isConflictsArray(conflicts)) return false;
  if (!isOptionalString(errorMessage)) return false;
  if (!isOptionalNumber(startedAt)) return false;
  if (!isOptionalNumber(updatedAt)) return false;

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
