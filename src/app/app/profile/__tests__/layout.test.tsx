import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create } from 'react-test-renderer';

import ProfileLayout from '@/app/app/profile/_layout';

const mockRouter = { replace: jest.fn() };
const mockTabNavigation = {
  addListener: jest.fn(),
  getState: () => ({
    routes: [
      { key: 'home-tab', name: 'index' },
      { key: 'profile-tab', name: 'profile' },
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

describe('ProfileLayout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTabNavigation.addListener.mockImplementation((_event, listener) => {
      return listener;
    });
  });

  it('returns a nested Profile route to its index when the Profile tab is pressed', () => {
    act(() => {
      create(<ProfileLayout />);
    });

    const listener = mockTabNavigation.addListener.mock.calls[0]![1] as (event: { target?: string }) => void;
    act(() => {
      listener({ target: 'profile-tab' });
    });

    expect(mockRouter.replace).toHaveBeenCalledWith('/app/profile');
  });

  it('ignores presses for other tabs', () => {
    act(() => {
      create(<ProfileLayout />);
    });

    const listener = mockTabNavigation.addListener.mock.calls[0]![1] as (event: { target?: string }) => void;
    act(() => {
      listener({ target: 'stats-tab' });
    });

    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
});
