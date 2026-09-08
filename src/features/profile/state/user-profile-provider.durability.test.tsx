import { afterEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect } from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { UserProfile } from '@/features/profile/model/user-profile';
import { USER_PROFILE_STORAGE_KEY } from '@/features/profile/persistence/user-profile-persistence';
import {
  UserProfileProvider,
  useUserProfileActions,
  useUserProfileDurability,
} from '@/features/profile/state/user-profile-provider';
import type { LocalDurabilityStatus, ScopedSaveOutcome } from '@/shared/persistence/storage';

// Same canonical shape as goal-provider.durability.test.tsx -- see .claude/plans/T248.1.md.
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required by jest hoisting
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

interface Captured {
  durability?: LocalDurabilityStatus<UserProfile>;
}

function makeHarness(captured: Captured) {
  return function Harness() {
    const durability = useUserProfileDurability();
    const { addSelectedTrick } = useUserProfileActions();

    useEffect(() => {
      captured.durability = durability;
    });

    return (
      <Text accessibilityLabel="add-selected-trick" onPress={() => addSelectedTrick('big-cup')}>
        {JSON.stringify(durability)}
      </Text>
    );
  };
}

function pressByAccessibilityLabel(root: ReactTestRenderer, label: string) {
  const [match] = root.root.findAll(
    (node) => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function',
  );
  match.props.onPress();
}

describe('UserProfileProvider durability', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('exposes a failed durability status with the current snapshot after a local save failure', async () => {
    const setItemSpy = jest.spyOn(AsyncStorage, 'setItem').mockImplementation(async (key) => {
      if (key.includes(USER_PROFILE_STORAGE_KEY)) {
        throw new Error('disk full');
      }
      return undefined;
    });

    const captured: Captured = {};
    const Harness = makeHarness(captured);
    let root!: ReactTestRenderer;
    await act(async () => {
      root = create(
        <UserProfileProvider>
          <Harness />
        </UserProfileProvider>,
      );
    });

    act(() => {
      pressByAccessibilityLabel(root, 'add-selected-trick');
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(captured.durability?.status).toBe('failed');
    if (captured.durability?.status === 'failed') {
      expect(captured.durability.snapshot.selectedTrickIds).toContain('big-cup');
      expect(typeof captured.durability.retry).toBe('function');
    }

    setItemSpy.mockRestore();

    act(() => {
      root.unmount();
    });
  });

  it('retry() clears the failure once the underlying write can succeed', async () => {
    const setItemSpy = jest.spyOn(AsyncStorage, 'setItem').mockImplementationOnce(async (key) => {
      if (key.includes(USER_PROFILE_STORAGE_KEY)) throw new Error('disk full');
      return undefined;
    });

    const captured: Captured = {};
    const Harness = makeHarness(captured);
    let root!: ReactTestRenderer;
    await act(async () => {
      root = create(
        <UserProfileProvider>
          <Harness />
        </UserProfileProvider>,
      );
    });

    act(() => {
      pressByAccessibilityLabel(root, 'add-selected-trick');
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(captured.durability?.status).toBe('failed');

    let retryOutcome: ScopedSaveOutcome | undefined;
    await act(async () => {
      if (captured.durability?.status === 'failed') {
        retryOutcome = await captured.durability.retry();
      }
    });

    expect(retryOutcome).toEqual({ status: 'saved' });
    expect(captured.durability).toEqual({ status: 'saved' });

    setItemSpy.mockRestore();

    act(() => {
      root.unmount();
    });
  });
});
