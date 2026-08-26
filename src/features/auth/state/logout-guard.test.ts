import { describe, expect, it } from "@jest/globals";

import {
  INITIAL_LOGOUT_GUARD_STATE,
  logoutGuardReducer,
  type LogoutGuardState,
} from "@/features/auth/state/logout-guard";

describe("logoutGuardReducer", () => {
  it("no-pending logout: logOutPressed with pendingCount 0 goes straight to signingOut, skipping prompt", () => {
    const next = logoutGuardReducer(INITIAL_LOGOUT_GUARD_STATE, { type: "logOutPressed", pendingCount: 0 });
    expect(next).toEqual({ status: "signingOut", retryFailed: false, errorCategory: undefined });
  });

  it("pending logout opens the prompt instead", () => {
    const next = logoutGuardReducer(INITIAL_LOGOUT_GUARD_STATE, { type: "logOutPressed", pendingCount: 3 });
    expect(next).toEqual({ status: "prompt", retryFailed: false, errorCategory: undefined });
  });

  it("a re-entrant logOutPressed while not idle is ignored", () => {
    const prompting: LogoutGuardState = { status: "prompt", retryFailed: false, errorCategory: undefined };
    const next = logoutGuardReducer(prompting, { type: "logOutPressed", pendingCount: 5 });
    expect(next).toBe(prompting);
  });

  it("retryPressed moves prompt to retrying", () => {
    const prompting: LogoutGuardState = { status: "prompt", retryFailed: false, errorCategory: undefined };
    const next = logoutGuardReducer(prompting, { type: "retryPressed" });
    expect(next).toEqual({ status: "retrying", retryFailed: false, errorCategory: undefined });
  });

  it("retryPressed is ignored outside prompt", () => {
    const next = logoutGuardReducer(INITIAL_LOGOUT_GUARD_STATE, { type: "retryPressed" });
    expect(next).toBe(INITIAL_LOGOUT_GUARD_STATE);
  });

  it("retry success: retryFinished with remainingPendingCount 0 proceeds to signingOut", () => {
    const retrying: LogoutGuardState = { status: "retrying", retryFailed: false, errorCategory: undefined };
    const next = logoutGuardReducer(retrying, { type: "retryFinished", remainingPendingCount: 0 });
    expect(next).toEqual({ status: "signingOut", retryFailed: false, errorCategory: undefined });
  });

  it("retry failure: retryFinished with remainingPendingCount > 0 returns to prompt with retryFailed true", () => {
    const retrying: LogoutGuardState = { status: "retrying", retryFailed: false, errorCategory: undefined };
    const next = logoutGuardReducer(retrying, { type: "retryFinished", remainingPendingCount: 2 });
    expect(next).toEqual({ status: "prompt", retryFailed: true, errorCategory: undefined });
  });

  it("retryFinished is ignored outside retrying", () => {
    const next = logoutGuardReducer(INITIAL_LOGOUT_GUARD_STATE, { type: "retryFinished", remainingPendingCount: 0 });
    expect(next).toBe(INITIAL_LOGOUT_GUARD_STATE);
  });

  it("discardPressed moves prompt to discarding", () => {
    const prompting: LogoutGuardState = { status: "prompt", retryFailed: true, errorCategory: undefined };
    const next = logoutGuardReducer(prompting, { type: "discardPressed" });
    expect(next).toEqual({ status: "discarding", retryFailed: true, errorCategory: undefined });
  });

  it("discard: discardFinished unconditionally proceeds to signingOut", () => {
    const discarding: LogoutGuardState = { status: "discarding", retryFailed: true, errorCategory: undefined };
    const next = logoutGuardReducer(discarding, { type: "discardFinished" });
    expect(next).toEqual({ status: "signingOut", retryFailed: false, errorCategory: undefined });
  });

  it("discardFinished is ignored outside discarding", () => {
    const next = logoutGuardReducer(INITIAL_LOGOUT_GUARD_STATE, { type: "discardFinished" });
    expect(next).toBe(INITIAL_LOGOUT_GUARD_STATE);
  });

  it("cancel: cancelPressed returns prompt to idle", () => {
    const prompting: LogoutGuardState = { status: "prompt", retryFailed: true, errorCategory: undefined };
    const next = logoutGuardReducer(prompting, { type: "cancelPressed" });
    expect(next).toEqual({ status: "idle", retryFailed: false, errorCategory: undefined });
  });

  it("cancelPressed is ignored outside prompt", () => {
    const next = logoutGuardReducer(INITIAL_LOGOUT_GUARD_STATE, { type: "cancelPressed" });
    expect(next).toBe(INITIAL_LOGOUT_GUARD_STATE);
  });

  it("sign-out failure surfaces errorCategory and returns to idle", () => {
    const signingOut: LogoutGuardState = { status: "signingOut", retryFailed: false, errorCategory: undefined };
    const next = logoutGuardReducer(signingOut, { type: "signOutFinished", error: "offline" });
    expect(next).toEqual({ status: "idle", retryFailed: false, errorCategory: "offline" });
  });

  it("sign-out success clears to idle with no error", () => {
    const signingOut: LogoutGuardState = { status: "signingOut", retryFailed: false, errorCategory: undefined };
    const next = logoutGuardReducer(signingOut, { type: "signOutFinished", error: undefined });
    expect(next).toEqual({ status: "idle", retryFailed: false, errorCategory: undefined });
  });

  it("signOutFinished is ignored outside signingOut", () => {
    const next = logoutGuardReducer(INITIAL_LOGOUT_GUARD_STATE, { type: "signOutFinished", error: "unknown" });
    expect(next).toBe(INITIAL_LOGOUT_GUARD_STATE);
  });

  it("reset returns to the initial state from every non-idle status", () => {
    const statuses: LogoutGuardState[] = [
      { status: "prompt", retryFailed: true, errorCategory: undefined },
      { status: "retrying", retryFailed: false, errorCategory: undefined },
      { status: "discarding", retryFailed: false, errorCategory: undefined },
      { status: "signingOut", retryFailed: false, errorCategory: undefined },
    ];
    for (const state of statuses) {
      expect(logoutGuardReducer(state, { type: "reset" })).toEqual(INITIAL_LOGOUT_GUARD_STATE);
    }
  });
});
