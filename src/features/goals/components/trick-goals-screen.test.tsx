import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { TrickGoalsScreen } from '@/features/goals/components/trick-goals-screen';

const mockAddGoal = jest.fn();
const mockDeleteGoal = jest.fn();

jest.mock('@/features/goals/state/goal-provider', () => ({
  useGoals: () => ({ goals: [] }),
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

describe('TrickGoalsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAddGoal.mockReturnValue({ status: 'saved' });
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
});
