import AsyncStorage from '@react-native-async-storage/async-storage';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Text } from 'react-native';
import type { ReactTestRenderer } from 'react-test-renderer';
import { act, create } from 'react-test-renderer';

import { NoteProvider } from '@/features/notes/state/note-provider';
import { MultiTrickSesh } from '@/features/sesh/components/multi-trick-sesh';
import { OPEN_ENDED_SESH_PLAN } from '@/features/sesh/model/sesh';
import {
  PracticeHistoryProvider,
  usePracticeHistory,
} from '@/features/stats/state/practice-history-provider';
import type { PracticeTrick } from '@/features/tricks/model/trick';

// MultiTrickSesh (transitively, via practice-history-provider) pulls in AsyncStorage. Mock it the
// same way sesh.test.tsx does — these tests never touch storage directly.
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required by jest hoisting
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const TRICKS: readonly PracticeTrick[] = [
  { id: 'big-cup', name: 'Big Cup' },
  { id: 'lighthouse', name: 'Lighthouse' },
  { id: 'airplane', name: 'Airplane' },
];

function pressByAccessibilityLabel(root: ReactTestRenderer, label: string) {
  const [match] = root.root.findAll(
    (node) => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function',
  );
  match.props.onPress();
}

function pressByVisibleText(root: ReactTestRenderer, text: string) {
  const [textNode] = root.root.findAll((node) => node.props.children === text);
  if (!textNode) throw new Error(`No node found with text: ${text}`);
  let current: typeof textNode | null = textNode;
  while (current && typeof current.props.onPress !== 'function') {
    current = current.parent;
  }
  if (!current) throw new Error(`No pressable ancestor found for text: ${text}`);
  current.props.onPress();
}

function findByText(root: ReactTestRenderer, text: string) {
  return root.root.findAll((node) => node.props.children === text);
}

function findByAccessibilityLabel(root: ReactTestRenderer, label: string) {
  return root.root.findAll((node) => node.props.accessibilityLabel === label);
}

function advanceThroughCountdown() {
  act(() => {
    jest.advanceTimersByTime(1000);
  });
  act(() => {
    jest.advanceTimersByTime(1000);
  });
  act(() => {
    jest.advanceTimersByTime(1000);
  });
}

// Renders the current session count and each session's laceCount behind accessibility labels so
// tests can assert on recorded history, mirroring the Harness pattern in sesh.test.tsx.
function SessionSummary() {
  const { sessions } = usePracticeHistory();
  return (
    <>
      <Text accessibilityLabel={`session-count:${sessions.length}`} />
      {sessions.map((session, index) => (
        <Text key={session.id} accessibilityLabel={`session-${index}-lace-count:${session.laceCount}`} />
      ))}
    </>
  );
}

async function mountMultiTrickSesh(props: {
  readonly advanceOnFirstLace?: boolean;
  readonly onFinished: () => void;
}) {
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(
      <NoteProvider>
        <PracticeHistoryProvider>
          <MultiTrickSesh
            tricks={TRICKS}
            plan={OPEN_ENDED_SESH_PLAN}
            advanceOnFirstLace={props.advanceOnFirstLace}
            onFinished={props.onFinished}
          />
          <SessionSummary />
        </PracticeHistoryProvider>
      </NoteProvider>,
    );
  });
  return root;
}

describe('MultiTrickSesh advanceOnFirstLace', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('advances to the next trick after a single lace when enabled, recording one landing per trick', async () => {
    const onFinished = jest.fn();
    const root = await mountMultiTrickSesh({ advanceOnFirstLace: true, onFinished });

    for (const trick of TRICKS) {
      advanceThroughCountdown();
      expect(findByText(root, trick.name).length).toBeGreaterThan(0);

      act(() => {
        pressByAccessibilityLabel(root, 'Laced');
      });
    }

    expect(onFinished).toHaveBeenCalledTimes(1);
    expect(findByAccessibilityLabel(root, 'session-count:3').length).toBeGreaterThan(0);
    for (let index = 0; index < TRICKS.length; index += 1) {
      expect(findByAccessibilityLabel(root, `session-${index}-lace-count:1`).length).toBeGreaterThan(0);
    }

    act(() => {
      root.unmount();
    });
  });

  it('does not advance on a single lace when disabled (default), requiring an explicit End Sesh', async () => {
    const onFinished = jest.fn();
    const root = await mountMultiTrickSesh({ onFinished });

    advanceThroughCountdown();
    expect(findByText(root, TRICKS[0].name).length).toBeGreaterThan(0);

    act(() => {
      pressByAccessibilityLabel(root, 'Laced');
    });

    // Still on the first trick's active screen — a single lace alone must not advance.
    expect(findByText(root, TRICKS[0].name).length).toBeGreaterThan(0);
    expect(findByAccessibilityLabel(root, 'session-count:0').length).toBeGreaterThan(0);

    act(() => {
      pressByVisibleText(root, 'End Sesh');
    });

    advanceThroughCountdown();
    expect(findByText(root, TRICKS[1].name).length).toBeGreaterThan(0);
    expect(findByAccessibilityLabel(root, 'session-count:1').length).toBeGreaterThan(0);

    act(() => {
      root.unmount();
    });
  });
});
