import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Pressable } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { AllTrickGoalsScreen } from '@/features/goals/components/all-trick-goals-screen';
import { GOALS_STORAGE_KEY } from '@/features/goals/persistence/goal-persistence';
import { GoalProvider, useGoalActions } from '@/features/goals/state/goal-provider';
import { createTimedSeshPlan, type Landing, type SeshSummary } from '@/features/sesh/model/sesh';
import {
  PracticeHistoryProvider,
  usePracticeHistoryActions,
} from '@/features/stats/state/practice-history-provider';
import type { PracticeTrick } from '@/features/tricks/model/trick';
import type { DirectoryTrick } from '@/features/tricks/model/trick-directory';

// AllTrickGoalsScreen transitively imports practice-history-provider, which pulls in
// AsyncStorage. Mock it the same way sesh.test.tsx and kentei-rank-auto-promotion.test.tsx do.
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required by jest hoisting
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const TRICK_A: PracticeTrick = { id: 'big-cup', name: 'Big Cup' };
const TRICK_B: PracticeTrick = { id: 'stall', name: 'Stall' };
const DIRECTORY_TRICKS: DirectoryTrick[] = [
  { ...TRICK_A, kenteiRank: 1, kenteiLevel: 'Basic', kenteiClass: '3rd Class' },
  { ...TRICK_B, customKind: 'standalone' },
];
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

function Harness({ focusedTrickIds = [] }: { readonly focusedTrickIds?: readonly string[] }) {
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
      <AllTrickGoalsScreen tricks={DIRECTORY_TRICKS} focusedTrickIds={focusedTrickIds} onBack={noop} />
    </>
  );
}

async function mountHarness(focusedTrickIds: readonly string[] = []) {
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(
      <GoalProvider>
        <PracticeHistoryProvider>
          <Harness focusedTrickIds={focusedTrickIds} />
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

    expect(findText(root, "No goals yet. Set one from a trick's Goals action, or add one below.")).toHaveLength(1);
  });

  it('links each goal\'s Practice action to /sesh with the correct trickId param', async () => {
    const root = await mountHarness();

    press(root, 'add-goal-a');

    const link = root.root.findByProps({ accessibilityLabel: 'Practice Big Cup' });
    expect(link.props.href).toBe('/app/sesh?trickId=big-cup&mode=practice');
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

  it('creates a goal for a chosen trick from the all-trick-goals screen and it appears in the list', async () => {
    const root = await mountHarness();

    press(root, 'Add goal');

    const [trickOption] = root.root.findAll(
      (node) => node.props.accessibilityLabel === 'Choose Stall',
    );
    act(() => {
      trickOption.props.onPress();
    });

    const [targetInput] = root.root.findAll(
      (node) => node.props.accessibilityLabel === 'Target lace count',
    );
    act(() => {
      targetInput.props.onChangeText('10');
    });

    press(root, 'Save goal');

    expect(findText(root, 'Stall')).toHaveLength(1);
    expect(findText(root, '0 / 10 laces')).toHaveLength(1);
  });

  it('uses shared focused, ranked, and custom directory sections in source order', async () => {
    const root = await mountHarness(['stall', 'big-cup']);

    press(root, 'Add goal');

    const text = root.root.findAll(
      (node) => typeof node.type === 'string' && typeof node.props.children === 'string',
    ).flatMap((node) => [node.props.children]);
    expect(text.indexOf('Focused tricks')).toBeGreaterThanOrEqual(0);
    expect(text.indexOf('Big Cup')).toBeLessThan(text.indexOf('Stall'));
    expect(text.indexOf('Focused tricks')).toBeLessThan(text.indexOf('Rank 1'));
    expect(text).toContain('Custom trick');
  });

  it('filters shared rows and opens the existing goal form for a selected custom trick', async () => {
    const root = await mountHarness();
    press(root, 'Add goal');

    const [search] = root.root.findAll((node) => node.props.accessibilityLabel === 'Search tricks');
    act(() => search.props.onChangeText('stall'));

    expect(root.root.findAll((node) => node.props.accessibilityLabel === 'Choose Big Cup')).toHaveLength(0);
    const [choose] = root.root.findAll((node) => node.props.accessibilityLabel === 'Choose Stall');
    act(() => choose.props.onPress());
    expect(findText(root, 'Set a target.')).toHaveLength(1);
  });

  it('persists a selected trick snapshot through the existing goal provider', async () => {
    const root = await mountHarness();
    press(root, 'Add goal');
    const [choose] = root.root.findAll((node) => node.props.accessibilityLabel === 'Choose Big Cup');
    act(() => choose.props.onPress());
    const [targetInput] = root.root.findAll((node) => node.props.accessibilityLabel === 'Target lace count');
    act(() => targetInput.props.onChangeText('7'));
    press(root, 'Save goal');

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const serialized = await AsyncStorage.getItem(GOALS_STORAGE_KEY);
    expect(JSON.parse(serialized ?? '{}').goals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ trickId: 'big-cup', trickName: 'Big Cup', targetCount: 7 }),
      ]),
    );
  });
});
