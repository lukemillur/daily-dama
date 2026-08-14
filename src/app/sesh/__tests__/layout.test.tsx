import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create } from 'react-test-renderer';
import type { ReactNode } from 'react';

import SeshLayout from '@/app/sesh/_layout';
import SeshScreen from '@/app/sesh/index';

const mockRouter = { replace: jest.fn() };
const mockTabNavigation = {
  addListener: jest.fn(),
  getState: () => ({
    routes: [
      { key: 'home-tab', name: 'index' },
      { key: 'sesh-tab', name: 'sesh' },
      { key: 'tricks-tab', name: 'tricks' },
    ],
  }),
};
const mockNavigation = { getParent: () => mockTabNavigation };

jest.mock('expo-router', () => ({
  Stack: () => null,
  useLocalSearchParams: () => ({}),
  useNavigation: () => mockNavigation,
  useRouter: () => mockRouter,
}));

jest.mock('@/components/ui/screen', () => ({
  Screen: ({ children }: { children: ReactNode }) => children,
}));
jest.mock('@/features/onboarding/state/require-onboarding', () => ({
  useRequireOnboarding: () => true,
}));
jest.mock('@/features/profile/state/user-profile-provider', () => ({
  useUserProfile: () => ({ lastSesh: undefined, selectedTrickIds: [] }),
}));
jest.mock('@/features/custom-tricks/state/custom-trick-provider', () => ({
  useCustomTricks: () => ({ tricks: [] }),
}));
jest.mock('@/features/sesh/components/sesh', () => ({
  Sesh: () => {
    const { Text: MockText } = require('react-native');
    return <MockText accessibilityLabel="Sesh home picker">Choose a trick</MockText>;
  },
}));

describe('SeshLayout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTabNavigation.addListener.mockImplementation((_event, listener) => listener);
  });

  it('returns a nested Sesh route to its index when the Sesh tab is pressed', () => {
    act(() => {
      create(<SeshLayout />);
    });

    const listener = mockTabNavigation.addListener.mock.calls[0]![1] as (event: { target?: string }) => void;
    act(() => {
      listener({ target: 'sesh-tab' });
    });

    expect(mockRouter.replace).toHaveBeenCalledWith('/sesh');
  });

  it('ignores presses for other tabs', () => {
    act(() => {
      create(<SeshLayout />);
    });

    const listener = mockTabNavigation.addListener.mock.calls[0]![1] as (event: { target?: string }) => void;
    act(() => {
      listener({ target: 'tricks-tab' });
    });

    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('unsubscribes the tab listener when the layout unmounts', () => {
    const unsubscribe = jest.fn();
    mockTabNavigation.addListener.mockReturnValue(unsubscribe);

    let rendered: ReturnType<typeof create>;
    act(() => {
      rendered = create(<SeshLayout />);
    });
    act(() => {
      rendered!.unmount();
    });

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('renders the Sesh home picker after the reset targets the index route', () => {
    act(() => {
      create(<SeshLayout />);
    });
    const listener = mockTabNavigation.addListener.mock.calls[0]![1] as (event: { target?: string }) => void;

    act(() => {
      listener({ target: 'sesh-tab' });
    });

    let screen!: ReturnType<typeof create>;
    act(() => {
      screen = create(<SeshScreen />);
    });

    expect(screen.root.findByProps({ accessibilityLabel: 'Sesh home picker' })).toBeDefined();
    expect(screen.root.findByProps({ children: 'Choose a trick' })).toBeDefined();
  });
});
