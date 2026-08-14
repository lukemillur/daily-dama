import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create } from 'react-test-renderer';
import { useEffect, useState, type ReactNode } from 'react';
import { Text } from 'react-native';

import SeshLayout from '@/app/sesh/_layout';
import SeshScreen from '@/app/sesh/index';

let mockResetRoute: ((route: string) => void) | undefined;
const mockRouter = {
  replace: jest.fn((route: string) => mockResetRoute?.(route)),
};
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
    mockResetRoute = undefined;
    mockTabNavigation.addListener.mockImplementation(() => undefined);
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

  it.each([
    ['single-trick completion', '/sesh/completed'],
    ['casual multi-trick selection', '/sesh/multi-trick'],
    ['casual multi-trick setup', '/sesh/multi-trick/setup'],
    ['casual multi-trick countdown', '/sesh/multi-trick/countdown'],
    ['casual multi-trick active practice', '/sesh/multi-trick/active'],
    ['casual multi-trick wrap-up', '/sesh/multi-trick/completed'],
    ['assessment flow picker', '/profile/kentei-assessment'],
    ['assessment countdown', '/profile/kentei-assessment/countdown'],
    ['assessment active practice', '/profile/kentei-assessment/active'],
    ['assessment wrap-up', '/profile/kentei-assessment/completed'],
  ])('renders a fresh canonical picker after pressing Sesh from %s', (_surface, initialRoute) => {
    function RouteHost() {
      const [route, setRoute] = useState(initialRoute);

      useEffect(() => {
        mockResetRoute = setRoute;
        return () => {
          mockResetRoute = undefined;
        };
      }, []);

      return (
        <>
          <Text accessibilityLabel={`route:${route}`} />
          {route === '/sesh' ? <SeshScreen /> : <Text accessibilityLabel="stale child route" />}
        </>
      );
    }

    let rendered!: ReturnType<typeof create>;
    act(() => {
      rendered = create(
        <>
          <SeshLayout />
          <RouteHost />
        </>,
      );
    });

    expect(rendered.root.findByProps({ accessibilityLabel: `route:${initialRoute}` })).toBeDefined();

    const listener = mockTabNavigation.addListener.mock.calls[0]![1] as (event: {
      target?: string;
    }) => void;
    act(() => {
      listener({ target: 'sesh-tab' });
    });

    expect(mockRouter.replace).toHaveBeenCalledWith('/sesh');
    expect(rendered.root.findByProps({ accessibilityLabel: 'route:/sesh' })).toBeDefined();
    expect(rendered.root.findByProps({ accessibilityLabel: 'Sesh home picker' })).toBeDefined();
    expect(rendered.root.findAllByProps({ accessibilityLabel: 'stale child route' })).toHaveLength(0);

    act(() => {
      rendered.unmount();
    });
  });
});
