import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { TrickGoalsScreen } from '@/features/goals/components/trick-goals-screen';
import type { Goal } from '@/features/goals/model/goal';

const mockAddGoal = jest.fn();
const mockDeleteGoal = jest.fn();
let mockGoals: readonly Goal[] = [];

const mockRouter = { push: jest.fn() };
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
}));

jest.mock('@/features/goals/state/goal-provider', () => ({
  useGoals: () => ({ goals: mockGoals }),
  useGoalActions: () => ({ addGoal: mockAddGoal, deleteGoal: mockDeleteGoal }),
}));
jest.mock('@/features/stats/state/practice-history-provider', () => ({
  usePracticeHistory: () => ({ sessions: [] }),
}));

function findButton(root: ReactTestRenderer, label: string) {
  const [button] = root.root.findAll(
    (node) => node.props.children === label && typeof node.props.onPress === 'function',
  );
  return button;
}

function findText(root: ReactTestRenderer, text: string) {
  return root.root.findAll(
    (node) => typeof node.type === 'string' && node.props.children === text,
  );
}

describe('TrickGoalsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAddGoal.mockReturnValue({ status: 'saved' });
    mockGoals = [];
  });

  it('uses a Back to Tricks control while retaining local add cancel and save transitions', () => {
    const onBack = jest.fn();
    let root!: ReactTestRenderer;
    act(() => {
      root = create(<TrickGoalsScreen trickId="big-cup" trickName="Big Cup" onBack={onBack} />);
    });

    act(() => {
      root.root.findByProps({ accessibilityLabel: 'Back to Tricks' }).props.onPress();
    });
    expect(onBack).toHaveBeenCalledTimes(1);

    act(() => {
      findButton(root, 'Add goal').props.onPress();
    });
    expect(root.root.findByProps({ accessibilityLabel: 'Target lace count' })).toBeDefined();

    act(() => {
      findButton(root, 'Cancel').props.onPress();
    });
    expect(findButton(root, 'Add goal')).toBeDefined();

    act(() => {
      findButton(root, 'Add goal').props.onPress();
    });
    act(() => {
      root.root.findByProps({ accessibilityLabel: 'Target lace count' }).props.onChangeText('3');
    });
    act(() => {
      root.root.findByProps({ accessibilityLabel: 'Save goal' }).props.onPress();
    });

    expect(mockAddGoal).toHaveBeenCalledWith({
      kind: 'count',
      trickId: 'big-cup',
      trickName: 'Big Cup',
      targetCount: 3,
    });
    expect(findButton(root, 'Add goal')).toBeDefined();
  });

  it('shows no trick-goals heading when the trick has exactly one goal', () => {
    mockGoals = [
      { id: 'goal-1', trickId: 'big-cup', trickName: 'Big Cup', kind: 'count', targetCount: 10, createdAt: 0 },
    ];
    let root!: ReactTestRenderer;
    act(() => {
      root = create(<TrickGoalsScreen trickId="big-cup" trickName="Big Cup" onBack={() => {}} />);
    });

    expect(findText(root, 'Big Cup goals')).toHaveLength(0);
  });

  it('shows a trick-goals heading when the trick has more than one goal', () => {
    mockGoals = [
      { id: 'goal-1', trickId: 'big-cup', trickName: 'Big Cup', kind: 'count', targetCount: 10, createdAt: 0 },
      { id: 'goal-2', trickId: 'big-cup', trickName: 'Big Cup', kind: 'time', targetMs: 60_000, createdAt: 0 },
    ];
    let root!: ReactTestRenderer;
    act(() => {
      root = create(<TrickGoalsScreen trickId="big-cup" trickName="Big Cup" onBack={() => {}} />);
    });

    expect(findText(root, 'Big Cup goals')).toHaveLength(1);
  });

  it('renders the goal card trick name whether or not the trick-goals heading is also present', () => {
    mockGoals = [
      { id: 'goal-1', trickId: 'big-cup', trickName: 'Big Cup', kind: 'count', targetCount: 10, createdAt: 0 },
    ];
    let root!: ReactTestRenderer;
    act(() => {
      root = create(<TrickGoalsScreen trickId="big-cup" trickName="Big Cup" onBack={() => {}} />);
    });

    // No section heading with a single goal, but the card itself still names its trick.
    expect(findText(root, 'Big Cup goals')).toHaveLength(0);
    expect(findText(root, 'Big Cup').length).toBeGreaterThan(0);

    mockGoals = [
      { id: 'goal-1', trickId: 'big-cup', trickName: 'Big Cup', kind: 'count', targetCount: 10, createdAt: 0 },
      { id: 'goal-2', trickId: 'big-cup', trickName: 'Big Cup', kind: 'time', targetMs: 60_000, createdAt: 0 },
    ];
    act(() => {
      root = create(<TrickGoalsScreen trickId="big-cup" trickName="Big Cup" onBack={() => {}} />);
    });

    // Section heading now present, and both goal cards still render their own trick name.
    expect(findText(root, 'Big Cup goals')).toHaveLength(1);
    expect(findText(root, 'Big Cup').length).toBeGreaterThanOrEqual(2);
  });

  it('navigates to practice when the goal card is pressed anywhere other than Delete', () => {
    mockGoals = [
      { id: 'goal-1', trickId: 'big-cup', trickName: 'Big Cup', kind: 'count', targetCount: 10, createdAt: 0 },
    ];
    let root!: ReactTestRenderer;
    act(() => {
      root = create(<TrickGoalsScreen trickId="big-cup" trickName="Big Cup" onBack={() => {}} />);
    });

    act(() => {
      root.root.findByProps({ accessibilityLabel: 'Practice Big Cup' }).props.onPress();
    });

    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/app/sesh',
      params: { trickId: 'big-cup', mode: 'practice' },
    });
  });

  it('does not navigate when Delete is pressed on a goal card', () => {
    mockGoals = [
      { id: 'goal-1', trickId: 'big-cup', trickName: 'Big Cup', kind: 'count', targetCount: 10, createdAt: 0 },
    ];
    let root!: ReactTestRenderer;
    act(() => {
      root = create(<TrickGoalsScreen trickId="big-cup" trickName="Big Cup" onBack={() => {}} />);
    });

    act(() => {
      root.root
        .findByProps({ accessibilityLabel: 'Delete goal' })
        .props.onPress({ stopPropagation: () => {} });
    });

    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(root.root.findByProps({ accessibilityLabel: 'Confirm delete goal' })).toBeDefined();
  });
});
