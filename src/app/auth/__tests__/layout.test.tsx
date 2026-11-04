import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
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
jest.mock('@/features/profile/components/app-theme-provider', () => ({
  CachedAppThemeProvider: ({ children }: { children: React.ReactNode }) => children,
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

  it('replaces every auth route with an unavailable state on native, running no auth action', async () => {
    ReactNative.Platform.OS = 'ios';
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
