import AsyncStorage from '@react-native-async-storage/async-storage';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Text } from 'react-native';
import type { ReactTestRenderer } from 'react-test-renderer';
import { act, create } from 'react-test-renderer';

import { NoteProvider } from '@/features/notes/state/note-provider';
import { MultiTrickSesh } from '@/features/sesh/components/multi-trick-sesh';
import { createTimedSeshPlan, OPEN_ENDED_SESH_PLAN, type SeshPlan } from '@/features/sesh/model/sesh';
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
  readonly plan?: SeshPlan;
  readonly onFinished: () => void;
  readonly skipTarget?: (currentIndex: number) => number;
  readonly endActionLabel?: string;
}) {
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(
      <NoteProvider>
        <PracticeHistoryProvider>
          <MultiTrickSesh
            tricks={TRICKS}
            plan={props.plan ?? OPEN_ENDED_SESH_PLAN}
            advanceOnFirstLace={props.advanceOnFirstLace}
            onFinished={props.onFinished}
            skipTarget={props.skipTarget}
            endActionLabel={props.endActionLabel}
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

    expect(onFinished).not.toHaveBeenCalled();

    act(() => {
      pressByAccessibilityLabel(root, 'Finish sesh');
    });

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

describe('MultiTrickSesh endActionLabel', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('forwards endActionLabel to ActiveSesh, replacing "End Sesh"', async () => {
    const onFinished = jest.fn();
    const root = await mountMultiTrickSesh({ onFinished, endActionLabel: 'End assessment' });

    advanceThroughCountdown();
    expect(findByText(root, TRICKS[0].name).length).toBeGreaterThan(0);
    expect(findByText(root, 'End assessment').length).toBeGreaterThan(0);
    expect(findByText(root, 'End Sesh')).toHaveLength(0);

    act(() => {
      root.unmount();
    });
  });
});

describe('MultiTrickSesh "Next trick" action', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('records the accumulated laces for the current trick and advances the run', async () => {
    const onFinished = jest.fn();
    const root = await mountMultiTrickSesh({ onFinished });

    advanceThroughCountdown();
    expect(findByText(root, TRICKS[0].name).length).toBeGreaterThan(0);

    act(() => {
      pressByAccessibilityLabel(root, 'Laced');
    });
    act(() => {
      pressByAccessibilityLabel(root, 'Laced');
    });

    // Still on the first trick until "Next trick" is pressed.
    expect(findByText(root, TRICKS[0].name).length).toBeGreaterThan(0);
    expect(findByAccessibilityLabel(root, 'session-count:0').length).toBeGreaterThan(0);

    act(() => {
      pressByVisibleText(root, 'Next trick');
    });

    // The first trick's landings were recorded before advancing.
    expect(findByAccessibilityLabel(root, 'session-count:1').length).toBeGreaterThan(0);
    expect(findByAccessibilityLabel(root, 'session-0-lace-count:2').length).toBeGreaterThan(0);

    advanceThroughCountdown();
    expect(findByText(root, TRICKS[1].name).length).toBeGreaterThan(0);

    act(() => {
      root.unmount();
    });
  });

  it('coexists with "End Sesh": pressing "Next trick" through the whole run finishes once', async () => {
    const onFinished = jest.fn();
    const root = await mountMultiTrickSesh({ onFinished });

    for (const trick of TRICKS) {
      advanceThroughCountdown();
      expect(findByText(root, trick.name).length).toBeGreaterThan(0);

      act(() => {
        pressByAccessibilityLabel(root, 'Laced');
      });
      act(() => {
        pressByVisibleText(root, 'Next trick');
      });
    }

    expect(onFinished).not.toHaveBeenCalled();

    act(() => {
      pressByAccessibilityLabel(root, 'Finish sesh');
    });

    expect(onFinished).toHaveBeenCalledTimes(1);
    expect(findByAccessibilityLabel(root, 'session-count:3').length).toBeGreaterThan(0);
    for (let index = 0; index < TRICKS.length; index += 1) {
      expect(findByAccessibilityLabel(root, `session-${index}-lace-count:1`).length).toBeGreaterThan(0);
    }

    act(() => {
      root.unmount();
    });
  });
});

describe('MultiTrickSesh per-trick duration', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('advances to the next trick once the per-trick duration elapses, with no manual action', async () => {
    const onFinished = jest.fn();
    const root = await mountMultiTrickSesh({ plan: createTimedSeshPlan(1), onFinished });

    for (const trick of TRICKS) {
      advanceThroughCountdown();
      expect(findByText(root, trick.name).length).toBeGreaterThan(0);

      act(() => {
        jest.advanceTimersByTime(60_000);
      });
    }

    expect(onFinished).not.toHaveBeenCalled();

    act(() => {
      pressByAccessibilityLabel(root, 'Finish sesh');
    });

    expect(onFinished).toHaveBeenCalledTimes(1);
    expect(findByAccessibilityLabel(root, 'session-count:3').length).toBeGreaterThan(0);
    for (let index = 0; index < TRICKS.length; index += 1) {
      expect(findByAccessibilityLabel(root, `session-${index}-lace-count:0`).length).toBeGreaterThan(0);
    }

    act(() => {
      root.unmount();
    });
  });
});

describe('MultiTrickSesh wrap-up', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders one wrap-up entry per attempted trick, in run order, with correct lace counts, and calls onFinished only after "Finish sesh" is pressed', async () => {
    const onFinished = jest.fn();
    const root = await mountMultiTrickSesh({ onFinished });

    const laceCounts = [1, 2, 0];

    for (let index = 0; index < TRICKS.length; index += 1) {
      const trick = TRICKS[index];
      advanceThroughCountdown();
      expect(findByText(root, trick.name).length).toBeGreaterThan(0);

      for (let lace = 0; lace < laceCounts[index]; lace += 1) {
        act(() => {
          pressByAccessibilityLabel(root, 'Laced');
        });
      }

      act(() => {
        pressByVisibleText(root, index === TRICKS.length - 1 ? 'End Sesh' : 'Next trick');
      });
    }

    // Assert each trick's wrap-up entry exists with the correct lace count
    // (time formatting is covered by formatDuration elsewhere, so match on
    // trick name + lace count only).
    for (let index = 0; index < TRICKS.length; index += 1) {
      const trick = TRICKS[index];
      const laceCount = laceCounts[index];
      const matches = root.root.findAll(
        (node) =>
          typeof node.props.accessibilityLabel === 'string' &&
          node.props.accessibilityLabel.startsWith(`Wrap-up entry: ${trick.name}, ${laceCount} laces,`),
      );
      expect(matches.length).toBeGreaterThan(0);
    }

    // And in run order — the wrap-up entries appear in the same order as
    // TRICKS, not just each individually present. findAll matches both the
    // composite styled-component and its underlying host node for each row,
    // so dedupe consecutive duplicates before comparing.
    const rawWrapUpEntryLabels = root.root
      .findAll(
        (node) =>
          typeof node.props.accessibilityLabel === 'string' &&
          node.props.accessibilityLabel.startsWith('Wrap-up entry:'),
      )
      .map((node) => node.props.accessibilityLabel as string);
    const wrapUpEntryLabels = [...new Set(rawWrapUpEntryLabels)];
    expect(wrapUpEntryLabels).toEqual(
      TRICKS.map((trick, index) => expect.stringContaining(`Wrap-up entry: ${trick.name}, ${laceCounts[index]} laces,`)),
    );

    expect(onFinished).not.toHaveBeenCalled();

    act(() => {
      pressByAccessibilityLabel(root, 'Finish sesh');
    });

    expect(onFinished).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
  });

  it('excludes skipped tricks from the wrap-up, showing only the attempted trick', async () => {
    const onFinished = jest.fn();
    const root = await mountMultiTrickSesh({
      onFinished,
      skipTarget: () => TRICKS.length,
    });

    advanceThroughCountdown();
    expect(findByText(root, TRICKS[0].name).length).toBeGreaterThan(0);

    act(() => {
      pressByAccessibilityLabel(root, 'Laced');
    });
    act(() => {
      pressByVisibleText(root, 'Next trick');
    });

    advanceThroughCountdown();
    expect(findByText(root, TRICKS[1].name).length).toBeGreaterThan(0);

    act(() => {
      pressByVisibleText(root, 'Skip this rank');
    });

    const attemptedMatches = root.root.findAll(
      (node) =>
        typeof node.props.accessibilityLabel === 'string' &&
        node.props.accessibilityLabel.startsWith(`Wrap-up entry: ${TRICKS[0].name},`),
    );
    expect(attemptedMatches.length).toBeGreaterThan(0);

    for (let index = 1; index < TRICKS.length; index += 1) {
      const skippedMatches = root.root.findAll(
        (node) =>
          typeof node.props.accessibilityLabel === 'string' &&
          node.props.accessibilityLabel.startsWith(`Wrap-up entry: ${TRICKS[index].name},`),
      );
      expect(skippedMatches.length).toBe(0);
    }

    expect(onFinished).not.toHaveBeenCalled();

    act(() => {
      pressByAccessibilityLabel(root, 'Finish sesh');
    });

    expect(onFinished).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
  });
});
