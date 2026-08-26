// T158: pure reducer for the current-device logout UI flow -- mirrors
// coordinator.tss syncCoordinatorReducer/use-sync-coordinator.ts pairing:
// this file owns only the state machine (no React, no signOut()/sync
// calls, no Date.now()/timers); the thin driver hook lives in
// use-logout-guard.ts. See .claude/plans/T158.md decision 5 for the full
// transition table this mirrors.

import type { AuthErrorCategory } from "@/features/auth/model/auth-errors";

export type LogoutGuardStatus = "idle" | "prompt" | "retrying" | "discarding" | "signingOut";

export interface LogoutGuardState {
  readonly status: LogoutGuardStatus;
  // True only after a Retry attempt still leaves pending operations --
  // drives the prompts retained failure copy. Cleared whenever the prompt
  // is freshly (re-)opened.
  readonly retryFailed: boolean;
  // Set only when the terminal signOut() call itself fails (offline/
  // unknown per T154.2s own trace) -- rendered the same way
  // account-section.tsx already renders it today.
  readonly errorCategory: AuthErrorCategory | undefined;
}

export type LogoutGuardAction =
  | { readonly type: "logOutPressed"; readonly pendingCount: number }
  | { readonly type: "retryPressed" }
  | { readonly type: "retryFinished"; readonly remainingPendingCount: number }
  | { readonly type: "discardPressed" }
  | { readonly type: "discardFinished" }
  | { readonly type: "cancelPressed" }
  | { readonly type: "signOutFinished"; readonly error: AuthErrorCategory | undefined }
  | { readonly type: "reset" };

export const INITIAL_LOGOUT_GUARD_STATE: LogoutGuardState = {
  status: "idle",
  retryFailed: false,
  errorCategory: undefined,
};

export function logoutGuardReducer(state: LogoutGuardState, action: LogoutGuardAction): LogoutGuardState {
  switch (action.type) {
    case "logOutPressed": {
      if (state.status !== "idle") return state; // re-entrant press guard
      if (action.pendingCount === 0) {
        return { status: "signingOut", retryFailed: false, errorCategory: undefined };
      }
      return { status: "prompt", retryFailed: false, errorCategory: undefined };
    }

    case "retryPressed": {
      if (state.status !== "prompt") return state;
      return { ...state, status: "retrying" };
    }

    case "retryFinished": {
      if (state.status !== "retrying") return state;
      if (action.remainingPendingCount === 0) {
        return { status: "signingOut", retryFailed: false, errorCategory: undefined };
      }
      return { status: "prompt", retryFailed: true, errorCategory: undefined };
    }

    case "discardPressed": {
      if (state.status !== "prompt") return state;
      return { ...state, status: "discarding" };
    }

    case "discardFinished": {
      if (state.status !== "discarding") return state;
      // Unconditional -- a discard always proceeds to sign-out regardless
      // of any residual count.
      return { status: "signingOut", retryFailed: false, errorCategory: undefined };
    }

    case "cancelPressed": {
      if (state.status !== "prompt") return state;
      return { status: "idle", retryFailed: false, errorCategory: undefined };
    }

    case "signOutFinished": {
      if (state.status !== "signingOut") return state;
      return { status: "idle", retryFailed: false, errorCategory: action.error };
    }

    case "reset":
      return INITIAL_LOGOUT_GUARD_STATE;
  }
}
