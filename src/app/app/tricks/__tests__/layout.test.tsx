import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create } from 'react-test-renderer';

import TricksLayout from '@/app/app/tricks/_layout';

const mockRouter = { replace: jest.fn() };
const mockTabNavigation = {
  addListener: jest.fn(),
  getState: () => ({
    routes: [
      { key: 'home-tab', name: 'index' },
      { key: 'tricks-tab', name: 'tricks' },
      { key: 'stats-tab', name: 'stats' },
    ],
  }),
};
const mockNavigation = { getParent: () => mockTabNavigation };

jest.mock('expo-router', () => ({
  Stack: () => null,
  useNavigation: () => mockNavigation,
  useRouter: () => mockRouter,
}));

describe('TricksLayout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTabNavigation.addListener.mockImplementation((_event, listener) => {
      return listener;
    });
  });

  it('returns a nested Tricks route to its index when the Tricks tab is pressed', () => {
    act(() => {
      create(<TricksLayout />);
    });

    const listener = mockTabNavigation.addListener.mock.calls[0]![1] as (event: { target?: string }) => void;
    act(() => {
      listener({ target: 'tricks-tab' });
    });

    expect(mockRouter.replace).toHaveBeenCalledWith('/app/tricks');
  });

  it('ignores presses for other tabs', () => {
    act(() => {
      create(<TricksLayout />);
    });

    const listener = mockTabNavigation.addListener.mock.calls[0]![1] as (event: { target?: string }) => void;
    act(() => {
      listener({ target: 'stats-tab' });
    });

    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
});
