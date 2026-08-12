import { describe, expect, it } from '@jest/globals';
import { useState } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { LacedTricksScreen } from '@/features/tricks/components/laced-tricks-screen';
import {
  type DirectoryTrick,
  selectEffectiveLacedTrickIds,
} from '@/features/tricks/model/trick-directory';

const FIXTURE_TRICKS: readonly DirectoryTrick[] = [
  { id: 'trick-1', name: 'Big Cup', kenteiRank: 1, kenteiLevel: 'Basic', kenteiClass: '3rd Class' },
  { id: 'trick-2', name: 'Small Cup', kenteiRank: 1, kenteiLevel: 'Basic', kenteiClass: '3rd Class' },
];

function findCard(root: ReactTestRenderer, label: string) {
  return root.root.find(
    (node) =>
      node.props.accessibilityLabel === label && typeof node.props.onPress === 'function',
  );
}

function Harness({ onToggleTrickId }: { readonly onToggleTrickId: (trickId: string) => void }) {
  const [manuallyUnlockedTrickIds, setManuallyUnlockedTrickIds] = useState<readonly string[]>([]);
  const unlockedTrickIds = selectEffectiveLacedTrickIds(new Set(), manuallyUnlockedTrickIds);

  return (
    <LacedTricksScreen
      tricks={FIXTURE_TRICKS}
      unlockedTrickIds={unlockedTrickIds}
      onToggleTrick={(trickId) => {
        onToggleTrickId(trickId);
        setManuallyUnlockedTrickIds((current) =>
          current.includes(trickId) ? current.filter((id) => id !== trickId) : [...current, trickId],
        );
      }}
      onClose={() => {}}
    />
  );
}

describe('LacedTricksScreen', () => {
  it('dispatches the manual-unlock toggle for the trick and re-renders it laced', () => {
    const toggledTrickIds: string[] = [];
    let root!: ReactTestRenderer;
    act(() => {
      root = create(<Harness onToggleTrickId={(trickId) => toggledTrickIds.push(trickId)} />);
    });

    const unlacedCard = findCard(root, 'Big Cup, unlaced');
    act(() => {
      unlacedCard.props.onPress();
    });

    expect(toggledTrickIds).toEqual(['trick-1']);
    expect(findCard(root, 'Big Cup, laced')).toBeTruthy();
  });

  it('renders a trick with lace history as laced with no manual flag', () => {
    let root!: ReactTestRenderer;
    act(() => {
      root = create(
        <LacedTricksScreen
          tricks={FIXTURE_TRICKS}
          unlockedTrickIds={new Set(['trick-2'])}
          onToggleTrick={() => {}}
          onClose={() => {}}
        />,
      );
    });

    expect(findCard(root, 'Small Cup, laced')).toBeTruthy();
    expect(findCard(root, 'Big Cup, unlaced')).toBeTruthy();
  });
});
