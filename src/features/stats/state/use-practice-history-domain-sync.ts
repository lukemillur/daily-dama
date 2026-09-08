// T157.6: the practice-history-domain-local sync driver. Owns pull-then-push
// cycles against an injected transport and the parallel
// `SyncEnvelope<PracticeHistorySyncSnapshot>` domain, while the PRIMARY
// `PracticeHistory` reducer (owned by `practice-history-provider.tsx`) stays
// the sole source of truth rendered by the app. Structurally a near-
// mechanical adaptation of `use-custom-trick-domain-sync.ts` (T157.5),
// simplified per "Why this domain is simpler" in `.claude/plans/T157.6.md`
// -- no revision cache, no `outboxIsEmpty` gate on pull-adopt (union-merge
// unconditionally: practice-session records are immutable and content-
// addressed by their own id, so a duplicate id occurring in both local
// state and a pulled row is guaranteed to be the *same* record, never a
// competing edit).
//
// Deliberately NOT the shared `syncCoordinatorReducer` (T157.9's job). This
// hook's `runSync` return value is already shaped like `DomainSyncRecord` so
// T157.9 can plug it in later with no reshaping.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import type { PracticeHistory, PracticeHistoryAction } from '@/features/stats/model/practice-history';
import {
  diffPracticeHistoryForOutboxOperations,
  mapPracticeSessionRowsToDomainHistory,
} from '@/features/stats/persistence/practice-history-cloud-mapping';
import type { PracticeSessionRow } from '@/features/stats/persistence/practice-history-cloud-repository';
import {
  createInitialPracticeHistorySyncSnapshot,
  loadPracticeHistorySyncEnvelope,
  practiceHistorySyncEnvelopeReducer,
  savePracticeHistorySyncEnvelope,
  type PracticeHistorySyncEnvelopeAction,
  type PracticeHistorySyncSnapshot,
} from '@/features/stats/persistence/practice-history-sync-envelope';
import { useIdentityHandle } from '@/shared/persistence/identity-provider';
import { useIdentityScopedDomain } from '@/shared/persistence/use-identity-scoped-domain';
import { createOutboxOperationId } from '@/shared/sync/outbox-operation';
import type { DomainSyncOutcome, DomainSyncRecord, SyncTrigger } from '@/shared/sync/coordinator';
import { createInitialSyncEnvelope, discardPendingOperations, type SyncEnvelope } from '@/shared/sync/sync-envelope';
import type { DomainDiscardOutcome } from '@/shared/sync/discard-outcome';
import { pullAllPages, pushOutboxOperations, type SyncTransportRepository } from '@/shared/sync/transport';

export interface UsePracticeHistoryDomainSyncOptions {
  readonly history: PracticeHistory; // current state from the PRIMARY reducer
  readonly hasHydratedHistory: boolean;
  readonly dispatchHistory: (action: PracticeHistoryAction) => void;
  readonly getTransport: () => SyncTransportRepository<PracticeSessionRow> | undefined; // undefined => no client available; no-op
}

export interface UsePracticeHistoryDomainSyncResult {
  readonly runSync: (trigger: SyncTrigger) => Promise<DomainSyncRecord>;
  readonly isSyncing: boolean;
  readonly lastResult: DomainSyncRecord | undefined;
  readonly hasHydrated: boolean;
  readonly localMutationTick: number;
  readonly pendingCount: number;
  readonly retryableFailureCount: number;
  readonly conflictCount: number;
  readonly discardPending: () => Promise<DomainDiscardOutcome>;
}

const PULL_PAGE_SIZE = 200;

function settle(outcome: DomainSyncOutcome): DomainSyncRecord {
  return { domain: 'practiceHistory', outcome, settledAt: Date.now() };
}

// Unions two session lists by id, preserving `localSessions`' own order and
// appending any pulled session whose id isn't already present locally.
// Immutable, content-addressed records mean a shared id is always the same
// record -- no conflict resolution needed, just a set union.
function unionSessionsById(
  localSessions: PracticeHistory['sessions'],
  pulledRows: readonly PracticeSessionRow[],
  pulledHistory: PracticeHistory,
): PracticeHistory['sessions'] {
  const localIds = new Set(localSessions.map((session) => session.id));
  const newSessions = pulledHistory.sessions.filter((session) => !localIds.has(session.id));
  if (newSessions.length === 0) return localSessions;
  return [...localSessions, ...newSessions];
}

export function usePracticeHistoryDomainSync(
  options: UsePracticeHistoryDomainSyncOptions,
): UsePracticeHistoryDomainSyncResult {
  const { identity, generation } = useIdentityHandle();

  const envelope = useIdentityScopedDomain<SyncEnvelope<PracticeHistorySyncSnapshot>, PracticeHistorySyncEnvelopeAction>({
    reducer: practiceHistorySyncEnvelopeReducer,
    initialState: createInitialSyncEnvelope(
      'practiceHistory',
      identity,
      createInitialPracticeHistorySyncSnapshot(options.history),
    ),
    load: (storage) =>
      loadPracticeHistorySyncEnvelope(storage, identity, createInitialPracticeHistorySyncSnapshot(options.history)),
    save: (storage, value) => savePracticeHistorySyncEnvelope(storage, value),
    createRestoreAction: (value) => ({ type: 'envelopeRestored' as const, envelope: value }),
  });

  // Stashed in a ref (not depended on directly) so the imperative runSync
  // callback and the diff effect always read the latest values without
  // needing to be reconstructed every render -- same rationale as
  // `use-custom-trick-domain-sync.ts`'s own `latestRef`.
  const latestRef = useRef({
    identity,
    history: options.history,
    dispatchHistory: options.dispatchHistory,
    getTransport: options.getTransport,
    envelopeState: envelope.state,
    envelopeDispatch: envelope.dispatch,
  });
  useLayoutEffect(() => {
    latestRef.current = {
      identity,
      history: options.history,
      dispatchHistory: options.dispatchHistory,
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

  // Set immediately before a pull-adopt dispatches `historyRestored` into
  // the primary reducer, and consumed (without diffing) by the effect
  // below. Without this, a server-driven merge would be mistaken for a
  // local mutation on the very next render, enqueueing outbox operations
  // that just write the same data straight back to the server it came
  // from -- a pointless feedback loop, not a real edit.
  const suppressNextDiffRef = useRef(false);

  const runSyncImpl = useCallback(async (_trigger: SyncTrigger): Promise<DomainSyncRecord> => {
    const { identity: currentIdentity, getTransport, dispatchHistory } = latestRef.current;

    if (currentIdentity.kind !== 'user') {
      return settle({ status: 'succeeded' });
    }
    const transport = getTransport();
    if (transport === undefined) {
      return settle({ status: 'succeeded' });
    }
    const userId = currentIdentity.userId;

    try {
      const pull = await pullAllPages(transport, { pageSize: PULL_PAGE_SIZE, startCursor: null });
      if (pull.status === 'failed') {
        return settle({ status: 'failed', errorMessage: pull.error.message });
      }

      // Re-read after the (possibly slow) pull call above -- local state may
      // have changed while this run's pull phase was in flight.
      const envelopeAtPushStart = latestRef.current.envelopeState;
      const envelopeDispatch = latestRef.current.envelopeDispatch;
      const localHistory = latestRef.current.history;

      // Merge unconditionally -- no `outboxIsEmpty` gate, see the header
      // comment. An invalid composition is left entirely alone; a malformed
      // server response must never clobber good local state.
      const composed = mapPracticeSessionRowsToDomainHistory(pull.rows, userId);
      let mergedSessions = localHistory.sessions;
      if (composed.status === 'valid') {
        mergedSessions = unionSessionsById(localHistory.sessions, pull.rows, composed.history);
        if (mergedSessions !== localHistory.sessions) {
          suppressNextDiffRef.current = true;
          dispatchHistory({ type: 'historyRestored', history: { sessions: mergedSessions } });
        }
      }

      envelopeDispatch({ type: 'revisionRecorded', snapshot: { history: { sessions: mergedSessions } } });

      const outboxSnapshot = envelopeAtPushStart.outbox;
      const pushResult = await pushOutboxOperations(transport, outboxSnapshot, {
        // No revision cache exists for this domain -- every push is an
        // unconditional insert; 23505 (a lost-ack retry) is handled as a
        // success by the transport itself.
        getExpectedRevision: () => null,
      });

      for (const outcome of pushResult.outcomes) {
        const now = Date.now();

        if (outcome.result.status === 'succeeded') {
          envelopeDispatch({
            type: 'operationAcknowledged',
            identity: currentIdentity,
            operationId: outcome.operationId,
          });
          continue;
        }

        // 'conflict' is handled defensively even though this domain's own
        // transport never actually produces it -- not assumed unreachable
        // at the type level. Both 'conflict' and 'failed' are parked, not
        // acknowledged, not retried automatically this run -- unrelated
        // records' outcomes are unaffected (pushOutboxOperations' own
        // "continue after one failure" guarantee).
        const errorMessage =
          outcome.result.status === 'conflict'
            ? `unexpected conflict for an immutable record: expected ${outcome.result.conflict.expectedRevision}, server has ${outcome.result.conflict.serverRevision}`
            : outcome.result.error.message;

        envelopeDispatch({
          type: 'operationAttemptRecorded',
          identity: currentIdentity,
          operationId: outcome.operationId,
          attemptedAt: now,
          errorMessage,
          failureKind: outcome.result.status === 'conflict' ? 'conflict' : 'retryable',
        });
      }

      return settle({ status: 'succeeded' });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown practice-history sync error.';
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

  // Watches the primary reducer's `history` for local mutations to enqueue
  // as outbox operations. Gated on both domains being hydrated for the
  // *current* generation -- dispatching into the envelope before its own
  // load resolves would be silently discarded the instant that load's
  // `envelopeRestored` action lands.
  const bothHydrated = options.hasHydratedHistory && envelope.hasHydrated;
  const previousHistoryRef = useRef<PracticeHistory>(options.history);
  const diffGenerationRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!bothHydrated) return;

    if (diffGenerationRef.current !== generation) {
      // (Re)armed for a new identity generation -- this render's `history`
      // is the just-restored value, not a user-driven local change; never
      // diff a restore against the previous identity's history.
      diffGenerationRef.current = generation;
      previousHistoryRef.current = options.history;
      return;
    }

    const previousHistory = previousHistoryRef.current;
    if (previousHistory === options.history) return;
    previousHistoryRef.current = options.history;

    if (suppressNextDiffRef.current) {
      suppressNextDiffRef.current = false;
      return; // this change came from a pull-adopt merge, not a local mutation
    }

    if (identity.kind !== 'user') return; // guests never sync

    const operationInputs = diffPracticeHistoryForOutboxOperations(previousHistory, options.history, identity.userId);
    if (operationInputs.length === 0) return;

    const now = Date.now();
    const operationIds = operationInputs.map(() => createOutboxOperationId(now, Math.random()));
    const nextSnapshot: PracticeHistorySyncSnapshot = { history: options.history };

    setLocalMutationTick((tick) => tick + 1);
    envelope.dispatch({
      type: 'localMutationApplied',
      identity,
      now,
      nextSnapshot,
      operationInputs,
      operationIds,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- envelope.dispatch is a stable useReducer dispatch; envelope.state is intentionally excluded to avoid re-diffing on every push-outcome update this same effect's own dispatch causes.
  }, [options.history, bothHydrated, generation, identity]);

  // Login triggering (and every other cross-domain trigger: foreground,
  // reconnect, local-mutation debouncing, manual retry) now lives in the
  // shared driver, `use-sync-coordinator.ts` (T157.9), which owns firing
  // `runSync('login')` once per identity generation across all five
  // domains via `syncCoordinatorReducer`. This hook only surfaces the two
  // scalar facts that driver needs (`hasHydrated`, `localMutationTick`).

  const pendingCount = envelope.state.outbox.length;
  const retryableFailureCount = envelope.state.outbox.filter((operation) => operation.lastFailureKind === 'retryable').length;
  const conflictCount = envelope.state.outbox.filter((operation) => operation.lastFailureKind === 'conflict').length;

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
      conflictCount,
      discardPending,
    }),
    [runSync, isSyncing, lastResult, bothHydrated, localMutationTick, pendingCount, retryableFailureCount, conflictCount, discardPending],
  );
}
