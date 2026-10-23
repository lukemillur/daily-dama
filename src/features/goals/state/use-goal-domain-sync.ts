// The goals-domain-local sync driver. Owns pull-then-push cycles
// against an injected transport and the parallel
// `SyncEnvelope<GoalSyncSnapshot>` domain, while the PRIMARY `GoalCollection`
// reducer (owned by `goal-provider.tsx`) stays the sole source of truth
// rendered by the app. Structurally a near-mechanical adaptation of
// `use-custom-trick-domain-sync.ts`, with one required addition:
// pull-composition must filter out tombstoned entries before adopting into
// the primary reducer (custom-tricks has no tombstone concept to filter;
// goals does).
//
// This hook does not decide when to sync. `runSync` returns a
// `DomainSyncRecord`, and the shared `syncCoordinatorReducer`
// (`use-sync-coordinator.ts`) schedules runs and aggregates all five domains.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import type { GoalAction, GoalCollection } from '@/features/goals/model/goal';
import {
  diffGoalsForOutboxOperations,
  mapGoalRowToDomainEntry,
  mapGoalRowsToDomainCollection,
} from '@/features/goals/persistence/goal-cloud-mapping';
import type { GoalRow } from '@/features/goals/persistence/goal-cloud-repository';
import {
  createInitialGoalSyncSnapshot,
  loadGoalSyncEnvelope,
  goalSyncEnvelopeReducer,
  saveGoalSyncEnvelope,
  type GoalSyncEnvelopeAction,
  type GoalSyncSnapshot,
} from '@/features/goals/persistence/goal-sync-envelope';
import { useIdentityHandle } from '@/shared/persistence/identity-provider';
import { useIdentityScopedDomain } from '@/shared/persistence/use-identity-scoped-domain';
import { createOutboxOperationId, type OutboxOperation } from '@/shared/sync/outbox-operation';
import type { DomainSyncOutcome, DomainSyncRecord, SyncTrigger } from '@/shared/sync/coordinator';
import { parseServerRowUpdatedAt, resolveUpdatedAtConflict } from '@/shared/sync/conflict-resolution';
import { createInitialSyncEnvelope, discardPendingOperations, type SyncEnvelope } from '@/shared/sync/sync-envelope';
import type { DomainDiscardOutcome } from '@/shared/sync/discard-outcome';
import { pullAllPages, pushOutboxOperations, type SyncTransportRepository } from '@/shared/sync/transport';

export interface UseGoalDomainSyncOptions {
  readonly collection: GoalCollection; // current state from the PRIMARY reducer
  readonly hasHydratedCollection: boolean;
  readonly dispatchCollection: (action: GoalAction) => void;
  readonly getTransport: () => SyncTransportRepository<GoalRow> | undefined; // undefined => no client available; no-op
}

export interface UseGoalDomainSyncResult {
  readonly runSync: (trigger: SyncTrigger) => Promise<DomainSyncRecord>;
  readonly isSyncing: boolean;
  readonly lastResult: DomainSyncRecord | undefined;
  readonly hasHydrated: boolean;
  readonly localMutationTick: number;
  readonly pendingCount: number;
  readonly retryableFailureCount: number;
  readonly discardPending: () => Promise<DomainDiscardOutcome>;
}

const PULL_PAGE_SIZE = 200;

function settle(outcome: DomainSyncOutcome): DomainSyncRecord {
  return { domain: 'goals', outcome, settledAt: Date.now() };
}

export function useGoalDomainSync(options: UseGoalDomainSyncOptions): UseGoalDomainSyncResult {
  const { identity, generation } = useIdentityHandle();

  const envelope = useIdentityScopedDomain<SyncEnvelope<GoalSyncSnapshot>, GoalSyncEnvelopeAction>({
    reducer: goalSyncEnvelopeReducer,
    initialState: createInitialSyncEnvelope('goals', identity, createInitialGoalSyncSnapshot(options.collection)),
    load: (storage) => loadGoalSyncEnvelope(storage, identity, createInitialGoalSyncSnapshot(options.collection)),
    save: (storage, value) => saveGoalSyncEnvelope(storage, value),
    createRestoreAction: (value) => ({ type: 'envelopeRestored' as const, envelope: value }),
  });

  // Stashed in a ref (not depended on directly) so the imperative runSync
  // callback and the diff effect always read the latest values without
  // needing to be reconstructed every render -- same rationale as
  // `use-custom-trick-domain-sync.ts`'s own `latestRef`.
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
  // coordinator debounces on this counter instead of the whole
  // domain state object, so its effect dependency stays a stable scalar.
  const [localMutationTick, setLocalMutationTick] = useState(0);

  // Set immediately before a pull-adopt dispatches `goalsRestored` into the
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
      const goalPull = await pullAllPages(transport, { pageSize: PULL_PAGE_SIZE, startCursor: null });
      if (goalPull.status === 'failed') {
        return settle({ status: 'failed', errorMessage: goalPull.error.message });
      }

      // Re-read after the (possibly slow) pull call above -- the outbox may
      // have grown with new local mutations while this run's pull phase was
      // in flight.
      const envelopeAtPushStart = latestRef.current.envelopeState;
      const envelopeDispatch = latestRef.current.envelopeDispatch;
      const outboxIsEmpty = envelopeAtPushStart.outbox.length === 0;
      const collectionMirror = envelopeAtPushStart.state.collection;

      let goalRevisionsCache: Record<string, number> = { ...envelopeAtPushStart.state.goalRevisions };

      if (outboxIsEmpty) {
        const composed = mapGoalRowsToDomainCollection(goalPull.rows, userId);
        if (composed.status === 'valid') {
          suppressNextDiffRef.current = true;
          dispatchCollection({ type: 'goalsRestored', collection: composed.collection });
          goalRevisionsCache = {};
          // Record revisions from EVERY pulled row including tombstoned
          // ones -- a tombstoned goal still needs its revision tracked so a
          // later local mutation against that same id (which shouldn't
          // normally happen once it's filtered out of the UI, but could via
          // a stale in-flight local edit) gets a correct expectedRevision
          // rather than null.
          for (const row of goalPull.rows) {
            goalRevisionsCache[row.id] = row.revision;
          }
        }
        // An invalid composition is left entirely alone -- neither the
        // primary reducer nor the revision cache are touched; a malformed
        // server response must never clobber good local state.
      } else {
        // Pending local writes stay authoritative locally (no auto-resolve)
        // -- only refresh the revision cache for records with
        // no pending operation, so their *next* push uses a fresh
        // expectedRevision.
        const pendingRecordIds = new Set(envelopeAtPushStart.outbox.map((op) => op.recordId));
        for (const row of goalPull.rows) {
          if (!pendingRecordIds.has(row.id)) {
            goalRevisionsCache[row.id] = row.revision;
          }
        }
      }

      envelopeDispatch({
        type: 'revisionRecorded',
        snapshot: { collection: collectionMirror, goalRevisions: goalRevisionsCache },
      });

      const outboxSnapshot = envelopeAtPushStart.outbox;
      const operationsById = new Map<string, OutboxOperation>(outboxSnapshot.map((op) => [op.operationId, op]));

      const pushResult = await pushOutboxOperations(transport, outboxSnapshot, {
        getExpectedRevision: (op) => goalRevisionsCache[op.recordId] ?? null,
      });

      for (const outcome of pushResult.outcomes) {
        const now = Date.now();
        const op = operationsById.get(outcome.operationId);

        if (outcome.result.status === 'succeeded') {
          envelopeDispatch({ type: 'operationAcknowledged', identity: currentIdentity, operationId: outcome.operationId });

          if (op?.operationType === 'delete') {
            delete goalRevisionsCache[outcome.recordId];
          } else {
            goalRevisionsCache[outcome.recordId] = outcome.result.row.revision;
          }

          envelopeDispatch({
            type: 'revisionRecorded',
            snapshot: { collection: collectionMirror, goalRevisions: { ...goalRevisionsCache } },
          });
          continue;
        }

        // 'conflict' resolves automatically, in this same run, by keeping
        // whichever snapshot has the later `updatedAt`. 'failed'
        // is still parked (not acknowledged, not retried automatically
        // this run) -- unrelated records' outcomes are unaffected
        // (pushOutboxOperations' own "continue after one conflict/failure"
        // guarantee). Neither makes the whole domain outcome 'failed' --
        // that's reserved for a pull failure or an unrecoverable adapter
        // exception, caught below. In particular, a tombstone-conflict on
        // one goal (stale-device resurrection attempt) resolves just that
        // goal's operation, never the whole run.
        if (outcome.result.status === 'conflict') {
          if (!op) continue;
          const conflict = outcome.result.conflict;
          const serverRow = conflict.serverRow ?? null;
          const serverUpdatedAt = parseServerRowUpdatedAt(serverRow);
          const localRecord = collectionMirror.goals.find((goal) => goal.id === outcome.recordId);
          const localUpdatedAt = op.operationType === 'upsert' && localRecord ? localRecord.updatedAt : op.createdAt;
          const winner = resolveUpdatedAtConflict(localUpdatedAt, serverUpdatedAt);

          if (winner === 'local') {
            goalRevisionsCache[outcome.recordId] = conflict.serverRevision;
            envelopeDispatch({
              type: 'localMutationApplied',
              identity: currentIdentity,
              now,
              nextSnapshot: { collection: collectionMirror, goalRevisions: { ...goalRevisionsCache } },
              operationInputs: [{ domain: 'goals', operationType: op.operationType, recordId: outcome.recordId, payload: op.payload }],
              operationIds: [createOutboxOperationId(now, Math.random())],
            });
            continue;
          }

          const mapped = serverRow === null ? undefined : mapGoalRowToDomainEntry(serverRow as GoalRow, userId);
          if (mapped !== undefined && mapped.status === 'invalid') continue;

          suppressNextDiffRef.current = true;
          dispatchCollection({
            type: 'goalsRestored',
            collection: {
              goals: [
                ...latestRef.current.collection.goals.filter((goal) => goal.id !== outcome.recordId),
                ...(mapped?.status === 'valid' && mapped.entry.status === 'active' ? [mapped.entry.goal] : []),
              ],
            },
          });
          if (mapped?.status === 'valid' && mapped.entry.status === 'active') {
            goalRevisionsCache[outcome.recordId] = conflict.serverRevision;
          } else {
            delete goalRevisionsCache[outcome.recordId];
          }
          envelopeDispatch({ type: 'operationAcknowledged', identity: currentIdentity, operationId: outcome.operationId });
          envelopeDispatch({
            type: 'revisionRecorded',
            snapshot: { collection: collectionMirror, goalRevisions: { ...goalRevisionsCache } },
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
      const errorMessage = error instanceof Error ? error.message : 'Unknown goal sync error.';
      return settle({ status: 'failed', errorMessage });
    }
  }, []);

  const runSync = useCallback(
    (trigger: SyncTrigger): Promise<DomainSyncRecord> => {
      // Local single-flight guard -- defense in depth against a direct
      // `runSync()` call bypassing the shared coordinator (some tests do
      // this deliberately). The real single-flight authority in production
      // is now the shared `syncCoordinatorReducer` driven by
      // `use-sync-coordinator.ts`.
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
  const previousCollectionRef = useRef<GoalCollection>(options.collection);
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

    const operationInputs = diffGoalsForOutboxOperations(previousCollection, options.collection, identity.userId);
    if (operationInputs.length === 0) return;

    const now = Date.now();
    const operationIds = operationInputs.map(() => createOutboxOperationId(now, Math.random()));
    const nextSnapshot: GoalSyncSnapshot = {
      collection: options.collection,
      goalRevisions: envelope.state.state.goalRevisions,
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
  // shared driver, `use-sync-coordinator.ts`, which owns firing
  // `runSync('login')` once per identity generation across all five
  // domains via `syncCoordinatorReducer`. This hook only surfaces the two
  // scalar facts that driver needs (`hasHydrated`, `localMutationTick`).

  const pendingCount = envelope.state.outbox.length;
  const retryableFailureCount = envelope.state.outbox.filter((operation) => operation.lastFailureKind === 'retryable').length;

  const discardPending = useCallback(async (): Promise<DomainDiscardOutcome> => {
    const { identity: currentIdentity, envelopeState, envelopeDispatch } = latestRef.current;
    if (envelopeState.outbox.length === 0) return { status: 'discarded' }; // nothing to clear

    const result = discardPendingOperations(envelopeState, currentIdentity);
    if (result.status !== 'applied') return { status: 'superseded' }; // identity changed underneath

    const saveOutcome = await envelope.saveNow(result.envelope);
    if (saveOutcome.status === 'failed') return { status: 'failed', error: saveOutcome.error };
    if (saveOutcome.status === 'superseded') return { status: 'superseded' };

    // Only now is the cleared outbox durable, so the in-memory clear can follow.
    envelopeDispatch({ type: 'outboxDiscarded', identity: currentIdentity });
    return { status: 'discarded' };
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
