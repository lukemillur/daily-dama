// The shared, cross-domain sync driver. Wraps the pure
// syncCoordinatorReducer (src/shared/sync/coordinator.ts) in a
// React hook that wires login, foreground, local-mutation, reconnection,
// and manual-retry triggers into it, with per-trigger debouncing/coalescing
// and an explicit guard against ever touching Sesh state (this hook never
// dispatches into any domains PRIMARY reducer itself -- each domains own
// runSync may do that internally on a pull-adopt, entirely inside that
// domains own driver, unrelated to anything here).
//
// Every timestamp/id is generated here, in the driver, never inside
// syncCoordinatorReducer itself -- same rule as sesh.ts reducer
// authority, generalized to this coordinator.

import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef } from "react";
import { AppState, Platform } from "react-native";

import { useIdentityHandle } from "@/shared/persistence/identity-provider";
import {
  createInitialCoordinatorState,
  createSyncRunId,
  syncCoordinatorReducer,
  type DomainSyncRecord,
  type SyncCoordinatorState,
  type SyncTrigger,
} from "@/shared/sync/coordinator";
import { SYNC_DOMAINS, type SyncDomain } from "@/shared/sync/domain";

// Foreground can fire AppState change more than once in quick succession
// (e.g. inactive -> active -> active again on some platforms); this throttle
// prevents a burst of foreground events from each starting their own run
// (the reducers own coalescing already handles two truly overlapping
// triggers -- this is specifically about not even requesting the second one
// so it does not become a spurious queuedRerunTrigger).
export const FOREGROUND_MIN_INTERVAL_MS = 15_000;

// Local mutations are the one trigger that genuinely needs debouncing: a
// user editing several fields in quick succession should batch into one
// sync run, not one run per keystroke-level change.
export const LOCAL_MUTATION_DEBOUNCE_MS = 800;

export interface SyncDomainHandle {
  readonly runSync: (trigger: SyncTrigger) => Promise<DomainSyncRecord>;
  readonly hasHydrated: boolean;
  readonly localMutationTick: number;
}

export type SyncDomainHandles = Readonly<Record<SyncDomain, SyncDomainHandle>>;

export interface UseSyncCoordinatorResult {
  readonly state: SyncCoordinatorState;
  readonly requestManualSync: () => void;
}

export function useSyncCoordinator(domains: SyncDomainHandles): UseSyncCoordinatorResult {
  const { identity, generation } = useIdentityHandle();

  const [state, dispatch] = useReducer(syncCoordinatorReducer, generation, createInitialCoordinatorState);

  // domains is a fresh object literal every render from the provider
  // wrapper -- stashed in a ref (synced in a layout effect, never written
  // during render) so the async run-driver effect below always reads the
  // latest runSync functions without needing the whole object in any
  // effects dependency array. Same rationale as every domain hooks own
  // latestRef.
  const domainsRef = useRef(domains);
  useLayoutEffect(() => {
    domainsRef.current = domains;
  });

  // The concrete unmount-cancels-stale-work mechanism for the run-driver
  // effect below -- guards every dispatch reached via an async
  // then/catch after unmount. The reducers own runId/generation
  // checks already make a stale result inert regardless; this only silences
  // the unmounted-update warning.
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const requestSync = useCallback(
    (trigger: SyncTrigger) => {
      if (identity.kind !== "user") return; // guests never sync
      dispatch({
        type: "syncRequested",
        trigger,
        identityGeneration: generation,
        runId: createSyncRunId(),
        now: Date.now(),
      });
    },
    [identity, generation],
  );

  // Mount-once effects below (foreground, reconnect) read requestSync
  // through this ref instead of depending on it directly, so they never
  // tear down and resubscribe their event listeners just because
  // requestSyncs identity/generation closure changed.
  const requestSyncRef = useRef(requestSync);
  useLayoutEffect(() => {
    requestSyncRef.current = requestSync;
  });

  // Shared between the identity-change effect (which must clear it
  // synchronously on logout/account-switch) and the local-mutation debounce
  // effect (which owns scheduling/clearing it during normal operation).
  const localMutationTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Identity-change cancellation: the reducer already cancels any in-flight
  // run and clears pendingRerunTrigger on identityChanged -- this effect
  // only detects the generation change and supplies the timestamp, plus
  // clears any queued local-mutation debounce synchronously so a stale
  // identitys queued debounce can never fire a trigger under the new
  // identity.
  const previousGenerationRef = useRef(generation);
  useEffect(() => {
    if (previousGenerationRef.current === generation) return;
    previousGenerationRef.current = generation;

    if (localMutationTimerRef.current !== undefined) {
      clearTimeout(localMutationTimerRef.current);
      localMutationTimerRef.current = undefined;
    }

    dispatch({ type: "identityChanged", identityGeneration: generation, now: Date.now() });
  }, [generation]);

  // Run-driver: once per runId, kick off every domains runSync and
  // report settlement back into the reducer via domainSettled. Trigger,
  // runId, and generation are all captured from state.run at kickoff, not
  // re-read later.
  const startedRunIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (state.status !== "running") return;
    if (startedRunIdRef.current === state.run.runId) return;
    startedRunIdRef.current = state.run.runId;

    const { runId, trigger, identityGeneration } = state.run;

    for (const domain of SYNC_DOMAINS) {
      const handle = domainsRef.current[domain];
      handle
        .runSync(trigger)
        .then((record) => {
          if (!isMountedRef.current) return;
          dispatch({
            type: "domainSettled",
            runId,
            identityGeneration,
            domain,
            outcome: record.outcome,
            now: Date.now(),
          });
        })
        .catch(() => {
          // Domain hooks are expected to catch and settle internally (see
          // e.g. use-profile-domain-sync.ts own runSyncImpl try/catch)
          // -- this is defense in depth only, so an unexpected rejection
          // never wedges the coordinator in running forever.
          if (!isMountedRef.current) return;
          dispatch({
            type: "domainSettled",
            runId,
            identityGeneration,
            domain,
            outcome: { status: "failed", errorMessage: "Unexpected sync driver error." },
            now: Date.now(),
          });
        });
    }
  }, [state]);

  // Pending-rerun: once a finished run surfaces a coalesced trigger, start
  // it immediately. Guarded per finished-run-id so the same rerun is never
  // requested twice for one lastRun.
  const consumedRerunForRunIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (state.status !== "idle" || state.pendingRerunTrigger === undefined || state.lastRun === undefined) return;
    if (consumedRerunForRunIdRef.current === state.lastRun.runId) return;
    consumedRerunForRunIdRef.current = state.lastRun.runId;
    requestSync(state.pendingRerunTrigger);
  }, [state, requestSync]);

  // Login: fires once per identity generation, once every domain reports
  // hydrated. Depends on explicit scalar hasHydrated values (not the
  // domains object, a fresh literal every render).
  const allDomainsHydrated = SYNC_DOMAINS.every((domain) => domains[domain].hasHydrated);
  const loginFiredGenerationRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (identity.kind !== "user") return;
    if (!allDomainsHydrated) return;
    if (loginFiredGenerationRef.current === generation) return;
    loginFiredGenerationRef.current = generation;
    requestSync("login");
  }, [identity, generation, allDomainsHydrated, requestSync]);

  // Local-mutation debounce: depends on the sum of every domains
  // localMutationTick (an explicit scalar, not the domains object).
  // Skips firing on mount itself (only a genuine subsequent bump schedules
  // a debounce) and clears/reschedules on every further bump within the
  // window.
  const localMutationTickSum = SYNC_DOMAINS.reduce((sum, domain) => sum + domains[domain].localMutationTick, 0);
  const previousTickSumRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (previousTickSumRef.current === undefined) {
      previousTickSumRef.current = localMutationTickSum;
      return;
    }
    if (previousTickSumRef.current === localMutationTickSum) return;
    previousTickSumRef.current = localMutationTickSum;

    if (localMutationTimerRef.current !== undefined) {
      clearTimeout(localMutationTimerRef.current);
    }
    localMutationTimerRef.current = setTimeout(() => {
      localMutationTimerRef.current = undefined;
      requestSyncRef.current("localMutation");
    }, LOCAL_MUTATION_DEBOUNCE_MS);

    return () => {
      if (localMutationTimerRef.current !== undefined) {
        clearTimeout(localMutationTimerRef.current);
        localMutationTimerRef.current = undefined;
      }
    };
  }, [localMutationTickSum]);

  // Foreground (mount-once): mirrors use-live-clock.ts own
  // AppState.addEventListener(change, ...) convention exactly.
  const lastForegroundAtRef = useRef(0);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active") return;
      const now = Date.now();
      if (now - lastForegroundAtRef.current < FOREGROUND_MIN_INTERVAL_MS) return;
      lastForegroundAtRef.current = now;
      requestSyncRef.current("foreground");
    });
    return () => {
      subscription.remove();
    };
  }, []);

  // Reconnect (mount-once, web-only): a plain browser connectivity signal,
  // not a Supabase Realtime subscription -- explicitly allowed despite this
  // tasks do-not-add-Realtime-subscriptions constraint, which is about
  // Realtime channels, not the browsers own online/offline events.
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return undefined;
    const handleOnline = () => requestSyncRef.current("reconnect");
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  const requestManualSync = useCallback(() => requestSync("manual"), [requestSync]);

  return useMemo(() => ({ state, requestManualSync }), [state, requestManualSync]);
}
