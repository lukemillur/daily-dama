import { afterEach, describe, expect, it, jest } from '@jest/globals';
import type { AuthChangeEvent, Session, SupabaseClient } from '@supabase/supabase-js';
import { useEffect } from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { AuthProvider } from '@/features/auth/state/auth-provider';
import { IdentityProvider, useIdentityHandle } from '@/shared/persistence/identity-provider';

const mockGetSupabaseClient = jest.fn();
jest.mock('@/features/auth/persistence/supabase-client', () => ({
  getSupabaseClient: () => mockGetSupabaseClient(),
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
  afterEach(() => {
    mockGetSupabaseClient.mockReset();
    captured.renderCount = 0;
    captured.identityKey = undefined;
    captured.generation = undefined;
  });

  it('gates children behind a fallback while Auth is initializing', async () => {
    const fake = createFakeClient(); // never emits, so Auth stays 'initializing'
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
