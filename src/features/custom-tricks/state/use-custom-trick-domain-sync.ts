// T157.5: the custom-tricks-domain-local sync driver. Owns pull-then-push
// cycles against an injected transport and the parallel
// `SyncEnvelope<CustomTrickSyncSnapshot>` domain, while the PRIMARY
// `CustomTrickCollection` reducer (owned by `custom-trick-provider.tsx`)
// stays the sole source of truth rendered by the app. Structurally a
// near-mechanical adaptation of `use-profile-domain-sync.ts` (T157.4),
// simplified for the single-table domain (no scalar/child-table split, no
// `recordId === userId` routing). See `.claude/plans/T157.5.md` "The driver
// hook" for the full design.
//
// Deliberately NOT the shared `syncCoordinatorReducer` (T157.9's job -- that
// reducer only reaches `idle` once all five SYNC_DOMAINS report settled,
// and today only `profile` + `customTricks` are wired). This hook's
// `runSync` return value is already shaped like `DomainSyncRecord` so
// T157.9 can plug it in later with no reshaping.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import type { CustomTrickAction, CustomTrickCollection } from '@/features/custom-tricks/model/custom-trick';
import {
  diffCustomTricksForOutboxOperations,
  mapCustomTrickRowToDomainTrick,
  mapCustomTrickRowsToDomainCollection,
} from '@/features/custom-tricks/persistence/custom-trick-cloud-mapping';
import type { CustomTrickRow } from '@/features/custom-tricks/persistence/custom-trick-cloud-repository';
import {
  createInitialCustomTrickSyncSnapshot,
  loadCustomTrickSyncEnvelope,
  customTrickSyncEnvelopeReducer,
  saveCustomTrickSyncEnvelope,
  type CustomTrickSyncEnvelopeAction,
  type CustomTrickSyncSnapshot,
} from '@/features/custom-tricks/persistence/custom-trick-sync-envelope';
import { useIdentityHandle } from '@/shared/persistence/identity-provider';
import { useIdentityScopedDomain } from '@/shared/persistence/use-identity-scoped-domain';
import { createOutboxOperationId, type OutboxOperation } from '@/shared/sync/outbox-operation';
import type { DomainSyncOutcome, DomainSyncRecord, SyncTrigger } from '@/shared/sync/coordinator';
import { parseServerRowUpdatedAt, resolveUpdatedAtConflict } from '@/shared/sync/conflict-resolution';
import { createInitialSyncEnvelope, discardPendingOperations, type SyncEnvelope } from '@/shared/sync/sync-envelope';
import { pullAllPages, pushOutboxOperations, type SyncTransportRepository } from '@/shared/sync/transport';

export interface UseCustomTrickDomainSyncOptions {
  readonly collection: CustomTrickCollection; // current state from the PRIMARY reducer
  readonly hasHydratedCollection: boolean;
  readonly dispatchCollection: (action: CustomTrickAction) => void;
  readonly getTransport: () => SyncTransportRepository<CustomTrickRow> | undefined; // undefined => no client available; no-op
}

export interface UseCustomTrickDomainSyncResult {
  readonly runSync: (trigger: SyncTrigger) => Promise<DomainSyncRecord>;
  readonly isSyncing: boolean;
  readonly lastResult: DomainSyncRecord | undefined;
  readonly hasHydrated: boolean;
  readonly localMutationTick: number;
  readonly pendingCount: number;
  readonly retryableFailureCount: number;
  readonly discardPending: () => Promise<void>;
}

const PULL_PAGE_SIZE = 200;

function settle(outcome: DomainSyncOutcome): DomainSyncRecord {
  return { domain: 'customTricks', outcome, settledAt: Date.now() };
}

export function useCustomTrickDomainSync(
  options: UseCustomTrickDomainSyncOptions,
): UseCustomTrickDomainSyncResult {
  const { identity, generation } = useIdentityHandle();

  const envelope = useIdentityScopedDomain<SyncEnvelope<CustomTrickSyncSnapshot>, CustomTrickSyncEnvelopeAction>({
    reducer: customTrickSyncEnvelopeReducer,
    initialState: createInitialSyncEnvelope(
      'customTricks',
      identity,
      createInitialCustomTrickSyncSnapshot(options.collection),
    ),
    load: (storage) =>
      loadCustomTrickSyncEnvelope(storage, identity, createInitialCustomTrickSyncSnapshot(options.collection)),
    save: (storage, value) => saveCustomTrickSyncEnvelope(storage, value),
    createRestoreAction: (value) => ({ type: 'envelopeRestored' as const, envelope: value }),
  });

  // Stashed in a ref (not depended on directly) so the imperative runSync
  // callback and the diff effect always read the latest values without
  // needing to be reconstructed every render -- same rationale as
  // `use-profile-domain-sync.ts`'s own `latestRef`.
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

  // Set immediately before a pull-adopt dispatches `customTricksRestored`
  // into the primary reducer, and consumed (without diffing) by the effect
  // below. Without this, a server-driven restore would be mistaken for a
  // local mutation on the very next render, enqueueing an outbox operation
  // that just writes the same data straight back to the server it came
  // from -- a pointless feedback loop, not a real edit.
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
      const trickPull = await pullAllPages(transport, { pageSize: PULL_PAGE_SIZE, startCursor: null });
      if (trickPull.status === 'failed') {
        return settle({ status: 'failed', errorMessage: trickPull.error.message });
      }

      // Re-read after the (possibly slow) pull call above -- the outbox may
      // have grown with new local mutations while this run's pull phase was
      // in flight.
      const envelopeAtPushStart = latestRef.current.envelopeState;
      const envelopeDispatch = latestRef.current.envelopeDispatch;
      const outboxIsEmpty = envelopeAtPushStart.outbox.length === 0;
      const collectionMirror = envelopeAtPushStart.state.collection;

      let trickRevisionsCache: Record<string, number> = { ...envelopeAtPushStart.state.trickRevisions };

      if (outboxIsEmpty) {
        const composed = mapCustomTrickRowsToDomainCollection(trickPull.rows, userId);
        if (composed.status === 'valid') {
          suppressNextDiffRef.current = true;
          dispatchCollection({ type: 'customTricksRestored', collection: composed.collection });
          trickRevisionsCache = {};
          for (const row of trickPull.rows) {
            trickRevisionsCache[row.id] = row.revision;
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
        for (const row of trickPull.rows) {
          if (!pendingRecordIds.has(row.id)) {
            trickRevisionsCache[row.id] = row.revision;
          }
        }
      }

      envelopeDispatch({
        type: 'revisionRecorded',
        snapshot: { collection: collectionMirror, trickRevisions: trickRevisionsCache },
      });

      const outboxSnapshot = envelopeAtPushStart.outbox;
      const operationsById = new Map<string, OutboxOperation>(outboxSnapshot.map((op) => [op.operationId, op]));

      const pushResult = await pushOutboxOperations(transport, outboxSnapshot, {
        getExpectedRevision: (op) => trickRevisionsCache[op.recordId] ?? null,
      });

      for (const outcome of pushResult.outcomes) {
        const now = Date.now();
        const op = operationsById.get(outcome.operationId);

        if (outcome.result.status === 'succeeded') {
          envelopeDispatch({ type: 'operationAcknowledged', identity: currentIdentity, operationId: outcome.operationId });

          if (op?.operationType === 'delete') {
            delete trickRevisionsCache[outcome.recordId];
          } else {
            trickRevisionsCache[outcome.recordId] = outcome.result.row.revision;
          }

          envelopeDispatch({
            type: 'revisionRecorded',
            snapshot: { collection: collectionMirror, trickRevisions: { ...trickRevisionsCache } },
          });
          continue;
        }

        // 'conflict' resolves automatically, in this same run, by keeping
        // whichever snapshot has the later `updatedAt` (T187.2). 'failed'
        // is still parked (not acknowledged, not retried automatically
        // this run) -- unrelated records' outcomes are unaffected
        // (pushOutboxOperations' own "continue after one conflict/failure"
        // guarantee). Neither makes the whole domain outcome 'failed' --
        // that's reserved for a pull failure or an unrecoverable adapter
        // exception, caught below.
        if (outcome.result.status === 'conflict') {
          if (!op) continue;
          const conflict = outcome.result.conflict;
          const serverRow = conflict.serverRow ?? null;
          const serverUpdatedAt = parseServerRowUpdatedAt(serverRow);
          const localRecord = collectionMirror.tricks.find((trick) => trick.id === outcome.recordId);
          const localUpdatedAt = op.operationType === 'upsert' && localRecord ? localRecord.updatedAt : op.createdAt;
          const winner = resolveUpdatedAtConflict(localUpdatedAt, serverUpdatedAt);

          if (winner === 'local') {
            trickRevisionsCache[outcome.recordId] = conflict.serverRevision;
            envelopeDispatch({
              type: 'localMutationApplied',
              identity: currentIdentity,
              now,
              nextSnapshot: { collection: collectionMirror, trickRevisions: { ...trickRevisionsCache } },
              operationInputs: [{ domain: 'customTricks', operationType: op.operationType, recordId: outcome.recordId, payload: op.payload }],
              operationIds: [createOutboxOperationId(now, Math.random())],
            });
            continue;
          }

          if (serverRow === null) {
            suppressNextDiffRef.current = true;
            dispatchCollection({ type: 'customTricksRestored', collection: { tricks: latestRef.current.collection.tricks.filter((trick) => trick.id !== outcome.recordId) } });
            delete trickRevisionsCache[outcome.recordId];
          } else {
            const mapped = mapCustomTrickRowToDomainTrick(serverRow as CustomTrickRow, userId);
            if (mapped.status !== 'valid') continue;
            suppressNextDiffRef.current = true;
            dispatchCollection({ type: 'customTricksRestored', collection: { tricks: [...latestRef.current.collection.tricks.filter((trick) => trick.id !== outcome.recordId), mapped.trick] } });
            trickRevisionsCache[outcome.recordId] = conflict.serverRevision;
          }
          envelopeDispatch({ type: 'operationAcknowledged', identity: currentIdentity, operationId: outcome.operationId });
          envelopeDispatch({
            type: 'revisionRecorded',
            snapshot: { collection: collectionMirror, trickRevisions: { ...trickRevisionsCache } },
          });
          continue;
        }

        envelopeDispatch({
          type: 'operationAttemptRecorded',
          identity: currentIdentity,
          operationId: outcome.operationId,
          attemptedAt: now,
          errorMessage: outcome.result.error.message,
          failureKind: 'retryable',
        });
      }

      return settle({ status: 'succeeded' });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown custom-trick sync error.';
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
  const previousCollectionRef = useRef<CustomTrickCollection>(options.collection);
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

    const operationInputs = diffCustomTricksForOutboxOperations(previousCollection, options.collection, identity.userId);
    if (operationInputs.length === 0) return;

    const now = Date.now();
    const operationIds = operationInputs.map(() => createOutboxOperationId(now, Math.random()));
    const nextSnapshot: CustomTrickSyncSnapshot = {
      collection: options.collection,
      trickRevisions: envelope.state.state.trickRevisions,
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
      discardPending,
    }),
    [runSync, isSyncing, lastResult, bothHydrated, localMutationTick, pendingCount, retryableFailureCount, discardPending],
  );
}
