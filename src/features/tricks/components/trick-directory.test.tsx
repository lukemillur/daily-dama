import { describe, expect, it } from '@jest/globals';
import { useState } from 'react';
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

function collectStrings(json: unknown, out: string[]): void {
  if (typeof json === 'string') {
    out.push(json);
    return;
  }
  if (Array.isArray(json)) {
    for (const child of json) collectStrings(child, out);
    return;
  }
  if (json && typeof json === 'object' && 'children' in json) {
    collectStrings((json as { children: unknown }).children, out);
  }
}

function allText(root: import('react-test-renderer').ReactTestRenderer): string[] {
  const out: string[] = [];
  collectStrings(root.toJSON(), out);
  return out;
}

describe('TrickDirectory', () => {
  it('sections by focusedTrickIds, independent of an in-progress selection prop, when showFocusedSection is set', () => {
    let root!: import('react-test-renderer').ReactTestRenderer;
    let toggled: string[] = [];
    act(() => {
      root = create(
        <TrickDirectory
          tricks={FIXTURE_TRICKS}
          showFocusedSection
          focusedTrickIds={['trick-3']}
          selection={{
            selectedTrickIds: [],
            onToggleTrick: (id) => {
              toggled = [...toggled, id];
            },
          }}
        />,
      );
    });

    const text = allText(root);
    const focusedHeaderIndex = text.indexOf('Focused tricks');
    const spikeIndex = text.indexOf('Spike');
    const rank1HeaderIndex = text.indexOf('Rank 1');
    expect(focusedHeaderIndex).toBeGreaterThanOrEqual(0);
    expect(spikeIndex).toBeGreaterThan(focusedHeaderIndex);
    expect(spikeIndex).toBeLessThan(rank1HeaderIndex);

    // Toggling in-progress selection (e.g. checking a different trick for this run) must not
    // move sections — focusedTrickIds stays the sole sectioning input.
    const [toggleAction] = root.root.findAll(
      (node) => node.props.accessibilityRole === 'checkbox' && typeof node.props.onPress === 'function',
    );
    act(() => {
      toggleAction.props.onPress();
    });
    expect(toggled.length).toBeGreaterThan(0);

    const textAfterToggle = allText(root);
    expect(textAfterToggle.indexOf('Focused tricks')).toBeGreaterThanOrEqual(0);
    expect(textAfterToggle.indexOf('Spike')).toBeGreaterThan(textAfterToggle.indexOf('Focused tricks'));
    expect(textAfterToggle.indexOf('Spike')).toBeLessThan(textAfterToggle.indexOf('Rank 1'));
  });

  it('hides the focused-tricks section while a search query is present, and restores it when cleared', () => {
    function Wrapper() {
      const [query, setQuery] = useState('');
      return (
        <TrickDirectory
          tricks={FIXTURE_TRICKS}
          showFocusedSection
          focusedTrickIds={['trick-3']}
          search={{ query, onChangeText: setQuery }}
        />
      );
    }

    let root!: import('react-test-renderer').ReactTestRenderer;
    act(() => {
      root = create(<Wrapper />);
    });

    expect(allText(root)).toContain('Focused tricks');

    const searchInput = root.root.findByProps({ accessibilityLabel: 'Search tricks' });
    act(() => {
      searchInput.props.onChangeText('Big');
    });
    expect(allText(root)).not.toContain('Focused tricks');

    act(() => {
      searchInput.props.onChangeText('');
    });
    expect(allText(root)).toContain('Focused tricks');

    act(() => {
      root.unmount();
    });
  });

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

  it('renders the laced treatment and a laced-count line for a laced trick, with no badge or toggle', () => {
    let root!: import('react-test-renderer').ReactTestRenderer;
    act(() => {
      root = create(
        <TrickDirectory
          tricks={FIXTURE_TRICKS}
          unlockedTrickIds={new Set(['trick-1'])}
          lacedCountByTrickId={new Map([['trick-1', 3]])}
        />,
      );
    });

    const flatTexts = allText(root);
    const joined = flatTexts.join('');

    expect(flatTexts).not.toContain('Locked');
    expect(flatTexts).not.toContain('Unlocked');
    expect(joined).toContain('3 laces');
    expect(flatTexts).toContain('✓');
    expect(root.root.findAll((node) => node.props.accessibilityRole === 'switch')).toHaveLength(0);
  });

  it('renders no laced treatment or laced-count line for an unlaced trick with zero laces', () => {
    let root!: import('react-test-renderer').ReactTestRenderer;
    act(() => {
      root = create(
        <TrickDirectory
          tricks={FIXTURE_TRICKS}
          unlockedTrickIds={new Set()}
          lacedCountByTrickId={new Map([['trick-1', 0]])}
        />,
      );
    });

    const flatTexts = allText(root);

    expect(flatTexts).not.toContain('Locked');
    expect(flatTexts).not.toContain('Unlocked');
    expect(flatTexts.some((text) => text.includes('lace'))).toBe(false);
    expect(flatTexts).not.toContain('✓');
    expect(root.root.findAll((node) => node.props.accessibilityRole === 'switch')).toHaveLength(0);
  });

  it('includes the note count in the Notes action label for a trick with notes', () => {
    let root!: import('react-test-renderer').ReactTestRenderer;
    act(() => {
      root = create(
        <TrickDirectory
          tricks={FIXTURE_TRICKS}
          notesAction={{ onOpen: () => {} }}
          noteCountByTrickId={new Map([['trick-1', 2]])}
        />,
      );
    });

    const flatTexts = allText(root);

    expect(flatTexts).toContain('Notes — 2');
  });

  it('omits the separator and count from the Notes action label for a trick with no notes', () => {
    let root!: import('react-test-renderer').ReactTestRenderer;
    act(() => {
      root = create(
        <TrickDirectory
          tricks={FIXTURE_TRICKS}
          notesAction={{ onOpen: () => {} }}
          noteCountByTrickId={new Map([['trick-1', 0]])}
        />,
      );
    });

    const flatTexts = allText(root);

    expect(flatTexts.some((text) => text.includes('—'))).toBe(false);
    expect(flatTexts).toContain('Notes');
  });

  it('includes the goal count in the Goals action label for a trick with goals', () => {
    let root!: import('react-test-renderer').ReactTestRenderer;
    act(() => {
      root = create(
        <TrickDirectory
          tricks={FIXTURE_TRICKS}
          goalsAction={{ onOpen: () => {} }}
          goalCountByTrickId={new Map([['trick-1', 2]])}
        />,
      );
    });

    const flatTexts = allText(root);

    expect(flatTexts).toContain('Goals — 2');
  });

  it('omits the separator and count from the Goals action label for a trick with no goals', () => {
    let root!: import('react-test-renderer').ReactTestRenderer;
    act(() => {
      root = create(
        <TrickDirectory
          tricks={FIXTURE_TRICKS}
          goalsAction={{ onOpen: () => {} }}
          goalCountByTrickId={new Map([['trick-1', 0]])}
        />,
      );
    });

    const flatTexts = allText(root);

    expect(flatTexts.some((text) => text.includes('—'))).toBe(false);
    expect(flatTexts).toContain('Goals');
  });
});
