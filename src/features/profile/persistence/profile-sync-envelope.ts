// The profile domain's sync bookkeeping envelope -- a second,
// parallel identity-scoped domain instance alongside the primary
// `userProfileReducer` (src/features/profile/model/user-profile.ts), not a
// replacement for it. The primary reducer stays the sole source of truth for the live
// `UserProfile` shown in the UI; this file only tracks "what has this
// device told the server, and what does it still owe the server."

import { parseUserProfile } from '@/features/profile/persistence/user-profile-persistence';
import type { UserProfile } from '@/features/profile/model/user-profile';
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

export interface ProfileSyncSnapshot {
  // Mirror of the primary reducer's state at the moment of the last envelope
  // mutation -- kept here (rather than re-derived) so the envelope is a
  // fully self-contained, independently reloadable document.
  readonly profile: UserProfile;
  readonly profileRevision: number | null;
  readonly trickStateRevisions: Readonly<Record<string, number>>;
}

export function createInitialProfileSyncSnapshot(profile: UserProfile): ProfileSyncSnapshot {
  return { profile, profileRevision: null, trickStateRevisions: {} };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRevisionNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}

function isTrickStateRevisions(value: unknown): value is Readonly<Record<string, number>> {
  if (!isRecord(value)) return false;
  return Object.values(value).every(isRevisionNumber);
}

export function isProfileSyncSnapshot(value: unknown): value is ProfileSyncSnapshot {
  if (!isRecord(value)) return false;

  const { profile, profileRevision, trickStateRevisions } = value;
  if (parseUserProfile(profile) === undefined) return false;
  if (profileRevision !== null && !isRevisionNumber(profileRevision)) return false;
  if (!isTrickStateRevisions(trickStateRevisions)) return false;

  return true;
}

export const profileSyncSnapshotCodec: SyncEnvelopeCodec<ProfileSyncSnapshot> = {
  isState: isProfileSyncSnapshot,
};

export const PROFILE_SYNC_ENVELOPE_STORAGE_KEY = 'daily-dama:profile-sync-envelope';

export async function loadProfileSyncEnvelope(
  storage: KeyValueStorage,
  identity: Identity,
  initialSnapshot: ProfileSyncSnapshot,
): Promise<PersistenceLoadResult<SyncEnvelope<ProfileSyncSnapshot>>> {
  return loadSyncEnvelope(
    storage,
    PROFILE_SYNC_ENVELOPE_STORAGE_KEY,
    'profile',
    profileSyncSnapshotCodec,
    identity,
    initialSnapshot,
  );
}

export async function saveProfileSyncEnvelope(
  storage: KeyValueStorage,
  envelope: SyncEnvelope<ProfileSyncSnapshot>,
): Promise<PersistenceSaveResult> {
  return saveSyncEnvelope(storage, PROFILE_SYNC_ENVELOPE_STORAGE_KEY, envelope);
}

export type ProfileSyncEnvelopeAction = SyncEnvelopeAction<ProfileSyncSnapshot>;

export function profileSyncEnvelopeReducer(
  state: SyncEnvelope<ProfileSyncSnapshot>,
  action: ProfileSyncEnvelopeAction,
): SyncEnvelope<ProfileSyncSnapshot> {
  return syncEnvelopeReducer(state, action);
}
