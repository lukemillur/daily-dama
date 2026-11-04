import AsyncStorage from '@react-native-async-storage/async-storage';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AppState, Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { GoalProvider } from '@/features/goals/state/goal-provider';
import { NoteProvider } from '@/features/notes/state/note-provider';
import { UserProfileProvider } from '@/features/profile/state/user-profile-provider';
import { Sesh } from '@/features/sesh/components/sesh';
import { LACE_INPUT_LOCKOUT_MS, OPEN_ENDED_SESH_PLAN, createTimedSeshPlan, type SeshPlan } from '@/features/sesh/model/sesh';
import {
  PracticeHistoryProvider,
  usePracticeHistory,
} from '@/features/stats/state/practice-history-provider';
import type { PracticeTrick } from '@/features/tricks/model/trick';

jest.mock('expo-audio', () => {
  const mockAudioPlayer = { play: jest.fn(), seekTo: jest.fn() };
  return { useAudioPlayer: jest.fn(() => mockAudioPlayer), __mockAudioPlayer: mockAudioPlayer };
});

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required by jest hoisting
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const TRICK: PracticeTrick = { id: 'big-cup', name: 'Big Cup' };
const TEN_MINUTES_MS = 10 * 60_000;

function findByAccessibilityLabel(root: ReactTestRenderer, label: string) {
  return root.root.findAll((node) => node.props.accessibilityLabel === label);
}

function findByText(root: ReactTestRenderer, text: string) {
  return root.root.findAll((node) => node.props.children === text);
}

function pressByVisibleText(root: ReactTestRenderer, text: string) {
  const [textNode] = root.root.findAll((node) => node.props.children === text);
  if (!textNode) throw new Error(`No node found with text: ${text}`);
  let current: typeof textNode | null = textNode;
  while (current && typeof current.props.onPress !== 'function') current = current.parent;
  if (!current) throw new Error(`No pressable ancestor found for text: ${text}`);
  current.props.onPress();
}

function SessionSummary() {
  const { sessions } = usePracticeHistory();
  return (
    <>
      <Text accessibilityLabel={`session-count:${sessions.length}`} />
      {sessions.map((session) => (
        <Text key={session.id} accessibilityLabel={`session-duration:${session.durationMs}`} />
      ))}
    </>
  );
}

async function startSesh(plan: SeshPlan) {
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(
      <UserProfileProvider>
        <NoteProvider>
          <GoalProvider>
            <PracticeHistoryProvider>
              <Sesh availableTricks={[TRICK]} selectedTrickIds={[TRICK.id]} initialPlan={plan} />
              <SessionSummary />
            </PracticeHistoryProvider>
          </GoalProvider>
        </NoteProvider>
      </UserProfileProvider>,
    );
  });
  act(() => {
    const [start] = root.root.findAll(
      (node) =>
        node.props.accessibilityLabel === `Start a sesh with ${TRICK.name}` &&
        typeof node.props.onPress === 'function',
    );
    start.props.onPress();
  });
  return root;
}

function foregroundAfter(gapMs: number) {
  const calls = (AppState.addEventListener as jest.Mock).mock.calls;
  const handler = calls[calls.length - 1][1] as (state: string) => void;
  jest.setSystemTime(Date.now() + gapMs);
  act(() => {
    handler('active');
  });
}

function advanceThroughCountdown() {
  for (let i = 0; i < 3; i += 1) {
    act(() => {
      jest.advanceTimersByTime(1000);
    });
  }
  act(() => {
    jest.advanceTimersByTime(LACE_INPUT_LOCKOUT_MS);
  });
}

describe('Sesh app foreground reconciliation (T043.1)', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('completes an overdue timed Sesh at its deadline and records history exactly once', async () => {
    const root = await startSesh(createTimedSeshPlan(1));
    advanceThroughCountdown();

    foregroundAfter(TEN_MINUTES_MS);

    expect(findByAccessibilityLabel(root, 'session-count:1').length).toBeGreaterThan(0);
    expect(findByAccessibilityLabel(root, 'session-duration:60000').length).toBeGreaterThan(0);

    // The interval path and a repeated foreground land on the same record id and must not duplicate.
    act(() => {
      jest.advanceTimersByTime(2_000);
    });
    foregroundAfter(0);
    expect(findByAccessibilityLabel(root, 'session-count:1').length).toBeGreaterThan(0);

    act(() => {
      root.unmount();
    });
  });

  it('records once when the interval completes the Sesh before the foreground does', async () => {
    const root = await startSesh(createTimedSeshPlan(1));
    advanceThroughCountdown();

    act(() => {
      jest.advanceTimersByTime(60_000);
    });
    foregroundAfter(TEN_MINUTES_MS);

    expect(findByAccessibilityLabel(root, 'session-count:1').length).toBeGreaterThan(0);

    act(() => {
      root.unmount();
    });
  });

  it('keeps an open-ended Sesh active and reports the full elapsed time when ended', async () => {
    const root = await startSesh(OPEN_ENDED_SESH_PLAN);
    advanceThroughCountdown();

    foregroundAfter(TEN_MINUTES_MS);
    expect(findByText(root, 'Sesh in progress').length).toBeGreaterThan(0);
    expect(findByAccessibilityLabel(root, 'session-count:0').length).toBeGreaterThan(0);

    act(() => {
      pressByVisibleText(root, 'End Sesh');
    });
    expect(
      findByAccessibilityLabel(root, `session-duration:${LACE_INPUT_LOCKOUT_MS + TEN_MINUTES_MS}`).length,
    ).toBeGreaterThan(0);

    act(() => {
      root.unmount();
    });
  });

  it('keeps a paused Sesh paused without accruing the background gap', async () => {
    const root = await startSesh(createTimedSeshPlan(1));
    advanceThroughCountdown();
    act(() => {
      pressByVisibleText(root, 'Pause Sesh');
    });

    foregroundAfter(TEN_MINUTES_MS);

    expect(findByText(root, 'Sesh paused').length).toBeGreaterThan(0);
    expect(findByAccessibilityLabel(root, 'session-count:0').length).toBeGreaterThan(0);

    act(() => {
      pressByVisibleText(root, 'Resume Sesh');
    });
    act(() => {
      pressByVisibleText(root, 'End Sesh');
    });
    expect(findByAccessibilityLabel(root, `session-duration:${LACE_INPUT_LOCKOUT_MS}`).length).toBeGreaterThan(0);

    act(() => {
      root.unmount();
    });
  });
});
