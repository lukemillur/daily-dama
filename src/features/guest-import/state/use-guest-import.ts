// T159.1: the thin React driver wrapping guestImportReducer, mirroring
// use-logout-guard.ts's own reducer+driver split and
// use-profile-domain-sync.ts's use of useIdentityScopedDomain for durable
// persistence. All effects/clocks/network calls live here, never in the
// reducer.
//
// Deliberate deviation from the plan's illustrative "dispatch
// resumeRequested on hydration" wording: createRestoreAction below wires
// hydration to `stateRestored`, which unconditionally adopts whatever was
// persisted (including a mid-flight status) directly as the live status --
// exactly as step 2 of .claude/plans/T159.1.md's own design specifies for
// `stateRestored`. Given that, resuming is simply "the restored status IS
// the current status" -- no second dispatch is needed or reachable
// (`resumeRequested`'s reducer guard is `status !== 'idle'`, which a
// mid-flight restored status already fails). `resumeRequested` stays fully
// implemented and unit-tested at the reducer level (guest-import.test.ts)
// for a future caller that restores a record through a channel other than
// this hook's own hydration.

import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  buildGuestImportTransports,
  countCloudRecords,
  countLocalGuestRecords,
} from '@/features/guest-import/persistence/guest-import-inventory';
import {
  loadGuestImportState,
  saveGuestImportState,
} from '@/features/guest-import/persistence/guest-import-persistence';
import {
  createGuestImportId,
  guestImportReducer,
  INITIAL_GUEST_IMPORT_STATE,
  type GuestImportAction,
  type GuestImportDomainCounts,
  type GuestImportState,
} from '@/features/guest-import/model/guest-import';
import { prepareGuestImport, readGuestImportSnapshot, runEmptyGuestImport } from '@/features/guest-import/persistence/guest-import-empty-account';
import { planExistingAccountMerge, readExistingAccountSnapshot } from '@/features/guest-import/persistence/guest-import-existing-account';
import { identityNamespace } from '@/shared/persistence/identity';
import { useIdentityHandle } from '@/shared/persistence/identity-provider';
import { useIdentityScopedDomain } from '@/shared/persistence/use-identity-scoped-domain';
import { getSupabaseClient } from '@/shared/supabase/supabase-client';
import { SYNC_DOMAINS } from '@/shared/sync/domain';

export interface UseGuestImportResult {
  readonly state: GuestImportState;
  readonly confirmImport: () => void;
  readonly cancelImport: () => void;
  readonly dismiss: () => void;
}

function mergeCounts(
  local: GuestImportDomainCounts,
  cloud: Readonly<Record<(typeof SYNC_DOMAINS)[number], number>>,
): GuestImportDomainCounts {
  const merged = { } as Record<string, { local: number; cloud: number }>;
  for (const domain of SYNC_DOMAINS) {
    merged[domain] = { local: local[domain].local, cloud: cloud[domain] };
  }
  return merged as GuestImportDomainCounts;
}

export function useGuestImport(): UseGuestImportResult {
  const { identity, generation } = useIdentityHandle();

  const { state, dispatch, hasHydrated, saveNow } = useIdentityScopedDomain<GuestImportState, GuestImportAction>({
    reducer: guestImportReducer,
    initialState: INITIAL_GUEST_IMPORT_STATE,
    load: loadGuestImportState,
    save: saveGuestImportState,
    createRestoreAction: (value) => ({ type: 'stateRestored', state: value }),
  });

  // Read fresh inside the async inventory closure below -- same rationale
  // as use-profile-domain-sync.ts's own latestRef: the imperative effect
  // must always see the current state/identity, not whatever was captured
  // when the effect closure was created, and must never re-fire just
  // because a ref changed.
  const latestRef = useRef({ state, dispatch, identity, saveNow });
  useLayoutEffect(() => {
    latestRef.current = { state, dispatch, identity, saveNow };
  }, [state, dispatch, identity, saveNow]);

  // Identity-change guard: mirrors use-logout-guard.ts's armedGenerationRef
  // pattern, simplified -- this hook has no "was a flow armed" precondition,
  // so any generation change after the first render is dispatched
  // unconditionally; the reducer itself decides whether it's a real
  // cancellation or a no-op (idle/completed/cancelled).
  const isFirstGenerationRenderRef = useRef(true);
  useEffect(() => {
    if (isFirstGenerationRenderRef.current) {
      isFirstGenerationRenderRef.current = false;
      return;
    }
    dispatch({ type: 'identityChanged', identityNamespace: identityNamespace(identity) });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires only on a genuine generation change, not on every identity/dispatch reference churn.
  }, [generation]);

  // Fresh-start kickoff: a truly untouched record (idle, no importId) for
  // a signed-in identity begins inventorying. Gated to at most once per
  // identity generation via `attemptedGenerationRef` -- without this, an
  // inventory failure (dispatched as `inventoryFailed`, which clears back
  // to idle/no-importId so a *manual* retry can start clean) would
  // otherwise be immediately re-kicked-off by this very effect on the next
  // render, forever, since idle+no-importId is indistinguishable from a
  // never-attempted state at the type level. One attempt per generation
  // also means a user-dismissed run (`dismissPressed` also resets to
  // idle+no-importId) is not immediately re-offered this same session.
  const attemptedGenerationRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!hasHydrated) return;
    if (identity.kind !== 'user') return;
    if (state.status !== 'idle' || state.importId !== undefined) return;
    if (attemptedGenerationRef.current === generation) return;
    attemptedGenerationRef.current = generation;

    const now = Date.now();
    dispatch({
      type: 'importRequested',
      importId: createGuestImportId(now, Math.random()),
      identityNamespace: identityNamespace(identity),
      now,
    });
  }, [hasHydrated, identity, generation, state.status, state.importId, dispatch]);

  // Runs the actual (read-only) local/cloud counting once per importId --
  // fires both for a freshly-requested import and for a resumed record
  // whose persisted status was already 'inventorying' (interrupted before
  // the counts even finished; nothing durable was captured yet, so this
  // re-reads rather than trusting stale in-flight data). Does NOT re-run
  // for a resumed 'awaitingConfirmation' -- that persisted inventory is
  // still valid because nothing has been uploaded yet.
  const inventoryStartedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!hasHydrated) return;
    if (identity.kind !== 'user') return;
    if (state.status !== 'inventorying') return;

    const importId = state.importId;
    if (importId === undefined) return;
    if (inventoryStartedRef.current.has(importId)) return;
    inventoryStartedRef.current.add(importId);

    let cancelled = false;
    const userId = identity.userId;

    (async () => {
      const localCounts = await countLocalGuestRecords(AsyncStorage);
      if (cancelled) return;

      const client = getSupabaseClient();
      if (client === null) {
        const latest = latestRef.current;
        if (latest.state.importId !== importId) return; // superseded
        latest.dispatch({
          type: 'inventoryFailed',
          importId,
          errorMessage: 'No cloud connection is available to check your account.',
          now: Date.now(),
        });
        return;
      }

      const transports = buildGuestImportTransports(client, userId);
      const cloudResult = await countCloudRecords(transports, userId);
      if (cancelled) return;

      const latest = latestRef.current;
      if (latest.state.importId !== importId) return; // superseded (identity changed, etc.)

      if (cloudResult.status === 'failed') {
        latest.dispatch({
          type: 'inventoryFailed',
          importId,
          errorMessage: cloudResult.errorMessage,
          now: Date.now(),
        });
        return;
      }

      latest.dispatch({
        type: 'inventoryCompleted',
        importId,
        inventory: mergeCounts(localCounts, cloudResult.counts),
        now: Date.now(),
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [hasHydrated, identity, state.status, state.importId]);

  const importStartedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!hasHydrated || identity.kind !== 'user' || state.status !== 'uploading' || state.targetKind === undefined) return;
    const importId = state.importId;
    if (importId === undefined || importStartedRef.current.has(importId)) return;
    importStartedRef.current.add(importId);
    let cancelled = false;
    const destinationIdentity = identity;
    void (async () => {
      try {
        let progress = latestRef.current.state.progress;
        if (progress === undefined && state.targetKind === 'empty') {
          const prepared = await prepareGuestImport({
            storage: AsyncStorage,
            destinationIdentity,
            destinationUserId: destinationIdentity.userId,
            importId,
            createdAt: Date.now(),
            createOperationId: (domain, recordId) => `guest-import-op-${importId}-${domain}-${recordId}`,
          });
          if (cancelled || latestRef.current.state.importId !== importId) return;
          progress = prepared.progress;
          latestRef.current.dispatch({ type: 'progressPrepared', importId, progress, now: Date.now() });
          await latestRef.current.saveNow?.({ ...latestRef.current.state, progress });
        }
        if (progress === undefined && state.targetKind === 'existing') {
          const source = await readGuestImportSnapshot(AsyncStorage);
          const client = getSupabaseClient();
          if (client === null) throw new Error('No cloud connection is available to import your guest data.');
          const transports = buildGuestImportTransports(client, destinationIdentity.userId);
          const target = await readExistingAccountSnapshot(transports, destinationIdentity.userId);
          if (target.status === 'failed') throw new Error(target.error.message);
          const planned = planExistingAccountMerge({
            guest: source,
            cloud: target.snapshot,
            destinationUserId: destinationIdentity.userId,
            importId,
            createdAt: Date.now(),
            createOperationId: (domain, recordId) => `guest-import-op-${importId}-${domain}-${recordId}`,
          });
          progress = { sourceIdentityNamespace: 'guest', destinationIdentityNamespace: identityNamespace(destinationIdentity), operations: planned.operations };
          if (cancelled || latestRef.current.state.importId !== importId) return;
          latestRef.current.dispatch({ type: 'existingMergePrepared', importId, progress, profileComparison: planned.profileComparison, deduplications: planned.deduplications, conflicts: planned.conflicts, now: Date.now() });
          await latestRef.current.saveNow?.({ ...latestRef.current.state, progress, profileComparison: planned.profileComparison, deduplications: planned.deduplications, conflicts: planned.conflicts });
        }
        if (progress === undefined) throw new Error('Guest import could not prepare its progress record.');
        const client = getSupabaseClient();
        if (client === null) throw new Error('No cloud connection is available to import your guest data.');
        const transports = buildGuestImportTransports(client, destinationIdentity.userId);
        // The hook remains inert when a test/dry-run inventory supplies no
        // mutation-capable transport; production adapters always expose push.
        if (typeof transports.profile?.push !== 'function') return;
        const result = await runEmptyGuestImport({
          storage: AsyncStorage,
          destinationIdentity,
          destinationUserId: destinationIdentity.userId,
          progress,
          repositories: transports,
          saveProgress: async (nextProgress) => {
            if (cancelled || latestRef.current.state.importId !== importId) return;
            latestRef.current.dispatch({ type: 'progressUpdated', importId, progress: nextProgress, now: Date.now() });
            await latestRef.current.saveNow?.({ ...latestRef.current.state, progress: nextProgress });
          },
        });
        if (cancelled || latestRef.current.state.importId !== importId || result.status !== 'completed') return;
        for (const domain of SYNC_DOMAINS) {
          const hasConflict = latestRef.current.state.conflicts.some((conflict) => conflict.domain === domain);
          latestRef.current.dispatch({ type: 'domainUploadSettled', importId, domain, outcome: { status: hasConflict ? 'conflict' : 'succeeded', errorMessage: undefined }, now: Date.now() });
        }
      } catch (error) {
        if (cancelled || latestRef.current.state.importId !== importId) return;
        const message = error instanceof Error ? error.message : 'Guest import could not be completed.';
        latestRef.current.dispatch({ type: 'domainUploadSettled', importId, domain: 'profile', outcome: { status: 'failed', errorMessage: message }, now: Date.now() });
      }
    })();
    return () => { cancelled = true; };
  }, [hasHydrated, identity, state.status, state.targetKind, state.importId]);

  const confirmImport = useCallback(() => {
    const latest = latestRef.current;
    if (latest.state.importId === undefined) return;
    latest.dispatch({ type: 'confirmPressed', importId: latest.state.importId, now: Date.now() });
  }, []);

  const cancelImport = useCallback(() => {
    const latest = latestRef.current;
    if (latest.state.importId === undefined) return;
    latest.dispatch({ type: 'cancelPressed', importId: latest.state.importId, now: Date.now() });
  }, []);

  const dismiss = useCallback(() => {
    dispatch({ type: 'dismissPressed' });
  }, [dispatch]);

  return { state, confirmImport, cancelImport, dismiss };
}
