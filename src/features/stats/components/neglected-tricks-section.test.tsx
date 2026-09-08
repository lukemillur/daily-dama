import { describe, expect, it } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import {
  NeglectedTricksSection,
  type NeglectedTrickCandidate,
} from '@/features/stats/components/neglected-tricks-section';
import type { NeglectedTrick } from '@/features/stats/model/neglected-tricks';

function trick(id: string, name = id): NeglectedTrickCandidate {
  return { id, name };
}

function entry(
  id: string,
  mostRecentPracticeAt?: number,
): NeglectedTrick<NeglectedTrickCandidate> {
  return {
    trick: trick(id, `Trick ${id}`),
    ...(mostRecentPracticeAt === undefined ? {} : { mostRecentPracticeAt }),
  };
}

function findPracticeLinks(root: ReactTestRenderer) {
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

function allText(root: ReactTestRenderer): string[] {
  const out: string[] = [];
  collectStrings(root.toJSON(), out);
  return out;
}

describe('NeglectedTricksSection', () => {
  it('renders nothing when there are no neglected tricks', () => {
    let root!: ReactTestRenderer;
    act(() => {
      root = create(<NeglectedTricksSection neglectedTricks={[]} />);
    });

    expect(root.toJSON()).toBeNull();
  });

  it('renders the first three selector results in order, each with a Practice action to /sesh?trickId=...', () => {
    const neglectedTricks = [entry('a'), entry('b'), entry('c')];
    let root!: ReactTestRenderer;
    act(() => {
      root = create(<NeglectedTricksSection neglectedTricks={neglectedTricks} />);
    });

    const text = allText(root);
    const indexA = text.indexOf('Trick a');
    const indexB = text.indexOf('Trick b');
    const indexC = text.indexOf('Trick c');
    expect(indexA).toBeGreaterThanOrEqual(0);
    expect(indexA).toBeLessThan(indexB);
    expect(indexB).toBeLessThan(indexC);

    const links = findPracticeLinks(root);
    expect(links).toHaveLength(3);
    expect(
      links.map((link) => (link.props.accessibilityLabel as string).replace('Practice ', '')),
    ).toEqual(['Trick a', 'Trick b', 'Trick c']);
  });

  it('links each Practice action to /sesh with the correct trickId param', () => {
    const neglectedTricks = [entry('big-cup')];
    let root!: ReactTestRenderer;
    act(() => {
      root = create(<NeglectedTricksSection neglectedTricks={neglectedTricks} />);
    });

    const link = root.root.findByProps({ accessibilityLabel: 'Practice Trick big-cup' });
    expect(link.props.href).toBe('/app/sesh?trickId=big-cup&mode=practice');
  });

  it('distinguishes never-practiced tricks from previously practiced ones', () => {
    const neglectedTricks = [entry('never'), entry('practiced', 1_700_000_000_000)];
    let root!: ReactTestRenderer;
    act(() => {
      root = create(<NeglectedTricksSection neglectedTricks={neglectedTricks} />);
    });

    const text = allText(root).join(' ');
    expect(text).toContain('Never practiced');
    expect(text).toMatch(/Last practiced/);
  });
});
