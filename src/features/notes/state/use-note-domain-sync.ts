// T157.8: the notes-domain-local sync driver. Owns pull-then-push cycles
// against an injected transport and the parallel
// `SyncEnvelope<NoteSyncSnapshot>` domain, while the PRIMARY `NoteCollection`
// reducer (owned by `note-provider.tsx`) stays the sole source of truth
// rendered by the app. Structurally a near-mechanical adaptation of
// `use-goal-domain-sync.ts` (T157.7), with the same required
// tombstone-filtering step in the pull-adopt branch (goals already needed
// this; custom-tricks did not). See `.claude/plans/T157.8.md` "The driver
// hook" for the full design.
//
// Deliberately NOT the shared `syncCoordinatorReducer` (T157.9's job -- that
// reducer only reaches `idle` once all five SYNC_DOMAINS report settled).
// This hook's `runSync` return value is already shaped like
// `DomainSyncRecord` so T157.9 can plug it in later with no reshaping.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import type { NoteAction, NoteCollection } from '@/features/notes/model/note';
import {
  diffNotesForOutboxOperations,
  mapNoteRowToDomainEntry,
  mapNoteRowsToDomainCollection,
} from '@/features/notes/persistence/note-cloud-mapping';
import type { NoteRow } from '@/features/notes/persistence/note-cloud-repository';
import {
  createInitialNoteSyncSnapshot,
  loadNoteSyncEnvelope,
  noteSyncEnvelopeReducer,
  saveNoteSyncEnvelope,
  type NoteSyncEnvelopeAction,
  type NoteSyncSnapshot,
} from '@/features/notes/persistence/note-sync-envelope';
import { useIdentityHandle } from '@/shared/persistence/identity-provider';
import { useIdentityScopedDomain } from '@/shared/persistence/use-identity-scoped-domain';
import { createOutboxOperation, createOutboxOperationId, type OutboxOperation } from '@/shared/sync/outbox-operation';
import type { DomainSyncOutcome, DomainSyncRecord, SyncTrigger } from '@/shared/sync/coordinator';
import type { SyncConflictRecord } from '@/shared/sync/conflict';
import { createInitialSyncEnvelope, discardPendingOperations, type SyncEnvelope } from '@/shared/sync/sync-envelope';
import { pullAllPages, pushOutboxOperations, type SyncTransportRepository } from '@/shared/sync/transport';

export interface UseNoteDomainSyncOptions {
  readonly collection: NoteCollection; // current state from the PRIMARY reducer
  readonly hasHydratedCollection: boolean;
  readonly dispatchCollection: (action: NoteAction) => void;
  readonly getTransport: () => SyncTransportRepository<NoteRow> | undefined; // undefined => no client available; no-op
}

export interface UseNoteDomainSyncResult {
  readonly runSync: (trigger: SyncTrigger) => Promise<DomainSyncRecord>;
  readonly isSyncing: boolean;
  readonly lastResult: DomainSyncRecord | undefined;
  readonly hasHydrated: boolean;
  readonly localMutationTick: number;
  // A plain render-time value (envelope.state.outbox.length), NOT read
  // through latestRef -- T158s logout guard needs this reactive across
  // renders, unlike runSyncImpls own internals which deliberately lag by
  // design. See sync-envelope.ts discardPendingOperations doc comment.
  readonly pendingCount: number;
  readonly retryableFailureCount: number;
  readonly conflictCount: number;
  readonly conflicts: readonly SyncConflictRecord[];
  readonly resolveConflict: (recordId: string, choice: 'local' | 'server') => Promise<void>;
  // Durably clears this domains outbox (via the shared write queue, never
  // a second independent writer) without touching the primary NoteCollection
  // reducer state -- T158. A safe no-op when already empty or when the
  // identity has changed since the call was made.
  readonly discardPending: () => Promise<void>;
}

const PULL_PAGE_SIZE = 200;

function settle(outcome: DomainSyncOutcome): DomainSyncRecord {
  return { domain: 'notes', outcome, settledAt: Date.now() };
}

export function useNoteDomainSync(options: UseNoteDomainSyncOptions): UseNoteDomainSyncResult {
  const { identity, generation } = useIdentityHandle();

  const envelope = useIdentityScopedDomain<SyncEnvelope<NoteSyncSnapshot>, NoteSyncEnvelopeAction>({
    reducer: noteSyncEnvelopeReducer,
    initialState: createInitialSyncEnvelope('notes', identity, createInitialNoteSyncSnapshot(options.collection)),
    load: (storage) => loadNoteSyncEnvelope(storage, identity, createInitialNoteSyncSnapshot(options.collection)),
    save: (storage, value) => saveNoteSyncEnvelope(storage, value),
    createRestoreAction: (value) => ({ type: 'envelopeRestored' as const, envelope: value }),
  });

  // Stashed in a ref (not depended on directly) so the imperative runSync
  // callback and the diff effect always read the latest values without
  // needing to be reconstructed every render -- same rationale as
  // `use-goal-domain-sync.ts`'s own `latestRef`.
  const latestRef = useRef({
    identity,
    generation,
    collection: options.collection,
    dispatchCollection: options.dispatchCollection,
    getTransport: options.getTransport,
    envelopeState: envelope.state,
    envelopeDispatch: envelope.dispatch,
  });
  useLayoutEffect(() => {
    latestRef.current = {
      identity,
      generation,
      collection: options.collection,
      dispatchCollection: options.dispatchCollection,
      getTransport: options.getTransport,
      envelopeState: envelope.state,
      envelopeDispatch: envelope.dispatch,
    };
  });

  const [isSyncing, setIsSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<DomainSyncRecord | undefined>(undefined);
  const inFlightRef = useRef<Promise<DomainSyncRecord> | undefined>(undefined);
  // Bumped once per enqueued local-mutation diff below -- the shared sync
  // coordinator (T157.9) debounces on this counter instead of the whole
  // domain state object, so its effect dependency stays a stable scalar.
  const [localMutationTick, setLocalMutationTick] = useState(0);

  // Set immediately before a pull-adopt dispatches `notesRestored` into the
  // primary reducer, and consumed (without diffing) by the effect below.
  // Without this, a server-driven restore would be mistaken for a local
  // mutation on the very next render, enqueueing an outbox operation that
  // just writes the same data straight back to the server it came from -- a
  // pointless feedback loop, not a real edit.
  const suppressNextDiffRef = useRef(false);

  const runSyncImpl = useCallback(async (_trigger: SyncTrigger): Promise<DomainSyncRecord> => {
    const { identity: currentIdentity, getTransport, dispatchCollection } = latestRef.current;

    if (currentIdentity.kind !== 'user') {
      return settle({ status: 'succeeded' });
    }
    const transport = getTransport();
    if (transport === undefined) {
      return settle({ status: 'succeeded' });
    }
    const userId = currentIdentity.userId;

    try {
      const notePull = await pullAllPages(transport, { pageSize: PULL_PAGE_SIZE, startCursor: null });
      if (notePull.status === 'failed') {
        return settle({ status: 'failed', errorMessage: notePull.error.message });
      }

      // Re-read after the (possibly slow) pull call above -- the outbox may
      // have grown with new local mutations while this run's pull phase was
      // in flight.
      const envelopeAtPushStart = latestRef.current.envelopeState;
      const envelopeDispatch = latestRef.current.envelopeDispatch;
      const outboxIsEmpty = envelopeAtPushStart.outbox.length === 0;
      const collectionMirror = envelopeAtPushStart.state.collection;

      let noteRevisionsCache: Record<string, number> = { ...envelopeAtPushStart.state.noteRevisions };

      if (outboxIsEmpty) {
        const composed = mapNoteRowsToDomainCollection(notePull.rows, userId);
        if (composed.status === 'valid') {
          suppressNextDiffRef.current = true;
          dispatchCollection({ type: 'notesRestored', collection: composed.collection });
          noteRevisionsCache = {};
          // Record revisions from EVERY pulled row including tombstoned
          // ones -- a tombstoned note still needs its revision tracked so a
          // later local mutation against that same id (which shouldn't
          // normally happen once it's filtered out of the UI, but could via
          // a stale in-flight local edit) gets a correct expectedRevision
          // rather than null.
          for (const row of notePull.rows) {
            noteRevisionsCache[row.id] = row.revision;
          }
        }
        // An invalid composition is left entirely alone -- neither the
        // primary reducer nor the revision cache are touched; a malformed
        // server response must never clobber good local state.
      } else {
        // Pending local writes stay authoritative locally (no auto-resolve,
        // per T160.2) -- only refresh the revision cache for records with
        // no pending operation, so their *next* push uses a fresh
        // expectedRevision.
        const pendingRecordIds = new Set(envelopeAtPushStart.outbox.map((op) => op.recordId));
        for (const row of notePull.rows) {
          if (!pendingRecordIds.has(row.id)) {
            noteRevisionsCache[row.id] = row.revision;
          }
        }
      }

      envelopeDispatch({
        type: 'revisionRecorded',
        snapshot: { collection: collectionMirror, noteRevisions: noteRevisionsCache },
      });

      const outboxSnapshot = envelopeAtPushStart.outbox;
      const operationsById = new Map<string, OutboxOperation>(outboxSnapshot.map((op) => [op.operationId, op]));

      const pushResult = await pushOutboxOperations(transport, outboxSnapshot, {
        getExpectedRevision: (op) => noteRevisionsCache[op.recordId] ?? null,
      });

      for (const outcome of pushResult.outcomes) {
        const now = Date.now();
        const op = operationsById.get(outcome.operationId);

        if (outcome.result.status === 'succeeded') {
          envelopeDispatch({ type: 'operationAcknowledged', identity: currentIdentity, operationId: outcome.operationId });

          if (op?.operationType === 'delete') {
            delete noteRevisionsCache[outcome.recordId];
          } else {
            noteRevisionsCache[outcome.recordId] = outcome.result.row.revision;
          }

          envelopeDispatch({
            type: 'revisionRecorded',
            snapshot: { collection: collectionMirror, noteRevisions: { ...noteRevisionsCache } },
          });
          continue;
        }

        // 'conflict' and 'failed' are both parked, not acknowledged, not
        // retried automatically this run -- unrelated records' outcomes are
        // unaffected (pushOutboxOperations' own "continue after one
        // conflict/failure" guarantee). Neither makes the whole domain
        // outcome 'failed' -- that's reserved for a pull failure or an
        // unrecoverable adapter exception, caught below. In particular, a
        // tombstone-conflict on one note (stale-device resurrection
        // attempt) parks just that note's operation, never the whole run.
        const errorMessage =
          outcome.result.status === 'conflict'
            ? `stale revision: expected ${outcome.result.conflict.expectedRevision}, server has ${outcome.result.conflict.serverRevision}`
            : outcome.result.error.message;

        envelopeDispatch({
          type: 'operationAttemptRecorded',
          identity: currentIdentity,
          operationId: outcome.operationId,
          attemptedAt: now,
          errorMessage,
          failureKind: outcome.result.status === 'conflict' ? 'conflict' : 'retryable',
        });
        if (outcome.result.status === 'conflict' && op) {
          const conflict: SyncConflictRecord = {
            domain: 'notes',
            recordId: outcome.recordId,
            operationId: op.operationId,
            operationType: op.operationType,
            expectedRevision: outcome.result.conflict.expectedRevision,
            serverRevision: outcome.result.conflict.serverRevision,
            localSnapshot: (op.payload ?? null) as unknown as SyncConflictRecord['localSnapshot'],
            serverSnapshot: (outcome.result.conflict.serverRow ?? null) as unknown as SyncConflictRecord['serverSnapshot'],
            createdAt: now,
          };
          envelopeDispatch({ type: 'conflictRecorded', identity: currentIdentity, conflict });
        }
      }

      return settle({ status: 'succeeded' });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown note sync error.';
      return settle({ status: 'failed', errorMessage });
    }
  }, []);

  const runSync = useCallback(
    (trigger: SyncTrigger): Promise<DomainSyncRecord> => {
      // Local single-flight guard -- defense in depth against a direct
      // `runSync()` call bypassing the shared coordinator (some tests do
      // this deliberately). The real single-flight authority in production
      // is now the shared `syncCoordinatorReducer` driven by
      // `use-sync-coordinator.ts` (T157.9).
      if (inFlightRef.current) return inFlightRef.current;

      setIsSyncing(true);
      const promise = runSyncImpl(trigger).then((record) => {
        setLastResult(record);
        setIsSyncing(false);
        inFlightRef.current = undefined;
        return record;
      });
      inFlightRef.current = promise;
      return promise;
    },
    [runSyncImpl],
  );

  // Watches the primary reducer's `collection` for local mutations to
  // enqueue as outbox operations. Gated on both domains being hydrated for
  // the *current* generation -- dispatching into the envelope before its
  // own load resolves would be silently discarded the instant that load's
  // `envelopeRestored` action lands (see `useIdentityScopedDomain`'s own
  // doc comment on why a restore always wins).
  const bothHydrated = options.hasHydratedCollection && envelope.hasHydrated;
  const previousCollectionRef = useRef<NoteCollection>(options.collection);
  const diffGenerationRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!bothHydrated) return;

    if (diffGenerationRef.current !== generation) {
      // (Re)armed for a new identity generation -- this render's
      // `collection` is the just-restored value, not a user-driven local
      // change; never diff a restore against the previous identity's
      // collection.
      diffGenerationRef.current = generation;
      previousCollectionRef.current = options.collection;
      return;
    }

    const previousCollection = previousCollectionRef.current;
    if (previousCollection === options.collection) return;
    previousCollectionRef.current = options.collection;

    if (suppressNextDiffRef.current) {
      suppressNextDiffRef.current = false;
      return; // this change came from a pull-adopt restore, not a local mutation
    }

    if (identity.kind !== 'user') return; // guests never sync

    const operationInputs = diffNotesForOutboxOperations(previousCollection, options.collection, identity.userId);
    if (operationInputs.length === 0) return;

    const now = Date.now();
    const operationIds = operationInputs.map(() => createOutboxOperationId(now, Math.random()));
    const nextSnapshot: NoteSyncSnapshot = {
      collection: options.collection,
      noteRevisions: envelope.state.state.noteRevisions,
    };

    setLocalMutationTick((tick) => tick + 1);
    envelope.dispatch({
      type: 'localMutationApplied',
      identity,
      now,
      nextSnapshot,
      operationInputs,
      operationIds,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- envelope.dispatch is a stable useReducer dispatch; envelope.state is read fresh above and intentionally excluded to avoid re-diffing on every revision-cache update this same effect's own dispatch causes.
  }, [options.collection, bothHydrated, generation, identity]);

  // Login triggering (and every other cross-domain trigger: foreground,
  // reconnect, local-mutation debouncing, manual retry) now lives in the
  // shared driver, `use-sync-coordinator.ts` (T157.9), which owns firing
  // `runSync('login')` once per identity generation across all five
  // domains via `syncCoordinatorReducer`. This hook only surfaces the two
  // scalar facts that driver needs (`hasHydrated`, `localMutationTick`).

  const pendingCount = envelope.state.outbox.length;
  const retryableFailureCount = envelope.state.outbox.filter((operation) => operation.lastFailureKind === 'retryable').length;
  const conflictCount = envelope.state.conflicts.length;
  const resolveConflict = useCallback(async (recordId: string, choice: 'local' | 'server') => {
    const current = latestRef.current;
    const conflict = current.envelopeState.conflicts.find((item) => item.recordId === recordId);
    if (!conflict || conflict.domain !== 'notes' || current.identity.kind !== 'user') return;
    if (current.generation !== generation || conflict.operationId !== current.envelopeState.outbox.find((op) => op.recordId === recordId)?.operationId) return;
    const now = Date.now();
    let revisionSnapshot = current.envelopeState.state;
    if (choice === 'server') {
      const mapped = conflict.serverSnapshot === null ? undefined : mapNoteRowToDomainEntry(conflict.serverSnapshot as NoteRow, current.identity.userId);
      if (mapped !== undefined && mapped.status === 'invalid') return;
      suppressNextDiffRef.current = true;
      current.dispatchCollection({ type: 'notesRestored', collection: { notes: [...current.collection.notes.filter((note) => note.id !== recordId), ...(mapped?.status === 'valid' && mapped.entry.status === 'active' ? [mapped.entry.note] : [])] } });
      const revisions = { ...revisionSnapshot.noteRevisions };
      if (mapped?.status === 'valid' && mapped.entry.status === 'active') revisions[recordId] = conflict.serverRevision;
      else delete revisions[recordId];
      revisionSnapshot = { ...revisionSnapshot, noteRevisions: revisions };
    } else {
      revisionSnapshot = { ...revisionSnapshot, noteRevisions: { ...revisionSnapshot.noteRevisions, [recordId]: conflict.serverRevision } };
    }
    const replacement = choice === 'local'
      ? createOutboxOperation(createOutboxOperationId(now, Math.random()), {
          domain: 'notes', operationType: conflict.operationType, recordId: conflict.recordId,
          payload: conflict.localSnapshot as Record<string, unknown> | null,
        }, now)
      : undefined;
    current.envelopeDispatch({ type: 'conflictResolved', identity: current.identity, domain: 'notes', recordId, operationId: conflict.operationId, replacement, revisionSnapshot });
  }, [generation]);

  const discardPending = useCallback(async () => {
    const { identity: currentIdentity, envelopeState, envelopeDispatch } = latestRef.current;
    if (envelopeState.outbox.length === 0) return;

    const result = discardPendingOperations(envelopeState, currentIdentity);
    if (result.status !== 'applied') return; // identity changed underneath; no-op

    await envelope.saveNow(result.envelope);
    envelopeDispatch({ type: 'outboxDiscarded', identity: currentIdentity });
  }, [envelope]);

  return useMemo(
    () => ({
      runSync,
      isSyncing,
      lastResult,
      hasHydrated: bothHydrated,
      localMutationTick,
      pendingCount,
      retryableFailureCount,
      conflictCount,
      conflicts: envelope.state.conflicts,
      resolveConflict,
      discardPending,
    }),
    [runSync, isSyncing, lastResult, bothHydrated, localMutationTick, pendingCount, retryableFailureCount, conflictCount, discardPending, resolveConflict, envelope.state.conflicts],
  );
}
