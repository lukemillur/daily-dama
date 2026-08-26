// T158: driver-hook unit coverage for useLogoutGuard, with useAuthActions,
// useSyncCoordinatorStatus, and useIdentityHandle mocked directly (no real
// provider tree) -- mirrors use-sync-coordinator.test.tsxs own
// injected-fake-handles convention. The end-to-end proof through the real
// AccountSection + LogoutPrompt UI lives in account-section.test.tsx; the
// cross-domain durability proof lives in
// sync-coordinator-provider.test.tsx.

import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { useEffect, useState } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

import type { SyncCoordinatorState } from "@/shared/sync/coordinator";

const mockSignOut = jest.fn<() => Promise<{ error: unknown }>>();

jest.mock("@/features/auth/state/auth-provider", () => ({
  useAuthActions: () => ({ signOut: mockSignOut }),
}));

let mockGeneration = 1;

jest.mock("@/shared/persistence/identity-provider", () => ({
  useIdentityHandle: () => ({
    identity: { kind: "user", userId: "11111111-1111-1111-1111-111111111111" },
    generation: mockGeneration,
    context: {},
  }),
}));

const mockRequestManualSync = jest.fn<() => void>();
const mockDiscardAllPending = jest.fn<() => Promise<void>>();
let mockCoordinatorState: SyncCoordinatorState = { status: "idle", identityGeneration: 1, lastRun: undefined, pendingRerunTrigger: undefined };
let mockPendingCount = 0;

jest.mock("@/shared/sync/sync-coordinator-provider", () => ({
  useSyncCoordinatorStatus: () => ({
    state: mockCoordinatorState,
    requestManualSync: mockRequestManualSync,
    pendingCount: mockPendingCount,
    discardAllPending: mockDiscardAllPending,
  }),
}));

import { useLogoutGuard, type UseLogoutGuardResult } from "@/features/auth/state/use-logout-guard";

function runningState(): SyncCoordinatorState {
  return {
    status: "running",
    identityGeneration: 1,
    run: {
      runId: "run-1",
      identityGeneration: 1,
      trigger: "manual",
      startedAt: 0,
      domainResults: {},
      queuedRerunTrigger: undefined,
    },
  };
}

function idleState(): SyncCoordinatorState {
  return { status: "idle", identityGeneration: 1, lastRun: undefined, pendingRerunTrigger: undefined };
}

interface Captured {
  result?: UseLogoutGuardResult;
  forceRerender?: () => void;
}

function makeHarness(captured: Captured) {
  return function Harness() {
    const [, setTick] = useState(0);
    useEffect(() => {
      captured.forceRerender = () => setTick((tick) => tick + 1);
    });

    const result = useLogoutGuard();
    useEffect(() => {
      captured.result = result;
    });

    return null;
  };
}

async function mountHarness() {
  const captured: Captured = {};
  const Harness = makeHarness(captured);
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(<Harness />);
  });
  return { root, captured };
}

async function flush(times = 4) {
  for (let i = 0; i < times; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

function rerender(captured: Captured) {
  captured.forceRerender?.();
}

describe("useLogoutGuard", () => {
  beforeEach(() => {
    mockSignOut.mockReset();
    mockRequestManualSync.mockReset();
    mockDiscardAllPending.mockReset();
    mockDiscardAllPending.mockResolvedValue(undefined);
    mockGeneration = 1;
    mockCoordinatorState = idleState();
    mockPendingCount = 0;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("no-pending logout: signs out directly without opening the prompt", async () => {
    mockPendingCount = 0;
    mockSignOut.mockResolvedValue({ error: null });
    const { root, captured } = await mountHarness();

    await act(async () => {
      captured.result?.handleLogOutPress();
      await Promise.resolve();
    });
    await flush();

    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(captured.result?.state.status).toBe("idle");
    expect(captured.result?.state.errorCategory).toBeUndefined();

    act(() => root.unmount());
  });

  it("pending logout opens the prompt instead of signing out", async () => {
    mockPendingCount = 3;
    const { root, captured } = await mountHarness();

    act(() => {
      captured.result?.handleLogOutPress();
    });
    await flush();

    expect(captured.result?.state.status).toBe("prompt");
    expect(mockSignOut).not.toHaveBeenCalled();

    act(() => root.unmount());
  });

  it("successful retry proceeds to sign-out once the coordinator returns to idle with no pending operations", async () => {
    mockPendingCount = 2;
    mockSignOut.mockResolvedValue({ error: null });
    const { root, captured } = await mountHarness();
    mockRequestManualSync.mockImplementation(() => {
      mockCoordinatorState = runningState();
      rerender(captured);
    });

    act(() => captured.result?.handleLogOutPress());
    await flush();
    act(() => captured.result?.handleRetry());
    await flush();

    expect(captured.result?.state.status).toBe("retrying");
    expect(mockRequestManualSync).toHaveBeenCalledTimes(1);

    act(() => {
      mockPendingCount = 0;
      mockCoordinatorState = idleState();
      rerender(captured);
    });
    await flush();

    expect(captured.result?.state.status).toBe("idle");
    expect(mockSignOut).toHaveBeenCalledTimes(1);

    act(() => root.unmount());
  });

  it("failed retry (offline-flavored) keeps the prompt open with retryFailed and never calls signOut", async () => {
    mockPendingCount = 2;
    const { root, captured } = await mountHarness();
    mockRequestManualSync.mockImplementation(() => {
      mockCoordinatorState = runningState();
      rerender(captured);
    });

    act(() => captured.result?.handleLogOutPress());
    await flush();
    act(() => captured.result?.handleRetry());
    await flush();

    act(() => {
      mockPendingCount = 2;
      mockCoordinatorState = idleState();
      rerender(captured);
    });
    await flush();

    expect(captured.result?.state.status).toBe("prompt");
    expect(captured.result?.state.retryFailed).toBe(true);
    expect(mockSignOut).not.toHaveBeenCalled();

    act(() => root.unmount());
  });

  it("a retry that coalesces into an already-running run still resolves once that run finishes", async () => {
    mockPendingCount = 1;
    mockSignOut.mockResolvedValue({ error: null });
    mockCoordinatorState = runningState();
    const { root, captured } = await mountHarness();
    mockRequestManualSync.mockImplementation(() => {
      // Coalesced: requestManualSync does not itself start a new visible
      // running transition, the caller just folds into the existing run.
    });

    act(() => captured.result?.handleLogOutPress());
    await flush();
    act(() => captured.result?.handleRetry());
    await flush();

    expect(captured.result?.state.status).toBe("retrying");

    act(() => {
      mockPendingCount = 0;
      mockCoordinatorState = idleState();
      rerender(captured);
    });
    await flush();

    expect(captured.result?.state.status).toBe("idle");
    expect(mockSignOut).toHaveBeenCalledTimes(1);

    act(() => root.unmount());
  });

  it("a same-tick-fast domain sync (runSync resolving immediately) still resolves via microtask ordering, not a hang", async () => {
    mockPendingCount = 1;
    mockSignOut.mockResolvedValue({ error: null });
    const { root, captured } = await mountHarness();
    mockRequestManualSync.mockImplementation(() => {
      mockCoordinatorState = runningState();
      rerender(captured);
      Promise.resolve().then(() => {
        mockPendingCount = 0;
        mockCoordinatorState = idleState();
        rerender(captured);
      });
    });

    act(() => captured.result?.handleLogOutPress());
    await flush();
    await act(async () => {
      captured.result?.handleRetry();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    await flush();

    expect(captured.result?.state.status).toBe("idle");
    expect(mockSignOut).toHaveBeenCalledTimes(1);

    act(() => root.unmount());
  });

  it("cancel dismisses the prompt without signing out", async () => {
    mockPendingCount = 4;
    const { root, captured } = await mountHarness();

    act(() => captured.result?.handleLogOutPress());
    await flush();
    act(() => captured.result?.handleCancel());
    await flush();

    expect(captured.result?.state.status).toBe("idle");
    expect(mockSignOut).not.toHaveBeenCalled();

    act(() => root.unmount());
  });

  it("discard unconditionally proceeds to sign-out after discardAllPending resolves", async () => {
    mockPendingCount = 4;
    mockSignOut.mockResolvedValue({ error: null });
    const { root, captured } = await mountHarness();

    act(() => captured.result?.handleLogOutPress());
    await flush();
    act(() => captured.result?.handleDiscard());
    await flush();

    expect(mockDiscardAllPending).toHaveBeenCalledTimes(1);
    expect(captured.result?.state.status).toBe("idle");
    expect(mockSignOut).toHaveBeenCalledTimes(1);

    act(() => root.unmount());
  });

  it("an identity/generation change while the prompt is open aborts the flow without signing out or discarding", async () => {
    mockPendingCount = 3;
    const { root, captured } = await mountHarness();

    act(() => captured.result?.handleLogOutPress());
    await flush();
    expect(captured.result?.state.status).toBe("prompt");

    act(() => {
      mockGeneration = 2;
      rerender(captured);
    });
    await flush();

    expect(captured.result?.state.status).toBe("idle");
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(mockDiscardAllPending).not.toHaveBeenCalled();

    act(() => root.unmount());
  });

  it("an identity/generation change during an in-flight discard aborts without calling signOut", async () => {
    mockPendingCount = 3;
    let resolveDiscard!: () => void;
    mockDiscardAllPending.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveDiscard = resolve;
        }),
    );
    const { root, captured } = await mountHarness();

    act(() => captured.result?.handleLogOutPress());
    await flush();
    act(() => captured.result?.handleDiscard());
    await flush();

    expect(captured.result?.state.status).toBe("discarding");

    act(() => {
      mockGeneration = 2;
      rerender(captured);
    });
    await flush();

    expect(captured.result?.state.status).toBe("idle");

    await act(async () => {
      resolveDiscard();
      await Promise.resolve();
    });
    await flush();

    expect(mockSignOut).not.toHaveBeenCalled();

    act(() => root.unmount());
  });
});
