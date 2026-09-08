import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';

// _layout.tsx transitively imports app-theme-provider.tsx -> use-cached-guest-theme.ts, which
// imports AsyncStorage directly for its native fallback path -- mock it before _layout.tsx is
// imported below, same pattern as app-tabs.web.test.tsx.
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required by jest hoisting
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('react-native-reanimated', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required by jest hoisting
  require('react-native-reanimated/mock'),
);

// _layout.tsx imports global.css directly (a web-only stylesheet with no runtime meaning under
// Jest) -- mock it out rather than teaching the resolver a CSS transform just for this test.
jest.mock('@/global.css', () => ({}), { virtual: true });

const mockRouter = { replace: jest.fn() };
let mockGlobalSearchParams: Record<string, string | string[]> = {};
const mockPathname = '/app/home';
jest.mock('expo-router', () => ({
  ThemeProvider: ({ children }: { children?: React.ReactNode }) => children,
  DarkTheme: {},
  DefaultTheme: {},
  Slot: () => {
    const { Text: RNText } = jest.requireActual('react-native') as typeof import('react-native');
    return <RNText>Routed content</RNText>;
  },
  useRouter: () => mockRouter,
  usePathname: () => mockPathname,
  useGlobalSearchParams: () => mockGlobalSearchParams,
}));

jest.mock('@/components/animated-icon', () => ({
  AnimatedSplashOverlay: () => null,
}));

jest.mock('@/features/auth/state/auth-provider', () => ({
  AuthProvider: ({ children }: { children?: React.ReactNode }) => children,
}));

jest.mock('@vercel/analytics/react', () => ({
  Analytics: () => null,
}));

import TabLayout from '@/app/_layout';
import { NEW_ACCOUNT_WELCOME_AUTO_DISMISS_MS } from '@/features/auth/components/new-account-welcome-overlay';

function findByAccessibilityLabel(root: ReactTestRenderer, label: string) {
  // Restrict to host (string-typed) nodes -- a styled-components-wrapped host element and its
  // composite ancestors all carry the same accessibilityLabel prop, so counting every fiber
  // would overcount a single rendered element.
  return root.root.findAll(
    (node) => typeof node.type === 'string' && node.props.accessibilityLabel === label,
  );
}

function findByText(root: ReactTestRenderer, text: string) {
  return root.root.findAll((node) => node.type === Text && node.props.children === text);
}

describe('root layout new-account welcome overlay (T208)', () => {
  beforeEach(() => {
    mockRouter.replace.mockClear();
    mockGlobalSearchParams = {};
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('never renders the overlay on a routine sign-in redirect (no newAccount param)', () => {
    let root!: ReactTestRenderer;
    act(() => {
      root = create(<TabLayout />);
    });

    expect(findByAccessibilityLabel(root, 'Account verified').length).toBe(0);
    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(findByText(root, 'Routed content').length).toBe(1);

    act(() => {
      root.unmount();
    });
  });

  it('renders the overlay exactly once when newAccount=1 is present, and strips the param', () => {
    mockGlobalSearchParams = { newAccount: '1' };
    let root!: ReactTestRenderer;
    act(() => {
      root = create(<TabLayout />);
    });

    expect(findByAccessibilityLabel(root, 'Account verified').length).toBe(1);
    expect(mockRouter.replace).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).toHaveBeenCalledWith('/app/home');
    // Renders regardless of what's under it (Home content or onboarding) -- the Slot stub
    // stands in for either.
    expect(findByText(root, 'Routed content').length).toBe(1);

    act(() => {
      root.unmount();
    });
  });

  it('renders the overlay when newAccount=1 arrives after mount via a client-side navigation (T249)', () => {
    // Reproduces the real-world signup round trip: the root layout mounts once with no
    // newAccount param (landing on /auth/callback), then auth-callback-screen.tsx's
    // router.replace({ pathname: '/app/home', params: { newAccount: '1' } }) is a client-side
    // History navigation that updates params on the already-mounted root layout without
    // remounting it. Only the post-mount effect -- not the lazy useState initializer -- can
    // pick this up.
    mockGlobalSearchParams = {};
    let root!: ReactTestRenderer;
    act(() => {
      root = create(<TabLayout />);
    });

    expect(findByAccessibilityLabel(root, 'Account verified').length).toBe(0);
    expect(mockRouter.replace).not.toHaveBeenCalled();

    mockGlobalSearchParams = { newAccount: '1' };
    act(() => {
      root.update(<TabLayout />);
    });

    expect(findByAccessibilityLabel(root, 'Account verified').length).toBe(1);
    expect(mockRouter.replace).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).toHaveBeenCalledWith('/app/home');

    act(() => {
      root.unmount();
    });
  });

  it('renders the overlay when newAccount=1 is present alongside another unrelated global param', () => {
    mockGlobalSearchParams = { newAccount: '1', other: 'x' };
    let root!: ReactTestRenderer;
    act(() => {
      root = create(<TabLayout />);
    });

    expect(findByAccessibilityLabel(root, 'Account verified').length).toBe(1);

    act(() => {
      root.unmount();
    });
  });

  it('auto-dismisses the overlay without requiring a tap', () => {
    mockGlobalSearchParams = { newAccount: '1' };
    let root!: ReactTestRenderer;
    act(() => {
      root = create(<TabLayout />);
    });

    expect(findByAccessibilityLabel(root, 'Account verified').length).toBe(1);

    act(() => {
      jest.advanceTimersByTime(NEW_ACCOUNT_WELCOME_AUTO_DISMISS_MS + 1000);
    });

    expect(findByAccessibilityLabel(root, 'Account verified').length).toBe(0);

    act(() => {
      root.unmount();
    });
  });
});
