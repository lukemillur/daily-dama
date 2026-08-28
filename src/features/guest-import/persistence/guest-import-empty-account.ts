import { INITIAL_USER_PROFILE, type UserProfile } from '@/features/profile/model/user-profile';
import { loadUserProfile, saveUserProfile } from '@/features/profile/persistence/user-profile-persistence';
import { diffProfileForOutboxOperations } from '@/features/profile/persistence/profile-cloud-mapping';
import { loadCustomTricks, saveCustomTricks } from '@/features/custom-tricks/persistence/custom-trick-persistence';
import { diffCustomTricksForOutboxOperations } from '@/features/custom-tricks/persistence/custom-trick-cloud-mapping';
import { loadPracticeHistory, savePracticeHistory } from '@/features/stats/persistence/practice-history-persistence';
import { diffPracticeHistoryForOutboxOperations } from '@/features/stats/persistence/practice-history-cloud-mapping';
import { loadGoals, saveGoals } from '@/features/goals/persistence/goal-persistence';
import { diffGoalsForOutboxOperations } from '@/features/goals/persistence/goal-cloud-mapping';
import { loadNotes, saveNotes } from '@/features/notes/persistence/note-persistence';
import { diffNotesForOutboxOperations } from '@/features/notes/persistence/note-cloud-mapping';
import { createGuestMigratingStorage } from '@/shared/persistence/scoped-storage';
import { GUEST_IDENTITY, type Identity, identityNamespace } from '@/shared/persistence/identity';
import type { KeyValueStorage } from '@/shared/persistence/storage';
import type { SyncDomain } from '@/shared/sync/domain';
import { createOutboxOperation, type NewOutboxOperationInput, type OutboxOperation } from '@/shared/sync/outbox-operation';
import { pushOutboxOperations, type SyncTransportPushResult, type SyncTransportRepository } from '@/shared/sync/transport';
import type { ProfileSyncTransport } from '@/features/profile/persistence/profile-sync-transport';
import type { CustomTrickRow } from '@/features/custom-tricks/persistence/custom-trick-cloud-repository';
import type { PracticeSessionRow } from '@/features/stats/persistence/practice-history-cloud-repository';
import type { GoalRow } from '@/features/goals/persistence/goal-cloud-repository';
import type { NoteRow } from '@/features/notes/persistence/note-cloud-repository';
import type { GuestImportOperationProgress, GuestImportProgress, GuestImportSourceCleanupStatus } from '@/features/guest-import/model/guest-import';

export interface GuestImportSourceSnapshot {
  readonly profile: UserProfile;
  readonly customTricks: Awaited<ReturnType<typeof loadCustomTricks>>['value'];
  readonly practiceHistory: Awaited<ReturnType<typeof loadPracticeHistory>>['value'];
  readonly goals: Awaited<ReturnType<typeof loadGoals>>['value'];
  readonly notes: Awaited<ReturnType<typeof loadNotes>>['value'];
}

export interface GuestImportPrepared {
  readonly snapshot: GuestImportSourceSnapshot;
  readonly progress: GuestImportProgress;
}

export interface GuestImportRepositories {
  readonly profile: Pick<ProfileSyncTransport, 'push'>;
  readonly customTricks: Pick<SyncTransportRepository<CustomTrickRow>, 'push'>;
  readonly practiceHistory: Pick<SyncTransportRepository<PracticeSessionRow>, 'push'>;
  readonly goals: Pick<SyncTransportRepository<GoalRow>, 'push'>;
  readonly notes: Pick<SyncTransportRepository<NoteRow>, 'push'>;
}

export interface PrepareGuestImportOptions {
  readonly storage: KeyValueStorage;
  readonly destinationIdentity: Identity;
  readonly destinationUserId: string;
  readonly importId: string;
  readonly createdAt: number;
  readonly createOperationId: (domain: SyncDomain, recordId: string) => string;
}

export async function readGuestImportSnapshot(storage: KeyValueStorage): Promise<GuestImportSourceSnapshot> {
  const guestStorage = createGuestMigratingStorage(storage, { getIdentity: () => GUEST_IDENTITY });
  const [profile, customTricks, practiceHistory, goals, notes] = await Promise.all([
    loadUserProfile(guestStorage), loadCustomTricks(guestStorage), loadPracticeHistory(guestStorage),
    loadGoals(guestStorage), loadNotes(guestStorage),
  ]);
  return { profile: profile.value, customTricks: customTricks.value, practiceHistory: practiceHistory.value, goals: goals.value, notes: notes.value };
}

function inputsForSnapshot(snapshot: GuestImportSourceSnapshot, userId: string): readonly NewOutboxOperationInput[] {
  return [
    ...diffProfileForOutboxOperations(INITIAL_USER_PROFILE, snapshot.profile, userId),
    ...diffCustomTricksForOutboxOperations({ tricks: [] }, snapshot.customTricks, userId),
    ...diffPracticeHistoryForOutboxOperations({ sessions: [] }, snapshot.practiceHistory, userId),
    ...diffGoalsForOutboxOperations({ goals: [] }, snapshot.goals, userId),
    ...diffNotesForOutboxOperations({ notes: [] }, snapshot.notes, userId),
  ];
}

export async function prepareGuestImport(options: PrepareGuestImportOptions): Promise<GuestImportPrepared> {
  const snapshot = await readGuestImportSnapshot(options.storage);
  const operations = inputsForSnapshot(snapshot, options.destinationUserId).map((input) => {
    const operationId = options.createOperationId(input.domain, input.recordId);
    const operation = createOutboxOperation(operationId, input, options.createdAt);
    return { ...operation, status: 'pending' as const, expectedRevision: null } satisfies GuestImportOperationProgress;
  });
  return {
    snapshot,
    progress: {
      sourceIdentityNamespace: 'guest',
      destinationIdentityNamespace: identityNamespace(options.destinationIdentity),
      operations,
    },
  };
}

export interface RunGuestImportOptions {
  readonly storage: KeyValueStorage;
  readonly destinationIdentity: Identity;
  readonly destinationUserId: string;
  readonly progress: GuestImportProgress;
  readonly repositories: GuestImportRepositories;
  readonly saveProgress: (progress: GuestImportProgress) => Promise<void>;
  readonly now?: () => number;
  readonly beforeOperation?: (operation: GuestImportOperationProgress) => Promise<void>;
  readonly beforeRequest?: (operation: GuestImportOperationProgress) => Promise<void>;
  readonly cleanupSourceRecord?: (operation: GuestImportOperationProgress) => Promise<void>;
  readonly cleanupReferences?: readonly { readonly domain: SyncDomain; readonly recordId: string }[];
}

export type GuestImportRunResult =
  | { readonly status: 'completed'; readonly progress: GuestImportProgress }
  | { readonly status: 'paused'; readonly progress: GuestImportProgress; readonly error: unknown };

const REPOSITORY_BY_DOMAIN: Record<SyncDomain, keyof GuestImportRepositories> = {
  profile: 'profile', customTricks: 'customTricks', practiceHistory: 'practiceHistory', goals: 'goals', notes: 'notes',
};

function isSuccess<Row>(result: SyncTransportPushResult<Row>): result is { status: 'succeeded'; row: Row } {
  return result.status === 'succeeded';
}

/**
 * Resumes one operation at a time. The progress write happens before the
 * request, acknowledgement before source cleanup, and the same operationId
 * is sent on every retry. A thrown request (including a dropped response)
 * deliberately leaves the operation pending for the next invocation.
 */
export async function runEmptyGuestImport(options: RunGuestImportOptions): Promise<GuestImportRunResult> {
  if (options.progress.destinationIdentityNamespace !== identityNamespace(options.destinationIdentity)) {
    throw new Error('Guest import destination identity changed; refusing to mutate another account.');
  }
  let progress = options.progress;
  const guestStorage = createGuestMigratingStorage(options.storage, { getIdentity: () => GUEST_IDENTITY });

  // Cleanup is intentionally replayed for acknowledged operations. This
  // closes the acknowledgement/guest-storage crash window: a failed cleanup
  // never causes a later resume to forget the source record.
  try {
    for (const operation of progress.operations.filter((item) => item.status === 'acknowledged' && item.sourceCleanupStatus !== 'completed' && item.sourceCleanupStatus !== 'retained')) {
      await (options.cleanupSourceRecord ?? ((item) => acknowledgeGuestSourceRecord(guestStorage, item)))(operation);
      progress = markCleaned(progress, operation.operationId, options.now?.() ?? Date.now());
      await options.saveProgress(progress);
    }
  } catch (error) {
    return { status: 'paused', progress, error };
  }

  for (const domain of ['profile', 'customTricks', 'practiceHistory', 'goals', 'notes'] as const) {
    const pending = progress.operations.filter((operation) => operation.domain === domain && operation.status === 'pending');
    const repository = options.repositories[REPOSITORY_BY_DOMAIN[domain]];
    for (const operation of pending) {
      try {
        await options.beforeOperation?.(operation);
      } catch (error) {
        return { status: 'paused', progress, error };
      }
      const attemptedAt = options.now?.() ?? Date.now();
      progress = updateOperation(progress, operation.operationId, (item) => ({ ...item, attemptCount: item.attemptCount + 1, lastAttemptedAt: attemptedAt, lastErrorMessage: null, lastFailureKind: null }));
      try { await options.saveProgress(progress); } catch (error) { return { status: 'paused', progress, error }; }
      const attemptedOperation = progress.operations.find((item) => item.operationId === operation.operationId)!;
      try { await options.beforeRequest?.(attemptedOperation); } catch (error) { return { status: 'paused', progress, error }; }
      const outboxOperation: OutboxOperation = attemptedOperation;
      let result: SyncTransportPushResult<unknown>;
      try {
        const pushed = await pushOutboxOperations(repository as SyncTransportRepository<unknown>, [outboxOperation], {
          getExpectedRevision: (item) => progress.operations.find((candidate) => candidate.operationId === item.operationId)?.expectedRevision ?? null,
        });
        result = pushed.outcomes[0].result;
      } catch (error) {
        return { status: 'paused', progress, error };
      }
      if (!isSuccess(result)) {
        if (result.status === 'failed') return { status: 'paused', progress, error: result.error };
        if (result.status === 'conflict') return { status: 'paused', progress, error: result.conflict };
        return { status: 'paused', progress, error: new Error('Repository returned an invalid push result.') };
      }
      progress = {
        ...progress,
        operations: progress.operations.map((item) => item.operationId === operation.operationId ? { ...item, status: 'acknowledged' as const, sourceCleanupStatus: 'pending' as const, acknowledgedAt: options.now?.() ?? Date.now() } : item),
      };
      try { await options.saveProgress(progress); } catch (error) { return { status: 'paused', progress, error }; }
      try {
        await (options.cleanupSourceRecord ?? ((item) => acknowledgeGuestSourceRecord(guestStorage, item)))(operation);
        progress = markCleaned(progress, operation.operationId, options.now?.() ?? Date.now());
        await options.saveProgress(progress);
      } catch (error) {
        return { status: 'paused', progress, error };
      }
    }
  }
  if (options.cleanupReferences) {
    for (const reference of options.cleanupReferences) {
      await acknowledgeGuestSourceRecord(guestStorage, {
        operationId: `dedup-${reference.domain}-${reference.recordId}`, domain: reference.domain, operationType: 'delete', recordId: reference.recordId,
        payload: null, createdAt: 0, attemptCount: 0, lastAttemptedAt: null, lastErrorMessage: null, status: 'acknowledged', expectedRevision: null,
      });
    }
  }
  return { status: 'completed', progress };
}

function updateOperation(progress: GuestImportProgress, operationId: string, update: (operation: GuestImportOperationProgress) => GuestImportOperationProgress): GuestImportProgress {
  return { ...progress, operations: progress.operations.map((item) => item.operationId === operationId ? update(item) : item) };
}

function markCleaned(progress: GuestImportProgress, operationId: string, at: number): GuestImportProgress {
  return updateOperation(progress, operationId, (item) => ({ ...item, sourceCleanupStatus: 'completed' as GuestImportSourceCleanupStatus, sourceCleanupCompletedAt: at }));
}

async function acknowledgeGuestSourceRecord(storage: KeyValueStorage, operation: GuestImportOperationProgress): Promise<void> {
  if (operation.domain === 'profile') {
    const loaded = await loadUserProfile(storage);
    const profile = loaded.value;
    if (operation.recordId === '__profile__' || operation.payload?.user_id === operation.recordId) {
      await saveUserProfile(storage, {
        ...INITIAL_USER_PROFILE,
        selectedTrickIds: profile.selectedTrickIds,
        manuallyUnlockedTrickIds: profile.manuallyUnlockedTrickIds,
      });
    } else {
      await saveUserProfile(storage, {
        ...profile,
        selectedTrickIds: profile.selectedTrickIds.filter((id) => id !== operation.recordId),
        manuallyUnlockedTrickIds: profile.manuallyUnlockedTrickIds?.filter((id) => id !== operation.recordId),
      });
    }
    return;
  }
  if (operation.domain === 'customTricks') {
    const loaded = await loadCustomTricks(storage); await saveCustomTricks(storage, { tricks: loaded.value.tricks.filter((item) => item.id !== operation.recordId) }); return;
  }
  if (operation.domain === 'practiceHistory') {
    const loaded = await loadPracticeHistory(storage); await savePracticeHistory(storage, { sessions: loaded.value.sessions.filter((item) => item.id !== operation.recordId) }); return;
  }
  if (operation.domain === 'goals') {
    const loaded = await loadGoals(storage); await saveGoals(storage, { goals: loaded.value.goals.filter((item) => item.id !== operation.recordId) }); return;
  }
  const loaded = await loadNotes(storage); await saveNotes(storage, { notes: loaded.value.notes.filter((item) => item.id !== operation.recordId) });
}
