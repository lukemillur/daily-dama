import { describe, expect, it, jest } from '@jest/globals';
import { AppState } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { useLiveClock } from '@/features/home/hooks/use-live-clock';

function HookHost({ intervalMs }: { readonly intervalMs: number }) {
  const now = useLiveClock(intervalMs);
  return now as unknown as null;
}

describe('useLiveClock', () => {
  it('returns the mounted time initially and advances on each interval tick', () => {
    jest.useFakeTimers();
    jest.setSystemTime(1_000_000);

    let root!: ReactTestRenderer;
    act(() => {
      root = create(<HookHost intervalMs={60_000} />);
    });
    expect(root.toJSON()).toBe(String(1_000_000));

    act(() => {
      jest.advanceTimersByTime(60_000);
    });
    expect(root.toJSON()).toBe(String(1_060_000));

    act(() => {
      root.unmount();
    });
    jest.useRealTimers();
  });

  it('refreshes immediately when the app returns to the foreground, without waiting for a tick', () => {
    jest.useFakeTimers();
    jest.setSystemTime(2_000_000);

    let root!: ReactTestRenderer;
    act(() => {
      root = create(<HookHost intervalMs={60_000} />);
    });

    const addEventListenerMock = AppState.addEventListener as jest.Mock;
    const handler = addEventListenerMock.mock.calls[addEventListenerMock.mock.calls.length - 1][1] as (
      state: string,
    ) => void;

    jest.setSystemTime(2_030_000);
    act(() => {
      handler('background');
    });
    // Backgrounding must not trigger a re-render/update — the guard is `state === 'active'` only.
    expect(root.toJSON()).toBe(String(2_000_000));

    act(() => {
      handler('active');
    });
    expect(root.toJSON()).toBe(String(2_030_000));

    act(() => {
      root.unmount();
    });
    jest.useRealTimers();
  });

  it('clears the interval and removes the AppState subscription on unmount', () => {
    jest.useFakeTimers();
    const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
    const removeMock = jest.fn();
    const addEventListenerSpy = jest
      .spyOn(AppState, 'addEventListener')
      .mockReturnValue({ remove: removeMock } as unknown as ReturnType<typeof AppState.addEventListener>);

    let root!: ReactTestRenderer;
    act(() => {
      root = create(<HookHost intervalMs={60_000} />);
    });

    act(() => {
      root.unmount();
    });

    expect(clearIntervalSpy).toHaveBeenCalled();
    expect(removeMock).toHaveBeenCalled();

    clearIntervalSpy.mockRestore();
    addEventListenerSpy.mockRestore();
    jest.useRealTimers();
  });
});
