// The notes domain's sync bookkeeping envelope -- a second,
// parallel identity-scoped domain instance alongside the primary
// `noteReducer` (src/features/notes/model/note.ts), not a replacement for
// it. Mirrors `goal-sync-envelope.ts` structurally. The primary reducer stays
// the sole source of truth for the live `NoteCollection` shown in the UI;
// this file only tracks "what has this device told the server, and what
// does it still owe the server."
//
// Structurally the same shape as the goals envelope: `api.notes` is a
// single row type (no scalar/child-table split), so there is no
// `profileRevision`-equivalent scalar field here -- only a per-note
// revision map.

import { isNoteCollection } from '@/features/notes/persistence/note-persistence';
import type { NoteCollection } from '@/features/notes/model/note';
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

export interface NoteSyncSnapshot {
  // Mirror of the primary reducer's state at the moment of the last envelope
  // mutation -- kept here (rather than re-derived) so the envelope is a
  // fully self-contained, independently reloadable document.
  readonly collection: NoteCollection;
  readonly noteRevisions: Readonly<Record<string, number>>;
}

export function createInitialNoteSyncSnapshot(collection: NoteCollection): NoteSyncSnapshot {
  return { collection, noteRevisions: {} };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRevisionNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}

function isNoteRevisions(value: unknown): value is Readonly<Record<string, number>> {
  if (!isRecord(value)) return false;
  return Object.values(value).every(isRevisionNumber);
}

export function isNoteSyncSnapshot(value: unknown): value is NoteSyncSnapshot {
  if (!isRecord(value)) return false;

  const { collection, noteRevisions } = value;
  if (!isNoteCollection(collection)) return false;
  if (!isNoteRevisions(noteRevisions)) return false;

  return true;
}

export const noteSyncSnapshotCodec: SyncEnvelopeCodec<NoteSyncSnapshot> = {
  isState: isNoteSyncSnapshot,
};

export const NOTE_SYNC_ENVELOPE_STORAGE_KEY = 'daily-dama:note-sync-envelope';

export async function loadNoteSyncEnvelope(
  storage: KeyValueStorage,
  identity: Identity,
  initialSnapshot: NoteSyncSnapshot,
): Promise<PersistenceLoadResult<SyncEnvelope<NoteSyncSnapshot>>> {
  return loadSyncEnvelope(storage, NOTE_SYNC_ENVELOPE_STORAGE_KEY, 'notes', noteSyncSnapshotCodec, identity, initialSnapshot);
}

export async function saveNoteSyncEnvelope(
  storage: KeyValueStorage,
  envelope: SyncEnvelope<NoteSyncSnapshot>,
): Promise<PersistenceSaveResult> {
  return saveSyncEnvelope(storage, NOTE_SYNC_ENVELOPE_STORAGE_KEY, envelope);
}

export type NoteSyncEnvelopeAction = SyncEnvelopeAction<NoteSyncSnapshot>;

export function noteSyncEnvelopeReducer(
  state: SyncEnvelope<NoteSyncSnapshot>,
  action: NoteSyncEnvelopeAction,
): SyncEnvelope<NoteSyncSnapshot> {
  return syncEnvelopeReducer(state, action);
}
