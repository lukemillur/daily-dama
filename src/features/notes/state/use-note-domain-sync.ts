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
import { createOutboxOperationId, type OutboxOperation } from '@/shared/sync/outbox-operation';
import type { DomainSyncOutcome, DomainSyncRecord, SyncTrigger } from '@/shared/sync/coordinator';
import { createInitialSyncEnvelope, type SyncEnvelope } from '@/shared/sync/sync-envelope';
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
    collection: options.collection,
    dispatchCollection: options.dispatchCollection,
    getTransport: options.getTransport,
    envelopeState: envelope.state,
    envelopeDispatch: envelope.dispatch,
  });
  useLayoutEffect(() => {
    latestRef.current = {
      identity,
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
        });
      }

      return settle({ status: 'succeeded' });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown note sync error.';
      return settle({ status: 'failed', errorMessage });
    }
  }, []);

  const runSync = useCallback(
    (trigger: SyncTrigger): Promise<DomainSyncRecord> => {
      // Local single-flight guard -- a deliberately simple per-domain
      // stand-in, superseded once T157.9 wires the real shared
      // `syncCoordinatorReducer`.
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

  // The one built-in trigger this task adds: once per identity generation
  // after both domains have hydrated, for signed-in users only. Everything
  // else (foreground, real reconnect detection, debouncing) is T157.9.
  const triggeredGenerationRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (identity.kind !== 'user') return;
    if (!bothHydrated) return;
    if (triggeredGenerationRef.current === generation) return;
    triggeredGenerationRef.current = generation;
    void runSync('login');
  }, [identity, bothHydrated, generation, runSync]);

  return useMemo(() => ({ runSync, isSyncing, lastResult }), [runSync, isSyncing, lastResult]);
}
