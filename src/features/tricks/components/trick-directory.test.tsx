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
});
