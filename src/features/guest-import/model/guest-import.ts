// T159.1: pure reducer/state-machine for resumable guest-to-account import.
// Mirrors src/shared/sync/coordinator.ts's style and doc-comment
// conventions closely: no React, no Supabase/network calls, no timers, no
// Date.now() -- every timestamp/id is supplied by the caller. A future
// driver (state/use-guest-import.ts) wraps this the way use-sync-coordinator.ts
// wraps syncCoordinatorReducer.
//
// This ticket only models the state machine end-to-end. Later tickets
// (T159.2-T159.5) plug a real inventory/upload/conflict-resolution effect
// into an already-correct set of transitions -- notably, nothing in this
// file ever drives 'uploading' to completion with real data; that's the
// driver hook (and later tickets') job.

import { SYNC_DOMAINS, type SyncDomain } from '@/shared/sync/domain';
import type { OutboxOperationType } from '@/shared/sync/outbox-operation';

export type GuestImportOperationStatus = 'pending' | 'acknowledged';

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
  | 'awaitingProfileChoice'
  | 'conflicts'
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

export interface GuestImportConflict {
  readonly domain: SyncDomain;
  readonly recordId: string;
}

export interface GuestImportState {
  readonly status: GuestImportStatus;
  readonly importId: string | undefined;
  readonly ownerIdentityNamespace: string | undefined;
  readonly inventory: GuestImportDomainCounts | undefined;
  readonly targetKind: GuestImportTargetKind | undefined;
  readonly domainOutcomes: Readonly<Partial<Record<SyncDomain, GuestImportDomainOutcome>>>;
  readonly profileChoice: 'guest' | 'cloud' | undefined;
  readonly conflicts: readonly GuestImportConflict[];
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
  profileChoice: undefined,
  conflicts: [],
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
      readonly type: 'domainUploadSettled';
      readonly importId: string;
      readonly domain: SyncDomain;
      readonly outcome: GuestImportDomainOutcome;
      readonly now: number;
    }
  | {
      readonly type: 'profileChoiceMade';
      readonly importId: string;
      readonly choice: 'guest' | 'cloud';
      readonly now: number;
    }
  | { readonly type: 'conflictsResolved'; readonly importId: string; readonly now: number }
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
      return { ...state, progress: action.progress, updatedAt: action.now };
    }

    case 'domainUploadSettled': {
      if (state.status !== 'uploading' || state.importId !== action.importId) return state;

      const domainOutcomes = { ...state.domainOutcomes, [action.domain]: action.outcome };

      if (!allDomainsSettled(domainOutcomes)) {
        return { ...state, domainOutcomes, updatedAt: action.now };
      }

      return {
        ...state,
        status: state.targetKind === 'empty' ? 'completed' : 'awaitingProfileChoice',
        domainOutcomes,
        updatedAt: action.now,
      };
    }

    case 'profileChoiceMade': {
      if (state.status !== 'awaitingProfileChoice' || state.importId !== action.importId) return state;
      return {
        ...state,
        status: state.conflicts.length > 0 ? 'conflicts' : 'completed',
        profileChoice: action.choice,
        updatedAt: action.now,
      };
    }

    case 'conflictsResolved': {
      if (state.status !== 'conflicts' || state.importId !== action.importId) return state;
      return { ...state, status: 'completed', updatedAt: action.now };
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
