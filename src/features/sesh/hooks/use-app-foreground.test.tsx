import { describe, expect, it, jest } from '@jest/globals';
import { AppState } from 'react-native';
import { act, create } from 'react-test-renderer';

import { useAppForeground } from '@/features/sesh/hooks/use-app-foreground';

function Host({ onForeground }: { readonly onForeground: (now: number) => void }) {
  useAppForeground(onForeground);
  return null;
}

function latestHandler() {
  const calls = (AppState.addEventListener as jest.Mock).mock.calls;
  return calls[calls.length - 1][1] as (state: string) => void;
}

describe('useAppForeground', () => {
  it('reports an explicit timestamp only when the app becomes active', () => {
    jest.useFakeTimers();
    jest.setSystemTime(5_000);
    const onForeground = jest.fn();
    act(() => {
      create(<Host onForeground={onForeground} />);
    });
    const handler = latestHandler();

    act(() => handler('background'));
    act(() => handler('inactive'));
    expect(onForeground).not.toHaveBeenCalled();

    jest.setSystemTime(9_000);
    act(() => handler('active'));
    expect(onForeground).toHaveBeenCalledWith(9_000);
    jest.useRealTimers();
  });

  it('uses the latest callback without resubscribing, and unsubscribes on unmount', () => {
    const first = jest.fn();
    const second = jest.fn();
    const remove = jest.fn();
    const spy = jest
      .spyOn(AppState, 'addEventListener')
      .mockReturnValue({ remove } as unknown as ReturnType<typeof AppState.addEventListener>);
    spy.mockClear();
    let root!: ReturnType<typeof create>;
    act(() => {
      root = create(<Host onForeground={first} />);
    });
    act(() => root.update(<Host onForeground={second} />));
    expect(spy).toHaveBeenCalledTimes(1);

    act(() => (spy.mock.calls[0][1] as (state: string) => void)('active'));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);

    act(() => root.unmount());
    expect(remove).toHaveBeenCalled();
    spy.mockRestore();
  });
});
