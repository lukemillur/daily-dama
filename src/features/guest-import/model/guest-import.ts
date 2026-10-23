// Pure reducer/state-machine for resumable guest-to-account import.
// Mirrors src/shared/sync/coordinator.ts's style and doc-comment
// conventions closely: no React, no Supabase/network calls, no timers, no
// Date.now() -- every timestamp/id is supplied by the caller. The driver
// (state/use-guest-import.ts) wraps this the way use-sync-coordinator.ts
// wraps syncCoordinatorReducer and owns the inventory, upload, and
// conflict-resolution effects. Nothing in this file drives 'uploading' to
// completion with real data.

import { SYNC_DOMAINS, type SyncDomain } from '@/shared/sync/domain';
import type { OutboxOperationType } from '@/shared/sync/outbox-operation';

export type GuestImportOperationStatus = 'pending' | 'acknowledged' | 'rejected';
export type GuestImportSourceCleanupStatus = 'pending' | 'completed' | 'retained';

export interface GuestImportOperationProgress {
  readonly operationId: string;
  readonly domain: SyncDomain;
  readonly operationType: OutboxOperationType;
  readonly recordId: string;
  readonly payload: Record<string, unknown> | null;
  readonly createdAt: number;
  readonly attemptCount: number;
  readonly lastAttemptedAt: number | null;
  readonly lastErrorMessage: string | null;
  readonly lastFailureKind?: 'retryable' | 'conflict' | null;
  readonly status: GuestImportOperationStatus;
  /** Source ownership is separate from destination acknowledgement. */
  readonly sourceCleanupStatus?: GuestImportSourceCleanupStatus;
  readonly acknowledgedAt?: number | null;
  readonly sourceCleanupCompletedAt?: number | null;
  readonly expectedRevision: number | null;
}

export interface GuestImportProgress {
  readonly sourceIdentityNamespace: 'guest';
  readonly destinationIdentityNamespace: string;
  readonly operations: readonly GuestImportOperationProgress[];
}

export type GuestImportStatus =
  | 'idle'
  | 'inventorying'
  | 'awaitingConfirmation'
  | 'uploading'
  | 'completed'
  | 'cancelled';

export type GuestImportTargetKind = 'empty' | 'existing';

export type GuestImportDomainCounts = Readonly<
  Record<SyncDomain, { readonly local: number; readonly cloud: number }>
>;

export interface GuestImportDomainOutcome {
  readonly status: 'pending' | 'succeeded' | 'failed' | 'conflict';
  readonly errorMessage: string | undefined;
}

export interface GuestImportRecordReference {
  readonly domain: SyncDomain;
  readonly recordId: string;
}

export type GuestImportChoice = 'guest' | 'cloud';

export interface GuestImportState {
  readonly status: GuestImportStatus;
  readonly importId: string | undefined;
  readonly ownerIdentityNamespace: string | undefined;
  readonly inventory: GuestImportDomainCounts | undefined;
  readonly targetKind: GuestImportTargetKind | undefined;
  readonly domainOutcomes: Readonly<Partial<Record<SyncDomain, GuestImportDomainOutcome>>>;
  readonly deduplications: readonly GuestImportRecordReference[];
  readonly errorMessage: string | undefined;
  readonly startedAt: number | undefined;
  readonly updatedAt: number | undefined;
  readonly progress?: GuestImportProgress;
}

export const INITIAL_GUEST_IMPORT_STATE: GuestImportState = {
  status: 'idle',
  importId: undefined,
  ownerIdentityNamespace: undefined,
  inventory: undefined,
  targetKind: undefined,
  domainOutcomes: {},
  deduplications: [],
  errorMessage: undefined,
  startedAt: undefined,
  updatedAt: undefined,
  progress: undefined,
};

export type GuestImportAction =
  | { readonly type: 'importRequested'; readonly importId: string; readonly identityNamespace: string; readonly now: number }
  | { readonly type: 'inventoryFailed'; readonly importId: string; readonly errorMessage: string; readonly now: number }
  | {
      readonly type: 'inventoryCompleted';
      readonly importId: string;
      readonly inventory: GuestImportDomainCounts;
      readonly now: number;
    }
  | { readonly type: 'confirmPressed'; readonly importId: string; readonly now: number }
  | { readonly type: 'progressPrepared'; readonly importId: string; readonly progress: GuestImportProgress; readonly now: number }
  | { readonly type: 'progressUpdated'; readonly importId: string; readonly progress: GuestImportProgress; readonly now: number }
  | {
      readonly type: 'existingMergePrepared';
      readonly importId: string;
      readonly progress: GuestImportProgress;
      readonly deduplications: readonly GuestImportRecordReference[];
      readonly now: number;
    }
  | {
      readonly type: 'domainUploadSettled';
      readonly importId: string;
      readonly domain: SyncDomain;
      readonly outcome: GuestImportDomainOutcome;
      readonly now: number;
    }
  | { readonly type: 'uploadFailed'; readonly importId: string; readonly errorMessage: string; readonly now: number }
  | { readonly type: 'cancelPressed'; readonly importId: string; readonly now: number }
  | { readonly type: 'dismissPressed' }
  | { readonly type: 'stateRestored'; readonly state: GuestImportState }
  | { readonly type: 'resumeRequested'; readonly persisted: GuestImportState; readonly identityNamespace: string }
  | { readonly type: 'identityChanged'; readonly identityNamespace: string };

function deriveTargetKind(inventory: GuestImportDomainCounts): GuestImportTargetKind {
  const isEmpty = SYNC_DOMAINS.every((domain) => inventory[domain].cloud === 0);
  return isEmpty ? 'empty' : 'existing';
}

function initialDomainOutcomes(): Readonly<Partial<Record<SyncDomain, GuestImportDomainOutcome>>> {
  const outcomes: Partial<Record<SyncDomain, GuestImportDomainOutcome>> = { };
  for (const domain of SYNC_DOMAINS) {
    outcomes[domain] = { status: 'pending', errorMessage: undefined };
  }
  return outcomes;
}

function allDomainsSettled(domainOutcomes: Readonly<Partial<Record<SyncDomain, GuestImportDomainOutcome>>>): boolean {
  return SYNC_DOMAINS.every((domain) => {
    const outcome = domainOutcomes[domain];
    return outcome !== undefined && outcome.status !== 'pending';
  });
}

function operationsSettled(state: GuestImportState): boolean {
  return (state.progress?.operations ?? []).every((operation) =>
    operation.status === 'rejected' ||
    (operation.status === 'acknowledged' &&
      (operation.sourceCleanupStatus === 'completed' || operation.sourceCleanupStatus === 'retained')),
  );
}

// `state.status === 'uploading'` is deliberately excluded here for
// progressPrepared/progressUpdated below: those actions never move status
// themselves, so gating strictly on "not literally uploading anymore" means
// a mid-upload progress update can never prematurely complete an import
// before domainUploadSettled has had its own say (see that case, which
// checks `operationsSettled` directly instead, since it's the one action
// that's actually allowed to leave 'uploading').
export function isGuestImportFinalizable(state: GuestImportState): boolean {
  if (state.status === 'uploading') return false;
  return operationsSettled(state);
}

export function guestImportReducer(state: GuestImportState, action: GuestImportAction): GuestImportState {
  switch (action.type) {
    case 'importRequested': {
      if (state.status !== 'idle') return state;
      return {
        ...INITIAL_GUEST_IMPORT_STATE,
        status: 'inventorying',
        importId: action.importId,
        ownerIdentityNamespace: action.identityNamespace,
        startedAt: action.now,
        updatedAt: action.now,
      };
    }

    case 'inventoryFailed': {
      if (state.status !== 'inventorying' || state.importId !== action.importId) return state;
      return {
        ...INITIAL_GUEST_IMPORT_STATE,
        status: 'idle',
        errorMessage: action.errorMessage,
        updatedAt: action.now,
      };
    }

    case 'inventoryCompleted': {
      if (state.status !== 'inventorying' || state.importId !== action.importId) return state;
      return {
        ...state,
        status: 'awaitingConfirmation',
        inventory: action.inventory,
        targetKind: deriveTargetKind(action.inventory),
        errorMessage: undefined,
        updatedAt: action.now,
      };
    }

    case 'confirmPressed': {
      if (state.status !== 'awaitingConfirmation' || state.importId !== action.importId) return state;
      return {
        ...state,
        status: 'uploading',
        domainOutcomes: initialDomainOutcomes(),
        updatedAt: action.now,
      };
    }

    case 'progressPrepared':
    case 'progressUpdated': {
      if (state.importId !== action.importId) return state;
      const next = { ...state, progress: action.progress, updatedAt: action.now };
      return isGuestImportFinalizable(next) ? { ...next, status: 'completed' } : next;
    }

    case 'existingMergePrepared': {
      if (state.status !== 'uploading' || state.importId !== action.importId) return state;
      return {
        ...state,
        progress: action.progress,
        deduplications: action.deduplications,
        updatedAt: action.now,
      };
    }

    case 'domainUploadSettled': {
      if (state.status !== 'uploading' || state.importId !== action.importId) return state;

      const domainOutcomes = { ...state.domainOutcomes, [action.domain]: action.outcome };

      if (!allDomainsSettled(domainOutcomes)) {
        return { ...state, domainOutcomes, updatedAt: action.now };
      }

      const next = { ...state, domainOutcomes, updatedAt: action.now };
      return operationsSettled(next) ? { ...next, status: 'completed' } : next;
    }

    // Mirrors 'inventoryFailed' exactly: any thrown error during the
    // upload phase (mid-upload exception, not a per-domain outcome) resets
    // to idle rather than being force-fit into domainUploadSettled's
    // per-domain vocabulary -- see use-guest-import.ts's upload effect
    // catch block for why a
    // domainUploadSettled shortcut here would be a worse, silent bug
    // (operationsSettled vacuously true on an empty/never-populated
    // operations list).
    case 'uploadFailed': {
      if (state.status !== 'uploading' || state.importId !== action.importId) return state;
      return {
        ...INITIAL_GUEST_IMPORT_STATE,
        status: 'idle',
        errorMessage: action.errorMessage,
        updatedAt: action.now,
      };
    }

    case 'cancelPressed': {
      if (state.status !== 'awaitingConfirmation' || state.importId !== action.importId) return state;
      return { ...state, status: 'cancelled', updatedAt: action.now };
    }

    case 'dismissPressed': {
      if (state.status !== 'completed' && state.status !== 'cancelled') return state;
      return INITIAL_GUEST_IMPORT_STATE;
    }

    case 'stateRestored': {
      return action.state;
    }

    case 'resumeRequested': {
      if (state.status !== 'idle') return state;
      if (action.persisted.ownerIdentityNamespace !== action.identityNamespace) return state;
      return action.persisted;
    }

    case 'identityChanged': {
      if (state.ownerIdentityNamespace === undefined) return state;
      if (state.ownerIdentityNamespace === action.identityNamespace) return state;
      if (state.status === 'idle' || state.status === 'completed' || state.status === 'cancelled') return state;
      return INITIAL_GUEST_IMPORT_STATE;
    }

    default:
      return state;
  }
}

export function createGuestImportId(now = Date.now(), random = Math.random()): string {
  return `guest-import-${now.toString(36)}-${Math.floor(random * 0x100000000).toString(36)}`;
}

// Centralizes the "does this inventory have any local-only data
// worth importing" check that both the auto-confirm effect
// (state/use-guest-import.ts) and the onboarding gate (app/app/home.tsx)
// need, so it isn't duplicated ad hoc the way GuestImportPreview's own
// domainsWithLocalData used to be.
export function hasAnyLocalGuestData(inventory: GuestImportDomainCounts): boolean {
  return SYNC_DOMAINS.some((domain) => inventory[domain].local > 0);
}

// True whenever a guest import is either actively running or
// parked at awaitingConfirmation with local data still to auto-confirm --
// i.e. whenever home.tsx's onboarding gate must wait rather than risk
// showing onboarding a second time to someone with existing local data.
// An awaitingConfirmation record with an all-zero inventory is
// permanently parked and must NOT be treated as pending here, or the gate would
// wedge forever.
export function isGuestImportPendingResolution(state: GuestImportState): boolean {
  switch (state.status) {
    case 'inventorying':
    case 'uploading':
      return true;
    case 'awaitingConfirmation':
      return state.inventory !== undefined && hasAnyLocalGuestData(state.inventory);
    default:
      return false;
  }
}
