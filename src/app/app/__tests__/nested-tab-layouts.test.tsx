import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create } from 'react-test-renderer';

import ProfileLayout from '@/app/app/profile/_layout';
import TricksLayout from '@/app/app/tricks/_layout';

const mockRouter = { replace: jest.fn() };
const mockTabNavigation = {
  addListener: jest.fn(),
  getState: () => ({
    routes: [
      { key: 'home-tab', name: 'index' },
      { key: 'profile-tab', name: 'profile' },
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

const CASES = [
  { name: 'Profile', Layout: ProfileLayout, tabKey: 'profile-tab', href: '/app/profile' },
  { name: 'Tricks', Layout: TricksLayout, tabKey: 'tricks-tab', href: '/app/tricks' },
] as const;

describe('nested tab layouts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTabNavigation.addListener.mockImplementation((_event, listener) => listener);
  });

  it.each(CASES)('returns $name to its index when its active tab is pressed', ({ Layout, tabKey, href }) => {
    act(() => {
      create(<Layout />);
    });

    const listener = mockTabNavigation.addListener.mock.calls[0]![1] as (event: { target?: string }) => void;
    act(() => {
      listener({ target: tabKey });
    });

    expect(mockRouter.replace).toHaveBeenCalledWith(href);
  });

  it.each(CASES)('ignores other tab presses for $name', ({ Layout }) => {
    act(() => {
      create(<Layout />);
    });

    const listener = mockTabNavigation.addListener.mock.calls[0]![1] as (event: { target?: string }) => void;
    act(() => {
      listener({ target: 'stats-tab' });
    });

    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
});
