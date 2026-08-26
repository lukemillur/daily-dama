// T158: the thin React driver wrapping logoutGuardReducer, mirroring
// use-sync-coordinator.tss own reducer+driver split. Consumes
// useAuthActions().signOut, useSyncCoordinatorStatus() (state,
// requestManualSync, pendingCount, discardAllPending), and
// useIdentityHandle() (generation). See .claude/plans/T158.md decision 6.

import { useCallback, useEffect, useReducer, useRef } from "react";

import { categorizeAuthError } from "@/features/auth/model/auth-errors";
import { logAuthWarning, trackAuthEvent } from "@/features/auth/observability/auth-observability";
import { useAuthActions } from "@/features/auth/state/auth-provider";
import {
  INITIAL_LOGOUT_GUARD_STATE,
  logoutGuardReducer,
  type LogoutGuardState,
} from "@/features/auth/state/logout-guard";
import { useIdentityHandle } from "@/shared/persistence/identity-provider";
import { useSyncCoordinatorStatus } from "@/shared/sync/sync-coordinator-provider";

export interface UseLogoutGuardResult {
  readonly state: LogoutGuardState;
  readonly pendingCount: number;
  readonly handleLogOutPress: () => void;
  readonly handleRetry: () => void;
  readonly handleDiscard: () => void;
  readonly handleCancel: () => void;
}

export function useLogoutGuard(): UseLogoutGuardResult {
  const { signOut } = useAuthActions();
  const { state: coordinatorState, requestManualSync, pendingCount, discardAllPending } = useSyncCoordinatorStatus();
  const { generation } = useIdentityHandle();

  const [state, dispatch] = useReducer(logoutGuardReducer, INITIAL_LOGOUT_GUARD_STATE);

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Stale-identity guard: captured the instant any non-idle flow starts
  // (handleLogOutPress, below), cleared once the flow returns to idle.
  // A generation change observed while armed aborts the local UI flow
  // immediately -- on top of, not instead of, the structural
  // checkIdentity/generation guards already inside discardPendingOperations,
  // the sync coordinators own identityChanged cancellation, and
  // AccountSections top-level authenticated-only render guard.
  const armedGenerationRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (state.status === "idle") {
      armedGenerationRef.current = undefined;
    }
  }, [state.status]);

  const statusRef = useRef(state.status);
  useEffect(() => {
    statusRef.current = state.status;
  });

  useEffect(() => {
    if (statusRef.current === "idle") return;
    if (armedGenerationRef.current === undefined) return;
    if (generation !== armedGenerationRef.current) {
      dispatch({ type: "reset" });
    }
  }, [generation]);

  const handleLogOutPress = useCallback(() => {
    armedGenerationRef.current = generation;
    dispatch({ type: "logOutPressed", pendingCount });
  }, [generation, pendingCount]);

  const handleRetry = useCallback(() => {
    dispatch({ type: "retryPressed" });
  }, []);

  const handleDiscard = useCallback(() => {
    dispatch({ type: "discardPressed" });
  }, []);

  const handleCancel = useCallback(() => {
    dispatch({ type: "cancelPressed" });
  }, []);

  // Retry: kick off a manual sync run the instant retrying is entered, then
  // wait for one full running -> idle transition of the shared
  // coordinators own state before reading the (now live) pendingCount and
  // reporting the outcome back to the reducer. Coalescing (a retry
  // requested while another run is already in flight) is covered for free
  // -- sawRunningRef only needs to observe running at any point while
  // armed, and coalescing still guarantees a subsequent full run completes
  // before the coordinator returns to idle.
  const retryArmedRef = useRef(false);
  const sawRunningRef = useRef(false);

  useEffect(() => {
    if (state.status !== "retrying") return;
    retryArmedRef.current = true;
    sawRunningRef.current = false;
    requestManualSync();
  }, [state.status, requestManualSync]);

  // Depends on state.status too (not just coordinatorState.status): a
  // retry that coalesces into an already-running run needs this effect to
  // notice retryArmedRef became true on the very render where status enters
  // retrying, even though coordinatorState.status itself does not change on
  // that render (it was already running before the retry was requested).
  // React runs a components effects in declaration order within one commit,
  // so the retry-enter effect above (which sets retryArmedRef) always runs
  // before this one on that shared render.
  useEffect(() => {
    if (!retryArmedRef.current) return;

    if (coordinatorState.status === "running") {
      sawRunningRef.current = true;
      return;
    }

    if (coordinatorState.status === "idle" && sawRunningRef.current) {
      retryArmedRef.current = false;
      sawRunningRef.current = false;
      if (!isMountedRef.current) return;
      dispatch({ type: "retryFinished", remainingPendingCount: pendingCount });
    }
  }, [state.status, coordinatorState.status, pendingCount]);

  // Discard: unconditional -- no re-check of pendingCount after the fact,
  // a discard always proceeds to sign-out.
  useEffect(() => {
    if (state.status !== "discarding") return;
    let cancelled = false;

    discardAllPending().then(() => {
      if (cancelled || !isMountedRef.current) return;
      dispatch({ type: "discardFinished" });
    });

    return () => {
      cancelled = true;
    };
  }, [state.status, discardAllPending]);

  // Sign-out: on success, deliberately do nothing else here --
  // AuthProviders own onAuthStateChange listener flips authState.status,
  // and AccountSections existing authenticated-only render guard naturally
  // unmounts everything, including any open prompt.
  useEffect(() => {
    if (state.status !== "signingOut") return;
    let cancelled = false;

    signOut().then(({ error }) => {
      if (error) {
        const category = categorizeAuthError(error);
        logAuthWarning("Log out failed.", error);
        trackAuthEvent("log_out_error", category);
        if (cancelled || !isMountedRef.current) return;
        dispatch({ type: "signOutFinished", error: category });
        return;
      }

      trackAuthEvent("log_out_success");
      if (cancelled || !isMountedRef.current) return;
      dispatch({ type: "signOutFinished", error: undefined });
    });

    return () => {
      cancelled = true;
    };
  }, [state.status, signOut]);

  return { state, pendingCount, handleLogOutPress, handleRetry, handleDiscard, handleCancel };
}
