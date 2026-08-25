// T157.9: unit coverage for the shared sync driver in isolation, with
// injected fake SyncDomainHandles (no real domain hooks, no context) --
// mirrors the use-live-clock.test.tsx / use-profile-domain-sync.test.tsx
// harness convention (a captured-ref HookHost, jest.useFakeTimers()). The
// fully-wired, real-providers-plus-real-Sesh proof of Sesh isolation and
// single-flight coalescing lives in
// sync-coordinator.sesh-isolation.test.tsx; this file is the narrower,
// faster-to-debug unit layer underneath it.

import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { type PropsWithChildren, useEffect, useMemo, useState } from "react";
import { AppState } from "react-native";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

// A CommonJS require (rather than import * as ReactNative) resolves to the exact same
// module.exports object react-natives own named imports use elsewhere in this files module
// graph -- see landing-page.test.tsx for the full rationale. Needed here so mutating
// Platform.OS is visible to use-sync-coordinator.ts own import { Platform } from react-native.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ReactNative = require("react-native") as typeof import("react-native");

jest.mock("@react-native-async-storage/async-storage", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required by jest hoisting
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

import { createIdentityContext } from "@/shared/persistence/identity-context";
import { createUserIdentity, GUEST_IDENTITY, type Identity } from "@/shared/persistence/identity";
import { IdentityHandleContext } from "@/shared/persistence/identity-provider";
import type { DomainSyncRecord, SyncTrigger } from "@/shared/sync/coordinator";
import { SYNC_DOMAINS, type SyncDomain } from "@/shared/sync/domain";
import {
  FOREGROUND_MIN_INTERVAL_MS,
  LOCAL_MUTATION_DEBOUNCE_MS,
  useSyncCoordinator,
  type SyncDomainHandles,
  type UseSyncCoordinatorResult,
} from "@/shared/sync/use-sync-coordinator";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const USER_IDENTITY: Identity = createUserIdentity(USER_ID)!;

type DomainRecord<T> = Record<SyncDomain, T>;
type RunSyncFn = (trigger: SyncTrigger) => Promise<DomainSyncRecord>;

function allDomains<T>(value: T): DomainRecord<T> {
  const entries = SYNC_DOMAINS.map((domain) => [domain, value] as const);
  return Object.fromEntries(entries) as DomainRecord<T>;
}

function settled(domain: SyncDomain, status: "succeeded" | "failed"): DomainSyncRecord {
  const outcome = status === "succeeded" ? { status: "succeeded" as const } : { status: "failed" as const, errorMessage: "fake failure" };
  return { domain, outcome, settledAt: Date.now() };
}

type RunSyncMock = jest.Mock<(trigger: SyncTrigger) => Promise<DomainSyncRecord>>;

function createSucceedingMocks(): DomainRecord<RunSyncMock> {
  const entries = SYNC_DOMAINS.map(
    (domain) => [domain, jest.fn(async (_trigger: SyncTrigger) => settled(domain, "succeeded"))] as const,
  );
  return Object.fromEntries(entries) as DomainRecord<RunSyncMock>;
}

function createFailingMocks(): DomainRecord<RunSyncMock> {
  const entries = SYNC_DOMAINS.map(
    (domain) => [domain, jest.fn(async (_trigger: SyncTrigger) => settled(domain, "failed"))] as const,
  );
  return Object.fromEntries(entries) as DomainRecord<RunSyncMock>;
}

function createDeferred<T>(): { readonly promise: Promise<T>; readonly resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function idleLastRun(state: UseSyncCoordinatorResult["state"] | undefined) {
  return state?.status === "idle" ? state.lastRun : undefined;
}

interface Driver {
  readonly setIdentity: (next: Identity) => void;
}

// Same test-only stand-in for IdentityProvider as
// use-profile-domain-sync.test.tsx -- lets a test drive identity switches
// directly while exercising the real IdentityHandleContext the production
// hook (and, transitively, useSyncCoordinator) reads from.
function IdentityHandleTestProvider({
  children,
  initialIdentity,
  onDriverReady,
}: PropsWithChildren<{ readonly initialIdentity: Identity; readonly onDriverReady?: (driver: Driver) => void }>) {
  const [context] = useState(() => createIdentityContext(initialIdentity));
  const [handle, setHandle] = useState(() => ({
    identity: context.getIdentity(),
    generation: context.getGeneration(),
    context,
  }));

  if (onDriverReady) {
    onDriverReady({
      setIdentity: (next) => {
        const generation = context.setIdentity(next);
        setHandle({ identity: next, generation, context });
      },
    });
  }

  return <IdentityHandleContext.Provider value={handle}>{children}</IdentityHandleContext.Provider>;
}

interface Captured {
  result?: UseSyncCoordinatorResult;
}

interface HarnessProps {
  readonly hasHydrated: DomainRecord<boolean>;
  readonly localMutationTick: DomainRecord<number>;
  readonly runSyncMocks: DomainRecord<RunSyncFn>;
}

function makeHarness(captured: Captured) {
  return function Harness({ hasHydrated, localMutationTick, runSyncMocks }: HarnessProps) {
    const domains: SyncDomainHandles = useMemo(() => {
      const entries = SYNC_DOMAINS.map(
        (domain) =>
          [
            domain,
            { runSync: runSyncMocks[domain], hasHydrated: hasHydrated[domain], localMutationTick: localMutationTick[domain] },
          ] as const,
      );
      return Object.fromEntries(entries) as SyncDomainHandles;
    }, [hasHydrated, localMutationTick, runSyncMocks]);

    const result = useSyncCoordinator(domains);
    useEffect(() => {
      captured.result = result;
    });
    return null;
  };
}

async function mountHarness(
  props: HarnessProps,
  options: { readonly initialIdentity?: Identity; readonly onDriverReady?: (driver: Driver) => void } = {},
) {
  const captured: Captured = {};
  const Harness = makeHarness(captured);
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(
      <IdentityHandleTestProvider
        initialIdentity={options.initialIdentity ?? USER_IDENTITY}
        onDriverReady={options.onDriverReady}
      >
        <Harness {...props} />
      </IdentityHandleTestProvider>,
    );
  });
  return { root, captured, Harness };
}

async function updateHarness(
  root: ReactTestRenderer,
  Harness: ReturnType<typeof makeHarness>,
  props: HarnessProps,
  initialIdentity: Identity,
) {
  await act(async () => {
    root.update(
      <IdentityHandleTestProvider initialIdentity={initialIdentity}>
        <Harness {...props} />
      </IdentityHandleTestProvider>,
    );
  });
}

async function flush(times = 4) {
  for (let i = 0; i < times; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

describe("useSyncCoordinator", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("a single trigger runs all five domains and reaches idle with a completed outcome", async () => {
    const runSyncMocks = createSucceedingMocks();
    const { captured } = await mountHarness({ hasHydrated: allDomains(false), localMutationTick: allDomains(0), runSyncMocks });

    await act(async () => {
      captured.result?.requestManualSync();
    });
    await flush();

    expect(captured.result?.state.status).toBe("idle");
    expect(idleLastRun(captured.result?.state)?.outcome).toBe("completed");
    for (const domain of SYNC_DOMAINS) {
      expect(runSyncMocks[domain]).toHaveBeenCalledTimes(1);
      expect(runSyncMocks[domain]).toHaveBeenCalledWith("manual");
    }
  });

  it("two overlapping manual triggers coalesce into one in-flight run, then automatically start a second run", async () => {
    const runSyncMocks = createSucceedingMocks();
    const { captured } = await mountHarness({ hasHydrated: allDomains(false), localMutationTick: allDomains(0), runSyncMocks });

    act(() => {
      captured.result?.requestManualSync();
      captured.result?.requestManualSync();
    });

    // Only the first (coalesced) run has actually started so far -- one call
    // each, not doubled.
    for (const domain of SYNC_DOMAINS) {
      expect(runSyncMocks[domain]).toHaveBeenCalledTimes(1);
    }

    await flush();

    // The coalesced second trigger automatically started and completed a
    // second run once the first settled.
    for (const domain of SYNC_DOMAINS) {
      expect(runSyncMocks[domain]).toHaveBeenCalledTimes(2);
    }
    expect(idleLastRun(captured.result?.state)?.outcome).toBe("completed");
  });

  it("all five domains failing (offline) still reaches completed, never throws, and a later trigger runs normally", async () => {
    const runSyncMocks = createFailingMocks();
    const { captured } = await mountHarness({ hasHydrated: allDomains(false), localMutationTick: allDomains(0), runSyncMocks });

    await act(async () => {
      captured.result?.requestManualSync();
    });
    await flush();

    expect(idleLastRun(captured.result?.state)?.outcome).toBe("completed");
    for (const domain of SYNC_DOMAINS) {
      expect(idleLastRun(captured.result?.state)?.domainResults[domain]?.outcome).toEqual({
        status: "failed",
        errorMessage: "fake failure",
      });
    }

    for (const domain of SYNC_DOMAINS) {
      runSyncMocks[domain].mockImplementation(async () => settled(domain, "succeeded"));
    }

    await act(async () => {
      captured.result?.requestManualSync();
    });
    await flush();

    expect(idleLastRun(captured.result?.state)?.outcome).toBe("completed");
    for (const domain of SYNC_DOMAINS) {
      expect(idleLastRun(captured.result?.state)?.domainResults[domain]?.outcome).toEqual({ status: "succeeded" });
    }
  });

  it("fires login exactly once per identity generation, once every domain has hydrated", async () => {
    const runSyncMocks = createSucceedingMocks();
    const initialHydrated: DomainRecord<boolean> = { ...allDomains(true), profile: false };
    const { root, captured, Harness } = await mountHarness({
      hasHydrated: initialHydrated,
      localMutationTick: allDomains(0),
      runSyncMocks,
    });
    await flush();

    for (const domain of SYNC_DOMAINS) {
      expect(runSyncMocks[domain]).not.toHaveBeenCalled();
    }
    expect(captured.result?.state.status).toBe("idle");
    expect(idleLastRun(captured.result?.state)).toBeUndefined();

    await updateHarness(
      root,
      Harness,
      { hasHydrated: allDomains(true), localMutationTick: allDomains(0), runSyncMocks },
      USER_IDENTITY,
    );
    await flush();

    for (const domain of SYNC_DOMAINS) {
      expect(runSyncMocks[domain]).toHaveBeenCalledTimes(1);
      expect(runSyncMocks[domain]).toHaveBeenCalledWith("login");
    }

    // Rerendering again at the same generation must not fire a second login run.
    await updateHarness(
      root,
      Harness,
      { hasHydrated: allDomains(true), localMutationTick: allDomains(0), runSyncMocks },
      USER_IDENTITY,
    );
    await flush();

    for (const domain of SYNC_DOMAINS) {
      expect(runSyncMocks[domain]).toHaveBeenCalledTimes(1);
    }
  });

  it("debounces rapid local-mutation ticks into a single localMutation run", async () => {
    jest.useFakeTimers();
    try {
      const runSyncMocks = createSucceedingMocks();
      const { root, Harness } = await mountHarness({
        hasHydrated: allDomains(false),
        localMutationTick: allDomains(0),
        runSyncMocks,
      });

      for (let tick = 1; tick <= 3; tick += 1) {
        await updateHarness(
          root,
          Harness,
          { hasHydrated: allDomains(false), localMutationTick: { ...allDomains(0), profile: tick }, runSyncMocks },
          USER_IDENTITY,
        );
      }

      act(() => {
        jest.advanceTimersByTime(LOCAL_MUTATION_DEBOUNCE_MS - 100);
      });
      for (const domain of SYNC_DOMAINS) {
        expect(runSyncMocks[domain]).not.toHaveBeenCalled();
      }

      act(() => {
        jest.advanceTimersByTime(200);
      });
      await flush();

      for (const domain of SYNC_DOMAINS) {
        expect(runSyncMocks[domain]).toHaveBeenCalledTimes(1);
        expect(runSyncMocks[domain]).toHaveBeenCalledWith("localMutation");
      }
    } finally {
      jest.useRealTimers();
    }
  });

  it("throttles rapid foreground events but allows a new run after the interval", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(1_000_000);
    try {
      const runSyncMocks = createSucceedingMocks();
      await mountHarness({ hasHydrated: allDomains(false), localMutationTick: allDomains(0), runSyncMocks });

      const addEventListenerMock = AppState.addEventListener as jest.Mock;
      const handler = addEventListenerMock.mock.calls[addEventListenerMock.mock.calls.length - 1][1] as (
        state: string,
      ) => void;

      act(() => {
        handler("active");
      });
      await flush();
      for (const domain of SYNC_DOMAINS) {
        expect(runSyncMocks[domain]).toHaveBeenCalledTimes(1);
        expect(runSyncMocks[domain]).toHaveBeenCalledWith("foreground");
      }

      jest.setSystemTime(1_000_000 + 1_000);
      act(() => {
        handler("active");
      });
      await flush();
      // Still within FOREGROUND_MIN_INTERVAL_MS of the first -- throttled.
      for (const domain of SYNC_DOMAINS) {
        expect(runSyncMocks[domain]).toHaveBeenCalledTimes(1);
      }

      jest.setSystemTime(1_000_000 + FOREGROUND_MIN_INTERVAL_MS + 1_000);
      act(() => {
        handler("active");
      });
      await flush();
      for (const domain of SYNC_DOMAINS) {
        expect(runSyncMocks[domain]).toHaveBeenCalledTimes(2);
      }
    } finally {
      jest.useRealTimers();
    }
  });

  it("fires a run on a browser online event (web only)", async () => {
    const originalPlatformOS = ReactNative.Platform.OS;
    const listeners: Record<string, ((event: unknown) => void)[]> = {};
    const fakeWindow = {
      addEventListener: (type: string, handler: (event: unknown) => void) => {
        (listeners[type] ??= []).push(handler);
      },
      removeEventListener: (type: string, handler: (event: unknown) => void) => {
        listeners[type] = (listeners[type] ?? []).filter((existing) => existing !== handler);
      },
    };

    ReactNative.Platform.OS = "web";
    (globalThis as { window?: unknown }).window = fakeWindow;

    try {
      const runSyncMocks = createSucceedingMocks();
      await mountHarness({ hasHydrated: allDomains(false), localMutationTick: allDomains(0), runSyncMocks });

      await act(async () => {
        listeners.online?.forEach((handler) => handler(new Event("online")));
      });
      await flush();

      for (const domain of SYNC_DOMAINS) {
        expect(runSyncMocks[domain]).toHaveBeenCalledTimes(1);
        expect(runSyncMocks[domain]).toHaveBeenCalledWith("reconnect");
      }
    } finally {
      ReactNative.Platform.OS = originalPlatformOS;
      delete (globalThis as { window?: unknown }).window;
    }
  });

  it("a manual retry request fires a run with trigger manual", async () => {
    const runSyncMocks = createSucceedingMocks();
    const { captured } = await mountHarness({ hasHydrated: allDomains(false), localMutationTick: allDomains(0), runSyncMocks });

    await act(async () => {
      captured.result?.requestManualSync();
    });
    await flush();

    for (const domain of SYNC_DOMAINS) {
      expect(runSyncMocks[domain]).toHaveBeenCalledWith("manual");
    }
  });

  it("unmount cancels a pending local-mutation debounce timer, logging no console errors", async () => {
    jest.useFakeTimers();
    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      const runSyncMocks = createSucceedingMocks();
      const { root, Harness } = await mountHarness({
        hasHydrated: allDomains(false),
        localMutationTick: allDomains(0),
        runSyncMocks,
      });

      await updateHarness(
        root,
        Harness,
        { hasHydrated: allDomains(false), localMutationTick: { ...allDomains(0), profile: 1 }, runSyncMocks },
        USER_IDENTITY,
      );

      act(() => {
        root.unmount();
      });

      act(() => {
        jest.advanceTimersByTime(LOCAL_MUTATION_DEBOUNCE_MS + 1_000);
      });
      await flush();

      for (const domain of SYNC_DOMAINS) {
        expect(runSyncMocks[domain]).not.toHaveBeenCalled();
      }
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    } finally {
      consoleErrorSpy.mockRestore();
      jest.useRealTimers();
    }
  });

  it("an identity change (logout) mid-run immediately reflects idle at the new generation, and inert late results", async () => {
    const deferreds = Object.fromEntries(
      SYNC_DOMAINS.map((domain) => [domain, createDeferred<DomainSyncRecord>()]),
    ) as DomainRecord<ReturnType<typeof createDeferred<DomainSyncRecord>>>;
    const runSyncMocks = Object.fromEntries(
      SYNC_DOMAINS.map(
        (domain) => [domain, jest.fn(async (_trigger: SyncTrigger) => deferreds[domain].promise)] as const,
      ),
    ) as DomainRecord<RunSyncMock>;

    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    let driver: Driver | undefined;
    try {
      const { captured } = await mountHarness(
        { hasHydrated: allDomains(false), localMutationTick: allDomains(0), runSyncMocks },
        { onDriverReady: (d) => { driver = d; } },
      );

      await act(async () => {
        captured.result?.requestManualSync();
      });

      expect(captured.result?.state.status).toBe("running");
      const startingGeneration = captured.result?.state.identityGeneration;

      await act(async () => {
        driver?.setIdentity(GUEST_IDENTITY);
      });

      expect(captured.result?.state.status).toBe("idle");
      expect(captured.result?.state.identityGeneration).not.toBe(startingGeneration);
      const stateAfterCancel = captured.result?.state;

      for (const domain of SYNC_DOMAINS) {
        deferreds[domain].resolve(settled(domain, "succeeded"));
      }
      await flush();

      expect(captured.result?.state).toEqual(stateAfterCancel);
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });
});
