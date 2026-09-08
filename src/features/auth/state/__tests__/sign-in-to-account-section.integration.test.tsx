// T176: a real-GoTrue-ordering regression test.
//
// Every other sign-in/AccountSection test in this repo mocks
// `@/features/auth/state/auth-provider` directly, so none of them exercise
// the actual contract this ticket investigated: signInWithPassword's
// promise only resolves after the installed @supabase/auth-js client has
// already awaited _saveSession and _notifyAllSubscribers for the
// SIGNED_IN event (confirmed by reading the installed
// GoTrueClient.js -- every signInWithPassword-shaped branch does
// await this._saveSession(...); await this._notifyAllSubscribers('SIGNED_IN', ...)
// before returning). This test mounts the real AuthProvider and a fake
// Supabase client that mirrors that same ordering, then proves the real
// SignInScreen -> real AuthProvider -> real AccountSection pipeline
// shows the signed-in Account section immediately after a successful
// sign-in submit, with no extra flush and no page refresh required.
//
// This investigation (T176) could not reproduce a stale-AccountSection
// defect anywhere in the current sign-in -> Profile flow -- see this
// ticket's completion notes in TASKS_DONE.md for the full write-up. This
// test exists to keep it that way: if a future change ever decouples the
// SIGNED_IN notification from signInWithPassword's own resolution (the
// one thing that currently guarantees no race window exists), this test
// fails.

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import type { AuthChangeEvent, Session, SupabaseClient } from '@supabase/supabase-js';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { AccountSection } from '@/features/auth/components/account-section';
import { SignInScreen } from '@/features/auth/components/sign-in-screen';
import { AuthProvider } from '@/features/auth/state/auth-provider';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required by jest hoisting
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const mockGetSupabaseClient = jest.fn();
jest.mock('@/shared/supabase/supabase-client', () => ({
  getSupabaseClient: () => mockGetSupabaseClient(),
}));

const mockReplace = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace, push: mockPush }) }));

jest.mock('@/features/auth/observability/auth-observability', () => ({
  trackAuthEvent: jest.fn(),
  logAuthWarning: jest.fn(),
}));

jest.mock('@/shared/sync/sync-coordinator-provider', () => ({
  useSyncCoordinatorStatus: () => ({
    state: { status: 'idle', identityGeneration: 0, lastRun: undefined, pendingRerunTrigger: undefined },
    requestManualSync: jest.fn(),
    pendingCount: 0,
    discardAllPending: jest.fn(async () => ({ status: 'discarded' })),
  }),
}));

type AuthCallback = (event: AuthChangeEvent, session: Session | null) => void;

const EMAIL = 'someone@example.com';
const PASSWORD = 'whateverpassword';
const SESSION = { access_token: 'tok', user: { email: EMAIL } } as unknown as Session;

function createRealisticFakeClient() {
  const unsubscribe = jest.fn();
  let capturedCallback: AuthCallback | undefined;

  const onAuthStateChange = jest.fn((cb: AuthCallback) => {
    capturedCallback = cb;
    return { data: { subscription: { unsubscribe } } };
  });

  const signInWithPassword = jest.fn(async () => {
    capturedCallback?.('SIGNED_IN', SESSION);
    return { error: null };
  });

  const client = {
    auth: { onAuthStateChange, signInWithPassword },
  } as unknown as SupabaseClient;

  return {
    client,
    emit: (event: AuthChangeEvent, session: Session | null) => capturedCallback?.(event, session),
  };
}

function findByLabel(renderer: ReactTestRenderer, label: string) {
  return renderer.root.find((node) => node.props.accessibilityLabel === label);
}

afterEach(() => {
  mockGetSupabaseClient.mockReset();
  mockReplace.mockReset();
  mockPush.mockReset();
});

describe('sign-in -> AccountSection (T176 real-ordering integration)', () => {
  it('shows the signed-in Account section immediately after a successful sign-in submit, with no refresh', async () => {
    const { client, emit } = createRealisticFakeClient();
    mockGetSupabaseClient.mockReturnValue(client);

    let root!: ReactTestRenderer;
    await act(async () => {
      root = create(
        <AuthProvider>
          <SignInScreen />
          <AccountSection />
        </AuthProvider>,
      );
    });

    // Mirrors the real client's own INITIAL_SESSION delivery on subscribe --
    // an already-resolved, signed-out session, matching a normal visit to
    // the sign-in screen (not the initializing/loading state).
    act(() => {
      emit('INITIAL_SESSION', null);
    });

    await act(async () => {
      findByLabel(root, 'Email').props.onChangeText(EMAIL);
    });
    await act(async () => {
      findByLabel(root, 'Password').props.onChangeText(PASSWORD);
    });

    expect(root.root.findAll((node) => node.props.accessibilityLabel === 'Log out')).toHaveLength(0);

    await act(async () => {
      await findByLabel(root, 'Sign in').props.onPress();
    });

    expect(mockReplace).toHaveBeenCalledWith('/app/home');
    expect(root.root.findAll((node) => node.props.accessibilityLabel === 'Log out').length).toBeGreaterThan(0);

    act(() => {
      root.unmount();
    });
  });
});
