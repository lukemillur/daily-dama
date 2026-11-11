import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { StatusBar } from 'expo-status-bar';
import * as ReactNative from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import AuthLayout from '@/app/auth/_layout';

const mockReplace = jest.fn();
const mockSignIn = jest.fn();
const mockSignUp = jest.fn();

jest.mock('expo-router', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Slot: () => <Text>auth-route-content</Text>,
    useRouter: () => ({ replace: mockReplace }),
  };
});
// The release component schedules an animation frame that would outlive the test environment.
jest.mock('@/shared/splash/splash-ready', () => ({ HideSplashWhenMounted: () => null }));
jest.mock('@/features/profile/components/app-theme-provider', () => ({
  CachedAppThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));
let mockCachedBackground = '#fbdcd6';
jest.mock('@/features/profile/state/use-cached-guest-theme', () => ({
  useCachedGuestTheme: () => ({ background: mockCachedBackground }),
}));
jest.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}));
jest.mock('@/features/auth/state/pending-verification-email', () => ({
  PendingVerificationEmailProvider: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@/features/auth/state/auth-provider', () => ({
  useAuthActions: () => ({ signIn: mockSignIn, signUp: mockSignUp }),
}));

const originalPlatformOS = ReactNative.Platform.OS;

async function mount() {
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(<AuthLayout />);
  });
  return root;
}

describe('AuthLayout', () => {
  beforeEach(() => {
    mockReplace.mockReset();
  });

  afterEach(() => {
    ReactNative.Platform.OS = originalPlatformOS;
  });

  it('renders the routed auth screen on web', async () => {
    ReactNative.Platform.OS = 'web';
    const root = await mount();

    expect(JSON.stringify(root.toJSON())).toContain('auth-route-content');
  });

  it('mounts exactly one status bar whose icons follow the cached theme background', async () => {
    ReactNative.Platform.OS = 'android';
    mockCachedBackground = '#fbdcd6';
    const pale = await mount();
    expect(pale.root.findAllByType(StatusBar)).toHaveLength(1);
    expect(pale.root.findByType(StatusBar).props.style).toBe('dark');

    mockCachedBackground = '#101820';
    const dark = await mount();
    expect(dark.root.findByType(StatusBar).props.style).toBe('light');
  });

  it('replaces every auth route with an unavailable state on a platform without accounts, running no auth action', async () => {
    ReactNative.Platform.OS = 'windows';
    const root = await mount();

    const json = JSON.stringify(root.toJSON());
    expect(json).not.toContain('auth-route-content');
    expect(json).toMatch(/not available in the mobile app yet/i);

    const back = root.root.find((node) => node.props.accessibilityLabel === 'Back to app');
    act(() => {
      back.props.onPress();
    });
    expect(mockReplace).toHaveBeenCalledWith('/app/home');
    expect(mockSignIn).not.toHaveBeenCalled();
    expect(mockSignUp).not.toHaveBeenCalled();
  });
});
