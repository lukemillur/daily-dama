// The custom-tricks domain's sync bookkeeping envelope -- a second,
// parallel identity-scoped domain instance alongside the primary
// `customTrickReducer` (src/features/custom-tricks/model/custom-trick.ts),
// not a replacement for it. Mirrors `profile-sync-envelope.ts` structurally.
// The primary
// reducer stays the sole source of truth for the live `CustomTrickCollection`
// shown in the UI; this file only tracks "what has this device told the
// server, and what does it still owe the server."
//
// Simpler than the profile envelope in one way: `api.custom_tricks` is a
// single row type (no scalar/child-table split), so there is no
// `profileRevision`-equivalent scalar field here -- only a per-trick
// revision map.

import { isCustomTrickCollection } from '@/features/custom-tricks/persistence/custom-trick-persistence';
import type { CustomTrickCollection } from '@/features/custom-tricks/model/custom-trick';
import type { Identity } from '@/shared/persistence/identity';
import type {
  KeyValueStorage,
  PersistenceLoadResult,
  PersistenceSaveResult,
} from '@/shared/persistence/storage';
import {
  loadSyncEnvelope,
  saveSyncEnvelope,
  syncEnvelopeReducer,
  type SyncEnvelope,
  type SyncEnvelopeAction,
  type SyncEnvelopeCodec,
} from '@/shared/sync/sync-envelope';

export interface CustomTrickSyncSnapshot {
  // Mirror of the primary reducer's state at the moment of the last envelope
  // mutation -- kept here (rather than re-derived) so the envelope is a
  // fully self-contained, independently reloadable document.
  readonly collection: CustomTrickCollection;
  readonly trickRevisions: Readonly<Record<string, number>>;
}

export function createInitialCustomTrickSyncSnapshot(collection: CustomTrickCollection): CustomTrickSyncSnapshot {
  return { collection, trickRevisions: {} };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRevisionNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}

function isTrickRevisions(value: unknown): value is Readonly<Record<string, number>> {
  if (!isRecord(value)) return false;
  return Object.values(value).every(isRevisionNumber);
}

export function isCustomTrickSyncSnapshot(value: unknown): value is CustomTrickSyncSnapshot {
  if (!isRecord(value)) return false;

  const { collection, trickRevisions } = value;
  if (!isCustomTrickCollection(collection)) return false;
  if (!isTrickRevisions(trickRevisions)) return false;

  return true;
}

export const customTrickSyncSnapshotCodec: SyncEnvelopeCodec<CustomTrickSyncSnapshot> = {
  isState: isCustomTrickSyncSnapshot,
};

export const CUSTOM_TRICK_SYNC_ENVELOPE_STORAGE_KEY = 'daily-dama:custom-trick-sync-envelope';

export async function loadCustomTrickSyncEnvelope(
  storage: KeyValueStorage,
  identity: Identity,
  initialSnapshot: CustomTrickSyncSnapshot,
): Promise<PersistenceLoadResult<SyncEnvelope<CustomTrickSyncSnapshot>>> {
  return loadSyncEnvelope(
    storage,
    CUSTOM_TRICK_SYNC_ENVELOPE_STORAGE_KEY,
    'customTricks',
    customTrickSyncSnapshotCodec,
    identity,
    initialSnapshot,
  );
}

export async function saveCustomTrickSyncEnvelope(
  storage: KeyValueStorage,
  envelope: SyncEnvelope<CustomTrickSyncSnapshot>,
): Promise<PersistenceSaveResult> {
  return saveSyncEnvelope(storage, CUSTOM_TRICK_SYNC_ENVELOPE_STORAGE_KEY, envelope);
}

export type CustomTrickSyncEnvelopeAction = SyncEnvelopeAction<CustomTrickSyncSnapshot>;

export function customTrickSyncEnvelopeReducer(
  state: SyncEnvelope<CustomTrickSyncSnapshot>,
  action: CustomTrickSyncEnvelopeAction,
): SyncEnvelope<CustomTrickSyncSnapshot> {
  return syncEnvelopeReducer(state, action);
}
