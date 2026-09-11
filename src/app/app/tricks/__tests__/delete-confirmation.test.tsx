import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { DeleteConfirmation } from '@/app/app/tricks';
import type { CustomTrick } from '@/features/custom-tricks/model/custom-trick';

const mockDeleteCustomTrick = jest.fn();
const mockRemoveSelectedTrick = jest.fn();
const mockRemoveManualUnlock = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));

jest.mock('@/features/custom-tricks/state/custom-trick-provider', () => ({
  useCustomTrickActions: () => ({ deleteCustomTrick: mockDeleteCustomTrick }),
  useCustomTricks: () => ({ tricks: [] }),
}));

jest.mock('@/features/profile/state/user-profile-provider', () => ({
  useUserProfile: () => ({ selectedTrickIds: [] }),
  useUserProfileActions: () => ({
    toggleSelectedTrick: jest.fn(),
    removeSelectedTrick: mockRemoveSelectedTrick,
    removeManualUnlock: mockRemoveManualUnlock,
  }),
}));

jest.mock('@/features/onboarding/state/require-onboarding', () => ({
  useRequireOnboarding: () => true,
}));

jest.mock('@/features/goals/state/goal-provider', () => ({ useGoals: () => ({ goals: [] }) }));
jest.mock('@/features/notes/state/note-provider', () => ({ useNotes: () => ({ notes: [] }) }));
jest.mock('@/features/stats/state/practice-history-provider', () => ({
  usePracticeHistory: () => ({ sessions: [] }),
}));

const trick: CustomTrick = { id: 'custom-solo', kind: 'standalone', name: 'Moon catch', updatedAt: 1 };

function containsMatchingText(renderer: ReactTestRenderer, pattern: RegExp) {
  return renderer.root.findAll(
    (node) => typeof node.props.children === 'string' && pattern.test(node.props.children),
  ).length > 0;
}

beforeEach(() => {
  mockDeleteCustomTrick.mockReset();
  mockRemoveSelectedTrick.mockReset();
  mockRemoveManualUnlock.mockReset();
});

describe('DeleteConfirmation', () => {
  it('omits the sequence heads-up when the trick is not referenced', () => {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(
        <DeleteConfirmation trick={trick} onCancel={jest.fn()} onDeleted={jest.fn()} />,
      );
    });

    expect(containsMatchingText(renderer, /also used as a step/)).toBe(false);
  });

  it('names the count without naming the referencing sequences for one reference', () => {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(
        <DeleteConfirmation
          trick={trick}
          referencingSequenceCount={1}
          onCancel={jest.fn()}
          onDeleted={jest.fn()}
        />,
      );
    });

    expect(
      renderer.root.findAll(
        (node) =>
          typeof node.props.children === 'string' &&
          node.props.children.includes('used as a step in 1 sequence'),
      ).length,
    ).toBeGreaterThan(0);
  });

  it('names the count without naming the referencing sequences for multiple references', () => {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(
        <DeleteConfirmation
          trick={trick}
          referencingSequenceCount={3}
          onCancel={jest.fn()}
          onDeleted={jest.fn()}
        />,
      );
    });

    const matches = renderer.root.findAll(
      (node) =>
        typeof node.props.children === 'string' &&
        node.props.children.includes('used as a step in 3 sequences'),
    );
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.some((node) => (node.props.children as string).match(/[A-Za-z]+ line/))).toBe(
      false,
    );
  });
});
