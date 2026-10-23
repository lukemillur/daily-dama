// Pure reducer for the current-device logout UI flow -- mirrors
// coordinator.tss syncCoordinatorReducer/use-sync-coordinator.ts pairing:
// this file owns only the state machine (no React, no signOut()/sync
// calls, no Date.now()/timers); the thin driver hook lives in
// use-logout-guard.ts. A failed or superseded discard never reaches
// `signingOut` (see DESLOPPIFY.md D001).

import type { AuthErrorCategory } from "@/features/auth/model/auth-errors";
import type { SyncDomain } from "@/shared/sync/domain";

export type LogoutGuardStatus = "idle" | "prompt" | "retrying" | "discarding" | "signingOut";

export type LogoutGuardDiscardOutcome =
  | { readonly status: "discarded" }
  | { readonly status: "failed"; readonly domains: readonly SyncDomain[] }
  | { readonly status: "superseded" };

export interface LogoutGuardState {
  readonly status: LogoutGuardStatus;
  // True only after a Retry attempt still leaves pending operations --
  // drives the prompts retained failure copy. Cleared whenever the prompt
  // is freshly (re-)opened.
  readonly retryFailed: boolean;
  // Set only when the terminal signOut() call itself fails (offline/
  // unknown in practice) -- rendered the same way
  // account-section.tsx already renders it today.
  readonly errorCategory: AuthErrorCategory | undefined;
  // Set only when a discard attempt left at least one domain's pending
  // operations unwritten -- drives the prompt's discard-failure copy.
  // Cleared by any fresh attempt (retry, discard, cancel, a new logout
  // press) or terminal transition; the only state that sets it is the
  // discarding-to-prompt failure transition below.
  readonly discardFailedDomains: readonly SyncDomain[] | undefined;
}

export type LogoutGuardAction =
  | { readonly type: "logOutPressed"; readonly pendingCount: number }
  | { readonly type: "retryPressed" }
  | { readonly type: "retryFinished"; readonly remainingPendingCount: number }
  | { readonly type: "discardPressed" }
  | { readonly type: "discardFinished"; readonly outcome: LogoutGuardDiscardOutcome }
  | { readonly type: "cancelPressed" }
  | { readonly type: "signOutFinished"; readonly error: AuthErrorCategory | undefined }
  | { readonly type: "reset" };

export const INITIAL_LOGOUT_GUARD_STATE: LogoutGuardState = {
  status: "idle",
  retryFailed: false,
  errorCategory: undefined,
  discardFailedDomains: undefined,
};

export function logoutGuardReducer(state: LogoutGuardState, action: LogoutGuardAction): LogoutGuardState {
  switch (action.type) {
    case "logOutPressed": {
      if (state.status !== "idle") return state; // re-entrant press guard
      if (action.pendingCount === 0) {
        return { status: "signingOut", retryFailed: false, errorCategory: undefined, discardFailedDomains: undefined };
      }
      return { status: "prompt", retryFailed: false, errorCategory: undefined, discardFailedDomains: undefined };
    }

    case "retryPressed": {
      if (state.status !== "prompt") return state;
      return { ...state, status: "retrying" };
    }

    case "retryFinished": {
      if (state.status !== "retrying") return state;
      if (action.remainingPendingCount === 0) {
        return { status: "signingOut", retryFailed: false, errorCategory: undefined, discardFailedDomains: undefined };
      }
      return { ...state, status: "prompt", retryFailed: true, errorCategory: undefined, discardFailedDomains: undefined };
    }

    case "discardPressed": {
      if (state.status !== "prompt") return state;
      return { ...state, status: "discarding", discardFailedDomains: undefined };
    }

    case "discardFinished": {
      if (state.status !== "discarding") return state;
      switch (action.outcome.status) {
        case "discarded":
          return { status: "signingOut", retryFailed: false, errorCategory: undefined, discardFailedDomains: undefined };
        case "failed":
          // A prior failed retry is still true and its copy is still useful.
          return { ...state, status: "prompt", discardFailedDomains: action.outcome.domains, errorCategory: undefined };
        case "superseded":
          return INITIAL_LOGOUT_GUARD_STATE;
      }
    }

    case "cancelPressed": {
      if (state.status !== "prompt") return state;
      return { status: "idle", retryFailed: false, errorCategory: undefined, discardFailedDomains: undefined };
    }

    case "signOutFinished": {
      if (state.status !== "signingOut") return state;
      return { status: "idle", retryFailed: false, errorCategory: action.error, discardFailedDomains: undefined };
    }

    case "reset":
      return INITIAL_LOGOUT_GUARD_STATE;
  }
}
