// T157.6: the practice-history domain's sync bookkeeping envelope -- a
// second, parallel identity-scoped domain instance alongside the primary
// `practiceHistoryReducer` (src/features/stats/model/practice-history.ts),
// not a replacement for it. Mirrors `custom-trick-sync-envelope.ts`
// structurally (T157.5); see `.claude/plans/T157.6.md` for the full design.
// The primary reducer stays the sole source of truth for the live
// `PracticeHistory` shown in Stats; this file only tracks "what has this
// device told the server, and what does it still owe the server."
//
// Simpler than the custom-tricks envelope in one way: `api.practice_sessions`
// has no revision column and no UPDATE/DELETE grant at all, so there is no
// revision-cache-equivalent field here at all -- just a mirror of the
// primary reducer's own state.

import type { PracticeHistory } from '@/features/stats/model/practice-history';
import { isPracticeHistory } from '@/features/stats/persistence/practice-history-persistence';
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

export interface PracticeHistorySyncSnapshot {
  // Mirror of the primary reducer's state at the moment of the last envelope
  // mutation -- kept here (rather than re-derived) so the envelope is a
  // fully self-contained, independently reloadable document.
  readonly history: PracticeHistory;
}

export function createInitialPracticeHistorySyncSnapshot(history: PracticeHistory): PracticeHistorySyncSnapshot {
  return { history };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isPracticeHistorySyncSnapshot(value: unknown): value is PracticeHistorySyncSnapshot {
  if (!isRecord(value)) return false;
  return isPracticeHistory(value.history);
}

export const practiceHistorySyncSnapshotCodec: SyncEnvelopeCodec<PracticeHistorySyncSnapshot> = {
  isState: isPracticeHistorySyncSnapshot,
};

export const PRACTICE_HISTORY_SYNC_ENVELOPE_STORAGE_KEY = 'daily-dama:practice-history-sync-envelope';

export async function loadPracticeHistorySyncEnvelope(
  storage: KeyValueStorage,
  identity: Identity,
  initialSnapshot: PracticeHistorySyncSnapshot,
): Promise<PersistenceLoadResult<SyncEnvelope<PracticeHistorySyncSnapshot>>> {
  return loadSyncEnvelope(
    storage,
    PRACTICE_HISTORY_SYNC_ENVELOPE_STORAGE_KEY,
    'practiceHistory',
    practiceHistorySyncSnapshotCodec,
    identity,
    initialSnapshot,
  );
}

export async function savePracticeHistorySyncEnvelope(
  storage: KeyValueStorage,
  envelope: SyncEnvelope<PracticeHistorySyncSnapshot>,
): Promise<PersistenceSaveResult> {
  return saveSyncEnvelope(storage, PRACTICE_HISTORY_SYNC_ENVELOPE_STORAGE_KEY, envelope);
}

export type PracticeHistorySyncEnvelopeAction = SyncEnvelopeAction<PracticeHistorySyncSnapshot>;

export function practiceHistorySyncEnvelopeReducer(
  state: SyncEnvelope<PracticeHistorySyncSnapshot>,
  action: PracticeHistorySyncEnvelopeAction,
): SyncEnvelope<PracticeHistorySyncSnapshot> {
  return syncEnvelopeReducer(state, action);
}
