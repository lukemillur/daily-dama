import { afterEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { type PropsWithChildren, useEffect, useState } from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { IdentityHandleContext } from '@/shared/persistence/identity-provider';
import { createIdentityContext } from '@/shared/persistence/identity-context';
import type { Identity } from '@/shared/persistence/identity';
import type { KeyValueStorage, PersistenceSaveResult, ScopedSaveOutcome } from '@/shared/persistence/storage';
import {
  useIdentityScopedDomain,
  type UseIdentityScopedDomainOptions,
} from '@/shared/persistence/use-identity-scoped-domain';

// The hook always constructs a `createGuestMigratingStorage(AsyncStorage, ...)` internally, even
// though every test here supplies its own `load`/`save` that ignore it. Mocked the same way every
// other provider test in this repo mocks it.
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required by jest hoisting
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const USER_A: Identity = { kind: 'user', userId: '11111111-1111-1111-1111-111111111111' };
const USER_B: Identity = { kind: 'user', userId: '22222222-2222-2222-2222-222222222222' };

interface FakeState {
  readonly value: number;
}

type FakeAction =
  | { readonly type: 'valueSet'; readonly value: number }
  | { readonly type: 'restored'; readonly value: number };

function fakeReducer(state: FakeState, action: FakeAction): FakeState {
  switch (action.type) {
    case 'valueSet':
      return { value: action.value };
    case 'restored':
      return { value: action.value };
  }
}

const INITIAL_FAKE_STATE: FakeState = { value: 0 };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

interface Driver {
  readonly setIdentity: (next: Identity) => void;
}

/**
 * Test-only stand-in for `IdentityProvider` that lets a test drive identity switches directly
 * (bypassing Auth entirely) while exercising the real `IdentityHandleContext` the production hook
 * reads from. Exposes a `Driver` via `onDriverReady` so tests can trigger a generation change from
 * outside React and have it flow through as a real context value update.
 */
function IdentityHandleTestProvider({
  children,
  onDriverReady,
}: PropsWithChildren<{ readonly onDriverReady: (driver: Driver) => void }>) {
  const [context] = useState(() => createIdentityContext());
  const [handle, setHandle] = useState(() => ({
    identity: context.getIdentity(),
    generation: context.getGeneration(),
    context,
  }));

  onDriverReady({
    setIdentity: (next) => {
      const generation = context.setIdentity(next);
      setHandle({ identity: next, generation, context });
    },
  });

  return <IdentityHandleContext.Provider value={handle}>{children}</IdentityHandleContext.Provider>;
}

interface Captured {
  state?: FakeState;
  hasHydrated?: boolean;
  setValue?: (value: number) => void;
  setIdentity?: (next: Identity) => void;
  saveNow?: (value: FakeState) => Promise<ScopedSaveOutcome>;
}

function makeHarness(options: UseIdentityScopedDomainOptions<FakeState, FakeAction>, captured: Captured) {
  return function Harness() {
    const { state, dispatch, hasHydrated, saveNow } = useIdentityScopedDomain(options);

    useEffect(() => {
      captured.state = state;
      captured.hasHydrated = hasHydrated;
      captured.setValue = (value: number) => dispatch({ type: 'valueSet', value });
      captured.saveNow = saveNow;
    });

    return <Text>{JSON.stringify({ state, hasHydrated })}</Text>;
  };
}

async function mountHarness(options: UseIdentityScopedDomainOptions<FakeState, FakeAction>) {
  const captured: Captured = {};
  const Harness = makeHarness(options, captured);

  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(
      <IdentityHandleTestProvider onDriverReady={(driver) => (captured.setIdentity = driver.setIdentity)}>
        <Harness />
      </IdentityHandleTestProvider>,
    );
  });
  return { root, captured };
}

describe('useIdentityScopedDomain', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('skips the first write immediately following initial hydration, but not later writes', async () => {
    const setItem = jest.fn<KeyValueStorage['setItem']>(async () => undefined);

    const options: UseIdentityScopedDomainOptions<FakeState, FakeAction> = {
      reducer: fakeReducer,
      initialState: INITIAL_FAKE_STATE,
      load: async () => ({ status: 'empty', value: INITIAL_FAKE_STATE }),
      // `save` ignores the storage the hook builds internally (it always wraps real AsyncStorage
      // via `createGuestMigratingStorage`) and instead writes through the local spy directly, so
      // the test can assert on write *count* and *timing* without touching AsyncStorage at all.
      save: async (_storage, value) => {
        await setItem('fake-key', JSON.stringify(value));
        return { status: 'saved' };
      },
      createRestoreAction: (value) => ({ type: 'restored', value: value.value }),
    };

    const { root, captured } = await mountHarness(options);

    expect(captured.hasHydrated).toBe(true);
    await act(async () => {
      await Promise.resolve();
    });
    expect(setItem).not.toHaveBeenCalled();

    act(() => {
      captured.setValue?.(5);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(setItem).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
  });

  it('re-arms the hydration-skip exactly once per identity switch', async () => {
    const setItem = jest.fn<KeyValueStorage['setItem']>(async () => undefined);

    const options: UseIdentityScopedDomainOptions<FakeState, FakeAction> = {
      reducer: fakeReducer,
      initialState: INITIAL_FAKE_STATE,
      load: async () => ({ status: 'empty', value: INITIAL_FAKE_STATE }),
      save: async (_storage, value) => {
        await setItem('fake-key', JSON.stringify(value));
        return { status: 'saved' };
      },
      createRestoreAction: (value) => ({ type: 'restored', value: value.value }),
    };

    const { root, captured } = await mountHarness(options);

    act(() => {
      captured.setValue?.(1);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(setItem).toHaveBeenCalledTimes(1);

    setItem.mockClear();
    act(() => {
      captured.setIdentity?.(USER_A);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // The load-triggered restore dispatch after the identity switch must not itself trigger a write.
    expect(setItem).not.toHaveBeenCalled();

    act(() => {
      captured.setValue?.(9);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(setItem).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
  });

  it('discards a load started for a superseded generation and never dispatches its result', async () => {
    const gate = deferred<PersistenceResultShape>();
    let loadCallCount = 0;

    const options: UseIdentityScopedDomainOptions<FakeState, FakeAction> = {
      reducer: fakeReducer,
      initialState: INITIAL_FAKE_STATE,
      load: async () => {
        loadCallCount += 1;
        if (loadCallCount === 1) {
          return gate.promise;
        }
        return { status: 'loaded', value: { value: 42 } };
      },
      save: async () => ({ status: 'saved' }),
      createRestoreAction: (value) => ({ type: 'restored', value: value.value }),
    };

    const { root, captured } = await mountHarness(options);

    // First load is still in flight (gate not resolved). Switch identity before it resolves.
    expect(captured.hasHydrated).toBe(false);
    act(() => {
      captured.setIdentity?.(USER_A);
    });

    // Second load (for the new generation) resolves quickly; the harness should end up hydrated
    // with its result (42), never the stale first load's eventual value.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(captured.hasHydrated).toBe(true);
    expect(captured.state).toEqual({ value: 42 });

    // Now resolve the stale first load. It must never overwrite the current state.
    await act(async () => {
      gate.resolve({ status: 'loaded', value: { value: 999 } });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(captured.state).toEqual({ value: 42 });

    act(() => {
      root.unmount();
    });
  });

  it('discards a queued write tagged with a superseded generation before it reaches storage', async () => {
    const setItem = jest.spyOn(AsyncStorage, 'setItem');
    const saveGate = deferred<void>();

    const options: UseIdentityScopedDomainOptions<FakeState, FakeAction> = {
      reducer: fakeReducer,
      initialState: INITIAL_FAKE_STATE,
      load: async () => ({ status: 'empty', value: INITIAL_FAKE_STATE }),
      // Deliberately awaits `saveGate` *before* calling the storage's own `setItem` -- simulating
      // slow AsyncStorage I/O (or any other delay) between when `save` starts and when it actually
      // reaches the storage write. The generation guard must catch this case too, not just a
      // write that was merely queued behind older items.
      save: async (storage, value) => {
        await saveGate.promise;
        await storage.setItem('fake-key', JSON.stringify(value));
        return { status: 'saved' };
      },
      createRestoreAction: (value) => ({ type: 'restored', value: value.value }),
    };

    const { root, captured } = await mountHarness(options);

    act(() => {
      captured.setValue?.(7);
    });
    await act(async () => {
      await Promise.resolve();
    });

    // The write is now queued (blocked on saveGate). Switch identity before it resolves.
    act(() => {
      captured.setIdentity?.(USER_A);
    });

    await act(async () => {
      saveGate.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // The stale write must never reach the actual storage -- the generation guard, checked
    // synchronously the instant `storage.setItem` is invoked (regardless of how long `save` took
    // to get there), bails out before the underlying `setItem` spy is ever called.
    expect(setItem).not.toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
  });

  it('keeps back-to-back writes ordered even when their underlying saves resolve out of order', async () => {
    const order: number[] = [];
    const delaysMs = [30, 5, 15];
    let callIndex = 0;

    const options: UseIdentityScopedDomainOptions<FakeState, FakeAction> = {
      reducer: fakeReducer,
      initialState: INITIAL_FAKE_STATE,
      load: async () => ({ status: 'empty', value: INITIAL_FAKE_STATE }),
      save: async (_storage, value) => {
        const myDelay = delaysMs[callIndex] ?? 0;
        callIndex += 1;
        await new Promise((resolve) => setTimeout(resolve, myDelay));
        order.push(value.value);
        return { status: 'saved' };
      },
      createRestoreAction: (value) => ({ type: 'restored', value: value.value }),
    };

    const { root, captured } = await mountHarness(options);

    act(() => {
      captured.setValue?.(1);
    });
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      captured.setValue?.(2);
    });
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      captured.setValue?.(3);
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    expect(order).toEqual([1, 2, 3]);

    act(() => {
      root.unmount();
    });
  });

  it('orders an explicit saveNow call relative to an already-queued effect-driven write for the same domain', async () => {
    const order: number[] = [];
    const delaysMs = [30, 5];
    let callIndex = 0;

    const options: UseIdentityScopedDomainOptions<FakeState, FakeAction> = {
      reducer: fakeReducer,
      initialState: INITIAL_FAKE_STATE,
      load: async () => ({ status: 'empty', value: INITIAL_FAKE_STATE }),
      save: async (_storage, value) => {
        const myDelay = delaysMs[callIndex] ?? 0;
        callIndex += 1;
        await new Promise((resolve) => setTimeout(resolve, myDelay));
        order.push(value.value);
        return { status: 'saved' };
      },
      createRestoreAction: (value) => ({ type: 'restored', value: value.value }),
    };

    const { root, captured } = await mountHarness(options);

    act(() => {
      captured.setValue?.(1);
    });
    await act(async () => {
      await Promise.resolve();
    });

    let explicitSaveDone = false;
    await act(async () => {
      const promise = captured.saveNow?.({ value: 2 }).then(() => {
        explicitSaveDone = true;
      });
      await promise;
    });

    // The explicit saveNow(2) call, made after the effect-driven write for
    // value 1 was already queued, must resolve only after that earlier
    // write -- both go through the same underlying queue, preserving FIFO
    // order rather than racing on their own independent delays.
    expect(explicitSaveDone).toBe(true);
    expect(order).toEqual([1, 2]);

    act(() => {
      root.unmount();
    });
  });

  it('safely no-ops a saveNow call tagged with an already-superseded generation', async () => {
    const setItem = jest.spyOn(AsyncStorage, 'setItem');

    const options: UseIdentityScopedDomainOptions<FakeState, FakeAction> = {
      reducer: fakeReducer,
      initialState: INITIAL_FAKE_STATE,
      load: async () => ({ status: 'empty', value: INITIAL_FAKE_STATE }),
      save: async (storage, value) => {
        await storage.setItem('fake-key', JSON.stringify(value));
        return { status: 'saved' };
      },
      createRestoreAction: (value) => ({ type: 'restored', value: value.value }),
    };

    const { root, captured } = await mountHarness(options);

    // Switch identity first, so the saveNow call below is tagged with a
    // generation that is stale by the time the write queue actually runs
    // it -- context.getGeneration() inside saveNow still captures the
    // *current* generation at call time, so this proves the guard is
    // exercised inside the queued write itself once a second identity
    // switch follows before it resolves.
    act(() => {
      captured.setIdentity?.(USER_A);
    });
    await act(async () => {
      await Promise.resolve();
    });

    setItem.mockClear();

    let saveNowPromise: Promise<ScopedSaveOutcome> | undefined;
    act(() => {
      saveNowPromise = captured.saveNow?.({ value: 9 });
    });

    // A further identity switch supersedes the generation saveNow captured
    // above before its queued write actually reaches storage.
    act(() => {
      captured.setIdentity?.(USER_B);
    });

    let outcome: ScopedSaveOutcome | undefined;
    await act(async () => {
      outcome = await saveNowPromise;
      await Promise.resolve();
    });

    expect(setItem).not.toHaveBeenCalled();
    expect(outcome).toEqual({ status: 'superseded' });

    act(() => {
      root.unmount();
    });
  });

  it('resolves saveNow with { status: "saved" } on a successful write', async () => {
    const options: UseIdentityScopedDomainOptions<FakeState, FakeAction> = {
      reducer: fakeReducer,
      initialState: INITIAL_FAKE_STATE,
      load: async () => ({ status: 'empty', value: INITIAL_FAKE_STATE }),
      save: async (storage, value) => {
        await storage.setItem('fake-key', JSON.stringify(value));
        return { status: 'saved' };
      },
      createRestoreAction: (value) => ({ type: 'restored', value: value.value }),
    };

    const { root, captured } = await mountHarness(options);

    let outcome: ScopedSaveOutcome | undefined;
    await act(async () => {
      outcome = await captured.saveNow?.({ value: 1 });
    });

    expect(outcome).toEqual({ status: 'saved' });

    act(() => {
      root.unmount();
    });
  });

  it('resolves saveNow with { status: "failed" } and calls onSaveFailed when save returns a failed result, and the queue survives for a following write', async () => {
    const onSaveFailed = jest.fn<(error: unknown) => void>();
    const failure = new Error('disk full');

    const options: UseIdentityScopedDomainOptions<FakeState, FakeAction> = {
      reducer: fakeReducer,
      initialState: INITIAL_FAKE_STATE,
      load: async () => ({ status: 'empty', value: INITIAL_FAKE_STATE }),
      save: jest
        .fn<UseIdentityScopedDomainOptions<FakeState, FakeAction>['save']>()
        .mockResolvedValueOnce({ status: 'failed', error: failure })
        .mockResolvedValueOnce({ status: 'saved' }),
      createRestoreAction: (value) => ({ type: 'restored', value: value.value }),
      onSaveFailed,
    };

    const { root, captured } = await mountHarness(options);

    let firstOutcome: ScopedSaveOutcome | undefined;
    await act(async () => {
      firstOutcome = await captured.saveNow?.({ value: 1 });
    });

    expect(firstOutcome).toEqual({ status: 'failed', error: failure });
    expect(onSaveFailed).toHaveBeenCalledTimes(1);
    expect(onSaveFailed).toHaveBeenCalledWith(failure);

    let secondOutcome: ScopedSaveOutcome | undefined;
    await act(async () => {
      secondOutcome = await captured.saveNow?.({ value: 2 });
    });

    expect(secondOutcome).toEqual({ status: 'saved' });

    act(() => {
      root.unmount();
    });
  });

  it('resolves saveNow with { status: "failed" } carrying the thrown error when save throws, and produces no unhandled rejection', async () => {
    const onSaveFailed = jest.fn<(error: unknown) => void>();
    const thrown = new Error('unexpected');

    const options: UseIdentityScopedDomainOptions<FakeState, FakeAction> = {
      reducer: fakeReducer,
      initialState: INITIAL_FAKE_STATE,
      load: async () => ({ status: 'empty', value: INITIAL_FAKE_STATE }),
      save: async () => {
        throw thrown;
      },
      createRestoreAction: (value) => ({ type: 'restored', value: value.value }),
      onSaveFailed,
    };

    const { root, captured } = await mountHarness(options);

    let outcome: ScopedSaveOutcome | undefined;
    await act(async () => {
      outcome = await captured.saveNow?.({ value: 1 });
    });

    expect(outcome).toEqual({ status: 'failed', error: thrown });
    expect(onSaveFailed).toHaveBeenCalledTimes(1);
    expect(onSaveFailed).toHaveBeenCalledWith(thrown);

    act(() => {
      root.unmount();
    });
  });

  it('reports { status: "superseded" } when the generation flips during save, and the underlying setItem is never invoked', async () => {
    const setItem = jest.spyOn(AsyncStorage, 'setItem');
    const saveGate = deferred<PersistenceSaveResult>();

    const options: UseIdentityScopedDomainOptions<FakeState, FakeAction> = {
      reducer: fakeReducer,
      initialState: INITIAL_FAKE_STATE,
      load: async () => ({ status: 'empty', value: INITIAL_FAKE_STATE }),
      save: async (storage, value) => {
        const result = await saveGate.promise;
        await storage.setItem('fake-key', JSON.stringify(value));
        return result;
      },
      createRestoreAction: (value) => ({ type: 'restored', value: value.value }),
    };

    const { root, captured } = await mountHarness(options);
    setItem.mockClear();

    let saveNowPromise: Promise<ScopedSaveOutcome> | undefined;
    act(() => {
      saveNowPromise = captured.saveNow?.({ value: 3 });
    });

    // Flip identity while `save` is still awaiting the deferred gate.
    act(() => {
      captured.setIdentity?.(USER_A);
    });

    let outcome: ScopedSaveOutcome | undefined;
    await act(async () => {
      saveGate.resolve({ status: 'saved' });
      outcome = await saveNowPromise;
      await Promise.resolve();
    });

    expect(outcome).toEqual({ status: 'superseded' });
    expect(setItem).not.toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
  });
});

type PersistenceResultShape =
  | { readonly status: 'loaded'; readonly value: FakeState }
  | { readonly status: 'empty'; readonly value: FakeState }
  | { readonly status: 'recovered'; readonly value: FakeState; readonly error: unknown };
