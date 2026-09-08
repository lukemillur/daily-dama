import { afterEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect } from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { GOALS_STORAGE_KEY } from '@/features/goals/persistence/goal-persistence';
import type { GoalCollection } from '@/features/goals/model/goal';
import { GoalProvider, useGoalActions, useGoalDurability } from '@/features/goals/state/goal-provider';
import { UserProfileProvider } from '@/features/profile/state/user-profile-provider';
import type { LocalDurabilityStatus, ScopedSaveOutcome } from '@/shared/persistence/storage';

// This is the canonical shape for the five domain-provider durability test files -- see
// .claude/plans/T248.1.md for the full template rationale. The other four
// (custom-trick-provider.durability.test.tsx, note-provider.durability.test.tsx,
// user-profile-provider.durability.test.tsx, practice-history-provider.durability.test.tsx) follow
// this same structure with domain-specific substitutions.
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required by jest hoisting
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

interface Captured {
  durability?: LocalDurabilityStatus<GoalCollection>;
}

// Matches use-identity-scoped-domain.test.tsx's harness-factory pattern: `captured` is captured by
// closure rather than passed as a prop, so the effect below writes to a plain closed-over variable
// instead of mutating a component prop (which the react-hooks/immutability rule forbids).
function makeHarness(captured: Captured) {
  return function Harness() {
    const durability = useGoalDurability();
    const { addGoal } = useGoalActions();

    useEffect(() => {
      captured.durability = durability;
    });

    return (
      <Text
        accessibilityLabel="add-goal"
        onPress={() =>
          addGoal({ kind: 'count', trickId: 'big-cup', trickName: 'Big Cup', targetCount: 10 })
        }
      >
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

describe('GoalProvider durability', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('exposes a failed durability status with the current snapshot after a local save failure', async () => {
    const setItemSpy = jest.spyOn(AsyncStorage, 'setItem').mockImplementation(async (key) => {
      if (key.includes(GOALS_STORAGE_KEY)) {
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
          <GoalProvider>
            <Harness />
          </GoalProvider>
        </UserProfileProvider>,
      );
    });

    act(() => {
      pressByAccessibilityLabel(root, 'add-goal');
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(captured.durability?.status).toBe('failed');
    if (captured.durability?.status === 'failed') {
      expect(captured.durability.snapshot.goals).toHaveLength(1);
      expect(captured.durability.snapshot.goals[0]?.trickId).toBe('big-cup');
      expect(typeof captured.durability.retry).toBe('function');
    }

    setItemSpy.mockRestore();

    act(() => {
      root.unmount();
    });
  });

  it('retry() clears the failure once the underlying write can succeed', async () => {
    const setItemSpy = jest.spyOn(AsyncStorage, 'setItem').mockImplementationOnce(async (key) => {
      if (key.includes(GOALS_STORAGE_KEY)) throw new Error('disk full');
      return undefined;
    });

    const captured: Captured = {};
    const Harness = makeHarness(captured);
    let root!: ReactTestRenderer;
    await act(async () => {
      root = create(
        <UserProfileProvider>
          <GoalProvider>
            <Harness />
          </GoalProvider>
        </UserProfileProvider>,
      );
    });

    act(() => {
      pressByAccessibilityLabel(root, 'add-goal');
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(captured.durability?.status).toBe('failed');

    // The mockImplementationOnce above has already been consumed, so the underlying real
    // AsyncStorage mock now handles subsequent setItem calls (including the retry) normally.
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
