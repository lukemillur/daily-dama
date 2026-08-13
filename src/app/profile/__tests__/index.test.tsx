import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import ProfileScreen from '@/app/profile/index';
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
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: jest.fn(), push: jest.fn() }) }));
// This test doesn't care about the redirect-when-incomplete behavior useRequireOnboarding adds —
// mocking it directly (rather than expo-router alone) skips that dependency entirely and lets the
// test focus purely on the copy this screen renders once onboarding is complete.
jest.mock('@/features/onboarding/state/require-onboarding', () => ({
  useRequireOnboarding: () => true,
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

  it('leaves the separate "Retake assessment" section untouched, distinct from the Kentei assessment copy', async () => {
    const root = await mountProfileScreen();

    expect(findByText(root, 'Retake assessment').length).toBeGreaterThan(0);
    expect(findByText(root, /updates your rank/i).length).toBeGreaterThan(0);

    act(() => {
      root.unmount();
    });
  });
});
