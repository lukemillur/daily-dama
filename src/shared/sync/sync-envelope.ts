import {
  createOutboxOperation,
  createOutboxOperationId,
  isOutboxOperation,
  type NewOutboxOperationInput,
  type OutboxOperation,
  type OutboxFailureKind,
} from '@/shared/sync/outbox-operation';
import type { SyncDomain } from '@/shared/sync/domain';
import { identityNamespace, type Identity } from '@/shared/persistence/identity';
import type {
  KeyValueStorage,
  PersistenceLoadResult,
  PersistenceSaveResult,
} from '@/shared/persistence/storage';

export const SYNC_ENVELOPE_SCHEMA_VERSION = 1;

/**
 * Pairs one domain's local state with its FIFO outbox and pull cursor in a
 * single document, so a state change and its operation can only ever be
 * persisted (and reloaded) together. One `SyncEnvelope<State>` instance is
 * created per domain -- this is deliberately not a shared cross-domain
 * structure; see `src/shared/persistence/*` domain-independence rules.
 */
export interface SyncEnvelope<State> {
  readonly version: typeof SYNC_ENVELOPE_SCHEMA_VERSION;
  readonly domain: SyncDomain;
  readonly identityNamespace: string; // identityNamespace(identity) baked in at write time
  readonly state: State;
  readonly outbox: readonly OutboxOperation[]; // FIFO: index 0 is oldest/next-to-send
  readonly cursor: string | null;
  readonly cursorUpdatedAt: number | null;
}

export interface SyncEnvelopeCodec<State> {
  readonly isState: (value: unknown) => value is State;
}

export type SyncEnvelopeRejectionReason = 'identityMismatch' | 'domainMismatch' | 'notFound';

export type SyncEnvelopeMutationResult<State> =
  | { readonly status: 'applied'; readonly envelope: SyncEnvelope<State> }
  | { readonly status: 'rejected'; readonly reason: SyncEnvelopeRejectionReason };

function checkIdentity<State>(envelope: SyncEnvelope<State>, identity: Identity): boolean {
  return envelope.identityNamespace === identityNamespace(identity);
}

export function createInitialSyncEnvelope<State>(
  domain: SyncDomain,
  identity: Identity,
  initialState: State,
): SyncEnvelope<State> {
  return {
    version: SYNC_ENVELOPE_SCHEMA_VERSION,
    domain,
    identityNamespace: identityNamespace(identity),
    state: initialState,
    outbox: [],
    cursor: null,
    cursorUpdatedAt: null,
  };
}

// THE atomic pairing: appends one outbox operation and swaps in the new
// domain state in a single new envelope object. Callers must persist the
// *returned* envelope via one saveSyncEnvelope call -- never save `state`
// and the outbox separately -- so a state change and its operation can never
// land on only one side of a crash/reload boundary.
export function applyLocalMutation<State>(
  envelope: SyncEnvelope<State>,
  identity: Identity,
  nextState: State,
  operationInput: NewOutboxOperationInput,
  createdAt: number,
  operationId: string = createOutboxOperationId(createdAt),
): SyncEnvelopeMutationResult<State> {
  if (!checkIdentity(envelope, identity)) return { status: 'rejected', reason: 'identityMismatch' };
  if (operationInput.domain !== envelope.domain) return { status: 'rejected', reason: 'domainMismatch' };

  const operation = createOutboxOperation(operationId, operationInput, createdAt);
  return {
    status: 'applied',
    envelope: { ...envelope, state: nextState, outbox: [...envelope.outbox, operation] },
  };
}

// Like applyLocalMutation, but coalesces to at most one pending operation
// per (domain, recordId) instead of always appending. A burst of rapid local
// edits to the same record (e.g. toggling one trick's selection on/off
// repeatedly offline) must not pile up N distinct pending outbox operations
// for that recordId -- doing so would require pushOutboxOperations' callers
// to track a mid-batch-mutating expected revision per operation, which the
// transport contract doesn't support. Any existing pending entry for
// `operationInput.recordId` (within this envelope's own domain -- operations
// for other domains never coexist in one envelope) is removed first, then
// the fresh one is appended, preserving FIFO order for every other record.
export function replacePendingOperationForRecord<State>(
  envelope: SyncEnvelope<State>,
  identity: Identity,
  nextState: State,
  operationInput: NewOutboxOperationInput,
  createdAt: number,
  operationId: string = createOutboxOperationId(createdAt),
): SyncEnvelopeMutationResult<State> {
  if (!checkIdentity(envelope, identity)) return { status: 'rejected', reason: 'identityMismatch' };
  if (operationInput.domain !== envelope.domain) return { status: 'rejected', reason: 'domainMismatch' };

  const operation = createOutboxOperation(operationId, operationInput, createdAt);
  const outboxWithoutExistingPending = envelope.outbox.filter(
    (op) => op.recordId !== operationInput.recordId,
  );
  return {
    status: 'applied',
    envelope: {
      ...envelope,
      state: nextState,
      outbox: [...outboxWithoutExistingPending, operation],
    },
  };
}

// Acknowledging removes the operation from the outbox entirely -- there is
// no persisted "acknowledged" status to accumulate forever. While present in
// `outbox`, an operation is pending; once a server ack is applied here, it
// is gone.
export function acknowledgeOutboxOperation<State>(
  envelope: SyncEnvelope<State>,
  identity: Identity,
  operationId: string,
): SyncEnvelopeMutationResult<State> {
  if (!checkIdentity(envelope, identity)) return { status: 'rejected', reason: 'identityMismatch' };
  if (!envelope.outbox.some((op) => op.operationId === operationId)) {
    return { status: 'rejected', reason: 'notFound' };
  }
  return {
    status: 'applied',
    envelope: { ...envelope, outbox: envelope.outbox.filter((op) => op.operationId !== operationId) },
  };
}

// operationId is preserved untouched -- this is what makes retries
// idempotent from the server's point of view.
export function recordOutboxOperationAttempt<State>(
  envelope: SyncEnvelope<State>,
  identity: Identity,
  operationId: string,
  attemptedAt: number,
  errorMessage: string | null,
  failureKind: OutboxFailureKind | null = null,
): SyncEnvelopeMutationResult<State> {
  if (!checkIdentity(envelope, identity)) return { status: 'rejected', reason: 'identityMismatch' };
  const index = envelope.outbox.findIndex((op) => op.operationId === operationId);
  if (index === -1) return { status: 'rejected', reason: 'notFound' };

  const outbox = envelope.outbox.slice();
  outbox[index] = {
    ...outbox[index],
    attemptCount: outbox[index].attemptCount + 1,
    lastAttemptedAt: attemptedAt,
    lastErrorMessage: errorMessage,
    lastFailureKind: failureKind,
  };
  return { status: 'applied', envelope: { ...envelope, outbox } };
}

// Discarding an outbox is unconditional: these operations were never
// applied server-side, so there is no revision-cache bookkeeping to touch,
// unlike acknowledgeOutboxOperation (a real server ack). The domain own
// primary reducer state is untouched -- discarding only clears the sync
// obligation, not any already-applied local edit.
export function discardPendingOperations<State>(
  envelope: SyncEnvelope<State>,
  identity: Identity,
): SyncEnvelopeMutationResult<State> {
  if (!checkIdentity(envelope, identity)) return { status: 'rejected', reason: 'identityMismatch' }
  return { status: 'applied', envelope: { ...envelope, outbox: [] } }
}

export function updateSyncCursor<State>(
  envelope: SyncEnvelope<State>,
  identity: Identity,
  cursor: string | null,
  updatedAt: number,
): SyncEnvelopeMutationResult<State> {
  if (!checkIdentity(envelope, identity)) return { status: 'rejected', reason: 'identityMismatch' };
  return { status: 'applied', envelope: { ...envelope, cursor, cursorUpdatedAt: updatedAt } };
}

export type SyncEnvelopeAction<State> =
  | { readonly type: 'envelopeRestored'; readonly envelope: SyncEnvelope<State> }
  | {
      readonly type: 'localMutationApplied';
      readonly identity: Identity;
      readonly now: number;
      readonly nextSnapshot: State;
      readonly operationInputs: readonly NewOutboxOperationInput[];
      readonly operationIds: readonly string[];
    }
  | { readonly type: 'operationAcknowledged'; readonly identity: Identity; readonly operationId: string }
  | {
      readonly type: 'operationAttemptRecorded';
      readonly identity: Identity;
      readonly operationId: string;
      readonly attemptedAt: number;
      readonly errorMessage: string | null;
      readonly failureKind?: OutboxFailureKind | null;
    }
  | { readonly type: 'revisionRecorded'; readonly snapshot: State }
  | {
      readonly type: 'cursorUpdated';
      readonly identity: Identity;
      readonly cursor: string | null;
      readonly updatedAt: number;
    }
  | { readonly type: 'outboxDiscarded'; readonly identity: Identity };

/**
 * Shared reducer for the five independent domain envelopes. Domain providers
 * retain their own typed action aliases and persistence lifecycle, while this
 * function is the single authority for identical outbox/cursor transitions.
 */
export function syncEnvelopeReducer<State>(
  state: SyncEnvelope<State>,
  action: SyncEnvelopeAction<State>,
): SyncEnvelope<State> {
  switch (action.type) {
    case 'envelopeRestored':
      return action.envelope;

    case 'localMutationApplied': {
      if (action.operationInputs.length !== action.operationIds.length) return state;

      let next = state;
      for (let index = 0; index < action.operationInputs.length; index += 1) {
        const result = replacePendingOperationForRecord(
          next,
          action.identity,
          action.nextSnapshot,
          action.operationInputs[index],
          action.now,
          action.operationIds[index],
        );
        if (result.status !== 'applied') return state;
        next = result.envelope;
      }
      return next;
    }

    case 'operationAcknowledged': {
      const result = acknowledgeOutboxOperation(state, action.identity, action.operationId);
      return result.status === 'applied' ? result.envelope : state;
    }

    case 'operationAttemptRecorded': {
      const result = recordOutboxOperationAttempt(
        state,
        action.identity,
        action.operationId,
        action.attemptedAt,
        action.errorMessage,
        action.failureKind ?? null,
      );
      return result.status === 'applied' ? result.envelope : state;
    }

    case 'revisionRecorded':
      return { ...state, state: action.snapshot };

    case 'cursorUpdated': {
      const result = updateSyncCursor(state, action.identity, action.cursor, action.updatedAt);
      return result.status === 'applied' ? result.envelope : state;
    }

    case 'outboxDiscarded': {
      const result = discardPendingOperations(state, action.identity);
      return result.status === 'applied' ? result.envelope : state;
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidSyncEnvelopeShape<State>(
  value: unknown,
  domain: SyncDomain,
  codec: SyncEnvelopeCodec<State>,
): value is SyncEnvelope<State> {
  if (!isRecord(value)) return false;
  if (value.version !== SYNC_ENVELOPE_SCHEMA_VERSION) return false;
  if (value.domain !== domain) return false;
  if (typeof value.identityNamespace !== 'string' || value.identityNamespace.length === 0) return false;
  if (!codec.isState(value.state)) return false;
  if (!Array.isArray(value.outbox) || !value.outbox.every(isOutboxOperation)) return false;

  const outbox = value.outbox as OutboxOperation[];
  if (!outbox.every((op) => op.domain === domain)) return false;
  const ids = outbox.map((op) => op.operationId);
  if (new Set(ids).size !== ids.length) return false; // duplicate operationId => corrupted envelope

  if (value.cursor !== null && typeof value.cursor !== 'string') return false;
  if (value.cursorUpdatedAt !== null && typeof value.cursorUpdatedAt !== 'number') return false;
  return true;
}

export function serializeSyncEnvelope<State>(envelope: SyncEnvelope<State>): string {
  return JSON.stringify(envelope);
}

export function deserializeSyncEnvelope<State>(
  serialized: string,
  domain: SyncDomain,
  codec: SyncEnvelopeCodec<State>,
): SyncEnvelope<State> | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    return undefined;
  }
  if (!isValidSyncEnvelopeShape(parsed, domain, codec)) return undefined;
  return parsed;
}

export async function loadSyncEnvelope<State>(
  storage: KeyValueStorage,
  storageKey: string,
  domain: SyncDomain,
  codec: SyncEnvelopeCodec<State>,
  identity: Identity,
  initialState: State,
): Promise<PersistenceLoadResult<SyncEnvelope<State>>> {
  try {
    const serialized = await storage.getItem(storageKey);
    if (serialized === null) {
      return { status: 'empty', value: createInitialSyncEnvelope(domain, identity, initialState) };
    }

    const envelope = deserializeSyncEnvelope(serialized, domain, codec);
    if (!envelope) {
      return {
        status: 'recovered',
        value: createInitialSyncEnvelope(domain, identity, initialState),
        error: new Error('The persisted sync envelope is malformed or uses an unsupported version.'),
      };
    }

    // Defense in depth on top of physical key namespacing (scoped-storage.ts):
    // even if `storage` were ever misconfigured/shared, an envelope tagged
    // for a different identity must never be treated as loaded.
    if (!checkIdentity(envelope, identity)) {
      return {
        status: 'recovered',
        value: createInitialSyncEnvelope(domain, identity, initialState),
        error: new Error('The persisted sync envelope belongs to a different identity.'),
      };
    }

    return { status: 'loaded', value: envelope };
  } catch (error) {
    return { status: 'recovered', value: createInitialSyncEnvelope(domain, identity, initialState), error };
  }
}

export async function saveSyncEnvelope<State>(
  storage: KeyValueStorage,
  storageKey: string,
  envelope: SyncEnvelope<State>,
): Promise<PersistenceSaveResult> {
  try {
    await storage.setItem(storageKey, serializeSyncEnvelope(envelope));
    return { status: 'saved' };
  } catch (error) {
    return { status: 'failed', error };
  }
}
