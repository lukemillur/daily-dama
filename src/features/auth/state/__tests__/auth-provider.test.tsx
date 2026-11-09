import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { AuthChangeEvent, Session, SupabaseClient } from '@supabase/supabase-js';
import { useEffect } from 'react';
import { Platform, Text } from 'react-native';
import { act, create } from 'react-test-renderer';

// Jest has no app manifest; expo-linking's createURL needs one to resolve the scheme.
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { scheme: 'dailydama' }, executionEnvironment: 'standalone' },
  ExecutionEnvironment: { Bare: 'bare', Standalone: 'standalone', StoreClient: 'storeClient' },
}));

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required by jest hoisting
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  AUTH_INIT_TIMEOUT_MS,
  AuthProvider,
  useAuthActions,
  useAuthState,
} from '@/features/auth/state/auth-provider';

import { createEncryptedSessionStorage } from '@/shared/supabase/session-storage';

const STORAGE_KEY = 'sb-example-auth-token';
const mockGetSupabaseClient = jest.fn();
const mockDiscardSupabaseClient = jest.fn();
// The adapter under test is whatever the client was built with; these tests inject AsyncStorage
// as that adapter (web behavior) and use `mockSessionStorage` to inject native-style adapters.
let mockSessionStorage: unknown;
jest.mock('@/shared/supabase/supabase-client', () => ({
  getSupabaseClient: () => mockGetSupabaseClient(),
  getGoTrueStorageKey: () => 'sb-example-auth-token',
  getSupabaseSessionStorage: () => mockSessionStorage,
  discardSupabaseClient: () => mockDiscardSupabaseClient(),
}));

const DELETION_USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const DELETION_PROFILE_KEY = 'user:' + DELETION_USER_ID + ':daily-dama:user-profile';

type AuthCallback = (event: AuthChangeEvent, session: Session | null) => void;

function createFakeClient(overrides?: { onAuthStateChangeImpl?: (cb: AuthCallback) => unknown }) {
  const unsubscribe = jest.fn();
  let capturedCallback: AuthCallback | undefined;
  const onAuthStateChange = jest.fn((cb: AuthCallback) => {
    capturedCallback = cb;
    if (overrides?.onAuthStateChangeImpl) {
      return overrides.onAuthStateChangeImpl(cb);
    }
    return { data: { subscription: { unsubscribe } } };
  });

  const signInWithPassword = jest.fn(async (): Promise<{ error: unknown }> => ({ error: null }));
  const signOut = jest.fn(async (): Promise<{ error: unknown }> => ({ error: null }));
  const updateUser = jest.fn(async (): Promise<{ error: unknown }> => ({ error: null }));
  const exchangeCodeForSession = jest.fn(
    async (): Promise<{ data: unknown; error: unknown }> => ({
      data: { redirectType: null },
      error: null,
    }),
  );
  const resetPasswordForEmail = jest.fn(async (): Promise<{ error: unknown }> => ({ error: null }));
  const signUp = jest.fn(async (): Promise<{ error: unknown }> => ({ error: null }));
  const resend = jest.fn(async (): Promise<{ error: unknown }> => ({ error: null }));
  const invoke = jest.fn(async (): Promise<{ data: null; error: unknown }> => ({ data: null, error: null }));

  const client = {
    auth: {
      onAuthStateChange,
      signInWithPassword,
      signOut,
      updateUser,
      exchangeCodeForSession,
      resetPasswordForEmail,
      signUp,
      resend,
      startAutoRefresh: jest.fn(async () => undefined),
      stopAutoRefresh: jest.fn(async () => undefined),
    },
    functions: { invoke },
  } as unknown as SupabaseClient;

  return {
    client,
    unsubscribe,
    signInWithPassword,
    signOut,
    updateUser,
    exchangeCodeForSession,
    resetPasswordForEmail,
    signUp,
    resend,
    invoke,
    emit: (event: AuthChangeEvent, session: Session | null) => capturedCallback?.(event, session),
  };
}

const captured: {
  state?: ReturnType<typeof useAuthState>;
  actions?: ReturnType<typeof useAuthActions>;
} = {};

function Harness() {
  const state = useAuthState();
  const actions = useAuthActions();

  useEffect(() => {
    captured.state = state;
    captured.actions = actions;
  });

  return <Text>{state.status}</Text>;
}

async function mount() {
  let root!: ReturnType<typeof create>;
  await act(async () => {
    root = create(
      <AuthProvider>
        <Harness />
      </AuthProvider>,
    );
  });
  return root;
}

// The callback-URL builder reads Platform.OS; the web-origin cases below stub `window`, so they
// must also present as web. Restored in afterEach.
const platformRestores: (() => void)[] = [];
function useWebPlatform() {
  const replaced = jest.replaceProperty(Platform, 'OS', 'web');
  platformRestores.push(() => replaced.restore());
}

describe('AuthProvider', () => {
  beforeEach(() => {
    mockSessionStorage = AsyncStorage;
  });

  afterEach(async () => {
    platformRestores.splice(0).forEach((restore) => restore());
    mockGetSupabaseClient.mockReset();
    mockDiscardSupabaseClient.mockReset();
    captured.state = undefined;
    captured.actions = undefined;
    await AsyncStorage.clear();
    jest.useRealTimers();
  });

  it('renders children immediately while Auth is still initializing, with no hydration-gate fallback, then bounds it to refreshFailed with no cached session', async () => {
    jest.useFakeTimers();
    // A client that never fires an auth event, so state stays 'initializing'
    // after mount -- proving children render without waiting for it to settle.
    const fake = createFakeClient();
    mockGetSupabaseClient.mockReturnValue(fake.client);

    const root = await mount();

    expect(root.toJSON()).not.toBeNull();
    expect(captured.state).toEqual({ status: 'initializing' });
    expect(captured.actions).toBeDefined();

    // Just under the bound: still initializing.
    await act(async () => {
      await jest.advanceTimersByTimeAsync(AUTH_INIT_TIMEOUT_MS - 1);
    });
    expect(captured.state).toEqual({ status: 'initializing' });

    // At the bound, with no real event and no cached session: refreshFailed.
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1);
    });
    expect(captured.state).toEqual({ status: 'refreshFailed' });

    act(() => {
      root.unmount();
    });
    jest.useRealTimers();
  });

  it('optimistically resolves to authenticated from a cached session promptly, without waiting for any event, using a client that never emits', async () => {
    const cachedSession = { access_token: 'cached', refresh_token: 'r', user: { id: 'u1' } } as unknown as Session;
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cachedSession));

    const fake = createFakeClient(); // never emits
    mockGetSupabaseClient.mockReturnValue(fake.client);

    let root!: ReturnType<typeof create>;
    await act(async () => {
      root = create(
        <AuthProvider>
          <Harness />
        </AuthProvider>,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(captured.state).toEqual({
      status: 'authenticated',
      session: cachedSession,
      lastEvent: 'INITIAL_SESSION',
    });

    act(() => {
      root.unmount();
    });
  });

  it('a late real event arriving after the optimistic cached-session read still overrides it correctly', async () => {
    const cachedSession = { access_token: 'cached', refresh_token: 'r', user: { id: 'u1' } } as unknown as Session;
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cachedSession));

    const fake = createFakeClient();
    mockGetSupabaseClient.mockReturnValue(fake.client);

    let root!: ReturnType<typeof create>;
    await act(async () => {
      root = create(
        <AuthProvider>
          <Harness />
        </AuthProvider>,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(captured.state).toEqual({
      status: 'authenticated',
      session: cachedSession,
      lastEvent: 'INITIAL_SESSION',
    });

    act(() => {
      fake.emit('SIGNED_OUT', null);
    });
    expect(captured.state).toEqual({ status: 'guest', reason: 'signedOut' });

    act(() => {
      root.unmount();
    });
  });

  it('bounds a hung refresh to refreshFailed when there is no cached session (fault injection: onAuthStateChange callback captured but never invoked)', async () => {
    jest.useFakeTimers();
    const fake = createFakeClient(); // captures the callback but never calls it
    mockGetSupabaseClient.mockReturnValue(fake.client);

    const root = await mount();
    expect(captured.state).toEqual({ status: 'initializing' });

    await act(async () => {
      await jest.advanceTimersByTimeAsync(AUTH_INIT_TIMEOUT_MS - 1);
    });
    expect(captured.state).toEqual({ status: 'initializing' });

    await act(async () => {
      await jest.advanceTimersByTimeAsync(1);
    });
    expect(captured.state).toEqual({ status: 'refreshFailed' });

    act(() => {
      root.unmount();
    });
    jest.useRealTimers();
  });

  it('a real event arriving after refreshFailed was already reached still corrects state (subscription never torn down)', async () => {
    jest.useFakeTimers();
    const fake = createFakeClient();
    mockGetSupabaseClient.mockReturnValue(fake.client);

    const root = await mount();

    await act(async () => {
      await jest.advanceTimersByTimeAsync(AUTH_INIT_TIMEOUT_MS);
    });
    expect(captured.state).toEqual({ status: 'refreshFailed' });

    const session = { access_token: 'a' } as unknown as Session;
    act(() => {
      fake.emit('SIGNED_IN', session);
    });
    expect(captured.state).toEqual({ status: 'authenticated', session, lastEvent: 'SIGNED_IN' });

    act(() => {
      root.unmount();
    });
    jest.useRealTimers();
  });

  it('abandonAuthAndContinueAsGuest removes the cached session and transitions to guest/error', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ access_token: 'cached' }));
    const fake = createFakeClient();
    mockGetSupabaseClient.mockReturnValue(fake.client);

    const root = await mount();

    let result: { error: Error | null } | undefined;
    await act(async () => {
      result = await captured.actions!.abandonAuthAndContinueAsGuest();
    });

    expect(result).toEqual({ error: null });
    expect(captured.state).toEqual({ status: 'guest', reason: 'error' });
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it('abandonAuthAndContinueAsGuest fails closed and leaves state unchanged when clearing storage fails', async () => {
    const fake = createFakeClient();
    mockGetSupabaseClient.mockReturnValue(fake.client);

    const root = await mount();

    const removeItemSpy = jest
      .spyOn(AsyncStorage, 'removeItem')
      .mockRejectedValueOnce(new Error('storage unavailable'));

    let result: { error: Error | null } | undefined;
    await act(async () => {
      result = await captured.actions!.abandonAuthAndContinueAsGuest();
    });

    expect(result?.error).toBeInstanceOf(Error);
    expect(captured.state).toEqual({ status: 'initializing' });

    removeItemSpy.mockRestore();
    act(() => {
      root.unmount();
    });
  });

  it('resolves to guest/unconfigured when no client is available', async () => {
    mockGetSupabaseClient.mockReturnValue(null);

    const root = await mount();

    expect(captured.state).toEqual({ status: 'guest', reason: 'unconfigured' });
    act(() => {
      root.unmount();
    });
  });

  it('offline init: resolves to guest when INITIAL_SESSION fires with a null session, with no getSession call', async () => {
    const fake = createFakeClient({
      onAuthStateChangeImpl: (cb) => {
        cb('INITIAL_SESSION', null);
        return { data: { subscription: { unsubscribe: jest.fn() } } };
      },
    });
    mockGetSupabaseClient.mockReturnValue(fake.client);

    const root = await mount();

    expect(captured.state).toEqual({ status: 'guest', reason: 'signedOut' });
    act(() => {
      root.unmount();
    });
  });

  it('offline init: resolves to authenticated when INITIAL_SESSION fires with a cached session', async () => {
    const cachedSession = { access_token: 'cached' } as unknown as Session;
    const fake = createFakeClient({
      onAuthStateChangeImpl: (cb) => {
        cb('INITIAL_SESSION', cachedSession);
        return { data: { subscription: { unsubscribe: jest.fn() } } };
      },
    });
    mockGetSupabaseClient.mockReturnValue(fake.client);

    const root = await mount();

    expect(captured.state).toEqual({
      status: 'authenticated',
      session: cachedSession,
      lastEvent: 'INITIAL_SESSION',
    });
    act(() => {
      root.unmount();
    });
  });

  it('updates state on SIGNED_IN, SIGNED_OUT, and TOKEN_REFRESHED events', async () => {
    const fake = createFakeClient();
    mockGetSupabaseClient.mockReturnValue(fake.client);

    const root = await mount();
    expect(captured.state).toEqual({ status: 'initializing' });

    const session = { access_token: 'a' } as unknown as Session;
    act(() => {
      fake.emit('SIGNED_IN', session);
    });
    expect(captured.state).toEqual({ status: 'authenticated', session, lastEvent: 'SIGNED_IN' });

    const refreshed = { access_token: 'refreshed' } as unknown as Session;
    act(() => {
      fake.emit('TOKEN_REFRESHED', refreshed);
    });
    expect(captured.state).toEqual({ status: 'authenticated', session: refreshed, lastEvent: 'TOKEN_REFRESHED' });

    act(() => {
      fake.emit('SIGNED_OUT', null);
    });
    expect(captured.state).toEqual({ status: 'guest', reason: 'signedOut' });
    act(() => {
      root.unmount();
    });
  });

  it('forwards signInWithPassword arguments and surfaces the error, without changing state directly', async () => {
    const fake = createFakeClient();
    const signInError = { message: 'invalid credentials' };
    fake.signInWithPassword.mockResolvedValueOnce({ error: signInError });
    mockGetSupabaseClient.mockReturnValue(fake.client);

    const root = await mount();

    let result: { error: unknown } | undefined;
    await act(async () => {
      result = await captured.actions!.signInWithPassword('a@b.com', 'secret');
    });

    expect(fake.signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.com', password: 'secret' });
    expect(result).toEqual({ error: signInError });
    expect(captured.state).toEqual({ status: 'initializing' });
    act(() => {
      root.unmount();
    });
  });

  describe('native session storage', () => {
    function createNativeAdapter(overrides?: { blobSetItem?: () => Promise<void> }) {
      const secure = new Map<string, string>();
      const blobs = new Map<string, string>();
      let counter = 0;
      const adapter = createEncryptedSessionStorage({
        keyStore: {
          getItem: async (key) => secure.get(key) ?? null,
          setItem: async (key, value) => void secure.set(key, value),
          removeItem: async (key) => void secure.delete(key),
        },
        blobStore: {
          getItem: async (key) => blobs.get(key) ?? null,
          setItem: overrides?.blobSetItem ?? (async (key, value) => void blobs.set(key, value)),
          removeItem: async (key) => void blobs.delete(key),
        },
        randomBytes: (length) => new Uint8Array(length).fill((counter += 1)),
      });
      return { adapter, blobs };
    }

    it('(c) optimistically resolves a session stored through the native adapter', async () => {
      const { adapter } = createNativeAdapter();
      const cachedSession = { access_token: 'cached', refresh_token: 'r', user: { id: 'u1' } } as unknown as Session;
      await adapter.setItem(STORAGE_KEY, JSON.stringify(cachedSession));
      mockSessionStorage = adapter;
      const fake = createFakeClient(); // never emits
      mockGetSupabaseClient.mockReturnValue(fake.client);

      let root!: ReturnType<typeof create>;
      await act(async () => {
        root = create(
          <AuthProvider>
            <Harness />
          </AuthProvider>,
        );
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(captured.state).toEqual({
        status: 'authenticated',
        session: cachedSession,
        lastEvent: 'INITIAL_SESSION',
      });
      act(() => {
        root.unmount();
      });
    });

    it('(e) returns a structured failure and stays guest when the session write rejects during sign-in', async () => {
      const { adapter, blobs } = createNativeAdapter({
        blobSetItem: async () => {
          throw new Error('disk full');
        },
      });
      mockSessionStorage = adapter;
      const fake = createFakeClient();
      // supabase-js rethrows the storage rejection out of signInWithPassword.
      fake.signInWithPassword.mockImplementationOnce(async () => {
        await adapter.setItem(STORAGE_KEY, 'session-json');
        return { error: null };
      });
      mockGetSupabaseClient.mockReturnValue(fake.client);

      const root = await mount();

      let result: { error: { message: string } | null } | undefined;
      await act(async () => {
        result = await captured.actions!.signInWithPassword('a@b.com', 'secret');
      });

      expect(result?.error?.message).toMatch(/could not save your sign-in/i);
      expect(fake.signOut).toHaveBeenCalledWith({ scope: 'local' });
      expect(blobs.has(STORAGE_KEY)).toBe(false);
      expect(captured.state).toEqual({ status: 'initializing' });
      act(() => {
        root.unmount();
      });
    });

    it('(f) retryAuthInitialisation discards the client and re-subscribes against a fresh one on native, without touching window', async () => {
      const first = createFakeClient();
      const second = createFakeClient();
      let current = first.client;
      mockGetSupabaseClient.mockImplementation(() => current);
      mockDiscardSupabaseClient.mockImplementation(() => {
        current = second.client;
      });
      const reload = jest.fn();
      const originalLocation = window.location;
      Object.defineProperty(window, 'location', { value: { reload }, configurable: true });

      const root = await mount();
      expect(first.unsubscribe).not.toHaveBeenCalled();

      await act(async () => {
        captured.actions!.retryAuthInitialisation();
      });

      expect(mockDiscardSupabaseClient).toHaveBeenCalledTimes(1);
      expect(first.unsubscribe).toHaveBeenCalledTimes(1);
      expect(second.client.auth.onAuthStateChange).toHaveBeenCalledTimes(1);
      expect(reload).not.toHaveBeenCalled();

      await act(async () => {
        second.emit('INITIAL_SESSION', null);
      });
      expect(captured.state).toEqual({ status: 'guest', reason: 'signedOut' });

      Object.defineProperty(window, 'location', { value: originalLocation, configurable: true });
      act(() => {
        root.unmount();
      });
    });
  });

  it('forwards signOut with scope local and surfaces the error', async () => {
    const fake = createFakeClient();
    const signOutError = { message: 'network down' };
    fake.signOut.mockResolvedValueOnce({ error: signOutError });
    mockGetSupabaseClient.mockReturnValue(fake.client);

    const root = await mount();

    let result: { error: unknown } | undefined;
    await act(async () => {
      result = await captured.actions!.signOut();
    });

    expect(fake.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(result).toEqual({ error: signOutError });
    act(() => {
      root.unmount();
    });
  });

  it('falls back to guest/error when subscribing throws synchronously', async () => {
    const throwingClient = {
      auth: {
        onAuthStateChange: () => {
          throw new Error('boom');
        },
      },
    } as unknown as SupabaseClient;
    mockGetSupabaseClient.mockReturnValue(throwingClient);

    const root = await mount();

    expect(captured.state).toEqual({ status: 'guest', reason: 'error' });
    act(() => {
      root.unmount();
    });
  });

  it('resolves to passwordRecovery when PASSWORD_RECOVERY fires with a session', async () => {
    const fake = createFakeClient();
    mockGetSupabaseClient.mockReturnValue(fake.client);

    const root = await mount();
    const session = { access_token: 'recovery' } as unknown as Session;
    act(() => {
      fake.emit('PASSWORD_RECOVERY', session);
    });

    expect(captured.state).toEqual({ status: 'passwordRecovery', session });
    act(() => {
      root.unmount();
    });
  });

  it('completePasswordRecovery rejects with session_not_found when not in passwordRecovery status, without calling updateUser', async () => {
    const fake = createFakeClient();
    mockGetSupabaseClient.mockReturnValue(fake.client);

    const root = await mount();
    expect(captured.state).toEqual({ status: 'initializing' });

    let result: { error: unknown } | undefined;
    await act(async () => {
      result = await captured.actions!.completePasswordRecovery('new-password-123');
    });

    expect(fake.updateUser).not.toHaveBeenCalled();
    expect((result?.error as { code?: string } | undefined)?.code).toBe('session_not_found');
    act(() => {
      root.unmount();
    });
  });

  it('completePasswordRecovery calls updateUser with the given password when in passwordRecovery status, and forwards a null error', async () => {
    const fake = createFakeClient();
    mockGetSupabaseClient.mockReturnValue(fake.client);

    const root = await mount();
    act(() => {
      fake.emit('PASSWORD_RECOVERY', { access_token: 'recovery' } as unknown as Session);
    });

    let result: { error: unknown } | undefined;
    await act(async () => {
      result = await captured.actions!.completePasswordRecovery('new-password-123');
    });

    expect(fake.updateUser).toHaveBeenCalledWith({ password: 'new-password-123' });
    expect(result).toEqual({ error: null });
    // State does not mutate directly from the action -- only via a subsequent real event.
    expect(captured.state).toEqual({ status: 'passwordRecovery', session: { access_token: 'recovery' } });
    act(() => {
      root.unmount();
    });
  });

  it('promotes to authenticated when the real USER_UPDATED event follows completePasswordRecovery (T274)', async () => {
    const fake = createFakeClient();
    mockGetSupabaseClient.mockReturnValue(fake.client);

    const root = await mount();
    act(() => {
      fake.emit('PASSWORD_RECOVERY', { access_token: 'recovery' } as unknown as Session);
    });

    await act(async () => {
      await captured.actions!.completePasswordRecovery('new-password-123');
    });
    expect(captured.state).toEqual({ status: 'passwordRecovery', session: { access_token: 'recovery' } });

    const updatedSession = { access_token: 'updated' } as unknown as Session;
    act(() => {
      fake.emit('USER_UPDATED', updatedSession);
    });

    expect(captured.state).toEqual({
      status: 'authenticated',
      session: updatedSession,
      lastEvent: 'USER_UPDATED',
    });
    act(() => {
      root.unmount();
    });
  });

  it('completePasswordRecovery forwards a failure error from updateUser', async () => {
    const fake = createFakeClient();
    const updateError = { message: 'weak password', code: 'weak_password' };
    fake.updateUser.mockResolvedValueOnce({ error: updateError });
    mockGetSupabaseClient.mockReturnValue(fake.client);

    const root = await mount();
    act(() => {
      fake.emit('PASSWORD_RECOVERY', { access_token: 'recovery' } as unknown as Session);
    });

    let result: { error: unknown } | undefined;
    await act(async () => {
      result = await captured.actions!.completePasswordRecovery('weak');
    });

    expect(result).toEqual({ error: updateError });
    act(() => {
      root.unmount();
    });
  });

  it('exchangeCodeForSession resolves redirectType recovery for a recovery code', async () => {
    const fake = createFakeClient();
    fake.exchangeCodeForSession.mockResolvedValueOnce({
      data: { redirectType: 'recovery' },
      error: null,
    });
    mockGetSupabaseClient.mockReturnValue(fake.client);

    const root = await mount();

    let result: { redirectType: 'recovery' | null; error: unknown } | undefined;
    await act(async () => {
      result = await captured.actions!.exchangeCodeForSession('a-code');
    });

    expect(fake.exchangeCodeForSession).toHaveBeenCalledWith('a-code');
    expect(result).toEqual({ redirectType: 'recovery', error: null });
    act(() => {
      root.unmount();
    });
  });

  it('exchangeCodeForSession resolves redirectType null for a signup-confirmation code', async () => {
    const fake = createFakeClient();
    fake.exchangeCodeForSession.mockResolvedValueOnce({
      data: { redirectType: null },
      error: null,
    });
    mockGetSupabaseClient.mockReturnValue(fake.client);

    const root = await mount();

    let result: { redirectType: 'recovery' | null; error: unknown } | undefined;
    await act(async () => {
      result = await captured.actions!.exchangeCodeForSession('a-code');
    });

    expect(result).toEqual({ redirectType: null, error: null });
    act(() => {
      root.unmount();
    });
  });

  it('exchangeCodeForSession passes through an error without a redirectType', async () => {
    const fake = createFakeClient();
    const exchangeError = { message: 'invalid code', code: 'flow_state_expired' };
    fake.exchangeCodeForSession.mockResolvedValueOnce({ data: null, error: exchangeError });
    mockGetSupabaseClient.mockReturnValue(fake.client);

    const root = await mount();

    let result: { redirectType: 'recovery' | null; error: unknown } | undefined;
    await act(async () => {
      result = await captured.actions!.exchangeCodeForSession('a-code');
    });

    expect(result).toEqual({ redirectType: null, error: exchangeError });
    act(() => {
      root.unmount();
    });
  });

  it('requestPasswordReset forwards email and a redirectTo ending in /auth/callback, with a null error', async () => {
    const fake = createFakeClient();
    mockGetSupabaseClient.mockReturnValue(fake.client);

    const originalWindow = (globalThis as { window?: unknown }).window;
    (globalThis as { window?: unknown }).window = { location: { origin: 'https://dailydama.com' } };
    useWebPlatform();

    const root = await mount();

    let result: { error: unknown } | undefined;
    await act(async () => {
      result = await captured.actions!.requestPasswordReset('person@example.com');
    });

    expect(fake.resetPasswordForEmail).toHaveBeenCalledWith('person@example.com', {
      redirectTo: 'https://dailydama.com/auth/callback',
    });
    expect(result).toEqual({ error: null });

    act(() => {
      root.unmount();
    });
    (globalThis as { window?: unknown }).window = originalWindow;
  });

  it('requestPasswordReset forwards a failure error from resetPasswordForEmail without mutating AuthState', async () => {
    const fake = createFakeClient();
    const resetError = { message: 'rate limited', code: 'over_email_send_rate_limit' };
    fake.resetPasswordForEmail.mockResolvedValueOnce({ error: resetError });
    mockGetSupabaseClient.mockReturnValue(fake.client);

    const originalWindow = (globalThis as { window?: unknown }).window;
    (globalThis as { window?: unknown }).window = { location: { origin: 'https://dailydama.com' } };
    useWebPlatform();

    const root = await mount();

    let result: { error: unknown } | undefined;
    await act(async () => {
      result = await captured.actions!.requestPasswordReset('person@example.com');
    });

    expect(result).toEqual({ error: resetError });
    expect(captured.state).toEqual({ status: 'initializing' });

    act(() => {
      root.unmount();
    });
    (globalThis as { window?: unknown }).window = originalWindow;
  });

  it('changePassword rejects with session_not_found when not authenticated, without calling signInWithPassword or updateUser', async () => {
    const fake = createFakeClient();
    mockGetSupabaseClient.mockReturnValue(fake.client);

    const root = await mount();
    expect(captured.state).toEqual({ status: 'initializing' });

    let result: { error: unknown } | undefined;
    await act(async () => {
      result = await captured.actions!.changePassword('old-password', 'new-password-123');
    });

    expect(fake.signInWithPassword).not.toHaveBeenCalled();
    expect(fake.updateUser).not.toHaveBeenCalled();
    expect((result?.error as { code?: string } | undefined)?.code).toBe('session_not_found');
    act(() => {
      root.unmount();
    });
  });

  it('deleteAccount rejects unauthenticated calls without invoking the function', async () => {
    const fake = createFakeClient();
    mockGetSupabaseClient.mockReturnValue(fake.client);
    const root = await mount();

    let result: { error: unknown } | undefined;
    await act(async () => {
      result = await captured.actions!.deleteAccount('current-password', 'DELETE');
    });

    expect(fake.invoke).not.toHaveBeenCalled();
    expect((result?.error as { code?: string } | undefined)?.code).toBe('session_not_found');
    act(() => root.unmount());
  });

  it('deleteAccount forwards the exact body to the hardened function and returns its result', async () => {
    const fake = createFakeClient();
    mockGetSupabaseClient.mockReturnValue(fake.client);
    const root = await mount();
    act(() => {
      fake.emit('SIGNED_IN', { access_token: 'token', user: { email: 'person@example.com' } } as unknown as Session);
    });
    const functionError = { status: 429, message: 'raw backend detail' };
    fake.invoke.mockResolvedValueOnce({ data: null, error: functionError });

    let result: { error: unknown } | undefined;
    await act(async () => {
      result = await captured.actions!.deleteAccount('current-password', 'DELETE');
    });

    expect(fake.invoke).toHaveBeenCalledWith('delete-account', {
      body: { currentPassword: 'current-password', confirmation: 'DELETE' },
    });
    expect(result).toEqual({ error: functionError });
    act(() => root.unmount());
  });

  it('deleteAccount, on normal success, purges the deleted account namespace and signs out locally', async () => {
    const fake = createFakeClient();
    mockGetSupabaseClient.mockReturnValue(fake.client);
    const root = await mount();
    act(() => {
      fake.emit('SIGNED_IN', {
        access_token: 'token',
        user: { id: DELETION_USER_ID, email: 'person@example.com' },
      } as unknown as Session);
    });
    await AsyncStorage.setItem(DELETION_PROFILE_KEY, 'seeded-account-data');
    fake.invoke.mockResolvedValueOnce({ data: null, error: null });

    let result: { error: unknown } | undefined;
    await act(async () => {
      result = await captured.actions!.deleteAccount('current-password', 'DELETE');
    });

    expect(await AsyncStorage.getItem(DELETION_PROFILE_KEY)).toBeNull();
    expect(fake.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(result).toEqual({ error: null });
    act(() => root.unmount());
  });

  it('deleteAccount, on a reconciled response-loss retry where Auth verification shows the user already gone, purges and signs out identically to a fresh success', async () => {
    // The delete-account Edge Function's own isNotFound check makes this
    // indistinguishable from a fresh success at the client (both resolve
    // functions.invoke with { error: null }) -- exercised as a separate
    // test anyway, per the exit criteria, so a future refactor cannot
    // accidentally split the two branches without this test catching it.
    const fake = createFakeClient();
    mockGetSupabaseClient.mockReturnValue(fake.client);
    const root = await mount();
    act(() => {
      fake.emit('SIGNED_IN', {
        access_token: 'token',
        user: { id: DELETION_USER_ID, email: 'person@example.com' },
      } as unknown as Session);
    });
    await AsyncStorage.setItem(DELETION_PROFILE_KEY, 'seeded-account-data');
    fake.invoke.mockResolvedValueOnce({ data: null, error: null });

    let result: { error: unknown } | undefined;
    await act(async () => {
      result = await captured.actions!.deleteAccount('current-password', 'DELETE');
    });

    expect(await AsyncStorage.getItem(DELETION_PROFILE_KEY)).toBeNull();
    expect(fake.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(result).toEqual({ error: null });
    act(() => root.unmount());
  });

  it('deleteAccount, on a response-loss retry where the user is still present, leaves storage and session untouched', async () => {
    const fake = createFakeClient();
    mockGetSupabaseClient.mockReturnValue(fake.client);
    const root = await mount();
    act(() => {
      fake.emit('SIGNED_IN', {
        access_token: 'token',
        user: { id: DELETION_USER_ID, email: 'person@example.com' },
      } as unknown as Session);
    });
    await AsyncStorage.setItem(DELETION_PROFILE_KEY, 'seeded-account-data');
    fake.invoke.mockResolvedValueOnce({ data: null, error: { status: 401 } });

    let result: { error: unknown } | undefined;
    await act(async () => {
      result = await captured.actions!.deleteAccount('current-password', 'DELETE');
    });

    expect(await AsyncStorage.getItem(DELETION_PROFILE_KEY)).toBe('seeded-account-data');
    expect(fake.signOut).not.toHaveBeenCalled();
    expect(result).toEqual({ error: { status: 401 } });
    act(() => root.unmount());
  });

  it('deleteAccount, on an offline retry, leaves storage and session untouched', async () => {
    const fake = createFakeClient();
    mockGetSupabaseClient.mockReturnValue(fake.client);
    const root = await mount();
    act(() => {
      fake.emit('SIGNED_IN', {
        access_token: 'token',
        user: { id: DELETION_USER_ID, email: 'person@example.com' },
      } as unknown as Session);
    });
    await AsyncStorage.setItem(DELETION_PROFILE_KEY, 'seeded-account-data');
    fake.invoke.mockResolvedValueOnce({ data: null, error: { name: 'FunctionsFetchError' } });

    let result: { error: unknown } | undefined;
    await act(async () => {
      result = await captured.actions!.deleteAccount('current-password', 'DELETE');
    });

    expect(await AsyncStorage.getItem(DELETION_PROFILE_KEY)).toBe('seeded-account-data');
    expect(fake.signOut).not.toHaveBeenCalled();
    expect(result).toEqual({ error: { name: 'FunctionsFetchError' } });
    act(() => root.unmount());
  });

  it('deleteAccount still signs out on success when the session user id is malformed, without attempting a purge', async () => {
    const fake = createFakeClient();
    mockGetSupabaseClient.mockReturnValue(fake.client);
    const root = await mount();
    act(() => {
      fake.emit('SIGNED_IN', {
        access_token: 'token',
        user: { id: 'not-a-uuid', email: 'person@example.com' },
      } as unknown as Session);
    });
    fake.invoke.mockResolvedValueOnce({ data: null, error: null });

    let result: { error: unknown } | undefined;
    await act(async () => {
      result = await captured.actions!.deleteAccount('current-password', 'DELETE');
    });

    expect(fake.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(result).toEqual({ error: null });
    act(() => root.unmount());
  });

  it('changePassword signs in with the current password then updates, in that order, when authenticated', async () => {
    const fake = createFakeClient();
    mockGetSupabaseClient.mockReturnValue(fake.client);

    const root = await mount();
    const session = { access_token: 'a', user: { email: 'person@example.com' } } as unknown as Session;
    act(() => {
      fake.emit('SIGNED_IN', session);
    });

    const callOrder: string[] = [];
    fake.signInWithPassword.mockImplementationOnce(async () => {
      callOrder.push('signIn');
      return { error: null };
    });
    fake.updateUser.mockImplementationOnce(async () => {
      callOrder.push('updateUser');
      return { error: null };
    });

    let result: { error: unknown } | undefined;
    await act(async () => {
      result = await captured.actions!.changePassword('old-password', 'new-password-123');
    });

    expect(fake.signInWithPassword).toHaveBeenCalledWith({
      email: 'person@example.com',
      password: 'old-password',
    });
    expect(fake.updateUser).toHaveBeenCalledWith({ password: 'new-password-123' });
    expect(callOrder).toEqual(['signIn', 'updateUser']);
    expect(result).toEqual({ error: null });
    act(() => {
      root.unmount();
    });
  });

  it('changePassword surfaces a wrong-current-password error and never calls updateUser', async () => {
    const fake = createFakeClient();
    const signInError = { message: 'invalid credentials', code: 'invalid_credentials' };
    fake.signInWithPassword.mockResolvedValueOnce({ error: signInError });
    mockGetSupabaseClient.mockReturnValue(fake.client);

    const root = await mount();
    act(() => {
      fake.emit('SIGNED_IN', {
        access_token: 'a',
        user: { email: 'person@example.com' },
      } as unknown as Session);
    });

    let result: { error: unknown } | undefined;
    await act(async () => {
      result = await captured.actions!.changePassword('wrong-password', 'new-password-123');
    });

    expect(fake.updateUser).not.toHaveBeenCalled();
    expect(result).toEqual({ error: signInError });
    act(() => {
      root.unmount();
    });
  });

  it('changePassword surfaces an offline error from the sign-in step', async () => {
    const fake = createFakeClient();
    const offlineError = new TypeError('Failed to fetch');
    fake.signInWithPassword.mockResolvedValueOnce({ error: offlineError });
    mockGetSupabaseClient.mockReturnValue(fake.client);

    const root = await mount();
    act(() => {
      fake.emit('SIGNED_IN', {
        access_token: 'a',
        user: { email: 'person@example.com' },
      } as unknown as Session);
    });

    let result: { error: unknown } | undefined;
    await act(async () => {
      result = await captured.actions!.changePassword('old-password', 'new-password-123');
    });

    expect(fake.updateUser).not.toHaveBeenCalled();
    expect(result).toEqual({ error: offlineError });
    act(() => {
      root.unmount();
    });
  });

  it('changePassword surfaces an offline error from the updateUser step, after a successful sign-in', async () => {
    const fake = createFakeClient();
    const offlineError = new TypeError('Failed to fetch');
    fake.updateUser.mockResolvedValueOnce({ error: offlineError });
    mockGetSupabaseClient.mockReturnValue(fake.client);

    const root = await mount();
    act(() => {
      fake.emit('SIGNED_IN', {
        access_token: 'a',
        user: { email: 'person@example.com' },
      } as unknown as Session);
    });

    let result: { error: unknown } | undefined;
    await act(async () => {
      result = await captured.actions!.changePassword('old-password', 'new-password-123');
    });

    expect(fake.signInWithPassword).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ error: offlineError });
    act(() => {
      root.unmount();
    });
  });

  it('changeEmail rejects with session_not_found when not authenticated, without calling signInWithPassword or updateUser', async () => {
    const fake = createFakeClient();
    mockGetSupabaseClient.mockReturnValue(fake.client);

    const root = await mount();
    expect(captured.state).toEqual({ status: 'initializing' });

    let result: { error: unknown } | undefined;
    await act(async () => {
      result = await captured.actions!.changeEmail('new@example.com', 'old-password');
    });

    expect(fake.signInWithPassword).not.toHaveBeenCalled();
    expect(fake.updateUser).not.toHaveBeenCalled();
    expect((result?.error as { code?: string } | undefined)?.code).toBe('session_not_found');
    act(() => {
      root.unmount();
    });
  });

  it('changeEmail calls updateUser with the new email and a fixed redirectTo carrying flow=email_change, with a null error', async () => {
    const fake = createFakeClient();
    mockGetSupabaseClient.mockReturnValue(fake.client);

    const originalWindow = (globalThis as { window?: unknown }).window;
    (globalThis as { window?: unknown }).window = { location: { origin: 'https://dailydama.com' } };
    useWebPlatform();

    const root = await mount();
    act(() => {
      fake.emit('SIGNED_IN', {
        access_token: 'a',
        user: { email: 'person@example.com' },
      } as unknown as Session);
    });

    let result: { error: unknown } | undefined;
    await act(async () => {
      result = await captured.actions!.changeEmail('new@example.com', 'old-password');
    });

    expect(fake.signInWithPassword).toHaveBeenCalledWith({
      email: 'person@example.com',
      password: 'old-password',
    });
    expect(fake.updateUser).toHaveBeenCalledWith(
      { email: 'new@example.com' },
      { emailRedirectTo: 'https://dailydama.com/auth/callback?flow=email_change' },
    );
    expect(result).toEqual({ error: null });

    act(() => {
      root.unmount();
    });
    (globalThis as { window?: unknown }).window = originalWindow;
  });

  it('changeEmail forwards a failure error from updateUser', async () => {
    const fake = createFakeClient();
    const updateError = { message: 'rate limited', code: 'over_email_send_rate_limit' };
    fake.updateUser.mockResolvedValueOnce({ error: updateError });
    mockGetSupabaseClient.mockReturnValue(fake.client);

    const originalWindow = (globalThis as { window?: unknown }).window;
    (globalThis as { window?: unknown }).window = { location: { origin: 'https://dailydama.com' } };
    useWebPlatform();

    const root = await mount();
    act(() => {
      fake.emit('SIGNED_IN', {
        access_token: 'a',
        user: { email: 'person@example.com' },
      } as unknown as Session);
    });

    let result: { error: unknown } | undefined;
    await act(async () => {
      result = await captured.actions!.changeEmail('new@example.com', 'old-password');
    });

    expect(fake.signInWithPassword).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ error: updateError });

    act(() => {
      root.unmount();
    });
    (globalThis as { window?: unknown }).window = originalWindow;
  });

  it('changeEmail signs in with the current password then updates, in that order, when authenticated', async () => {
    const fake = createFakeClient();
    mockGetSupabaseClient.mockReturnValue(fake.client);

    const originalWindow = (globalThis as { window?: unknown }).window;
    (globalThis as { window?: unknown }).window = { location: { origin: 'https://dailydama.com' } };
    useWebPlatform();

    const root = await mount();
    act(() => {
      fake.emit('SIGNED_IN', {
        access_token: 'a',
        user: { email: 'person@example.com' },
      } as unknown as Session);
    });

    const callOrder: string[] = [];
    fake.signInWithPassword.mockImplementationOnce(async () => {
      callOrder.push('signIn');
      return { error: null };
    });
    fake.updateUser.mockImplementationOnce(async () => {
      callOrder.push('updateUser');
      return { error: null };
    });

    let result: { error: unknown } | undefined;
    await act(async () => {
      result = await captured.actions!.changeEmail('new@example.com', 'old-password');
    });

    expect(fake.signInWithPassword).toHaveBeenCalledWith({
      email: 'person@example.com',
      password: 'old-password',
    });
    expect(fake.updateUser).toHaveBeenCalledWith(
      { email: 'new@example.com' },
      { emailRedirectTo: 'https://dailydama.com/auth/callback?flow=email_change' },
    );
    expect(callOrder).toEqual(['signIn', 'updateUser']);
    expect(result).toEqual({ error: null });

    act(() => {
      root.unmount();
    });
    (globalThis as { window?: unknown }).window = originalWindow;
  });

  it('changeEmail surfaces a wrong-current-password error and never calls updateUser', async () => {
    const fake = createFakeClient();
    const signInError = { message: 'invalid credentials', code: 'invalid_credentials' };
    fake.signInWithPassword.mockResolvedValueOnce({ error: signInError });
    mockGetSupabaseClient.mockReturnValue(fake.client);

    const root = await mount();
    act(() => {
      fake.emit('SIGNED_IN', {
        access_token: 'a',
        user: { email: 'person@example.com' },
      } as unknown as Session);
    });

    let result: { error: unknown } | undefined;
    await act(async () => {
      result = await captured.actions!.changeEmail('new@example.com', 'wrong-password');
    });

    expect(fake.updateUser).not.toHaveBeenCalled();
    expect(result).toEqual({ error: signInError });
    act(() => {
      root.unmount();
    });
  });

  it('changeEmail surfaces an offline error from the sign-in step', async () => {
    const fake = createFakeClient();
    const offlineError = new TypeError('Failed to fetch');
    fake.signInWithPassword.mockResolvedValueOnce({ error: offlineError });
    mockGetSupabaseClient.mockReturnValue(fake.client);

    const root = await mount();
    act(() => {
      fake.emit('SIGNED_IN', {
        access_token: 'a',
        user: { email: 'person@example.com' },
      } as unknown as Session);
    });

    let result: { error: unknown } | undefined;
    await act(async () => {
      result = await captured.actions!.changeEmail('new@example.com', 'old-password');
    });

    expect(fake.updateUser).not.toHaveBeenCalled();
    expect(result).toEqual({ error: offlineError });
    act(() => {
      root.unmount();
    });
  });

  it('unsubscribes from the auth listener on unmount', async () => {
    const fake = createFakeClient();
    mockGetSupabaseClient.mockReturnValue(fake.client);

    const root = await mount();
    act(() => {
      root.unmount();
    });

    expect(fake.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('signUp forwards email, password, and a redirectTo ending in /auth/callback, with a null error', async () => {
    const fake = createFakeClient();
    mockGetSupabaseClient.mockReturnValue(fake.client);

    const originalWindow = (globalThis as { window?: unknown }).window;
    (globalThis as { window?: unknown }).window = { location: { origin: 'https://dailydama.com' } };
    useWebPlatform();

    const root = await mount();

    let result: { error: unknown } | undefined;
    await act(async () => {
      result = await captured.actions!.signUp('person@example.com', 'a-long-enough-password');
    });

    expect(fake.signUp).toHaveBeenCalledWith({
      email: 'person@example.com',
      password: 'a-long-enough-password',
      options: { emailRedirectTo: 'https://dailydama.com/auth/callback' },
    });
    expect(result).toEqual({ error: null });

    act(() => {
      root.unmount();
    });
    (globalThis as { window?: unknown }).window = originalWindow;
  });

  it('signUp forwards a failure error from signUp without mutating AuthState', async () => {
    const fake = createFakeClient();
    const signUpError = { message: 'already exists', code: 'user_already_exists' };
    fake.signUp.mockResolvedValueOnce({ error: signUpError });
    mockGetSupabaseClient.mockReturnValue(fake.client);

    const originalWindow = (globalThis as { window?: unknown }).window;
    (globalThis as { window?: unknown }).window = { location: { origin: 'https://dailydama.com' } };
    useWebPlatform();

    const root = await mount();

    let result: { error: unknown } | undefined;
    await act(async () => {
      result = await captured.actions!.signUp('person@example.com', 'a-long-enough-password');
    });

    expect(result).toEqual({ error: signUpError });
    expect(captured.state).toEqual({ status: 'initializing' });

    act(() => {
      root.unmount();
    });
    (globalThis as { window?: unknown }).window = originalWindow;
  });

  it('resendSignupConfirmation forwards email and a redirectTo ending in /auth/callback, with a null error', async () => {
    const fake = createFakeClient();
    mockGetSupabaseClient.mockReturnValue(fake.client);

    const originalWindow = (globalThis as { window?: unknown }).window;
    (globalThis as { window?: unknown }).window = { location: { origin: 'https://dailydama.com' } };
    useWebPlatform();

    const root = await mount();

    let result: { error: unknown } | undefined;
    await act(async () => {
      result = await captured.actions!.resendSignupConfirmation('person@example.com');
    });

    expect(fake.resend).toHaveBeenCalledWith({
      type: 'signup',
      email: 'person@example.com',
      options: { emailRedirectTo: 'https://dailydama.com/auth/callback' },
    });
    expect(result).toEqual({ error: null });

    act(() => {
      root.unmount();
    });
    (globalThis as { window?: unknown }).window = originalWindow;
  });

  it('resendSignupConfirmation forwards a failure error from resend', async () => {
    const fake = createFakeClient();
    const resendError = { message: 'rate limited', code: 'over_email_send_rate_limit' };
    fake.resend.mockResolvedValueOnce({ error: resendError });
    mockGetSupabaseClient.mockReturnValue(fake.client);

    const originalWindow = (globalThis as { window?: unknown }).window;
    (globalThis as { window?: unknown }).window = { location: { origin: 'https://dailydama.com' } };
    useWebPlatform();

    const root = await mount();

    let result: { error: unknown } | undefined;
    await act(async () => {
      result = await captured.actions!.resendSignupConfirmation('person@example.com');
    });

    expect(result).toEqual({ error: resendError });

    act(() => {
      root.unmount();
    });
    (globalThis as { window?: unknown }).window = originalWindow;
  });

  describe('native email-link callback URLs (no window)', () => {
    // Platform.OS is 'ios' under jest-expo; `window` carries no `location`, as on device.
    it('passes dailydama://auth/callback to all four email flows', async () => {
      const fake = createFakeClient();
      mockGetSupabaseClient.mockReturnValue(fake.client);
      const root = await mount();
      act(() => {
        fake.emit('SIGNED_IN', { access_token: 'a', user: { email: 'person@example.com' } } as unknown as Session);
      });

      await act(async () => {
        await captured.actions!.signUp('person@example.com', 'a-long-enough-password');
        await captured.actions!.resendSignupConfirmation('person@example.com');
        await captured.actions!.requestPasswordReset('person@example.com');
        await captured.actions!.changeEmail('new@example.com', 'old-password');
      });

      expect(fake.signUp).toHaveBeenCalledWith(
        expect.objectContaining({ options: { emailRedirectTo: 'dailydama://auth/callback' } }),
      );
      expect(fake.resend).toHaveBeenCalledWith(
        expect.objectContaining({ options: { emailRedirectTo: 'dailydama://auth/callback' } }),
      );
      expect(fake.resetPasswordForEmail).toHaveBeenCalledWith('person@example.com', {
        redirectTo: 'dailydama://auth/callback',
      });
      expect(fake.updateUser).toHaveBeenCalledWith(
        { email: 'new@example.com' },
        { emailRedirectTo: 'dailydama://auth/callback?flow=email_change' },
      );

      act(() => {
        root.unmount();
      });
    });

    it('returns a typed error and makes no network call when no callback URL can be resolved', async () => {
      const fake = createFakeClient();
      mockGetSupabaseClient.mockReturnValue(fake.client);
      const originalWindow = (globalThis as { window?: unknown }).window;
      useWebPlatform();
      (globalThis as { window?: unknown }).window = undefined;

      const root = await mount();
      let result: { error: unknown } | undefined;
      await act(async () => {
        result = await captured.actions!.signUp('person@example.com', 'a-long-enough-password');
      });

      expect((result?.error as { message?: string } | undefined)?.message).toBe('Unable to resolve the callback URL.');
      expect(fake.signUp).not.toHaveBeenCalled();

      act(() => {
        root.unmount();
      });
      (globalThis as { window?: unknown }).window = originalWindow;
    });
  });
});
