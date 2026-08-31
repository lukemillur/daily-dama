// T157.4: the profile-domain-local sync driver. Owns pull-then-push cycles
// against an injected transport and the parallel `SyncEnvelope<ProfileSyncSnapshot>`
// domain, while the PRIMARY `UserProfile` reducer (owned by
// `user-profile-provider.tsx`) stays the sole source of truth rendered by
// the app. See `.claude/plans/T157.4.md` "The driver hook" for the full
// design.
//
// Deliberately NOT the shared `syncCoordinatorReducer` (T157.9's job -- that
// reducer only reaches `idle` once all five SYNC_DOMAINS report settled,
// and only `profile` is wired today). This hook's `runSync` return value is
// already shaped like `DomainSyncRecord` so T157.9 can plug it in later
// with no reshaping.
//
// Deviations from the plan's illustrative option shape, both required to
// make the design actually work and noted here rather than silently:
// - `identity`/`generation` are derived internally via `useIdentityHandle()`
//   rather than accepted as a caller-supplied `identity` option -- a single
//   internal read avoids the caller and this hook's own parallel envelope
//   domain (which also reads `useIdentityHandle()` via
//   `useIdentityScopedDomain`) ever observing two different identity
//   values for the same render.
// - `dispatchProfile` was added: the driver must dispatch the PRIMARY
//   reducer's own `profileRestored` action to perform the "second-browser
//   rehydrate" pull-adopt described in the plan, which requires the
//   caller's dispatch function.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import type { UserProfile, UserProfileAction } from '@/features/profile/model/user-profile';
import { composeUserProfileFromCloudRows, diffProfileForOutboxOperations, mapProfileRowToDomainFields, mapTrickStateRowsToDomainFields } from '@/features/profile/persistence/profile-cloud-mapping';
import type { ProfileRow, UserTrickStateRow } from '@/features/profile/persistence/profile-cloud-repository';
import {
  createInitialProfileSyncSnapshot,
  loadProfileSyncEnvelope,
  profileSyncEnvelopeReducer,
  saveProfileSyncEnvelope,
  type ProfileSyncEnvelopeAction,
  type ProfileSyncSnapshot,
} from '@/features/profile/persistence/profile-sync-envelope';
import type { ProfileSyncTransport } from '@/features/profile/persistence/profile-sync-transport';
import { useIdentityHandle } from '@/shared/persistence/identity-provider';
import { useIdentityScopedDomain } from '@/shared/persistence/use-identity-scoped-domain';
import { createOutboxOperationId, type OutboxOperation } from '@/shared/sync/outbox-operation';
import type { DomainSyncOutcome, DomainSyncRecord, SyncTrigger } from '@/shared/sync/coordinator';
import { parseServerRowUpdatedAt, resolveUpdatedAtConflict } from '@/shared/sync/conflict-resolution';
import { createInitialSyncEnvelope, discardPendingOperations, type SyncEnvelope } from '@/shared/sync/sync-envelope';
import { pullAllPages, pushOutboxOperations } from '@/shared/sync/transport';

export interface UseProfileDomainSyncOptions {
  readonly profile: UserProfile; // current state from the PRIMARY reducer
  readonly hasHydratedProfile: boolean;
  readonly dispatchProfile: (action: UserProfileAction) => void;
  readonly getTransport: () => ProfileSyncTransport | undefined; // undefined => no client available; no-op
}

export interface UseProfileDomainSyncResult {
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
  return { domain: 'profile', outcome, settledAt: Date.now() };
}

export function useProfileDomainSync(options: UseProfileDomainSyncOptions): UseProfileDomainSyncResult {
  const { identity, generation } = useIdentityHandle();

  const envelope = useIdentityScopedDomain<SyncEnvelope<ProfileSyncSnapshot>, ProfileSyncEnvelopeAction>({
    reducer: profileSyncEnvelopeReducer,
    initialState: createInitialSyncEnvelope('profile', identity, createInitialProfileSyncSnapshot(options.profile)),
    load: (storage) => loadProfileSyncEnvelope(storage, identity, createInitialProfileSyncSnapshot(options.profile)),
    save: (storage, value) => saveProfileSyncEnvelope(storage, value),
    createRestoreAction: (value) => ({ type: 'envelopeRestored' as const, envelope: value }),
  });

  // Stashed in a ref (not depended on directly) so the imperative runSync
  // callback and the diff effect always read the latest values without
  // needing to be reconstructed every render -- same rationale as
  // `useIdentityScopedDomain`'s own `optionsRef` (see that file's doc
  // comment): synced in a layout effect, never written during render.
  const latestRef = useRef({
    identity,
    generation,
    profile: options.profile,
    dispatchProfile: options.dispatchProfile,
    getTransport: options.getTransport,
    envelopeState: envelope.state,
    envelopeDispatch: envelope.dispatch,
  });
  useLayoutEffect(() => {
    latestRef.current = {
      identity,
      generation,
      profile: options.profile,
      dispatchProfile: options.dispatchProfile,
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

  // Set immediately before a pull-adopt dispatches `profileRestored` into
  // the primary reducer, and consumed (without diffing) by the effect
  // below. Without this, a server-driven restore would be mistaken for a
  // local mutation on the very next render, enqueueing an outbox operation
  // that just writes the same data straight back to the server it came
  // from -- a pointless feedback loop, not a real edit.
  const suppressNextDiffRef = useRef(false);

  const runSyncImpl = useCallback(async (_trigger: SyncTrigger): Promise<DomainSyncRecord> => {
    const { identity: currentIdentity, getTransport, dispatchProfile } = latestRef.current;

    if (currentIdentity.kind !== 'user') {
      return settle({ status: 'succeeded' });
    }
    const transport = getTransport();
    if (transport === undefined) {
      return settle({ status: 'succeeded' });
    }
    const userId = currentIdentity.userId;

    try {
      const profilePull = await transport.pullProfileRow();
      if (profilePull.status === 'failed') {
        return settle({ status: 'failed', errorMessage: profilePull.error.message });
      }

      const trickPull = await pullAllPages(
        { pull: (request) => transport.pullTrickStatePage(request) },
        { pageSize: PULL_PAGE_SIZE, startCursor: null },
      );
      if (trickPull.status === 'failed') {
        return settle({ status: 'failed', errorMessage: trickPull.error.message });
      }

      // Re-read after the (possibly slow) pull calls above -- the outbox
      // may have grown with new local mutations while this run's pull
      // phase was in flight.
      const envelopeAtPushStart = latestRef.current.envelopeState;
      const envelopeDispatch = latestRef.current.envelopeDispatch;
      const pulledProfileRow = profilePull.page.items[0] ?? null;
      const outboxIsEmpty = envelopeAtPushStart.outbox.length === 0;
      const profileMirror = envelopeAtPushStart.state.profile;

      let profileRevisionCache = envelopeAtPushStart.state.profileRevision;
      let trickStateRevisionsCache: Record<string, number> = { ...envelopeAtPushStart.state.trickStateRevisions };

      if (outboxIsEmpty) {
        const composed = composeUserProfileFromCloudRows(pulledProfileRow, trickPull.rows, userId);
        if (composed.status === 'valid') {
          suppressNextDiffRef.current = true;
          dispatchProfile({ type: 'profileRestored', profile: composed.profile, updatedAt: 0 });
          profileRevisionCache = pulledProfileRow ? pulledProfileRow.revision : null;
          trickStateRevisionsCache = {};
          for (const row of trickPull.rows) {
            trickStateRevisionsCache[row.trick_id] = row.revision;
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
        if (!pendingRecordIds.has(userId) && pulledProfileRow) {
          profileRevisionCache = pulledProfileRow.revision;
        }
        for (const row of trickPull.rows) {
          if (!pendingRecordIds.has(row.trick_id)) {
            trickStateRevisionsCache[row.trick_id] = row.revision;
          }
        }
      }

      envelopeDispatch({
        type: 'revisionRecorded',
        snapshot: { profile: profileMirror, profileRevision: profileRevisionCache, trickStateRevisions: trickStateRevisionsCache },
      });

      const outboxSnapshot = envelopeAtPushStart.outbox;
      const operationsById = new Map<string, OutboxOperation>(outboxSnapshot.map((op) => [op.operationId, op]));

      const pushResult = await pushOutboxOperations(
        { push: (request) => transport.push(request) },
        outboxSnapshot,
        {
          getExpectedRevision: (op) =>
            op.recordId === userId ? profileRevisionCache : (trickStateRevisionsCache[op.recordId] ?? null),
        },
      );

      for (const outcome of pushResult.outcomes) {
        const now = Date.now();
        const op = operationsById.get(outcome.operationId);

        if (outcome.result.status === 'succeeded') {
          envelopeDispatch({ type: 'operationAcknowledged', identity: currentIdentity, operationId: outcome.operationId });

          if (outcome.recordId === userId) {
            profileRevisionCache = outcome.result.row.revision;
          } else if (op?.operationType === 'delete') {
            delete trickStateRevisionsCache[outcome.recordId];
          } else {
            trickStateRevisionsCache[outcome.recordId] = outcome.result.row.revision;
          }

          envelopeDispatch({
            type: 'revisionRecorded',
            snapshot: { profile: profileMirror, profileRevision: profileRevisionCache, trickStateRevisions: { ...trickStateRevisionsCache } },
          });
          continue;
        }

        // 'conflict' resolves automatically, in this same run, by keeping
        // whichever snapshot has the later `updatedAt` (T187.2) -- there is
        // no pending attempt/error state left to record for it. 'failed' is
        // still parked (not acknowledged, not retried automatically this
        // run) -- unrelated records' outcomes are unaffected
        // (pushOutboxOperations' own "continue after one conflict/failure"
        // guarantee). Neither makes the whole domain outcome 'failed' --
        // that's reserved for a pull failure or an unrecoverable adapter
        // exception, caught below.
        if (outcome.result.status === 'conflict') {
          if (!op) continue;
          const conflict = outcome.result.conflict;
          const serverRow = conflict.serverRow ?? null;
          const serverUpdatedAt = parseServerRowUpdatedAt(serverRow);
          const localUpdatedAt = profileMirror.updatedAt ?? op.createdAt;
          const winner = resolveUpdatedAtConflict(localUpdatedAt, serverUpdatedAt);

          if (winner === 'local') {
            if (outcome.recordId === userId) {
              profileRevisionCache = conflict.serverRevision;
            } else {
              trickStateRevisionsCache[outcome.recordId] = conflict.serverRevision;
            }
            envelopeDispatch({
              type: 'localMutationApplied',
              identity: currentIdentity,
              now,
              nextSnapshot: { profile: profileMirror, profileRevision: profileRevisionCache, trickStateRevisions: { ...trickStateRevisionsCache } },
              operationInputs: [{ domain: 'profile', operationType: op.operationType, recordId: outcome.recordId, payload: op.payload }],
              operationIds: [createOutboxOperationId(now, Math.random())],
            });
          } else {
            const latestProfile = latestRef.current.profile;
            if (outcome.recordId === userId) {
              const mapped = mapProfileRowToDomainFields(serverRow as ProfileRow | null, userId);
              if (mapped.status === 'valid') {
                suppressNextDiffRef.current = true;
                dispatchProfile({ type: 'profileRestored', profile: { ...latestProfile, ...mapped.fields }, updatedAt: 0 });
              }
              profileRevisionCache = conflict.serverRevision;
            } else if (serverRow === null) {
              const profile = {
                ...latestProfile,
                selectedTrickIds: latestProfile.selectedTrickIds.filter((id) => id !== outcome.recordId),
                manuallyUnlockedTrickIds: (latestProfile.manuallyUnlockedTrickIds ?? []).filter((id) => id !== outcome.recordId),
              };
              suppressNextDiffRef.current = true;
              dispatchProfile({ type: 'profileRestored', profile, updatedAt: 0 });
              delete trickStateRevisionsCache[outcome.recordId];
            } else {
              const mapped = mapTrickStateRowsToDomainFields([serverRow as UserTrickStateRow], userId);
              if (mapped.status === 'valid') {
                const selected = new Set(latestProfile.selectedTrickIds.filter((id) => id !== outcome.recordId));
                const unlocked = new Set((latestProfile.manuallyUnlockedTrickIds ?? []).filter((id) => id !== outcome.recordId));
                if (mapped.fields.selectedTrickIds.includes(outcome.recordId)) selected.add(outcome.recordId);
                if ((mapped.fields.manuallyUnlockedTrickIds ?? []).includes(outcome.recordId)) unlocked.add(outcome.recordId);
                suppressNextDiffRef.current = true;
                dispatchProfile({ type: 'profileRestored', profile: { ...latestProfile, selectedTrickIds: [...selected], manuallyUnlockedTrickIds: [...unlocked] }, updatedAt: 0 });
              }
              trickStateRevisionsCache[outcome.recordId] = conflict.serverRevision;
            }
            envelopeDispatch({ type: 'operationAcknowledged', identity: currentIdentity, operationId: outcome.operationId });
            envelopeDispatch({
              type: 'revisionRecorded',
              snapshot: { profile: profileMirror, profileRevision: profileRevisionCache, trickStateRevisions: { ...trickStateRevisionsCache } },
            });
          }
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
      const errorMessage = error instanceof Error ? error.message : 'Unknown profile sync error.';
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

  // Watches the primary reducer's `profile` for local mutations to enqueue
  // as outbox operations. Gated on both domains being hydrated for the
  // *current* generation -- dispatching into the envelope before its own
  // load resolves would be silently discarded the instant that load's
  // `envelopeRestored` action lands (see `useIdentityScopedDomain`'s own
  // doc comment on why a restore always wins).
  const bothHydrated = options.hasHydratedProfile && envelope.hasHydrated;
  const previousProfileRef = useRef<UserProfile>(options.profile);
  const diffGenerationRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!bothHydrated) return;

    if (diffGenerationRef.current !== generation) {
      // (Re)armed for a new identity generation -- this render's `profile`
      // is the just-restored value, not a user-driven local change; never
      // diff a restore against the previous identity's profile.
      diffGenerationRef.current = generation;
      previousProfileRef.current = options.profile;
      return;
    }

    const previousProfile = previousProfileRef.current;
    if (previousProfile === options.profile) return;
    previousProfileRef.current = options.profile;

    if (suppressNextDiffRef.current) {
      suppressNextDiffRef.current = false;
      return; // this change came from a pull-adopt restore, not a local mutation
    }

    if (identity.kind !== 'user') return; // guests never sync

    const operationInputs = diffProfileForOutboxOperations(previousProfile, options.profile, identity.userId);
    if (operationInputs.length === 0) return;

    const now = Date.now();
    const operationIds = operationInputs.map(() => createOutboxOperationId(now, Math.random()));
    const nextSnapshot: ProfileSyncSnapshot = {
      profile: options.profile,
      profileRevision: envelope.state.state.profileRevision,
      trickStateRevisions: envelope.state.state.trickStateRevisions,
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
  }, [options.profile, bothHydrated, generation, identity]);

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
