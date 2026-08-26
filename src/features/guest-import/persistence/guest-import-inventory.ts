// T159.1: read-only inventory step -- counts local guest records vs. cloud
// records per domain, without mutating anything. No reducer/React
// involvement; this is a pure-async data-gathering module the driver hook
// (state/use-guest-import.ts) calls into.

import type { SupabaseClient } from '@supabase/supabase-js';

import { extractScalarFields } from '@/features/profile/persistence/profile-cloud-mapping';
import { loadUserProfile } from '@/features/profile/persistence/user-profile-persistence';
import { INITIAL_USER_PROFILE } from '@/features/profile/model/user-profile';
import type { UserTrickStateRow } from '@/features/profile/persistence/profile-cloud-repository';
import { createProfileSyncTransportAdapter, type ProfileSyncTransport } from '@/features/profile/persistence/profile-sync-transport';

import { loadCustomTricks } from '@/features/custom-tricks/persistence/custom-trick-persistence';
import { mapCustomTrickRowsToDomainCollection } from '@/features/custom-tricks/persistence/custom-trick-cloud-mapping';
import type { CustomTrickRow } from '@/features/custom-tricks/persistence/custom-trick-cloud-repository';
import { createCustomTrickSyncTransportAdapter } from '@/features/custom-tricks/persistence/custom-trick-sync-transport';

import { loadPracticeHistory } from '@/features/stats/persistence/practice-history-persistence';
import type { PracticeSessionRow } from '@/features/stats/persistence/practice-history-cloud-repository';
import { createPracticeHistorySyncTransportAdapter } from '@/features/stats/persistence/practice-history-sync-transport';

import { loadGoals } from '@/features/goals/persistence/goal-persistence';
import { mapGoalRowsToDomainCollection } from '@/features/goals/persistence/goal-cloud-mapping';
import type { GoalRow } from '@/features/goals/persistence/goal-cloud-repository';
import { createGoalSyncTransportAdapter } from '@/features/goals/persistence/goal-sync-transport';

import { loadNotes } from '@/features/notes/persistence/note-persistence';
import { mapNoteRowsToDomainCollection } from '@/features/notes/persistence/note-cloud-mapping';
import type { NoteRow } from '@/features/notes/persistence/note-cloud-repository';
import { createNoteSyncTransportAdapter } from '@/features/notes/persistence/note-sync-transport';

import type { GuestImportDomainCounts } from '@/features/guest-import/model/guest-import';
import type { SyncDomain } from '@/shared/sync/domain';
import { GUEST_IDENTITY } from '@/shared/persistence/identity';
import { createGuestMigratingStorage } from '@/shared/persistence/scoped-storage';
import type { KeyValueStorage } from '@/shared/persistence/storage';
import type { Database } from '@/shared/supabase/database-types';
import type { CloudRepositoryError } from '@/shared/supabase/cloud-repository';
import { pullAllPages, type SyncTransportRepository } from '@/shared/sync/transport';

// Same page size use-profile-domain-sync.ts already uses for pulling every
// row of a domain during a real sync run.
const PULL_PAGE_SIZE = 200;

/**
 * Reads every guest-scoped local domain document and counts what an import
 * would move. Reuses the five already-existing loadXxx persistence
 * functions directly against a guest-pinned storage view -- no new
 * serialization logic, and no mutation of anything.
 */
export async function countLocalGuestRecords(base: KeyValueStorage): Promise<GuestImportDomainCounts> {
  const guestStorage = createGuestMigratingStorage(base, { getIdentity: () => GUEST_IDENTITY });

  const [profileResult, customTricksResult, practiceHistoryResult, goalsResult, notesResult] = await Promise.all([
    loadUserProfile(guestStorage),
    loadCustomTricks(guestStorage),
    loadPracticeHistory(guestStorage),
    loadGoals(guestStorage),
    loadNotes(guestStorage),
  ]);

  const profile = profileResult.value;
  // Matches diffProfileForOutboxOperations' own "one profile-domain record"
  // accounting exactly: one scalar op keyed by userId (if any scalar field
  // differs from the untouched default), plus one op per distinct trick id
  // across selection/manual-unlock.
  const hasNonDefaultScalarFields =
    JSON.stringify(extractScalarFields(profile)) !== JSON.stringify(extractScalarFields(INITIAL_USER_PROFILE));
  const trickIdUnion = new Set([...profile.selectedTrickIds, ...(profile.manuallyUnlockedTrickIds ?? [])]);
  const profileLocalCount = (hasNonDefaultScalarFields ? 1 : 0) + trickIdUnion.size;

  return {
    profile: { local: profileLocalCount, cloud: 0 },
    customTricks: { local: customTricksResult.value.tricks.length, cloud: 0 },
    practiceHistory: { local: practiceHistoryResult.value.sessions.length, cloud: 0 },
    goals: { local: goalsResult.value.goals.length, cloud: 0 },
    notes: { local: notesResult.value.notes.length, cloud: 0 },
  };
}

export interface GuestImportTransports {
  readonly profile: ProfileSyncTransport;
  readonly customTricks: SyncTransportRepository<CustomTrickRow>;
  readonly practiceHistory: SyncTransportRepository<PracticeSessionRow>;
  readonly goals: SyncTransportRepository<GoalRow>;
  readonly notes: SyncTransportRepository<NoteRow>;
}

/**
 * Thin factory over the five already-built createXSyncTransportAdapter
 * functions (T157.4-T157.8) -- no new adapters, just a bundle for this
 * ticket's read-only cloud counting.
 */
export function buildGuestImportTransports(
  client: SupabaseClient<Database, 'api'>,
  userId: string,
): GuestImportTransports {
  return {
    profile: createProfileSyncTransportAdapter(client, userId),
    customTricks: createCustomTrickSyncTransportAdapter(client, userId),
    practiceHistory: createPracticeHistorySyncTransportAdapter(client, userId),
    goals: createGoalSyncTransportAdapter(client, userId),
    notes: createNoteSyncTransportAdapter(client, userId),
  };
}

export type CountCloudRecordsResult =
  | { readonly status: 'succeeded'; readonly counts: Readonly<Record<SyncDomain, number>> }
  | { readonly status: 'failed'; readonly domain: SyncDomain; readonly errorMessage: string };

function failure(
  domain: SyncDomain,
  error: CloudRepositoryError,
): CountCloudRecordsResult {
  return { status: 'failed', domain, errorMessage: error.message };
}

/**
 * Pulls all pages per domain, in the fixed order profile, customTricks,
 * practiceHistory, goals, notes, so a failure always names a deterministic
 * first-failing domain. A pull failure or a mapping-invalid result for any
 * domain short-circuits the whole function -- no partial counts are
 * reported for domains that happened to succeed before the failure.
 */
export async function countCloudRecords(
  transports: GuestImportTransports,
  userId: string,
): Promise<CountCloudRecordsResult> {
  const profilePull = await transports.profile.pullProfileRow();
  if (profilePull.status === 'failed') return failure('profile', profilePull.error);

  const trickStatePull = await pullAllPages<UserTrickStateRow>(
    { pull: (request) => transports.profile.pullTrickStatePage(request) },
    { pageSize: PULL_PAGE_SIZE, startCursor: null },
  );
  if (trickStatePull.status === 'failed') return failure('profile', trickStatePull.error);

  // A present cloud profile row counts as 1 regardless of field values --
  // deliberately asymmetric with the local side's "non-default scalar
  // fields" check, since a cloud row is always fully-populated once it
  // exists at all and a present row is itself evidence of prior sync/
  // account activity worth surfacing. Not a bug; simpler than trying to
  // detect "non-default" server-side.
  const profileCount = (profilePull.page.items[0] ? 1 : 0) + trickStatePull.rows.length;

  const customTricksPull = await pullAllPages<CustomTrickRow>(
    { pull: (request) => transports.customTricks.pull(request) },
    { pageSize: PULL_PAGE_SIZE, startCursor: null },
  );
  if (customTricksPull.status === 'failed') return failure('customTricks', customTricksPull.error);
  const customTricksMapped = mapCustomTrickRowsToDomainCollection(customTricksPull.rows, userId);
  if (customTricksMapped.status === 'invalid') {
    return failure('customTricks', { kind: 'validation', message: 'Malformed custom-trick cloud rows.' });
  }

  const practiceHistoryPull = await pullAllPages<PracticeSessionRow>(
    { pull: (request) => transports.practiceHistory.pull(request) },
    { pageSize: PULL_PAGE_SIZE, startCursor: null },
  );
  if (practiceHistoryPull.status === 'failed') return failure('practiceHistory', practiceHistoryPull.error);

  const goalsPull = await pullAllPages<GoalRow>(
    { pull: (request) => transports.goals.pull(request) },
    { pageSize: PULL_PAGE_SIZE, startCursor: null },
  );
  if (goalsPull.status === 'failed') return failure('goals', goalsPull.error);
  const goalsMapped = mapGoalRowsToDomainCollection(goalsPull.rows, userId);
  if (goalsMapped.status === 'invalid') {
    return failure('goals', { kind: 'validation', message: 'Malformed goal cloud rows.' });
  }

  const notesPull = await pullAllPages<NoteRow>(
    { pull: (request) => transports.notes.pull(request) },
    { pageSize: PULL_PAGE_SIZE, startCursor: null },
  );
  if (notesPull.status === 'failed') return failure('notes', notesPull.error);
  const notesMapped = mapNoteRowsToDomainCollection(notesPull.rows, userId);
  if (notesMapped.status === 'invalid') {
    return failure('notes', { kind: 'validation', message: 'Malformed note cloud rows.' });
  }

  return {
    status: 'succeeded',
    counts: {
      profile: profileCount,
      customTricks: customTricksMapped.collection.tricks.length,
      practiceHistory: practiceHistoryPull.rows.length,
      goals: goalsMapped.collection.goals.length,
      notes: notesMapped.collection.notes.length,
    },
  };
}
