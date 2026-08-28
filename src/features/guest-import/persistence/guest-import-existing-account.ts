import type { UserProfile } from '@/features/profile/model/user-profile';
import {
  extractScalarFields,
  mapUserProfileToTrickStateUpsertInputs,
  type ProfileScalarFields,
} from '@/features/profile/persistence/profile-cloud-mapping';
import type { CustomTrickCollection, CustomTrick } from '@/features/custom-tricks/model/custom-trick';
import { mapCustomTrickToUpsertInput } from '@/features/custom-tricks/persistence/custom-trick-cloud-mapping';
import type { PracticeHistory, PracticeSessionRecord } from '@/features/stats/model/practice-history';
import { mapPracticeSessionRecordToInsertInput } from '@/features/stats/persistence/practice-history-cloud-mapping';
import type { Goal } from '@/features/goals/model/goal';
import type { GoalCloudEntry } from '@/features/goals/persistence/goal-cloud-mapping';
import { mapGoalToInsertInput } from '@/features/goals/persistence/goal-cloud-mapping';
import type { Note } from '@/features/notes/model/note';
import type { NoteCloudEntry } from '@/features/notes/persistence/note-cloud-mapping';
import { mapNoteToInsertInput } from '@/features/notes/persistence/note-cloud-mapping';
import type {
  GuestImportConflict,
  GuestImportOperationProgress,
  GuestImportProfileComparison,
  GuestImportRecordReference,
} from '@/features/guest-import/model/guest-import';
import type { ConflictSnapshot } from '@/shared/sync/conflict';
import { SYNC_DOMAINS, type SyncDomain } from '@/shared/sync/domain';
import { createOutboxOperation, type NewOutboxOperationInput } from '@/shared/sync/outbox-operation';
import type { GuestImportTransports } from '@/features/guest-import/persistence/guest-import-inventory';
import { pullAllPages } from '@/shared/sync/transport';
import type { CloudRepositoryError } from '@/shared/supabase/cloud-repository';
import type { UserTrickStateRow } from '@/features/profile/persistence/profile-cloud-repository';
import type { CustomTrickRow } from '@/features/custom-tricks/persistence/custom-trick-cloud-repository';
import type { PracticeSessionRow } from '@/features/stats/persistence/practice-history-cloud-repository';
import type { GoalRow } from '@/features/goals/persistence/goal-cloud-repository';
import type { NoteRow } from '@/features/notes/persistence/note-cloud-repository';
import { mapProfileRowToDomainFields, mapTrickStateRowsToDomainFields } from '@/features/profile/persistence/profile-cloud-mapping';
import { mapCustomTrickRowsToDomainCollection } from '@/features/custom-tricks/persistence/custom-trick-cloud-mapping';
import { mapPracticeSessionRowsToDomainHistory } from '@/features/stats/persistence/practice-history-cloud-mapping';
import { mapGoalRowsToDomainEntries } from '@/features/goals/persistence/goal-cloud-mapping';
import { mapNoteRowsToDomainEntries } from '@/features/notes/persistence/note-cloud-mapping';

const PULL_PAGE_SIZE = 200;

export type ExistingAccountSnapshotResult =
  | { readonly status: 'succeeded'; readonly snapshot: ExistingAccountSnapshot }
  | { readonly status: 'failed'; readonly error: CloudRepositoryError };

export async function readExistingAccountSnapshot(
  transports: GuestImportTransports,
  userId: string,
): Promise<ExistingAccountSnapshotResult> {
  const profile = await transports.profile.pullProfileRow();
  if (profile.status === 'failed') return profile;
  const trickStates = await pullAllPages<UserTrickStateRow>({ pull: (request) => transports.profile.pullTrickStatePage(request) }, { pageSize: PULL_PAGE_SIZE, startCursor: null });
  if (trickStates.status === 'failed') return { status: 'failed', error: trickStates.error };
  const custom = await pullAllPages<CustomTrickRow>(transports.customTricks, { pageSize: PULL_PAGE_SIZE, startCursor: null });
  if (custom.status === 'failed') return { status: 'failed', error: custom.error };
  const history = await pullAllPages<PracticeSessionRow>(transports.practiceHistory, { pageSize: PULL_PAGE_SIZE, startCursor: null });
  if (history.status === 'failed') return { status: 'failed', error: history.error };
  const goals = await pullAllPages<GoalRow>(transports.goals, { pageSize: PULL_PAGE_SIZE, startCursor: null });
  if (goals.status === 'failed') return { status: 'failed', error: goals.error };
  const notes = await pullAllPages<NoteRow>(transports.notes, { pageSize: PULL_PAGE_SIZE, startCursor: null });
  if (notes.status === 'failed') return { status: 'failed', error: notes.error };

  const profileMapped = mapProfileRowToDomainFields(profile.page.items[0] ?? null, userId);
  const trickMapped = mapTrickStateRowsToDomainFields(trickStates.rows, userId);
  const customMapped = mapCustomTrickRowsToDomainCollection(custom.rows, userId);
  const historyMapped = mapPracticeSessionRowsToDomainHistory(history.rows, userId);
  const goalsMapped = mapGoalRowsToDomainEntries(goals.rows, userId);
  const notesMapped = mapNoteRowsToDomainEntries(notes.rows, userId);
  if (profileMapped.status === 'invalid' || trickMapped.status === 'invalid' || customMapped.status === 'invalid' || historyMapped.status === 'invalid' || goalsMapped.status === 'invalid' || notesMapped.status === 'invalid') {
    return { status: 'failed', error: { kind: 'validation', message: 'Malformed existing-account cloud snapshot.' } };
  }
  const profileFields = profileMapped.status === 'absent' ? null : profileMapped.fields;
  return {
    status: 'succeeded',
    snapshot: {
      profile: profileFields,
      trickStates: trickStates.rows.map((row) => ({ trickId: row.trick_id, isSelected: row.is_selected, isManuallyUnlocked: row.is_manually_unlocked, revision: row.revision })),
      customTricks: customMapped.collection,
      practiceHistory: historyMapped.history,
      goals: goalsMapped.entries,
      notes: notesMapped.entries,
    },
  };
}

export interface GuestImportTrickStateSnapshot {
  readonly trickId: string;
  readonly isSelected: boolean;
  readonly isManuallyUnlocked: boolean;
  readonly revision: number;
}

export interface ExistingAccountSnapshot {
  readonly profile: ProfileScalarFields | null;
  readonly trickStates: readonly GuestImportTrickStateSnapshot[];
  readonly customTricks: CustomTrickCollection;
  readonly practiceHistory: PracticeHistory;
  readonly goals: readonly GoalCloudEntry[];
  readonly notes: readonly NoteCloudEntry[];
}

export interface ExistingMergePlan {
  readonly profileComparison: GuestImportProfileComparison;
  readonly operations: readonly GuestImportOperationProgress[];
  readonly deduplications: readonly GuestImportRecordReference[];
  readonly conflicts: readonly GuestImportConflict[];
  readonly counts: Readonly<Record<SyncDomain, { readonly creates: number; readonly deduplicated: number; readonly conflicts: number }>>;
}

export interface PlanExistingMergeOptions {
  readonly guest: { readonly profile: UserProfile; readonly customTricks: CustomTrickCollection; readonly practiceHistory: PracticeHistory; readonly goals: { readonly goals: readonly Goal[] }; readonly notes: { readonly notes: readonly Note[] } };
  readonly cloud: ExistingAccountSnapshot;
  readonly destinationUserId: string;
  readonly importId: string;
  readonly createdAt: number;
  readonly createOperationId: (domain: SyncDomain, recordId: string) => string;
}

function snapshot(value: unknown): ConflictSnapshot {
  return value as ConflictSnapshot;
}

function equal(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function byId<T extends { readonly id: string }>(items: readonly T[], domain: string): Map<string, T> {
  const result = new Map<string, T>();
  for (const item of items) {
    if (result.has(item.id)) throw new Error(`Duplicate ${domain} record id ${JSON.stringify(item.id)}.`);
    result.set(item.id, item);
  }
  return result;
}

function trickStatesById(items: readonly GuestImportTrickStateSnapshot[]): Map<string, GuestImportTrickStateSnapshot> {
  const result = new Map<string, GuestImportTrickStateSnapshot>();
  for (const item of items) {
    if (result.has(item.trickId)) throw new Error(`Duplicate profile trick-state id ${JSON.stringify(item.trickId)}.`);
    result.set(item.trickId, item);
  }
  return result;
}

function operation(
  domain: SyncDomain,
  recordId: string,
  payload: Record<string, unknown>,
  expectedRevision: number | null,
  options: PlanExistingMergeOptions,
): GuestImportOperationProgress {
  const input: NewOutboxOperationInput = { domain, operationType: 'upsert', recordId, payload };
  return {
    ...createOutboxOperation(options.createOperationId(domain, recordId), input, options.createdAt),
    status: 'pending',
    expectedRevision,
  };
}

function conflict(domain: SyncDomain, recordId: string, guest: unknown, cloud: unknown, revision: number | null): GuestImportConflict {
  return { domain, recordId, guestSnapshot: snapshot(guest), cloudSnapshot: snapshot(cloud), cloudRevision: revision };
}

export function planExistingAccountMerge(options: PlanExistingMergeOptions): ExistingMergePlan {
  const guestScalar = extractScalarFields(options.guest.profile);
  const profileComparison: GuestImportProfileComparison = { guest: snapshot(guestScalar), cloud: options.cloud.profile === null ? null : snapshot(options.cloud.profile) };
  const operations: GuestImportOperationProgress[] = [];
  const deduplications: GuestImportRecordReference[] = [];
  const conflicts: GuestImportConflict[] = [];
  const counts = {} as Record<SyncDomain, { creates: number; deduplicated: number; conflicts: number }>;
  for (const domain of SYNC_DOMAINS) counts[domain] = { creates: 0, deduplicated: 0, conflicts: 0 };

  const guestTrickStates = trickStatesById(mapUserProfileToTrickStateUpsertInputs(options.guest.profile, options.destinationUserId).map((input) => ({
    trickId: input.trick_id, isSelected: input.is_selected ?? false, isManuallyUnlocked: input.is_manually_unlocked ?? false, revision: 0,
  })));
  const cloudTrickStates = trickStatesById(options.cloud.trickStates);
  for (const trickId of [...guestTrickStates.keys()].sort()) {
    const guestState = guestTrickStates.get(trickId)!;
    const cloudState = cloudTrickStates.get(trickId);
    const merged = { isSelected: guestState.isSelected || (cloudState?.isSelected ?? false), isManuallyUnlocked: guestState.isManuallyUnlocked || (cloudState?.isManuallyUnlocked ?? false) };
    if (cloudState === undefined) {
      operations.push(operation('profile', trickId, { user_id: options.destinationUserId, trick_id: trickId, is_selected: merged.isSelected, is_manually_unlocked: merged.isManuallyUnlocked }, null, options));
      counts.profile.creates += 1;
    } else if (merged.isSelected === cloudState.isSelected && merged.isManuallyUnlocked === cloudState.isManuallyUnlocked) {
      deduplications.push({ domain: 'profile', recordId: trickId }); counts.profile.deduplicated += 1;
    } else {
      operations.push(operation('profile', trickId, { user_id: options.destinationUserId, trick_id: trickId, is_selected: merged.isSelected, is_manually_unlocked: merged.isManuallyUnlocked }, cloudState.revision, options));
      counts.profile.creates += 1;
    }
  }

  const domains: readonly [SyncDomain, readonly { id: string }[], readonly unknown[], (item: unknown) => Record<string, unknown>][] = [
    ['customTricks', options.guest.customTricks.tricks, options.cloud.customTricks.tricks, (item) => mapCustomTrickToUpsertInput(item as CustomTrick, options.destinationUserId) as unknown as Record<string, unknown>],
    ['practiceHistory', options.guest.practiceHistory.sessions, options.cloud.practiceHistory.sessions, (item) => mapPracticeSessionRecordToInsertInput(item as PracticeSessionRecord, options.destinationUserId) as unknown as Record<string, unknown>],
    ['goals', options.guest.goals.goals, options.cloud.goals, (item) => mapGoalToInsertInput(item as Goal, options.destinationUserId) as unknown as Record<string, unknown>],
    ['notes', options.guest.notes.notes, options.cloud.notes, (item) => mapNoteToInsertInput(item as Note, options.destinationUserId) as unknown as Record<string, unknown>],
  ];
  for (const [domain, guestItems, cloudItems, toPayload] of domains) {
    const guestById = byId(guestItems, domain);
    const cloudById = new Map<string, unknown>();
    for (const item of cloudItems) {
      const id = domain === 'goals' || domain === 'notes'
        ? (item as GoalCloudEntry | NoteCloudEntry).status === 'active'
          ? ((item as GoalCloudEntry | NoteCloudEntry).status === 'active' && domain === 'goals' ? (item as GoalCloudEntry).goal.id : (item as NoteCloudEntry).note.id)
          : (domain === 'goals' ? (item as GoalCloudEntry).goal.id : (item as NoteCloudEntry).note.id)
        : (item as { readonly id: string }).id;
      if (cloudById.has(id)) throw new Error(`Duplicate ${domain} record id ${JSON.stringify(id)}.`);
      cloudById.set(id, item);
    }
    for (const id of [...guestById.keys()].sort()) {
      const guestItem = guestById.get(id)!; const cloudItem = cloudById.get(id) as GoalCloudEntry | NoteCloudEntry | CustomTrick | PracticeSessionRecord | undefined;
      const guestCanonical = toPayload(guestItem);
      let cloudCanonical: unknown = cloudItem === undefined ? undefined : toPayload(cloudItem);
      let revision: number | null = null;
      if (domain === 'goals' || domain === 'notes') {
        const entry = cloudItem as GoalCloudEntry | NoteCloudEntry | undefined;
        if (entry === undefined) cloudCanonical = undefined;
        else if (entry.status === 'active') {
          cloudCanonical = domain === 'goals'
            ? mapGoalToInsertInput((entry as GoalCloudEntry).goal, options.destinationUserId)
            : mapNoteToInsertInput((entry as NoteCloudEntry).note, options.destinationUserId);
        } else {
          cloudCanonical = { status: 'deleted', ...(domain === 'goals' ? { goal: (entry as GoalCloudEntry).goal } : { note: (entry as NoteCloudEntry).note }), deletedAt: entry.meta.deletedAt };
        }
        revision = entry?.meta.revision ?? null;
      }
      // canonical payloads intentionally omit server metadata and tombstone wrappers.
      if (cloudItem === undefined) { operations.push(operation(domain, id, guestCanonical, null, options)); counts[domain].creates += 1; }
      else if (equal(guestCanonical, cloudCanonical)) { deduplications.push({ domain, recordId: id }); counts[domain].deduplicated += 1; }
      else { conflicts.push(conflict(domain, id, guestCanonical, cloudCanonical, revision)); counts[domain].conflicts += 1; }
    }
  }
  operations.sort((a, b) => SYNC_DOMAINS.indexOf(a.domain) - SYNC_DOMAINS.indexOf(b.domain) || a.recordId.localeCompare(b.recordId));
  deduplications.sort((a, b) => SYNC_DOMAINS.indexOf(a.domain) - SYNC_DOMAINS.indexOf(b.domain) || a.recordId.localeCompare(b.recordId));
  conflicts.sort((a, b) => SYNC_DOMAINS.indexOf(a.domain) - SYNC_DOMAINS.indexOf(b.domain) || a.recordId.localeCompare(b.recordId));
  return { profileComparison, operations, deduplications, conflicts, counts };
}
