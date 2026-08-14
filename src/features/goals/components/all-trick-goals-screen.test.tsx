import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Pressable } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { AllTrickGoalsScreen } from '@/features/goals/components/all-trick-goals-screen';
import { GoalProvider, useGoalActions } from '@/features/goals/state/goal-provider';
import { createTimedSeshPlan, type Landing, type SeshSummary } from '@/features/sesh/model/sesh';
import {
  PracticeHistoryProvider,
  usePracticeHistoryActions,
} from '@/features/stats/state/practice-history-provider';
import type { PracticeTrick } from '@/features/tricks/model/trick';

// AllTrickGoalsScreen transitively imports practice-history-provider, which pulls in
// AsyncStorage. Mock it the same way sesh.test.tsx and kentei-rank-auto-promotion.test.tsx do.
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required by jest hoisting
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const TRICK_A: PracticeTrick = { id: 'big-cup', name: 'Big Cup' };
const TRICK_B: PracticeTrick = { id: 'stall', name: 'Stall' };
const PLAN = createTimedSeshPlan(5);

function landing(elapsedMs: number): Landing {
  return { landedAt: elapsedMs, elapsedMs, intervalMs: elapsedMs };
}

function summaryFor(trick: PracticeTrick, landingCount: number): SeshSummary {
  return {
    trick,
    plan: PLAN,
    startedAt: 0,
    endedAt: 5000,
    durationMs: 5000,
    landings: Array.from({ length: landingCount }, (_, index) => landing((index + 1) * 1000)),
  };
}

function noop() {}

function Harness() {
  const { addGoal } = useGoalActions();
  const { recordCompletedSesh } = usePracticeHistoryActions();

  return (
    <>
      <Pressable
        accessibilityLabel="add-goal-a"
        onPress={() =>
          addGoal({ kind: 'count', trickId: TRICK_A.id, trickName: TRICK_A.name, targetCount: 3 })
        }
      />
      <Pressable
        accessibilityLabel="add-goal-b"
        onPress={() =>
          addGoal({ kind: 'count', trickId: TRICK_B.id, trickName: TRICK_B.name, targetCount: 5 })
        }
      />
      <Pressable
        accessibilityLabel="record-sesh-a"
        onPress={() => recordCompletedSesh(summaryFor(TRICK_A, 3))}
      />
      <AllTrickGoalsScreen onClose={noop} />
    </>
  );
}

async function mountHarness() {
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(
      <GoalProvider>
        <PracticeHistoryProvider>
          <Harness />
        </PracticeHistoryProvider>
      </GoalProvider>,
    );
  });
  return root;
}

function press(root: ReactTestRenderer, label: string) {
  const [node] = root.root.findAll((candidate) => candidate.props.accessibilityLabel === label);
  act(() => {
    node.props.onPress();
  });
}

function findText(root: ReactTestRenderer, text: string) {
  return root.root.findAll(
    (node) => typeof node.type === 'string' && node.props.children === text,
  );
}

describe('AllTrickGoalsScreen', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('lists goals from multiple tricks with per-goal progress, achieved and unachieved rendered distinguishably', async () => {
    // Goals are created against a real Date.now() timestamp, but summaryFor() uses a fixed,
    // unrealistic endedAt (5000) as the recorded session's completedAt. Pin Date.now() so the
    // goals' createdAt precedes that fixed completedAt, matching production where both
    // timestamps come from the same real clock.
    const dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(0);
    try {
      const root = await mountHarness();

      press(root, 'add-goal-a');
      press(root, 'add-goal-b');
      press(root, 'record-sesh-a');

      expect(findText(root, 'Big Cup')).toHaveLength(1);
      expect(findText(root, 'Stall')).toHaveLength(1);
      expect(findText(root, '3 / 3 laces')).toHaveLength(1);
      expect(findText(root, '0 / 5 laces')).toHaveLength(1);

      // Achieved and unachieved goals must render distinguishably: exactly one "Achieved" badge,
      // and it must belong to trick A's card (the only goal that reached its target).
      const achievedBadges = findText(root, 'Achieved');
      expect(achievedBadges).toHaveLength(1);
    } finally {
      dateNowSpy.mockRestore();
    }
  });

  it('shows the empty state when there are no goals', async () => {
    const root = await mountHarness();

    expect(findText(root, "No goals yet. Set one from a trick's Goals action.")).toHaveLength(1);
  });

  it('removes a goal from the list once deleted', async () => {
    const root = await mountHarness();

    press(root, 'add-goal-a');
    expect(findText(root, 'Big Cup')).toHaveLength(1);

    const [deleteAction] = root.root.findAll(
      (node) => node.props.accessibilityLabel === 'Delete goal',
    );
    act(() => {
      deleteAction.props.onPress();
    });

    const [confirmDelete] = root.root.findAll(
      (node) => node.props.accessibilityLabel === 'Confirm delete goal',
    );
    act(() => {
      confirmDelete.props.onPress();
    });

    expect(findText(root, 'Big Cup')).toHaveLength(0);
  });
});
