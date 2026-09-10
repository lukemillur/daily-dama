import { afterEach, describe, expect, it, jest } from '@jest/globals';
import type { AuthChangeEvent, Session, SupabaseClient } from '@supabase/supabase-js';
import { useEffect } from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

// auth-provider.tsx (imported transitively below via AuthProvider) now
// imports the AsyncStorage native module directly for T161.5's account
// purge -- mocked here so this test doesn't need a native module.
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required by jest hoisting
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import AsyncStorage from '@react-native-async-storage/async-storage';

import { AuthProvider } from '@/features/auth/state/auth-provider';
import { IdentityProvider, useIdentityHandle } from '@/shared/persistence/identity-provider';

const STORAGE_KEY = 'sb-example-auth-token';
const mockGetSupabaseClient = jest.fn();
jest.mock('@/shared/supabase/supabase-client', () => ({
  getSupabaseClient: () => mockGetSupabaseClient(),
  getGoTrueStorageKey: () => 'sb-example-auth-token',
}));

const USER_A_ID = '11111111-1111-1111-1111-111111111111';
const USER_B_ID = '22222222-2222-2222-2222-222222222222';

type AuthCallback = (event: AuthChangeEvent, session: Session | null) => void;

function createFakeClient() {
  const unsubscribe = jest.fn();
  let capturedCallback: AuthCallback | undefined;
  const onAuthStateChange = jest.fn((cb: AuthCallback) => {
    capturedCallback = cb;
    return { data: { subscription: { unsubscribe } } };
  });

  const client = { auth: { onAuthStateChange } } as unknown as SupabaseClient;

  return {
    client,
    emit: (event: AuthChangeEvent, session: Session | null) => capturedCallback?.(event, session),
  };
}

function sessionWithUserId(id: string): Session {
  return { access_token: 't', user: { id } } as unknown as Session;
}

const captured: { renderCount: number; identityKey?: string; generation?: number } = { renderCount: 0 };

function identityKey(identity: ReturnType<typeof useIdentityHandle>['identity']) {
  return identity.kind === 'guest' ? 'guest' : `user:${identity.userId}`;
}

function Harness() {
  const { identity, generation } = useIdentityHandle();

  useEffect(() => {
    captured.renderCount += 1;
    captured.identityKey = identityKey(identity);
    captured.generation = generation;
  });

  return <Text>{identityKey(identity)}</Text>;
}

async function mount(fake: ReturnType<typeof createFakeClient>) {
  mockGetSupabaseClient.mockReturnValue(fake.client);
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(
      <AuthProvider>
        <IdentityProvider>
          <Harness />
        </IdentityProvider>
      </AuthProvider>,
    );
  });
  return root;
}

describe('IdentityProvider', () => {
  afterEach(async () => {
    mockGetSupabaseClient.mockReset();
    captured.renderCount = 0;
    captured.identityKey = undefined;
    captured.generation = undefined;
    await AsyncStorage.clear();
    jest.useRealTimers();
  });

  it('gates children behind a fallback while Auth is initializing, then falls back to the refreshFailed recovery UI once the bound elapses with no cached session', async () => {
    jest.useFakeTimers();
    const fake = createFakeClient(); // never emits, so Auth stays 'initializing' until the timeout
    mockGetSupabaseClient.mockReturnValue(fake.client);

    let root!: ReactTestRenderer;
    await act(async () => {
      root = create(
        <AuthProvider>
          <IdentityProvider>
            <Harness />
          </IdentityProvider>
        </AuthProvider>,
      );
    });

    expect(captured.identityKey).toBeUndefined();
    expect(root.root.findAllByType(Text).some((node) => node.props.children === 'guest')).toBe(false);

    await act(async () => {
      await jest.advanceTimersByTimeAsync(10_000);
    });

    // Still gated (no session/identity resolved), but the fallback replaced with the visible
    // recovery UI rather than staying gated forever.
    expect(captured.identityKey).toBeUndefined();
    expect(
      root.root.findAllByType(Text).some((node) => node.props.children === 'Try again'),
    ).toBe(true);
    expect(
      root.root.findAllByType(Text).some((node) => node.props.children === 'Continue as guest'),
    ).toBe(true);

    act(() => {
      root.unmount();
    });
  });

  it('resolves the correct identity from a cached session without ever showing the fallback, even with a client that never emits', async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ access_token: 't', refresh_token: 'r', user: { id: USER_A_ID } }),
    );
    const fake = createFakeClient(); // never emits -- proves the optimistic read alone unblocks this

    let root!: ReactTestRenderer;
    await act(async () => {
      mockGetSupabaseClient.mockReturnValue(fake.client);
      root = create(
        <AuthProvider>
          <IdentityProvider>
            <Harness />
          </IdentityProvider>
        </AuthProvider>,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(captured.identityKey).toBe(`user:${USER_A_ID}`);
    expect(root.root.findAllByType(Text).some((node) => node.props.children === 'guest')).toBe(false);

    act(() => {
      root.unmount();
    });
  });

  it('clicking Continue as guest after refreshFailed unblocks children under a real guest identity', async () => {
    jest.useFakeTimers();
    const fake = createFakeClient(); // never emits, no cached session
    mockGetSupabaseClient.mockReturnValue(fake.client);

    let root!: ReactTestRenderer;
    await act(async () => {
      root = create(
        <AuthProvider>
          <IdentityProvider>
            <Harness />
          </IdentityProvider>
        </AuthProvider>,
      );
    });

    await act(async () => {
      await jest.advanceTimersByTimeAsync(10_000);
    });

    const continueButton = root.root
      .findAllByProps({ accessibilityRole: 'button' })
      .find((node) =>
        node.findAllByType(Text).some((textNode) => textNode.props.children === 'Continue as guest'),
      );
    expect(continueButton).toBeDefined();

    await act(async () => {
      continueButton!.props.onPress();
      await jest.advanceTimersByTimeAsync(0);
      await Promise.resolve();
    });

    expect(captured.identityKey).toBe('guest');
    expect(
      root.root.findAllByType(Text).some((node) => node.props.children === 'Continue as guest'),
    ).toBe(false);

    act(() => {
      root.unmount();
    });
  });

  it('resolves to guest once Auth settles with no session', async () => {
    const fake = createFakeClient();
    const root = await mount(fake);

    await act(async () => {
      fake.emit('INITIAL_SESSION', null);
      await Promise.resolve();
    });

    expect(captured.identityKey).toBe('guest');
    expect(captured.generation).toBe(0);

    act(() => {
      root.unmount();
    });
  });

  it('does not bump generation on repeated auth events for the same identity (e.g. two TOKEN_REFRESHED)', async () => {
    const fake = createFakeClient();
    const root = await mount(fake);

    await act(async () => {
      fake.emit('SIGNED_IN', sessionWithUserId(USER_A_ID));
      await Promise.resolve();
    });
    expect(captured.identityKey).toBe(`user:${USER_A_ID}`);
    expect(captured.generation).toBe(1);
    const countAfterSignIn = captured.renderCount;

    await act(async () => {
      fake.emit('TOKEN_REFRESHED', sessionWithUserId(USER_A_ID));
      await Promise.resolve();
    });
    await act(async () => {
      fake.emit('TOKEN_REFRESHED', sessionWithUserId(USER_A_ID));
      await Promise.resolve();
    });

    // Same identity both times -- generation must not bump, and the harness effect should not
    // have re-run for identity reasons (auth state itself still changes, but IdentityProvider's
    // own handle must not produce a new generation).
    expect(captured.generation).toBe(1);
    expect(captured.identityKey).toBe(`user:${USER_A_ID}`);
    expect(captured.renderCount).toBe(countAfterSignIn);

    act(() => {
      root.unmount();
    });
  });

  it('produces two distinct, increasing generations when switching from user A to user B', async () => {
    const fake = createFakeClient();
    const root = await mount(fake);

    await act(async () => {
      fake.emit('SIGNED_IN', sessionWithUserId(USER_A_ID));
      await Promise.resolve();
    });
    expect(captured.identityKey).toBe(`user:${USER_A_ID}`);
    expect(captured.generation).toBe(1);

    await act(async () => {
      fake.emit('SIGNED_IN', sessionWithUserId(USER_B_ID));
      await Promise.resolve();
    });
    expect(captured.identityKey).toBe(`user:${USER_B_ID}`);
    expect(captured.generation).toBe(2);

    act(() => {
      root.unmount();
    });
  });
});
