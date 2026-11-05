import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { StyleSheet, Text, type ViewStyle } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { DISPLAY_MAX_FONT_SIZE_MULTIPLIER } from '@/components/ui/typography';
import { ActiveSesh } from '@/features/sesh/components/sesh';
import { createTimedSeshPlan } from '@/features/sesh/model/sesh';
import type { PracticeTrick } from '@/features/tricks/model/trick';

// Same require-based spy as landing-page.test.tsx: a namespace import would be wrapped by Babel
// interop and the spy would not reach sesh.tsx's own named import.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ReactNative = require('react-native') as typeof import('react-native');
const dimensionsSpy = jest.spyOn(ReactNative, 'useWindowDimensions');

jest.mock('expo-audio', () => {
  const mockAudioPlayer = { play: jest.fn(), seekTo: jest.fn() };
  return { useAudioPlayer: jest.fn(() => mockAudioPlayer) };
});

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required by jest hoisting
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const TRICK: PracticeTrick = { id: 'big-cup', name: 'Big Cup' };
const PLAN = createTimedSeshPlan(5);

function noop() {}

type JsonNode = { props: Record<string, unknown>; children: (JsonNode | string)[] | null };

function renderActive(fontScale: number) {
  dimensionsSpy.mockReturnValue({ width: 390, height: 844, scale: 3, fontScale });
  let root!: ReactTestRenderer;
  act(() => {
    root = create(
      <ActiveSesh
        trick={TRICK}
        plan={PLAN}
        startedAt={Date.now()}
        landings={[]}
        pausedDurationMs={0}
        liveChallengeEnabled={false}
        onLaced={noop}
        onPause={noop}
        onResume={noop}
        onEnd={noop}
        onTimerElapsed={noop}
      />,
    );
  });
  return root;
}

function findNode(
  node: JsonNode | string | null,
  match: (n: JsonNode) => boolean,
): JsonNode | undefined {
  if (node === null || typeof node === 'string') return undefined;
  if (match(node)) return node;
  for (const child of node.children ?? []) {
    const found = findNode(child, match);
    if (found) return found;
  }
  return undefined;
}

function secondaryActionsDirection(root: ReactTestRenderer) {
  const container = findNode(
    root.toJSON() as unknown as JsonNode,
    (n) =>
      (n.children ?? []).length === 2 &&
      (n.children ?? []).some(
        (c) => typeof c !== 'string' && JSON.stringify(c).includes('Pause Sesh'),
      ),
  );
  return StyleSheet.flatten(container?.props.style as ViewStyle)?.flexDirection;
}

describe('ActiveSesh at accessibility text sizes (T305)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    dimensionsSpy.mockReset();
  });

  it('keeps Pause/End side by side at the default text size', () => {
    const root = renderActive(1);
    expect(secondaryActionsDirection(root)).toBe('row');
    act(() => root.unmount());
  });

  it('stacks Pause/End at large accessibility text sizes', () => {
    const root = renderActive(2);
    expect(secondaryActionsDirection(root)).toBe('column');
    act(() => root.unmount());
  });

  it('caps font scaling on the Laced label but not on control labels', () => {
    const root = renderActive(1);
    const textByContent = (content: string) =>
      root.root.findAll((n) => n.type === Text && n.props.children === content)[0];
    expect(textByContent('Laced.')?.props.maxFontSizeMultiplier).toBe(
      DISPLAY_MAX_FONT_SIZE_MULTIPLIER,
    );
    expect(textByContent('Pause Sesh')?.props.maxFontSizeMultiplier).toBeUndefined();
    act(() => root.unmount());
  });
});
