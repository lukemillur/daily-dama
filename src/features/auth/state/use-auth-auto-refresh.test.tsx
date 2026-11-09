import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AppState, Platform } from 'react-native';
import { act, create } from 'react-test-renderer';

import { useAuthAutoRefresh } from '@/features/auth/state/use-auth-auto-refresh';

const startAutoRefresh = jest.fn(async () => undefined);
const stopAutoRefresh = jest.fn(async () => undefined);
const mockClient = { auth: { startAutoRefresh, stopAutoRefresh } };
jest.mock('@/shared/supabase/supabase-client', () => ({
  getSupabaseClient: () => mockClient,
}));

const originalPlatformOS = Platform.OS;
const originalAppState = AppState.currentState;

function setCurrentState(state: typeof AppState.currentState) {
  (AppState as { currentState: typeof AppState.currentState }).currentState = state;
}

function Harness() {
  useAuthAutoRefresh(0);
  return null;
}

describe('useAuthAutoRefresh', () => {
  let handler: ((state: string) => void) | undefined;
  const remove = jest.fn();

  beforeEach(() => {
    handler = undefined;
    jest.clearAllMocks();
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, cb: (s: string) => void) => {
      handler = cb;
      return { remove };
    }) as unknown as typeof AppState.addEventListener);
    setCurrentState('active');
  });

  afterEach(() => {
    setCurrentState(originalAppState);
    Platform.OS = originalPlatformOS;
    jest.restoreAllMocks();
    startAutoRefresh.mockClear();
    stopAutoRefresh.mockClear();
    remove.mockClear();
  });

  it('(d) on native, starts when active, stops on background, restarts on active, ignores inactive', async () => {
    Platform.OS = 'ios';
    let root!: ReturnType<typeof create>;
    await act(async () => {
      root = create(<Harness />);
    });
    expect(startAutoRefresh).toHaveBeenCalledTimes(1);

    await act(async () => handler!('inactive'));
    expect(stopAutoRefresh).not.toHaveBeenCalled();
    expect(startAutoRefresh).toHaveBeenCalledTimes(1);

    await act(async () => handler!('background'));
    expect(stopAutoRefresh).toHaveBeenCalledTimes(1);

    await act(async () => handler!('active'));
    expect(startAutoRefresh).toHaveBeenCalledTimes(2);

    await act(async () => root.unmount());
    expect(remove).toHaveBeenCalledTimes(1);
    expect(stopAutoRefresh).toHaveBeenCalledTimes(2);
  });

  it('does not start when mounted while the app is not active', async () => {
    Platform.OS = 'android';
    setCurrentState('background');

    await act(async () => {
      create(<Harness />);
    });

    expect(startAutoRefresh).not.toHaveBeenCalled();
  });

  it('(d) on web, does nothing', async () => {
    Platform.OS = 'web';
    let root!: ReturnType<typeof create>;
    await act(async () => {
      root = create(<Harness />);
    });

    expect(AppState.addEventListener).not.toHaveBeenCalled();
    expect(startAutoRefresh).not.toHaveBeenCalled();

    await act(async () => root.unmount());
    expect(stopAutoRefresh).not.toHaveBeenCalled();
  });
});
