import { describe, expect, it } from '@jest/globals';
import { act, create } from 'react-test-renderer';

import { TrickDirectory } from '@/features/tricks/components/trick-directory';
import type { DirectoryTrick } from '@/features/tricks/model/trick-directory';

const FIXTURE_TRICKS: readonly DirectoryTrick[] = [
  { id: 'trick-1', name: 'Big Cup', kenteiRank: 1, kenteiLevel: 'Basic', kenteiClass: '3rd Class' },
  { id: 'trick-2', name: 'Small Cup', kenteiRank: 1, kenteiLevel: 'Basic', kenteiClass: '3rd Class' },
  { id: 'trick-3', name: 'Spike', kenteiRank: 2, kenteiLevel: 'Basic', kenteiClass: '3rd Class' },
];

function findPracticeActions(root: import('react-test-renderer').ReactTestRenderer) {
  return root.root.findAll(
    (node) =>
      typeof node.type === 'string' &&
      typeof node.props.accessibilityLabel === 'string' &&
      node.props.accessibilityLabel.startsWith('Practice '),
  );
}

describe('TrickDirectory', () => {
  it('renders no Practice action when practiceAction is absent', () => {
    let root!: import('react-test-renderer').ReactTestRenderer;
    act(() => {
      root = create(<TrickDirectory tricks={FIXTURE_TRICKS} />);
    });

    expect(findPracticeActions(root)).toHaveLength(0);
  });

  it('renders one Practice action per row when practiceAction is supplied', () => {
    let root!: import('react-test-renderer').ReactTestRenderer;
    act(() => {
      root = create(<TrickDirectory practiceAction tricks={FIXTURE_TRICKS} />);
    });

    expect(findPracticeActions(root)).toHaveLength(FIXTURE_TRICKS.length);
  });
});
