// T157.7: the goals domain's sync bookkeeping envelope -- a second,
// parallel identity-scoped domain instance alongside the primary
// `goalReducer` (src/features/goals/model/goal.ts), not a replacement for
// it. Mirrors `custom-trick-sync-envelope.ts` structurally (T157.5, itself
// mirroring `profile-sync-envelope.ts` from T157.4); see
// `.claude/plans/T157.7.md` for the full design. The primary reducer stays
// the sole source of truth for the live `GoalCollection` shown in the UI;
// this file only tracks "what has this device told the server, and what
// does it still owe the server."
//
// Structurally the same shape as the custom-tricks envelope: `api.goals` is
// a single row type (no scalar/child-table split), so there is no
// `profileRevision`-equivalent scalar field here -- only a per-goal
// revision map.

import { isGoalCollection } from '@/features/goals/persistence/goal-persistence';
import type { GoalCollection } from '@/features/goals/model/goal';
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

export interface GoalSyncSnapshot {
  // Mirror of the primary reducer's state at the moment of the last envelope
  // mutation -- kept here (rather than re-derived) so the envelope is a
  // fully self-contained, independently reloadable document.
  readonly collection: GoalCollection;
  readonly goalRevisions: Readonly<Record<string, number>>;
}

export function createInitialGoalSyncSnapshot(collection: GoalCollection): GoalSyncSnapshot {
  return { collection, goalRevisions: {} };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRevisionNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}

function isGoalRevisions(value: unknown): value is Readonly<Record<string, number>> {
  if (!isRecord(value)) return false;
  return Object.values(value).every(isRevisionNumber);
}

export function isGoalSyncSnapshot(value: unknown): value is GoalSyncSnapshot {
  if (!isRecord(value)) return false;

  const { collection, goalRevisions } = value;
  if (!isGoalCollection(collection)) return false;
  if (!isGoalRevisions(goalRevisions)) return false;

  return true;
}

export const goalSyncSnapshotCodec: SyncEnvelopeCodec<GoalSyncSnapshot> = {
  isState: isGoalSyncSnapshot,
};

export const GOAL_SYNC_ENVELOPE_STORAGE_KEY = 'daily-dama:goal-sync-envelope';

export async function loadGoalSyncEnvelope(
  storage: KeyValueStorage,
  identity: Identity,
  initialSnapshot: GoalSyncSnapshot,
): Promise<PersistenceLoadResult<SyncEnvelope<GoalSyncSnapshot>>> {
  return loadSyncEnvelope(storage, GOAL_SYNC_ENVELOPE_STORAGE_KEY, 'goals', goalSyncSnapshotCodec, identity, initialSnapshot);
}

export async function saveGoalSyncEnvelope(
  storage: KeyValueStorage,
  envelope: SyncEnvelope<GoalSyncSnapshot>,
): Promise<PersistenceSaveResult> {
  return saveSyncEnvelope(storage, GOAL_SYNC_ENVELOPE_STORAGE_KEY, envelope);
}

export type GoalSyncEnvelopeAction = SyncEnvelopeAction<GoalSyncSnapshot>;

export function goalSyncEnvelopeReducer(
  state: SyncEnvelope<GoalSyncSnapshot>,
  action: GoalSyncEnvelopeAction,
): SyncEnvelope<GoalSyncSnapshot> {
  return syncEnvelopeReducer(state, action);
}
