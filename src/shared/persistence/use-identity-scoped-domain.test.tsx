import { afterEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { type PropsWithChildren, useEffect, useState } from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { IdentityHandleContext } from '@/shared/persistence/identity-provider';
import { createIdentityContext } from '@/shared/persistence/identity-context';
import type { Identity } from '@/shared/persistence/identity';
import type { KeyValueStorage } from '@/shared/persistence/storage';
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
}

function makeHarness(options: UseIdentityScopedDomainOptions<FakeState, FakeAction>, captured: Captured) {
  return function Harness() {
    const { state, dispatch, hasHydrated } = useIdentityScopedDomain(options);

    useEffect(() => {
      captured.state = state;
      captured.hasHydrated = hasHydrated;
      captured.setValue = (value: number) => dispatch({ type: 'valueSet', value });
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
});

type PersistenceResultShape =
  | { readonly status: 'loaded'; readonly value: FakeState }
  | { readonly status: 'empty'; readonly value: FakeState }
  | { readonly status: 'recovered'; readonly value: FakeState; readonly error: unknown };
