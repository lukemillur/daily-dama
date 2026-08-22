import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import ProfileScreen from '@/app/app/profile/index';
import type { AuthState } from '@/features/auth/model/auth-state';
import {
  serializeUserProfile,
  USER_PROFILE_STORAGE_KEY,
} from '@/features/profile/persistence/user-profile-persistence';
import { UserProfileProvider } from '@/features/profile/state/user-profile-provider';

// ProfileScreen (transitively, via user-profile-provider) pulls in AsyncStorage — mocked the same
// way other provider-backed tests in this repo do.
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required by jest hoisting
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
// ProfileScreen calls useRouter() directly (for "Start Kentei assessment"). No test in the repo
// currently mocks expo-router — this file is new.
const mockRouterPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: jest.fn(), push: mockRouterPush }) }));
// This test doesn't care about the redirect-when-incomplete behavior useRequireOnboarding adds —
// mocking it directly (rather than expo-router alone) skips that dependency entirely and lets the
// test focus purely on the copy this screen renders once onboarding is complete.
jest.mock('@/features/onboarding/state/require-onboarding', () => ({
  useRequireOnboarding: () => true,
}));
// ProfileScreen now renders AccountSection, which calls useAuthState()/useAuthActions()
// directly (T154.2) -- this file mounts ProfileScreen with no AuthProvider in the tree, so it
// must mock the module. Defaults to guest so every pre-existing assertion above (which knows
// nothing about Auth) keeps passing unchanged. Deep behavioral coverage of AccountSection itself
// lives in account-section.test.tsx -- these are thin integration assertions only.
let mockAuthState: AuthState = { status: 'guest', reason: 'unconfigured' };
const mockSignOut = jest.fn<() => Promise<{ error: unknown }>>();
jest.mock('@/features/auth/state/auth-provider', () => ({
  useAuthState: () => mockAuthState,
  useAuthActions: () => ({ signOut: mockSignOut }),
}));
jest.mock('@/features/auth/observability/auth-observability', () => ({
  trackAuthEvent: jest.fn(),
  logAuthWarning: jest.fn(),
}));

function findByText(root: ReactTestRenderer, text: string | RegExp) {
  return root.root.findAll((node) => {
    const { children } = node.props;
    if (typeof children !== 'string') return false;
    return typeof text === 'string' ? children === text : text.test(children);
  });
}

async function mountProfileScreen() {
  await AsyncStorage.setItem(
    USER_PROFILE_STORAGE_KEY,
    serializeUserProfile({
      hasCompletedOnboarding: true,
      kenteiRank: 3,
      selectedTrickIds: [],
    }),
  );

  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(
      <UserProfileProvider>
        <ProfileScreen />
      </UserProfileProvider>,
    );
  });
  return root;
}

function collectTextInOrder(root: ReactTestRenderer): string[] {
  const texts: string[] = [];
  const json = root.toJSON();

  function walk(node: unknown): void {
    if (node == null) return;
    if (typeof node === 'string') {
      texts.push(node);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    const element = node as { children?: unknown };
    if (element.children) walk(element.children);
  }

  walk(json);
  return texts;
}

describe('ProfileScreen account section', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    mockAuthState = { status: 'guest', reason: 'unconfigured' };
    mockSignOut.mockReset();
    mockRouterPush.mockReset();
  });

  it('shows no Log out control for a guest', async () => {
    const root = await mountProfileScreen();

    expect(findByText(root, 'Log out')).toHaveLength(0);

    act(() => {
      root.unmount();
    });
  });

  it('shows the Log out control when authenticated', async () => {
    mockAuthState = {
      status: 'authenticated',
      session: { access_token: 'tok', user: { email: 'someone@example.com' } } as never,
      lastEvent: 'SIGNED_IN',
    };
    const root = await mountProfileScreen();

    expect(findByText(root, 'Log out').length).toBeGreaterThan(0);

    act(() => {
      root.unmount();
    });
  });
});

describe('ProfileScreen guest account entry points', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    mockAuthState = { status: 'guest', reason: 'unconfigured' };
    mockRouterPush.mockReset();
  });

  it('lets an unauthenticated guest open sign-up and sign-in', async () => {
    const root = await mountProfileScreen();

    const signUp = root.root.find((node) => node.props.accessibilityLabel === 'Sign up');
    const signIn = root.root.find((node) => node.props.accessibilityLabel === 'Sign in');

    act(() => {
      signUp.props.onPress();
    });
    expect(mockRouterPush).toHaveBeenCalledWith('/auth/sign-up');

    act(() => {
      signIn.props.onPress();
    });
    expect(mockRouterPush).toHaveBeenCalledWith('/auth/sign-in');

    act(() => {
      root.unmount();
    });
  });

  it('shows neither guest entry point for an authenticated user', async () => {
    mockAuthState = {
      status: 'authenticated',
      session: { access_token: 'tok', user: { email: 'someone@example.com' } } as never,
      lastEvent: 'SIGNED_IN',
    };
    const root = await mountProfileScreen();

    expect(
      root.root.findAll((node) => node.props.accessibilityLabel === 'Sign up'),
    ).toHaveLength(0);
    expect(
      root.root.findAll((node) => node.props.accessibilityLabel === 'Sign in'),
    ).toHaveLength(0);

    act(() => {
      root.unmount();
    });
  });
});

describe('ProfileScreen Kentei assessment copy', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('describes the real Kentei assessment as promotion-only, never as replacing or lowering the rank', async () => {
    const root = await mountProfileScreen();

    expect(findByText(root, /promotes you automatically/i).length).toBeGreaterThan(0);
    expect(findByText(root, /assessed at/i)).toHaveLength(0);
    expect(findByText(root, /lower/i)).toHaveLength(0);

    act(() => {
      root.unmount();
    });
  });

  it('no longer shows the removed "Retake assessment" section', async () => {
    const root = await mountProfileScreen();

    expect(findByText(root, 'Retake assessment')).toHaveLength(0);
    expect(findByText(root, /updates your rank/i)).toHaveLength(0);

    act(() => {
      root.unmount();
    });
  });

  it('renders the theme color picker so it is reachable from Profile', async () => {
    const root = await mountProfileScreen();

    expect(findByText(root, 'App theme').length).toBeGreaterThan(0);

    act(() => {
      root.unmount();
    });
  });

});

describe('ProfileScreen theme section order and copy', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('renders the refreshed preset and theme-picker headings', async () => {
    const root = await mountProfileScreen();

    expect(findByText(root, 'Select a preset').length).toBeGreaterThan(0);
    expect(findByText(root, 'Or, make it yours').length).toBeGreaterThan(0);

    act(() => {
      root.unmount();
    });
  });

  it('renders the streak section after both theme sections', async () => {
    const root = await mountProfileScreen();

    const texts = collectTextInOrder(root);
    const presetIndex = texts.indexOf('Quick presets');
    const themePickerIndex = texts.indexOf('App theme');
    const streakIndex = texts.indexOf('Daily streak');

    expect(presetIndex).toBeGreaterThan(-1);
    expect(themePickerIndex).toBeGreaterThan(-1);
    expect(streakIndex).toBeGreaterThan(-1);
    expect(streakIndex).toBeGreaterThan(presetIndex);
    expect(streakIndex).toBeGreaterThan(themePickerIndex);

    act(() => {
      root.unmount();
    });
  });
});
