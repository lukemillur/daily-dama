import { mapUserProfileToProfileUpsertInput, type ProfileScalarFields } from '@/features/profile/persistence/profile-cloud-mapping';
import type { GuestImportChoice, GuestImportConflict, GuestImportOperationProgress, GuestImportProfileComparison, GuestImportProgress } from '@/features/guest-import/model/guest-import';
import { createOutboxOperation } from '@/shared/sync/outbox-operation';
import type { GuestImportRepositories } from '@/features/guest-import/persistence/guest-import-empty-account';
import { runEmptyGuestImport } from '@/features/guest-import/persistence/guest-import-empty-account';
import type { KeyValueStorage } from '@/shared/persistence/storage';
import type { Identity } from '@/shared/persistence/identity';
import { SYNC_DOMAINS, type SyncDomain } from '@/shared/sync/domain';
import { pushOutboxOperations, type SyncTransportRepository } from '@/shared/sync/transport';
import type { OutboxOperation } from '@/shared/sync/outbox-operation';

export interface ProfileChoicePlan {
  readonly choice: GuestImportChoice;
  readonly operation: GuestImportOperationProgress | null;
}

/** Builds the only profile mutation allowed by the guest-import choice. */
export function planProfileChoice(options: {
  readonly comparison: GuestImportProfileComparison;
  readonly choice: GuestImportChoice;
  readonly destinationUserId: string;
  readonly expectedRevision: number | null;
  readonly operationId: string;
  readonly createdAt: number;
}): ProfileChoicePlan {
  if (options.choice === 'cloud') return { choice: 'cloud', operation: null };
  const payload = mapUserProfileToProfileUpsertInput(
    { ...(options.comparison.guest as unknown as ProfileScalarFields), selectedTrickIds: [] },
    options.destinationUserId,
  ) as unknown as Record<string, unknown>;
  return {
    choice: 'guest',
    operation: {
      ...createOutboxOperation(options.operationId, { domain: 'profile', operationType: 'upsert', recordId: options.destinationUserId, payload }, options.createdAt),
      status: 'pending',
      expectedRevision: options.comparison.cloud === null ? null : options.expectedRevision,
    },
  };
}

export interface ConflictChoicePlan {
  readonly choice: GuestImportChoice;
  readonly operation: GuestImportOperationProgress | null;
}

export function planConflictChoice(options: {
  readonly conflict: GuestImportConflict;
  readonly choice: GuestImportChoice;
  readonly operation: GuestImportOperationProgress | null;
}): ConflictChoicePlan {
  if (options.choice === 'cloud') return { choice: 'cloud', operation: null };
  if (options.operation === null) throw new Error('A keep-guest conflict choice requires a prepared operation.');
  return { choice: 'guest', operation: { ...options.operation, expectedRevision: options.conflict.cloudRevision } };
}

export interface ExistingGuestImportRunOptions {
  readonly storage?: KeyValueStorage;
  readonly destinationIdentity?: Identity;
  readonly destinationUserId?: string;
  readonly progress: GuestImportProgress;
  readonly repositories: GuestImportRepositories;
  readonly saveProgress: (progress: GuestImportProgress) => Promise<void>;
  readonly conflicts: readonly GuestImportConflict[];
  readonly resolutions: readonly { readonly domain: SyncDomain; readonly recordId: string; readonly choice: GuestImportChoice }[];
  readonly profileChoice?: GuestImportChoice;
  readonly profileOperation?: GuestImportOperationProgress | null;
  readonly beforeOperation?: (operation: GuestImportOperationProgress) => Promise<void>;
  readonly beforeRequest?: (operation: GuestImportOperationProgress) => Promise<void>;
  readonly now?: () => number;
  readonly cleanupReferences?: readonly { readonly domain: SyncDomain; readonly recordId: string }[];
}

/** Runs safe accepted records independently. It intentionally never deletes guest data. */
export async function runExistingGuestImport(options: ExistingGuestImportRunOptions): Promise<GuestImportProgress> {
  let progress = options.progress;
  const selected = new Map(options.resolutions.map((item) => [`${item.domain}:${item.recordId}`, item]));
  const conflictByKey = new Map(options.conflicts.map((item) => [`${item.domain}:${item.recordId}`, item]));
  const operations = [...progress.operations];
  for (const [key, resolution] of selected) {
    if (resolution.choice !== 'guest' || operations.some((item) => item.domain === resolution.domain && item.recordId === resolution.recordId)) continue;
    const conflict = conflictByKey.get(key);
    if (!conflict) continue;
    operations.push({
      ...createOutboxOperation(`guest-import-${options.progress.destinationIdentityNamespace}-${resolution.domain}-${resolution.recordId}`, { domain: resolution.domain, operationType: 'upsert', recordId: resolution.recordId, payload: conflict.guestSnapshot as Record<string, unknown> }, options.progress.operations[0]?.createdAt ?? 0),
      status: 'pending', expectedRevision: conflict.cloudRevision,
    });
  }
  if (options.profileChoice === 'guest' && options.profileOperation && !operations.some((item) => item.operationId === options.profileOperation?.operationId)) operations.push(options.profileOperation);
  operations.sort((a, b) => SYNC_DOMAINS.indexOf(a.domain) - SYNC_DOMAINS.indexOf(b.domain) || a.recordId.localeCompare(b.recordId));
  progress = { ...progress, operations };
  if (options.storage && options.destinationIdentity && options.destinationUserId) {
    const result = await runEmptyGuestImport({
      storage: options.storage, destinationIdentity: options.destinationIdentity, destinationUserId: options.destinationUserId,
      progress: { ...progress, operations }, repositories: options.repositories, saveProgress: options.saveProgress,
      beforeOperation: options.beforeOperation, beforeRequest: options.beforeRequest, now: options.now,
      cleanupReferences: options.cleanupReferences,
    });
    return result.progress;
  }
  for (const domain of SYNC_DOMAINS) {
    const repository = options.repositories[domain] as SyncTransportRepository<unknown>;
    for (const operation of progress.operations.filter((item) => item.domain === domain && item.status === 'pending')) {
      await options.saveProgress(progress);
      const result = (await pushOutboxOperations(repository, [operation as OutboxOperation], { getExpectedRevision: (item) => progress.operations.find((candidate) => candidate.operationId === item.operationId)?.expectedRevision ?? null })).outcomes[0].result;
      if (result.status !== 'succeeded') continue;
      progress = { ...progress, operations: progress.operations.map((item) => item.operationId === operation.operationId ? { ...item, status: 'acknowledged' as const } : item) };
      await options.saveProgress(progress);
    }
  }
  return progress;
}
