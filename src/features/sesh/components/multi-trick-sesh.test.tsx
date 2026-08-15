import AsyncStorage from '@react-native-async-storage/async-storage';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { ReactNode } from 'react';
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
import type { PracticeTrick, TrickSummary } from '@/features/tricks/model/trick';

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

const TRICKS_WITH_KENTEI: readonly TrickSummary[] = [
  { id: 'big-cup', name: 'Big Cup', kenteiRank: 5, kenteiClass: '3rd Class', kenteiLevel: 'Basic' },
  { id: 'lighthouse', name: 'Lighthouse', kenteiRank: 5, kenteiClass: '3rd Class', kenteiLevel: 'Basic' },
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
      {sessions.map((session, index) => (
        <Text key={session.id} accessibilityLabel={`session-${index}-duration:${session.durationMs}`} />
      ))}
      {sessions.map((session, index) => (
        <Text
          key={session.id}
          accessibilityLabel={`session-${index}-origin:${session.origin ?? 'none'}`}
        />
      ))}
    </>
  );
}

function findSessionDurationMs(root: ReactTestRenderer, index: number): number {
  const [match] = root.root.findAll(
    (node) =>
      typeof node.props.accessibilityLabel === 'string' &&
      node.props.accessibilityLabel.startsWith(`session-${index}-duration:`),
  );
  if (!match) throw new Error(`No duration label found for session ${index}`);
  return Number(match.props.accessibilityLabel.split(':')[1]);
}

function findSessionOrigin(root: ReactTestRenderer, index: number): string {
  const [match] = root.root.findAll(
    (node) =>
      typeof node.props.accessibilityLabel === 'string' &&
      node.props.accessibilityLabel.startsWith(`session-${index}-origin:`),
  );
  if (!match) throw new Error(`No origin label found for session ${index}`);
  return match.props.accessibilityLabel.split(':')[1];
}

async function mountMultiTrickSesh(props: {
  readonly advanceOnFirstLace?: boolean;
  readonly pauseAfterLace?: boolean;
  readonly plan?: SeshPlan;
  readonly onFinished: () => void;
  readonly skipTarget?: (currentIndex: number) => number;
  readonly endActionLabel?: string;
  readonly skipCountdownBetweenTricks?: boolean;
  readonly hideTimer?: boolean;
  readonly describeSkippedRange?: (startIndex: number, endIndex: number) => string;
  readonly wrapUpFooter?: ReactNode;
  readonly onCancelRun?: () => void;
  readonly tricks?: readonly PracticeTrick[];
  readonly showRankStanding?: boolean;
  readonly origin?: 'assessment';
  readonly suppressTransientCompletionFallback?: boolean;
  readonly finishButtonLabel?: string;
}) {
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(
      <NoteProvider>
        <PracticeHistoryProvider>
          <MultiTrickSesh
            tricks={props.tricks ?? TRICKS}
            plan={props.plan ?? OPEN_ENDED_SESH_PLAN}
            advanceOnFirstLace={props.advanceOnFirstLace}
            pauseAfterLace={props.pauseAfterLace}
            onFinished={props.onFinished}
            skipTarget={props.skipTarget}
            endActionLabel={props.endActionLabel}
            skipCountdownBetweenTricks={props.skipCountdownBetweenTricks}
            hideTimer={props.hideTimer}
            describeSkippedRange={props.describeSkippedRange}
            wrapUpFooter={props.wrapUpFooter}
            onCancelRun={props.onCancelRun}
            showRankStanding={props.showRankStanding}
            origin={props.origin}
            suppressTransientCompletionFallback={props.suppressTransientCompletionFallback}
            finishButtonLabel={props.finishButtonLabel}
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

    for (const [index, trick] of TRICKS.entries()) {
      advanceThroughCountdown();
      expect(findByText(root, trick.name).length).toBeGreaterThan(0);

      act(() => {
        pressByAccessibilityLabel(root, 'Laced');
      });

      if (index === TRICKS.length - 1) {
        expect(findByText(root, 'Next trick')).toHaveLength(0);
      }
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

  it('does not show the generic completion panel while an assessment advances to the next trick', async () => {
    const onFinished = jest.fn();
    const root = await mountMultiTrickSesh({
      advanceOnFirstLace: true,
      origin: 'assessment',
      suppressTransientCompletionFallback: true,
      skipCountdownBetweenTricks: true,
      onFinished,
    });

    advanceThroughCountdown();
    act(() => {
      pressByAccessibilityLabel(root, 'Laced');
    });

    expect(findByText(root, 'Sequence complete')).toHaveLength(0);
    expect(findByText(root, 'Nice work.')).toHaveLength(0);
    expect(findByText(root, TRICKS[1].name).length).toBeGreaterThan(0);
    expect(findByAccessibilityLabel(root, 'Laced').length).toBeGreaterThan(0);

    act(() => {
      root.unmount();
    });
  });

  it('does not show the generic completion panel while an assessment reaches its wrap-up', async () => {
    const onFinished = jest.fn();
    const assessmentTricks = TRICKS.slice(0, 1);
    const root = await mountMultiTrickSesh({
      tricks: assessmentTricks,
      advanceOnFirstLace: true,
      origin: 'assessment',
      suppressTransientCompletionFallback: true,
      finishButtonLabel: 'Go to Home',
      wrapUpFooter: <Text accessibilityLabel="Assessment result">Rank 2</Text>,
      onFinished,
    });

    advanceThroughCountdown();
    act(() => {
      pressByAccessibilityLabel(root, 'Laced');
    });

    expect(findByText(root, 'Sequence complete')).toHaveLength(0);
    expect(findByText(root, 'You worked through every trick in this sesh.')).toHaveLength(0);
    expect(findByAccessibilityLabel(root, 'Assessment result').length).toBeGreaterThan(0);
    expect(findByAccessibilityLabel(root, 'Go to Home').length).toBeGreaterThan(0);

    act(() => {
      root.unmount();
    });
  });

  it('allows manual advancement without lacing when advanceOnFirstLace is set', async () => {
    const onFinished = jest.fn();
    const root = await mountMultiTrickSesh({
      advanceOnFirstLace: true,
      onFinished,
    });

    advanceThroughCountdown();
    expect(findByText(root, TRICKS[0].name).length).toBeGreaterThan(0);
    expect(findByAccessibilityLabel(root, 'Laced').length).toBeGreaterThan(0);
    expect(findByText(root, 'Next trick').length).toBeGreaterThan(0);
    expect(findByAccessibilityLabel(root, 'session-count:0').length).toBeGreaterThan(0);

    act(() => {
      pressByVisibleText(root, 'Next trick');
    });

    expect(findByAccessibilityLabel(root, 'session-count:1').length).toBeGreaterThan(0);
    expect(findByAccessibilityLabel(root, 'session-0-lace-count:0').length).toBeGreaterThan(0);

    advanceThroughCountdown();
    expect(findByText(root, TRICKS[1].name).length).toBeGreaterThan(0);
    expect(findByText(root, 'Next trick').length).toBeGreaterThan(0);

    act(() => {
      root.unmount();
    });
  });

  it('does not advance on a single lace when disabled (default), and "End Sesh" ends the whole run', async () => {
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

    // "End Sesh" ends the whole run, not just the current trick — reaches
    // the wrap-up immediately instead of advancing to the next trick.
    expect(findByText(root, 'Finish sesh').length).toBeGreaterThan(0);
    expect(findByText(root, 'Nice work.').length).toBeGreaterThan(0);
    expect(findByAccessibilityLabel(root, 'session-count:1').length).toBeGreaterThan(0);
    expect(findByAccessibilityLabel(root, 'session-0-lace-count:1').length).toBeGreaterThan(0);
    expect(findByText(root, TRICKS[1].name)).toHaveLength(0);
    expect(findByText(root, TRICKS[2].name)).toHaveLength(0);

    act(() => {
      root.unmount();
    });
  });
});

describe('MultiTrickSesh origin', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('tags the recorded session with the given origin', async () => {
    const onFinished = jest.fn();
    const root = await mountMultiTrickSesh({ onFinished, origin: 'assessment' });

    advanceThroughCountdown();
    act(() => {
      pressByAccessibilityLabel(root, 'Laced');
    });
    act(() => {
      pressByVisibleText(root, 'End Sesh');
    });

    expect(findSessionOrigin(root, 0)).toBe('assessment');

    act(() => {
      root.unmount();
    });
  });

  it('leaves the recorded session untagged when no origin is passed', async () => {
    const onFinished = jest.fn();
    const root = await mountMultiTrickSesh({ onFinished });

    advanceThroughCountdown();
    act(() => {
      pressByAccessibilityLabel(root, 'Laced');
    });
    act(() => {
      pressByVisibleText(root, 'End Sesh');
    });

    expect(findSessionOrigin(root, 0)).toBe('none');

    act(() => {
      root.unmount();
    });
  });
});

describe('MultiTrickSesh "End Sesh" ends the run early', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("reaches the wrap-up immediately with only the current trick's laces-so-far recorded", async () => {
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

    act(() => {
      pressByVisibleText(root, 'End Sesh');
    });

    const wrapUpMatches = root.root.findAll(
      (node) =>
        typeof node.props.accessibilityLabel === 'string' &&
        node.props.accessibilityLabel.startsWith(`Wrap-up entry: ${TRICKS[0].name}, 2 laces,`),
    );
    expect(wrapUpMatches.length).toBeGreaterThan(0);

    const allWrapUpEntries = root.root.findAll(
      (node) =>
        typeof node.props.accessibilityLabel === 'string' &&
        node.props.accessibilityLabel.startsWith('Wrap-up entry:'),
    );
    expect(new Set(allWrapUpEntries.map((node) => node.props.accessibilityLabel))).toEqual(
      new Set([expect.stringContaining(`Wrap-up entry: ${TRICKS[0].name}, 2 laces,`)]),
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

  it('records tricks already advanced past via "Next trick" before "End Sesh" stops the run', async () => {
    const onFinished = jest.fn();
    const root = await mountMultiTrickSesh({ onFinished });

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
      pressByAccessibilityLabel(root, 'Laced');
    });
    act(() => {
      pressByVisibleText(root, 'End Sesh');
    });

    expect(findByText(root, 'Finish sesh').length).toBeGreaterThan(0);
    expect(findByAccessibilityLabel(root, 'session-count:2').length).toBeGreaterThan(0);

    const allWrapUpEntries = root.root.findAll(
      (node) =>
        typeof node.props.accessibilityLabel === 'string' &&
        node.props.accessibilityLabel.startsWith('Wrap-up entry:'),
    );
    const uniqueLabels = new Set(allWrapUpEntries.map((node) => node.props.accessibilityLabel));
    expect(uniqueLabels).toEqual(
      new Set([
        expect.stringContaining(`Wrap-up entry: ${TRICKS[0].name}, 1 laces,`),
        expect.stringContaining(`Wrap-up entry: ${TRICKS[1].name}, 1 laces,`),
      ]),
    );
    expect(findByText(root, TRICKS[2].name)).toHaveLength(0);

    act(() => {
      root.unmount();
    });
  });

  it('ends the whole run when pressed via a custom endActionLabel (e.g. "End assessment")', async () => {
    const onFinished = jest.fn();
    const root = await mountMultiTrickSesh({ onFinished, endActionLabel: 'End assessment' });

    advanceThroughCountdown();
    expect(findByText(root, TRICKS[0].name).length).toBeGreaterThan(0);

    act(() => {
      pressByAccessibilityLabel(root, 'Laced');
    });
    act(() => {
      pressByVisibleText(root, 'End assessment');
    });

    expect(findByText(root, 'Finish sesh').length).toBeGreaterThan(0);
    expect(findByAccessibilityLabel(root, 'session-count:1').length).toBeGreaterThan(0);
    expect(findByAccessibilityLabel(root, 'session-0-lace-count:1').length).toBeGreaterThan(0);
    expect(findByText(root, TRICKS[1].name)).toHaveLength(0);

    act(() => {
      root.unmount();
    });
  });

  it('reaches the wrap-up with both an attempted entry and a skipped-range entry when a rank was skipped earlier in the run (PR 55 QA)', async () => {
    const onFinished = jest.fn();
    const root = await mountMultiTrickSesh({
      onFinished,
      endActionLabel: 'End assessment',
      // Skip only trick 1 (index 1), landing back on trick 2 (index 2) so
      // the run isn't over yet -- exercises "Skip this rank" followed later
      // by "End assessment", the exact combination the task's exit
      // criteria calls out for confirming rank-skip wrap-up messaging.
      skipTarget: () => 2,
      describeSkippedRange: (start, end) => `Rank ${start + 1} — ${end - start} tricks skipped`,
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
    act(() => {
      pressByAccessibilityLabel(root, 'Confirm skip rank');
    });

    advanceThroughCountdown();
    expect(findByText(root, TRICKS[2].name).length).toBeGreaterThan(0);

    act(() => {
      pressByAccessibilityLabel(root, 'Laced');
    });
    act(() => {
      pressByVisibleText(root, 'End assessment');
    });

    // Reaches the wrap-up immediately (not the next trick -- there isn't
    // one), with both attempted tricks recorded and the skipped rank
    // rendered as its own "Skipped" entry, not as a failed attempt.
    expect(findByText(root, 'Finish sesh').length).toBeGreaterThan(0);
    expect(findByAccessibilityLabel(root, 'session-count:2').length).toBeGreaterThan(0);

    const attemptedLabels = new Set(
      root.root
        .findAll(
          (node) =>
            typeof node.props.accessibilityLabel === 'string' &&
            node.props.accessibilityLabel.startsWith('Wrap-up entry:'),
        )
        .map((node) => node.props.accessibilityLabel as string),
    );
    expect(attemptedLabels).toEqual(
      new Set([
        expect.stringContaining(`Wrap-up entry: ${TRICKS[0].name}, 1 laces,`),
        expect.stringContaining(`Wrap-up entry: ${TRICKS[2].name}, 1 laces,`),
      ]),
    );

    const skippedMatches = root.root.findAll(
      (node) =>
        typeof node.props.accessibilityLabel === 'string' &&
        node.props.accessibilityLabel === 'Wrap-up skipped: Rank 2 — 1 tricks skipped',
    );
    expect(skippedMatches.length).toBeGreaterThan(0);

    act(() => {
      root.unmount();
    });
  });
});

describe('MultiTrickSesh pauseAfterLace', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows an acknowledgment panel before advancing, then advances after the delay', async () => {
    const onFinished = jest.fn();
    const root = await mountMultiTrickSesh({ advanceOnFirstLace: true, pauseAfterLace: true, onFinished });

    advanceThroughCountdown();
    expect(findByText(root, TRICKS[0].name).length).toBeGreaterThan(0);

    act(() => {
      pressByAccessibilityLabel(root, 'Laced');
    });

    // Acknowledgment panel shown; next trick's "Laced" button isn't reachable yet.
    expect(findByAccessibilityLabel(root, 'Trick landed').length).toBeGreaterThan(0);
    expect(findByAccessibilityLabel(root, 'Laced').length).toBe(0);

    act(() => {
      jest.advanceTimersByTime(1499);
    });
    expect(findByAccessibilityLabel(root, 'Trick landed').length).toBeGreaterThan(0);

    act(() => {
      jest.advanceTimersByTime(1);
    });

    // Acknowledgment gone; next trick's countdown appears.
    expect(findByAccessibilityLabel(root, 'Trick landed').length).toBe(0);
    advanceThroughCountdown();
    expect(findByText(root, TRICKS[1].name).length).toBeGreaterThan(0);

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

describe('MultiTrickSesh hideTimer', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('hides the timer during an assessment-style run', async () => {
    const onFinished = jest.fn();
    const root = await mountMultiTrickSesh({ onFinished, hideTimer: true });

    advanceThroughCountdown();
    expect(findByText(root, TRICKS[0].name).length).toBeGreaterThan(0);
    expect(findByText(root, 'Elapsed time')).toHaveLength(0);
    expect(findByText(root, 'Time remaining')).toHaveLength(0);

    act(() => {
      root.unmount();
    });
  });

  it('shows the timer during a regular run', async () => {
    const onFinished = jest.fn();
    const root = await mountMultiTrickSesh({ onFinished });

    advanceThroughCountdown();
    expect(findByText(root, 'Elapsed time').length).toBeGreaterThan(0);

    act(() => {
      root.unmount();
    });
  });

  it('still records a real, non-zero durationMs while the timer is hidden', async () => {
    const onFinished = jest.fn();
    const root = await mountMultiTrickSesh({ onFinished, hideTimer: true });

    advanceThroughCountdown();

    act(() => {
      jest.advanceTimersByTime(2000);
    });

    act(() => {
      pressByVisibleText(root, 'Laced.');
    });

    act(() => {
      pressByVisibleText(root, 'End Sesh');
    });

    expect(findSessionDurationMs(root, 0)).toBeGreaterThan(0);

    act(() => {
      root.unmount();
    });
  });
});

describe('MultiTrickSesh skipCountdownBetweenTricks', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('still shows the first trick\'s countdown, then skips the countdown for every later trick', async () => {
    const onFinished = jest.fn();
    const root = await mountMultiTrickSesh({ onFinished, skipCountdownBetweenTricks: true });

    // First trick: countdown still shown, has to be advanced through before
    // the active screen (and "Laced") appears.
    advanceThroughCountdown();
    expect(findByText(root, TRICKS[0].name).length).toBeGreaterThan(0);
    expect(findByAccessibilityLabel(root, 'Laced').length).toBeGreaterThan(0);

    act(() => {
      pressByAccessibilityLabel(root, 'Laced');
    });
    act(() => {
      pressByVisibleText(root, 'Next trick');
    });

    // Second trick: no advanceThroughCountdown() here — the next trick
    // should already be in 'active' with "Laced" available.
    expect(findByText(root, TRICKS[1].name).length).toBeGreaterThan(0);
    expect(findByAccessibilityLabel(root, 'Laced').length).toBeGreaterThan(0);

    act(() => {
      root.unmount();
    });
  });

  it('lands directly in active on the next rank after "Skip this rank"', async () => {
    const onFinished = jest.fn();
    const root = await mountMultiTrickSesh({
      onFinished,
      skipCountdownBetweenTricks: true,
      skipTarget: () => 2,
    });

    advanceThroughCountdown();
    expect(findByText(root, TRICKS[0].name).length).toBeGreaterThan(0);

    act(() => {
      pressByVisibleText(root, 'Skip this rank');
    });

    act(() => {
      pressByAccessibilityLabel(root, 'Confirm skip rank');
    });

    // No advanceThroughCountdown() — TRICKS[2] should already be active.
    expect(findByText(root, TRICKS[2].name).length).toBeGreaterThan(0);
    expect(findByAccessibilityLabel(root, 'Laced').length).toBeGreaterThan(0);

    act(() => {
      root.unmount();
    });
  });
});

describe('MultiTrickSesh countdown Skip (T075)', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('skips the first casual countdown into the active trick without recording a landing', async () => {
    const onFinished = jest.fn();
    const root = await mountMultiTrickSesh({ onFinished });

    expect(findByAccessibilityLabel(root, 'Skip countdown').length).toBeGreaterThan(0);
    expect(findByAccessibilityLabel(root, 'Laced')).toHaveLength(0);

    act(() => {
      pressByAccessibilityLabel(root, 'Skip countdown');
    });

    expect(findByAccessibilityLabel(root, 'Laced').length).toBeGreaterThan(0);
    expect(findByAccessibilityLabel(root, 'Skip countdown')).toHaveLength(0);
    expect(findByAccessibilityLabel(root, 'session-count:0').length).toBeGreaterThan(0);

    act(() => {
      root.unmount();
    });
  });

  it('skips a later casual countdown without waiting or creating a skipped-trick record', async () => {
    const onFinished = jest.fn();
    const root = await mountMultiTrickSesh({ onFinished });

    act(() => {
      pressByAccessibilityLabel(root, 'Skip countdown');
    });
    expect(findByAccessibilityLabel(root, 'Laced').length).toBeGreaterThan(0);

    // Advance without lacing the first trick so its ordinary completion path records no landing;
    // the second trick still receives its own countdown because the default is enabled.
    act(() => {
      pressByVisibleText(root, 'Next trick');
    });

    expect(findByText(root, TRICKS[1].name).length).toBeGreaterThan(0);
    expect(findByAccessibilityLabel(root, 'Skip countdown').length).toBeGreaterThan(0);

    act(() => {
      pressByAccessibilityLabel(root, 'Skip countdown');
    });

    expect(findByAccessibilityLabel(root, 'Laced').length).toBeGreaterThan(0);
    expect(findByAccessibilityLabel(root, 'Skip countdown')).toHaveLength(0);
    expect(findByAccessibilityLabel(root, 'session-count:1').length).toBeGreaterThan(0);
    expect(findByAccessibilityLabel(root, 'session-0-lace-count:0').length).toBeGreaterThan(0);

    act(() => {
      root.unmount();
    });
  });

  it('starts the elapsed clock at the skip timestamp', async () => {
    jest.setSystemTime(100_000);
    const onFinished = jest.fn();
    const root = await mountMultiTrickSesh({ onFinished, tricks: TRICKS.slice(0, 1) });

    act(() => {
      pressByAccessibilityLabel(root, 'Skip countdown');
    });
    act(() => {
      jest.advanceTimersByTime(2_500);
    });
    act(() => {
      pressByVisibleText(root, 'End Sesh');
    });

    expect(findSessionDurationMs(root, 0)).toBe(2_500);

    act(() => {
      root.unmount();
    });
  });

  it('does not expose the casual countdown Skip action to assessment runs', async () => {
    const onFinished = jest.fn();
    const root = await mountMultiTrickSesh({ onFinished, origin: 'assessment' });

    expect(findByAccessibilityLabel(root, 'Skip countdown')).toHaveLength(0);
    expect(findByText(root, 'Cancel')).toHaveLength(0);

    act(() => {
      root.unmount();
    });
  });
});


describe('MultiTrickSesh "Skip this rank" confirmation (T056)', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows the specific tricks a skip would discard before committing anything', async () => {
    const onFinished = jest.fn();
    const root = await mountMultiTrickSesh({ onFinished, skipTarget: () => 2 });

    advanceThroughCountdown();
    expect(findByText(root, TRICKS[0].name).length).toBeGreaterThan(0);

    act(() => {
      pressByVisibleText(root, 'Skip this rank');
    });

    expect(findByAccessibilityLabel(root, 'Skip rank confirmation').length).toBeGreaterThan(0);
    expect(findByText(root, TRICKS[0].name).length).toBeGreaterThan(0);
    expect(findByText(root, TRICKS[1].name).length).toBeGreaterThan(0);

    expect(findByAccessibilityLabel(root, 'session-count:0').length).toBeGreaterThan(0);

    act(() => {
      root.unmount();
    });
  });

  it('leaves the run unaffected when the skip is canceled', async () => {
    const onFinished = jest.fn();
    const root = await mountMultiTrickSesh({ onFinished, skipTarget: () => 2 });

    advanceThroughCountdown();

    act(() => {
      pressByVisibleText(root, 'Skip this rank');
    });
    expect(findByAccessibilityLabel(root, 'Skip rank confirmation').length).toBeGreaterThan(0);

    act(() => {
      pressByAccessibilityLabel(root, 'Cancel skip rank');
    });

    expect(findByAccessibilityLabel(root, 'Skip rank confirmation').length).toBe(0);
    expect(findByText(root, TRICKS[0].name).length).toBeGreaterThan(0);
    expect(findByAccessibilityLabel(root, 'Laced').length).toBeGreaterThan(0);

    act(() => {
      pressByAccessibilityLabel(root, 'Laced');
    });
    act(() => {
      pressByVisibleText(root, 'End Sesh');
    });

    expect(findByAccessibilityLabel(root, 'session-count:1').length).toBeGreaterThan(0);
    expect(findByAccessibilityLabel(root, 'session-0-lace-count:1').length).toBeGreaterThan(0);

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

    for (let index = 0; index < TRICKS.length; index += 1) {
      const trick = TRICKS[index];
      advanceThroughCountdown();
      expect(findByText(root, trick.name).length).toBeGreaterThan(0);

      act(() => {
        pressByAccessibilityLabel(root, 'Laced');
      });
      act(() => {
        pressByVisibleText(root, index === TRICKS.length - 1 ? 'End Sesh' : 'Next trick');
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

  it('hides "Next trick" on the final trick of the run but shows it on every earlier trick', async () => {
    const onFinished = jest.fn();
    const root = await mountMultiTrickSesh({ onFinished });

    for (let index = 0; index < TRICKS.length; index += 1) {
      const trick = TRICKS[index];
      advanceThroughCountdown();
      expect(findByText(root, trick.name).length).toBeGreaterThan(0);

      act(() => {
        pressByAccessibilityLabel(root, 'Laced');
      });

      const isFinalTrick = index === TRICKS.length - 1;
      if (isFinalTrick) {
        expect(findByText(root, 'Next trick')).toHaveLength(0);
      } else {
        expect(findByText(root, 'Next trick').length).toBeGreaterThan(0);
      }
      expect(findByText(root, 'End Sesh').length).toBeGreaterThan(0);

      act(() => {
        pressByVisibleText(root, isFinalTrick ? 'End Sesh' : 'Next trick');
      });
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

    act(() => {
      pressByAccessibilityLabel(root, 'Confirm skip rank');
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

  it('renders the wrap-up footer only once the wrap-up is showing, not before', async () => {
    const onFinished = jest.fn();
    const root = await mountMultiTrickSesh({
      onFinished,
      wrapUpFooter: <Text accessibilityLabel="resulting-rank">Rank 5</Text>,
    });

    expect(findByAccessibilityLabel(root, 'resulting-rank')).toHaveLength(0);

    for (let index = 0; index < TRICKS.length; index += 1) {
      const trick = TRICKS[index];
      advanceThroughCountdown();
      expect(findByText(root, trick.name).length).toBeGreaterThan(0);

      act(() => {
        pressByAccessibilityLabel(root, 'Laced');
      });
      act(() => {
        pressByVisibleText(root, index === TRICKS.length - 1 ? 'End Sesh' : 'Next trick');
      });
    }

    expect(findByAccessibilityLabel(root, 'resulting-rank').length).toBeGreaterThan(0);

    act(() => {
      root.unmount();
    });
  });

  it('reports a skipped rank as skipped, not failed, and keeps it out of the attempted rows', async () => {
    const onFinished = jest.fn();
    const root = await mountMultiTrickSesh({
      onFinished,
      skipTarget: () => TRICKS.length,
      describeSkippedRange: (start, end) => `Skipped ${end - start} tricks`,
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

    act(() => {
      pressByAccessibilityLabel(root, 'Confirm skip rank');
    });

    const skippedMatches = root.root.findAll(
      (node) =>
        typeof node.props.accessibilityLabel === 'string' &&
        node.props.accessibilityLabel.startsWith('Wrap-up skipped:'),
    );
    expect(skippedMatches.length).toBeGreaterThan(0);
    for (const match of skippedMatches) {
      expect(match.props.accessibilityLabel).not.toContain('laces');
      expect(match.props.accessibilityLabel).not.toContain('0 laces');
    }

    for (let index = 1; index < TRICKS.length; index += 1) {
      const attemptedMatches = root.root.findAll(
        (node) =>
          typeof node.props.accessibilityLabel === 'string' &&
          node.props.accessibilityLabel.startsWith(`Wrap-up entry: ${TRICKS[index].name},`),
      );
      expect(attemptedMatches.length).toBe(0);
    }

    act(() => {
      pressByAccessibilityLabel(root, 'Finish sesh');
    });

    expect(onFinished).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
  });
});

describe('MultiTrickSesh onCancelRun (T047)', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('calls onCancelRun when Cancel is pressed during the very first trick countdown', async () => {
    const onFinished = jest.fn();
    const onCancelRun = jest.fn();
    const root = await mountMultiTrickSesh({ onFinished, onCancelRun });

    // Advance partway through the countdown, not to completion.
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(findByText(root, TRICKS[0].name).length).toBeGreaterThan(0);

    act(() => {
      pressByVisibleText(root, 'Cancel');
    });

    expect(onCancelRun).toHaveBeenCalledTimes(1);
    expect(onFinished).not.toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
  });

  it('does not render Cancel on the second trick countdown, even after the first completes normally', async () => {
    const onFinished = jest.fn();
    const onCancelRun = jest.fn();
    const root = await mountMultiTrickSesh({ onFinished, onCancelRun });

    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(findByText(root, TRICKS[0].name).length).toBeGreaterThan(0);
    expect(findByText(root, 'Cancel').length).toBeGreaterThan(0);

    // Finish advancing through the first trick's countdown so it lands in 'active'.
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    act(() => {
      pressByAccessibilityLabel(root, 'Laced');
    });
    act(() => {
      pressByVisibleText(root, 'Next trick');
    });

    // Second trick: still shows its own countdown (skipCountdownBetweenTricks is not set), but
    // must not offer Cancel — the scope boundary from the task Notes.
    expect(findByText(root, TRICKS[1].name).length).toBeGreaterThan(0);
    expect(findByText(root, 'Cancel')).toHaveLength(0);

    act(() => {
      root.unmount();
    });
  });

  it('does not render Cancel on the second trick countdown after skipping past the first', async () => {
    const onFinished = jest.fn();
    const onCancelRun = jest.fn();
    const root = await mountMultiTrickSesh({
      onFinished,
      onCancelRun,
      skipTarget: () => 1,
    });

    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(findByText(root, TRICKS[0].name).length).toBeGreaterThan(0);
    expect(findByText(root, 'Cancel').length).toBeGreaterThan(0);

    act(() => {
      pressByVisibleText(root, 'Skip this rank');
    });

    act(() => {
      pressByAccessibilityLabel(root, 'Confirm skip rank');
    });

    expect(findByText(root, TRICKS[1].name).length).toBeGreaterThan(0);
    expect(findByText(root, 'Cancel')).toHaveLength(0);

    act(() => {
      root.unmount();
    });
  });

  it('does not render Cancel on any countdown when onCancelRun is not supplied', async () => {
    const onFinished = jest.fn();
    const root = await mountMultiTrickSesh({ onFinished });

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(findByText(root, TRICKS[0].name).length).toBeGreaterThan(0);
    expect(findByText(root, 'Cancel')).toHaveLength(0);

    act(() => {
      root.unmount();
    });
  });
});

describe('MultiTrickSesh showRankStanding', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders the rank/class label during both countdown and active phases when set', async () => {
    const onFinished = jest.fn();
    const root = await mountMultiTrickSesh({
      onFinished,
      tricks: TRICKS_WITH_KENTEI,
      showRankStanding: true,
    });

    expect(JSON.stringify(root.toJSON())).toContain('Rank 5 · 3rd Class · Basic');

    advanceThroughCountdown();

    expect(JSON.stringify(root.toJSON())).toContain('Rank 5 · 3rd Class · Basic');

    act(() => {
      root.unmount();
    });
  });

  it('does not render the label when showRankStanding is not passed', async () => {
    const onFinished = jest.fn();
    const root = await mountMultiTrickSesh({ onFinished, tricks: TRICKS_WITH_KENTEI });

    expect(JSON.stringify(root.toJSON())).not.toContain('Rank 5');

    act(() => {
      root.unmount();
    });
  });
});
