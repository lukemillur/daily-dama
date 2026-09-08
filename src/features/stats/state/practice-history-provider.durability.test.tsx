import { afterEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect } from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { createTimedSeshPlan, type SeshSummary } from '@/features/sesh/model/sesh';
import { PRACTICE_HISTORY_STORAGE_KEY } from '@/features/stats/persistence/practice-history-persistence';
import type { PracticeHistory } from '@/features/stats/model/practice-history';
import {
  PracticeHistoryProvider,
  usePracticeHistoryActions,
  usePracticeHistoryDurability,
} from '@/features/stats/state/practice-history-provider';
import type { LocalDurabilityStatus, ScopedSaveOutcome } from '@/shared/persistence/storage';

// Same canonical shape as goal-provider.durability.test.tsx -- see .claude/plans/T248.1.md.
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required by jest hoisting
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const SUMMARY: SeshSummary = {
  trick: { id: 'big-cup', name: 'Big Cup' },
  plan: createTimedSeshPlan(5),
  startedAt: 0,
  endedAt: 5000,
  durationMs: 5000,
  landings: [{ landedAt: 1000, elapsedMs: 1000, intervalMs: 1000 }],
};

interface Captured {
  durability?: LocalDurabilityStatus<PracticeHistory>;
}

function makeHarness(captured: Captured) {
  return function Harness() {
    const durability = usePracticeHistoryDurability();
    const { recordCompletedSesh } = usePracticeHistoryActions();

    useEffect(() => {
      captured.durability = durability;
    });

    return (
      <Text accessibilityLabel="record-sesh" onPress={() => recordCompletedSesh(SUMMARY)}>
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

describe('PracticeHistoryProvider durability', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('exposes a failed durability status with the current snapshot after a local save failure', async () => {
    const setItemSpy = jest.spyOn(AsyncStorage, 'setItem').mockImplementation(async (key) => {
      if (key.includes(PRACTICE_HISTORY_STORAGE_KEY)) {
        throw new Error('disk full');
      }
      return undefined;
    });

    const captured: Captured = {};
    const Harness = makeHarness(captured);
    let root!: ReactTestRenderer;
    await act(async () => {
      root = create(
        <PracticeHistoryProvider>
          <Harness />
        </PracticeHistoryProvider>,
      );
    });

    act(() => {
      pressByAccessibilityLabel(root, 'record-sesh');
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(captured.durability?.status).toBe('failed');
    if (captured.durability?.status === 'failed') {
      expect(captured.durability.snapshot.sessions).toHaveLength(1);
      expect(captured.durability.snapshot.sessions[0]?.trickId).toBe('big-cup');
      expect(typeof captured.durability.retry).toBe('function');
    }

    setItemSpy.mockRestore();

    act(() => {
      root.unmount();
    });
  });

  it('retry() clears the failure once the underlying write can succeed', async () => {
    const setItemSpy = jest.spyOn(AsyncStorage, 'setItem').mockImplementationOnce(async (key) => {
      if (key.includes(PRACTICE_HISTORY_STORAGE_KEY)) throw new Error('disk full');
      return undefined;
    });

    const captured: Captured = {};
    const Harness = makeHarness(captured);
    let root!: ReactTestRenderer;
    await act(async () => {
      root = create(
        <PracticeHistoryProvider>
          <Harness />
        </PracticeHistoryProvider>,
      );
    });

    act(() => {
      pressByAccessibilityLabel(root, 'record-sesh');
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
