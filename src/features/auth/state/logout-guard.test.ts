import { describe, expect, it } from "@jest/globals";

import {
  INITIAL_LOGOUT_GUARD_STATE,
  logoutGuardReducer,
  type LogoutGuardState,
} from "@/features/auth/state/logout-guard";

describe("logoutGuardReducer", () => {
  it("no-pending logout: logOutPressed with pendingCount 0 goes straight to signingOut, skipping prompt", () => {
    const next = logoutGuardReducer(INITIAL_LOGOUT_GUARD_STATE, { type: "logOutPressed", pendingCount: 0 });
    expect(next).toEqual({ status: "signingOut", retryFailed: false, errorCategory: undefined, discardFailedDomains: undefined });
  });

  it("pending logout opens the prompt instead", () => {
    const next = logoutGuardReducer(INITIAL_LOGOUT_GUARD_STATE, { type: "logOutPressed", pendingCount: 3 });
    expect(next).toEqual({ status: "prompt", retryFailed: false, errorCategory: undefined, discardFailedDomains: undefined });
  });

  it("a re-entrant logOutPressed while not idle is ignored", () => {
    const prompting: LogoutGuardState = { status: "prompt", retryFailed: false, errorCategory: undefined, discardFailedDomains: undefined };
    const next = logoutGuardReducer(prompting, { type: "logOutPressed", pendingCount: 5 });
    expect(next).toBe(prompting);
  });

  it("logOutPressed clears a stale discardFailedDomains from a previous attempt", () => {
    const idleWithStaleFailure: LogoutGuardState = { status: "idle", retryFailed: false, errorCategory: undefined, discardFailedDomains: ["profile"] };
    const next = logoutGuardReducer(idleWithStaleFailure, { type: "logOutPressed", pendingCount: 2 });
    expect(next.discardFailedDomains).toBeUndefined();
  });

  it("retryPressed moves prompt to retrying", () => {
    const prompting: LogoutGuardState = { status: "prompt", retryFailed: false, errorCategory: undefined, discardFailedDomains: undefined };
    const next = logoutGuardReducer(prompting, { type: "retryPressed" });
    expect(next).toEqual({ status: "retrying", retryFailed: false, errorCategory: undefined, discardFailedDomains: undefined });
  });

  it("retryPressed is ignored outside prompt", () => {
    const next = logoutGuardReducer(INITIAL_LOGOUT_GUARD_STATE, { type: "retryPressed" });
    expect(next).toBe(INITIAL_LOGOUT_GUARD_STATE);
  });

  it("retry success: retryFinished with remainingPendingCount 0 proceeds to signingOut", () => {
    const retrying: LogoutGuardState = { status: "retrying", retryFailed: false, errorCategory: undefined, discardFailedDomains: undefined };
    const next = logoutGuardReducer(retrying, { type: "retryFinished", remainingPendingCount: 0 });
    expect(next).toEqual({ status: "signingOut", retryFailed: false, errorCategory: undefined, discardFailedDomains: undefined });
  });

  it("retry failure: retryFinished with remainingPendingCount > 0 returns to prompt with retryFailed true", () => {
    const retrying: LogoutGuardState = { status: "retrying", retryFailed: false, errorCategory: undefined, discardFailedDomains: undefined };
    const next = logoutGuardReducer(retrying, { type: "retryFinished", remainingPendingCount: 2 });
    expect(next).toEqual({ status: "prompt", retryFailed: true, errorCategory: undefined, discardFailedDomains: undefined });
  });

  it("retryFinished clears a stale discardFailedDomains from a previous discard attempt", () => {
    const retrying: LogoutGuardState = { status: "retrying", retryFailed: false, errorCategory: undefined, discardFailedDomains: ["profile"] };
    const next = logoutGuardReducer(retrying, { type: "retryFinished", remainingPendingCount: 2 });
    expect(next.discardFailedDomains).toBeUndefined();
  });

  it("retryFinished is ignored outside retrying", () => {
    const next = logoutGuardReducer(INITIAL_LOGOUT_GUARD_STATE, { type: "retryFinished", remainingPendingCount: 0 });
    expect(next).toBe(INITIAL_LOGOUT_GUARD_STATE);
  });

  it("discardPressed moves prompt to discarding and clears a stale discardFailedDomains", () => {
    const prompting: LogoutGuardState = { status: "prompt", retryFailed: true, errorCategory: undefined, discardFailedDomains: ["notes"] };
    const next = logoutGuardReducer(prompting, { type: "discardPressed" });
    expect(next).toEqual({ status: "discarding", retryFailed: true, errorCategory: undefined, discardFailedDomains: undefined });
  });

  it("discard success: discardFinished with a discarded outcome proceeds to signingOut", () => {
    const discarding: LogoutGuardState = { status: "discarding", retryFailed: true, errorCategory: undefined, discardFailedDomains: undefined };
    const next = logoutGuardReducer(discarding, { type: "discardFinished", outcome: { status: "discarded" } });
    expect(next).toEqual({ status: "signingOut", retryFailed: false, errorCategory: undefined, discardFailedDomains: undefined });
  });

  it("discard failure: discardFinished with a failed outcome returns to prompt, names the failed domains, and preserves retryFailed", () => {
    const discarding: LogoutGuardState = { status: "discarding", retryFailed: true, errorCategory: undefined, discardFailedDomains: undefined };
    const next = logoutGuardReducer(discarding, {
      type: "discardFinished",
      outcome: { status: "failed", domains: ["customTricks", "goals"] },
    });
    expect(next).toEqual({
      status: "prompt",
      retryFailed: true,
      errorCategory: undefined,
      discardFailedDomains: ["customTricks", "goals"],
    });
  });

  it("discard supersession: discardFinished with a superseded outcome resets to the initial state", () => {
    const discarding: LogoutGuardState = { status: "discarding", retryFailed: true, errorCategory: undefined, discardFailedDomains: undefined };
    const next = logoutGuardReducer(discarding, { type: "discardFinished", outcome: { status: "superseded" } });
    expect(next).toEqual(INITIAL_LOGOUT_GUARD_STATE);
  });

  it("discardFinished is ignored outside discarding", () => {
    const next = logoutGuardReducer(INITIAL_LOGOUT_GUARD_STATE, { type: "discardFinished", outcome: { status: "discarded" } });
    expect(next).toBe(INITIAL_LOGOUT_GUARD_STATE);
  });

  it("cancel: cancelPressed returns prompt to idle and clears discardFailedDomains", () => {
    const prompting: LogoutGuardState = { status: "prompt", retryFailed: true, errorCategory: undefined, discardFailedDomains: ["profile"] };
    const next = logoutGuardReducer(prompting, { type: "cancelPressed" });
    expect(next).toEqual({ status: "idle", retryFailed: false, errorCategory: undefined, discardFailedDomains: undefined });
  });

  it("cancelPressed is ignored outside prompt", () => {
    const next = logoutGuardReducer(INITIAL_LOGOUT_GUARD_STATE, { type: "cancelPressed" });
    expect(next).toBe(INITIAL_LOGOUT_GUARD_STATE);
  });

  it("sign-out failure surfaces errorCategory and returns to idle", () => {
    const signingOut: LogoutGuardState = { status: "signingOut", retryFailed: false, errorCategory: undefined, discardFailedDomains: undefined };
    const next = logoutGuardReducer(signingOut, { type: "signOutFinished", error: "offline" });
    expect(next).toEqual({ status: "idle", retryFailed: false, errorCategory: "offline", discardFailedDomains: undefined });
  });

  it("sign-out success clears to idle with no error", () => {
    const signingOut: LogoutGuardState = { status: "signingOut", retryFailed: false, errorCategory: undefined, discardFailedDomains: undefined };
    const next = logoutGuardReducer(signingOut, { type: "signOutFinished", error: undefined });
    expect(next).toEqual({ status: "idle", retryFailed: false, errorCategory: undefined, discardFailedDomains: undefined });
  });

  it("signOutFinished is ignored outside signingOut", () => {
    const next = logoutGuardReducer(INITIAL_LOGOUT_GUARD_STATE, { type: "signOutFinished", error: "unknown" });
    expect(next).toBe(INITIAL_LOGOUT_GUARD_STATE);
  });

  it("reset returns to the initial state from every non-idle status", () => {
    const statuses: LogoutGuardState[] = [
      { status: "prompt", retryFailed: true, errorCategory: undefined, discardFailedDomains: ["profile"] },
      { status: "retrying", retryFailed: false, errorCategory: undefined, discardFailedDomains: undefined },
      { status: "discarding", retryFailed: false, errorCategory: undefined, discardFailedDomains: undefined },
      { status: "signingOut", retryFailed: false, errorCategory: undefined, discardFailedDomains: undefined },
    ];
    for (const state of statuses) {
      expect(logoutGuardReducer(state, { type: "reset" })).toEqual(INITIAL_LOGOUT_GUARD_STATE);
    }
  });
});
