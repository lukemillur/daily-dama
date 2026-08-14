import AsyncStorage from '@react-native-async-storage/async-storage';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { ComponentProps, ReactElement } from 'react';
import { Pressable, Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { formatGoalTarget } from '@/features/goals/components/trick-goals-screen';
import type { Goal, GoalProgress } from '@/features/goals/model/goal';
import { useGoalActions, useGoals, GoalProvider } from '@/features/goals/state/goal-provider';
import { NoteProvider, useNotes } from '@/features/notes/state/note-provider';
import type { Note } from '@/features/notes/model/note';
import { UserProfileProvider } from '@/features/profile/state/user-profile-provider';
import { Sesh, ActiveSesh, CompletedSesh, Countdown } from '@/features/sesh/components/sesh';
import {
  createOpenEndedSeshPlan,
  createTimedSeshPlan,
  formatDuration,
  formatRemainingDuration,
  type Landing,
  type SeshSummary,
} from '@/features/sesh/model/sesh';
import {
  createPracticeSessionRecordId,
  type PracticeSessionRecord,
} from '@/features/stats/model/practice-history';
import {
  PracticeHistoryProvider,
  usePracticeHistory,
  usePracticeHistoryActions,
} from '@/features/stats/state/practice-history-provider';
import type { PracticeTrick, TrickSummary } from '@/features/tricks/model/trick';

// ActiveSesh/CompletedSesh are re-exported from a module that also (transitively) imports
// practice-history-provider, which pulls in AsyncStorage. Mock it the same way
// kentei-rank-auto-promotion.test.tsx does — the tests here never touch storage directly.
// This mock call is hoisted above the imports above by babel-jest, so the require below runs
// before the real module is ever reached.
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required by jest hoisting
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const TRICK: PracticeTrick = { id: 'big-cup', name: 'Big Cup' };
const TRICK_WITH_KENTEI: TrickSummary = {
  id: 'lighthouse',
  name: 'Lighthouse',
  kenteiRank: 5,
  kenteiClass: '3rd Class',
  kenteiLevel: 'Basic',
};
const PLAN = createTimedSeshPlan(5);

// Match only the rendered host View, not the CelebrationBanner/wrapper component instances
// (which still carry a matching `accessibilityLabel` prop even after auto-dismiss makes them
// render null, since that prop is passed down rather than consumed and dropped).
function findBanner(root: ReactTestRenderer) {
  return root.root.findAll(
    (node) => (node.type as unknown) === 'View' && node.props.accessibilityLabel === 'First lace ever on Big Cup',
  );
}

function findGoalBanner(root: ReactTestRenderer, goal: Goal) {
  const label = `Goal achieved for ${goal.trickName}: ${formatGoalTarget(goal)}`;
  return root.root.findAll((node) => (node.type as unknown) === 'View' && node.props.accessibilityLabel === label);
}

function findPersonalBestBanner(root: ReactTestRenderer, trickName: string) {
  const label = `New personal best on ${trickName}`;
  return root.root.findAll((node) => (node.type as unknown) === 'View' && node.props.accessibilityLabel === label);
}

function landing(elapsedMs: number): Landing {
  return { landedAt: elapsedMs, elapsedMs, intervalMs: elapsedMs };
}

function noop() {}

function buildNote(overrides: Partial<Note> = {}): Note {
  return {
    id: 'note-1',
    trickId: TRICK.id,
    trickName: TRICK.name,
    body: 'Keep the elbow tucked in on the release.',
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

function pressByAccessibilityLabel(root: ReactTestRenderer, label: string) {
  const [match] = root.root.findAll(
    (node) => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function',
  );
  match.props.onPress();
}

function findByAccessibilityLabel(root: ReactTestRenderer, label: string) {
  return root.root.findAll((node) => node.props.accessibilityLabel === label);
}

// Some buttons (e.g. "End Sesh") only carry visible text, no accessibilityLabel. Find the text
// node and climb to the nearest ancestor exposing an onPress handler.
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

// Renders the latest note's practiceSessionId behind an accessibilityLabel so tests can assert
// on it after driving the save flow, mirroring the Harness pattern in
// kentei-rank-auto-promotion.test.tsx.
function LatestNotePracticeSessionId() {
  const { notes } = useNotes();
  const latest = notes[notes.length - 1];
  return (
    <Text accessibilityLabel={`latest-note-practice-session-id:${latest?.practiceSessionId ?? ''}`} />
  );
}

async function mountWithNoteProvider(children: ReactElement) {
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(<NoteProvider>{children}</NoteProvider>);
  });
  return root;
}

describe('ActiveSesh first-lace celebration', () => {
  // ActiveSesh runs a real setInterval (via useNow) to tick the on-screen timer. Fake timers
  // keep that interval from firing during assertions and — combined with unmounting each root
  // in afterEach — stop it from keeping the process alive after the test file finishes.
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders the in-sesh banner on the landing that takes the trick from zero to one lace, and not after', () => {
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
          hadPriorLaceAtSeshStart={false}
          onLaced={noop}
          onPause={noop}
          onResume={noop}
          onEnd={noop}
          onTimerElapsed={noop}
        />,
      );
    });

    expect(findBanner(root)).toHaveLength(0);

    act(() => {
      root.update(
        <ActiveSesh
          trick={TRICK}
          plan={PLAN}
          startedAt={Date.now()}
          landings={[landing(1000)]}
          pausedDurationMs={0}
          liveChallengeEnabled={false}
          hadPriorLaceAtSeshStart={false}
          onLaced={noop}
          onPause={noop}
          onResume={noop}
          onEnd={noop}
          onTimerElapsed={noop}
        />,
      );
    });

    expect(findBanner(root).length).toBeGreaterThan(0);
    expect(JSON.stringify(root.toJSON())).toContain('You just landed');

    act(() => {
      root.update(
        <ActiveSesh
          trick={TRICK}
          plan={PLAN}
          startedAt={Date.now()}
          landings={[landing(1000), landing(2000)]}
          pausedDurationMs={0}
          liveChallengeEnabled={false}
          hadPriorLaceAtSeshStart={false}
          onLaced={noop}
          onPause={noop}
          onResume={noop}
          onEnd={noop}
          onTimerElapsed={noop}
        />,
      );
    });

    expect(findBanner(root)).toHaveLength(0);
    act(() => {
      root.unmount();
    });
  });

  it('auto-dismisses the in-sesh banner a few seconds after it appears, with no further Laced press', () => {
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
          hadPriorLaceAtSeshStart={false}
          onLaced={noop}
          onPause={noop}
          onResume={noop}
          onEnd={noop}
          onTimerElapsed={noop}
        />,
      );
    });

    act(() => {
      root.update(
        <ActiveSesh
          trick={TRICK}
          plan={PLAN}
          startedAt={Date.now()}
          landings={[landing(1000)]}
          pausedDurationMs={0}
          liveChallengeEnabled={false}
          hadPriorLaceAtSeshStart={false}
          onLaced={noop}
          onPause={noop}
          onResume={noop}
          onEnd={noop}
          onTimerElapsed={noop}
        />,
      );
    });

    expect(findBanner(root).length).toBeGreaterThan(0);

    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(findBanner(root).length).toBeGreaterThan(0);

    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(findBanner(root)).toHaveLength(0);

    act(() => {
      root.unmount();
    });
  });

  it('never shows the in-sesh banner when the trick already had a prior lace', () => {
    let root!: ReactTestRenderer;
    act(() => {
      root = create(
        <ActiveSesh
          trick={TRICK}
          plan={PLAN}
          startedAt={Date.now()}
          landings={[landing(1000)]}
          pausedDurationMs={0}
          liveChallengeEnabled={false}
          hadPriorLaceAtSeshStart={true}
          onLaced={noop}
          onPause={noop}
          onResume={noop}
          onEnd={noop}
          onTimerElapsed={noop}
        />,
      );
    });

    expect(findBanner(root)).toHaveLength(0);
    act(() => {
      root.unmount();
    });
  });
});

describe('ActiveSesh "Next trick" action', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not render "Next trick" when onNextTrick is omitted', () => {
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

    expect(root.root.findAll((node) => node.props.children === 'Next trick')).toHaveLength(0);

    act(() => {
      root.unmount();
    });
  });

  it('renders "Next trick" and invokes the handler when supplied', () => {
    const onNextTrick = jest.fn();
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
          onNextTrick={onNextTrick}
        />,
      );
    });

    expect(root.root.findAll((node) => node.props.children === 'Next trick').length).toBeGreaterThan(0);

    act(() => {
      pressByVisibleText(root, 'Next trick');
    });

    expect(onNextTrick).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
  });
});

describe('ActiveSesh end action label', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders "End Sesh" when endActionLabel is omitted', () => {
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

    expect(JSON.stringify(root.toJSON())).toContain('End Sesh');

    act(() => {
      root.unmount();
    });
  });

  it('renders the supplied endActionLabel instead of "End Sesh"', () => {
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
          endActionLabel="End assessment"
        />,
      );
    });

    const json = JSON.stringify(root.toJSON());
    expect(json).toContain('End assessment');
    expect(json).not.toContain('End Sesh');

    act(() => {
      root.unmount();
    });
  });
});

describe('ActiveSesh timer visibility', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders the timer and its label when hideTimer is omitted', () => {
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

    expect(JSON.stringify(root.toJSON())).toContain('Time remaining');

    act(() => {
      root.unmount();
    });
  });

  it('hides the timer and its label when hideTimer is set', () => {
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
          hideTimer
        />,
      );
    });

    expect(JSON.stringify(root.toJSON())).not.toContain('Time remaining');

    act(() => {
      root.unmount();
    });
  });
});

describe('ActiveSesh pause/resume timer accuracy (regression)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows the correct elapsed time immediately on resume for a timed plan', () => {
    let root!: ReactTestRenderer;
    const startedAt = Date.now();

    act(() => {
      root = create(
        <ActiveSesh
          trick={TRICK}
          plan={PLAN}
          startedAt={startedAt}
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

    act(() => {
      jest.advanceTimersByTime(10_000);
    });

    const pausedAt = Date.now();
    act(() => {
      root.update(
        <ActiveSesh
          trick={TRICK}
          plan={PLAN}
          startedAt={startedAt}
          pausedAt={pausedAt}
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

    act(() => {
      jest.advanceTimersByTime(5_000);
    });

    act(() => {
      root.update(
        <ActiveSesh
          trick={TRICK}
          plan={PLAN}
          startedAt={startedAt}
          landings={[]}
          pausedDurationMs={5_000}
          liveChallengeEnabled={false}
          onLaced={noop}
          onPause={noop}
          onResume={noop}
          onEnd={noop}
          onTimerElapsed={noop}
        />,
      );
    });

    const json = JSON.stringify(root.toJSON());
    expect(json).toContain(formatRemainingDuration(290_000));
    expect(json).not.toContain(formatRemainingDuration(295_000));

    act(() => {
      root.unmount();
    });
  });

  it('shows the correct elapsed time immediately on resume for an open-ended plan', () => {
    let root!: ReactTestRenderer;
    const startedAt = Date.now();
    const openEndedPlan = createOpenEndedSeshPlan();

    act(() => {
      root = create(
        <ActiveSesh
          trick={TRICK}
          plan={openEndedPlan}
          startedAt={startedAt}
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

    act(() => {
      jest.advanceTimersByTime(10_000);
    });

    const pausedAt = Date.now();
    act(() => {
      root.update(
        <ActiveSesh
          trick={TRICK}
          plan={openEndedPlan}
          startedAt={startedAt}
          pausedAt={pausedAt}
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

    act(() => {
      jest.advanceTimersByTime(5_000);
    });

    act(() => {
      root.update(
        <ActiveSesh
          trick={TRICK}
          plan={openEndedPlan}
          startedAt={startedAt}
          landings={[]}
          pausedDurationMs={5_000}
          liveChallengeEnabled={false}
          onLaced={noop}
          onPause={noop}
          onResume={noop}
          onEnd={noop}
          onTimerElapsed={noop}
        />,
      );
    });

    const json = JSON.stringify(root.toJSON());
    expect(json).toContain(formatDuration(10_000));
    expect(json).not.toContain(formatDuration(5_000));

    act(() => {
      root.unmount();
    });
  });
});

describe('CompletedSesh first-lace celebration', () => {
  const summary: SeshSummary = {
    trick: TRICK,
    plan: PLAN,
    startedAt: 0,
    endedAt: 5000,
    durationMs: 5000,
    landings: [landing(1000)],
  };

  it('shows the past-tense banner when isFirstLace is true', async () => {
    const root = await mountWithNoteProvider(
      <CompletedSesh summary={summary} isFirstLace={true} onReset={noop} onRepeat={noop} />,
    );

    expect(findBanner(root).length).toBeGreaterThan(0);
    expect(JSON.stringify(root.toJSON())).toContain('You landed');
    expect(JSON.stringify(root.toJSON())).not.toContain('You just landed');
  });

  it('shows no banner when isFirstLace is false', async () => {
    const root = await mountWithNoteProvider(
      <CompletedSesh summary={summary} isFirstLace={false} onReset={noop} onRepeat={noop} />,
    );

    expect(findBanner(root)).toHaveLength(0);
  });
});

describe('CompletedSesh note prompt', () => {
  const lacedSummary: SeshSummary = {
    trick: TRICK,
    plan: PLAN,
    startedAt: 0,
    endedAt: 5000,
    durationMs: 5000,
    landings: [landing(1000)],
  };

  const unlacedSummary: SeshSummary = {
    trick: TRICK,
    plan: PLAN,
    startedAt: 0,
    endedAt: 5000,
    durationMs: 5000,
    landings: [],
  };

  it('shows laced copy for a timed sesh with at least one landing', async () => {
    const root = await mountWithNoteProvider(
      <CompletedSesh summary={lacedSummary} isFirstLace={false} onReset={noop} onRepeat={noop} />,
    );

    const text = JSON.stringify(root.toJSON());
    expect(text).toContain('Landed it.');
    expect(text).not.toContain("Didn't land it this time.");
  });

  it('shows no-lace copy for a timed sesh with zero landings', async () => {
    const root = await mountWithNoteProvider(
      <CompletedSesh summary={unlacedSummary} isFirstLace={false} onReset={noop} onRepeat={noop} />,
    );

    const text = JSON.stringify(root.toJSON());
    expect(text).toContain("Didn't land it this time.");
    expect(text).not.toContain('Landed it.');
  });

  it.each([
    ['a laced sesh', lacedSummary],
    ['an unlaced sesh', unlacedSummary],
  ])('carries the correct practice-session reference for %s', async (_label, summary) => {
    const root = await mountWithNoteProvider(
      <>
        <CompletedSesh summary={summary} isFirstLace={false} onReset={noop} onRepeat={noop} />
        <LatestNotePracticeSessionId />
      </>,
    );

    act(() => {
      pressByAccessibilityLabel(root, 'Add a note');
    });

    const [input] = findByAccessibilityLabel(root, 'Note body');
    act(() => {
      input.props.onChangeText('What worked and what didn\'t.');
    });

    act(() => {
      pressByAccessibilityLabel(root, 'Save note');
    });

    const expectedId = createPracticeSessionRecordId(summary);
    expect(
      findByAccessibilityLabel(root, `latest-note-practice-session-id:${expectedId}`).length,
    ).toBeGreaterThan(0);
  });
});

function buildCountGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'goal-1',
    trickId: TRICK.id,
    trickName: TRICK.name,
    createdAt: 1000,
    kind: 'count',
    targetCount: 3,
    ...overrides,
  } as Goal;
}

function buildTimeGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'goal-time-1',
    trickId: TRICK.id,
    trickName: TRICK.name,
    createdAt: 1000,
    kind: 'time',
    targetMs: 10_000,
    ...overrides,
  } as Goal;
}

function buildSessionRecord(overrides: Partial<PracticeSessionRecord> = {}): PracticeSessionRecord {
  return {
    id: 'session-1',
    trickId: TRICK.id,
    trickName: TRICK.name,
    startedAt: 0,
    completedAt: 5000,
    durationMs: 5000,
    laceCount: 1,
    ...overrides,
  };
}

describe('CompletedSesh goals panel', () => {
  const summary: SeshSummary = {
    trick: TRICK,
    plan: PLAN,
    startedAt: 0,
    endedAt: 5000,
    durationMs: 5000,
    landings: [landing(1000)],
  };

  it('renders the goal and its progress for the practiced trick', async () => {
    const goals = [buildCountGoal({ targetCount: 3 })];
    const sessions = [buildSessionRecord({ laceCount: 2 })];

    const root = await mountWithNoteProvider(
      <CompletedSesh
        summary={summary}
        isFirstLace={false}
        onReset={noop}
        onRepeat={noop}
        goals={goals}
        sessions={sessions}
      />,
    );

    const text = JSON.stringify(root.toJSON());
    expect(text).toContain('2 / 3 laces');
  });

  it('renders no goals section when the trick has no goals', async () => {
    const root = await mountWithNoteProvider(
      <CompletedSesh
        summary={summary}
        isFirstLace={false}
        onReset={noop}
        onRepeat={noop}
        goals={[]}
        sessions={[]}
      />,
    );

    const text = JSON.stringify(root.toJSON());
    expect(text).not.toContain('Lace count goal');
    expect(text).not.toContain('Practice time goal');
  });
});

describe('CompletedSesh goals panel ordering (regression)', () => {
  // Regression coverage for the off-by-one-sesh trap: Sesh.tsx must read goals/sessions live
  // from the providers at render, not from a snapshot captured before recordCompletedSesh runs.
  // A props-only test can't catch a mistake at that wiring level, so this harness mounts the
  // real providers and drives both actions directly, mirroring the Harness pattern in
  // kentei-rank-auto-promotion.test.tsx.

  const summary: SeshSummary = {
    trick: TRICK,
    plan: PLAN,
    startedAt: 0,
    endedAt: 5000,
    durationMs: 5000,
    landings: [landing(1000), landing(2000)],
  };

  function Harness() {
    const { goals } = useGoals();
    const { addGoal } = useGoalActions();
    const { sessions } = usePracticeHistory();
    const { recordCompletedSesh } = usePracticeHistoryActions();

    return (
      <>
        <Pressable
          accessibilityLabel="add-count-goal"
          onPress={() =>
            addGoal({ kind: 'count', trickId: TRICK.id, trickName: TRICK.name, targetCount: 3 })
          }
        />
        <Pressable
          accessibilityLabel="record-sesh"
          onPress={() => recordCompletedSesh(summary)}
        />
        <CompletedSesh
          summary={summary}
          isFirstLace={false}
          onReset={noop}
          onRepeat={noop}
          goals={goals}
          sessions={sessions}
        />
      </>
    );
  }

  async function mountHarness() {
    let root!: ReactTestRenderer;
    await act(async () => {
      root = create(
        <NoteProvider>
          <GoalProvider>
            <PracticeHistoryProvider>
              <Harness />
            </PracticeHistoryProvider>
          </GoalProvider>
        </NoteProvider>,
      );
    });
    return root;
  }

  it('reflects the just-completed sesh in goal progress, not the sesh before it', async () => {
    // The goal is created against a real Date.now() timestamp, but this fixture's sesh
    // uses a fixed, unrealistic `summary.endedAt` (5000) as its completed-session timestamp.
    // Pin Date.now() so the goal's createdAt precedes that fixed completedAt, matching
    // production where both timestamps come from the same real clock.
    const dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(0);
    try {
      const root = await mountHarness();

      act(() => {
        pressByAccessibilityLabel(root, 'add-count-goal');
      });

      // Before the sesh is recorded, progress should show zero landings toward the goal.
      expect(JSON.stringify(root.toJSON())).toContain('0 / 3 laces');

      act(() => {
        pressByAccessibilityLabel(root, 'record-sesh');
      });

      // After recordCompletedSesh runs, progress must include this sesh's 2 landings — not be
      // stale by one sesh.
      expect(JSON.stringify(root.toJSON())).toContain('2 / 3 laces');
    } finally {
      dateNowSpy.mockRestore();
    }
  });
});

describe('ActiveSesh trick notes', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders the notes panel with existing note text for a trick that has notes', () => {
    const note = buildNote({ body: 'Keep the elbow tucked in on the release.' });
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
          hadPriorLaceAtSeshStart={false}
          trickNotes={[note]}
          onLaced={noop}
          onPause={noop}
          onResume={noop}
          onEnd={noop}
          onTimerElapsed={noop}
        />,
      );
    });

    expect(findByAccessibilityLabel(root, 'Notes from previous sessions').length).toBeGreaterThan(0);
    expect(JSON.stringify(root.toJSON())).toContain('Keep the elbow tucked in on the release.');

    act(() => {
      root.unmount();
    });
  });

  it('renders no notes section for a trick with no existing notes', () => {
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
          hadPriorLaceAtSeshStart={false}
          trickNotes={[]}
          onLaced={noop}
          onPause={noop}
          onResume={noop}
          onEnd={noop}
          onTimerElapsed={noop}
        />,
      );
    });

    expect(findByAccessibilityLabel(root, 'Notes from previous sessions')).toHaveLength(0);

    act(() => {
      root.unmount();
    });
  });
});

describe('ActiveSesh goal celebration - count-based goals', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows the banner on the landing that crosses the target, and not on later landings', () => {
    const goal = buildCountGoal({ targetCount: 3 });
    const baseline: GoalProgress = { goal, current: 2, target: 3, achieved: false };

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
          hadPriorLaceAtSeshStart={true}
          goalBaselines={[baseline]}
          onLaced={noop}
          onPause={noop}
          onResume={noop}
          onEnd={noop}
          onTimerElapsed={noop}
        />,
      );
    });

    expect(findGoalBanner(root, goal)).toHaveLength(0);

    act(() => {
      root.update(
        <ActiveSesh
          trick={TRICK}
          plan={PLAN}
          startedAt={Date.now()}
          landings={[landing(1000)]}
          pausedDurationMs={0}
          liveChallengeEnabled={false}
          hadPriorLaceAtSeshStart={true}
          goalBaselines={[baseline]}
          onLaced={noop}
          onPause={noop}
          onResume={noop}
          onEnd={noop}
          onTimerElapsed={noop}
        />,
      );
    });

    expect(findGoalBanner(root, goal).length).toBeGreaterThan(0);
    expect(JSON.stringify(root.toJSON())).toContain('You just reached your goal');

    act(() => {
      root.update(
        <ActiveSesh
          trick={TRICK}
          plan={PLAN}
          startedAt={Date.now()}
          landings={[landing(1000), landing(2000)]}
          pausedDurationMs={0}
          liveChallengeEnabled={false}
          hadPriorLaceAtSeshStart={true}
          goalBaselines={[baseline]}
          onLaced={noop}
          onPause={noop}
          onResume={noop}
          onEnd={noop}
          onTimerElapsed={noop}
        />,
      );
    });

    expect(findGoalBanner(root, goal)).toHaveLength(0);

    act(() => {
      root.unmount();
    });
  });

  it('auto-dismisses a count-goal banner a few seconds after it appears, with no further Laced press', () => {
    const goal = buildCountGoal({ targetCount: 3 });
    const baseline: GoalProgress = { goal, current: 2, target: 3, achieved: false };

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
          hadPriorLaceAtSeshStart={true}
          goalBaselines={[baseline]}
          onLaced={noop}
          onPause={noop}
          onResume={noop}
          onEnd={noop}
          onTimerElapsed={noop}
        />,
      );
    });

    act(() => {
      root.update(
        <ActiveSesh
          trick={TRICK}
          plan={PLAN}
          startedAt={Date.now()}
          landings={[landing(1000)]}
          pausedDurationMs={0}
          liveChallengeEnabled={false}
          hadPriorLaceAtSeshStart={true}
          goalBaselines={[baseline]}
          onLaced={noop}
          onPause={noop}
          onResume={noop}
          onEnd={noop}
          onTimerElapsed={noop}
        />,
      );
    });

    expect(findGoalBanner(root, goal).length).toBeGreaterThan(0);

    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(findGoalBanner(root, goal).length).toBeGreaterThan(0);

    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(findGoalBanner(root, goal)).toHaveLength(0);

    act(() => {
      root.unmount();
    });
  });

  it('never celebrates a goal that was already achieved before the sesh started', () => {
    const goal = buildCountGoal({ targetCount: 3 });
    const baseline: GoalProgress = { goal, current: 3, target: 3, achieved: true };

    let root!: ReactTestRenderer;
    act(() => {
      root = create(
        <ActiveSesh
          trick={TRICK}
          plan={PLAN}
          startedAt={Date.now()}
          landings={[landing(1000), landing(2000), landing(3000)]}
          pausedDurationMs={0}
          liveChallengeEnabled={false}
          hadPriorLaceAtSeshStart={true}
          goalBaselines={[baseline]}
          onLaced={noop}
          onPause={noop}
          onResume={noop}
          onEnd={noop}
          onTimerElapsed={noop}
        />,
      );
    });

    expect(findGoalBanner(root, goal)).toHaveLength(0);

    act(() => {
      root.unmount();
    });
  });
});

describe('ActiveSesh personal-best celebration', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows the banner on the landing that beats the best, not on the tie, and not on the next landing', () => {
    let root!: ReactTestRenderer;
    act(() => {
      root = create(
        <ActiveSesh
          trick={TRICK}
          plan={PLAN}
          startedAt={Date.now()}
          landings={[landing(1000)]}
          pausedDurationMs={0}
          personalBest={2}
          liveChallengeEnabled={false}
          hadPriorLaceAtSeshStart={true}
          onLaced={noop}
          onPause={noop}
          onResume={noop}
          onEnd={noop}
          onTimerElapsed={noop}
        />,
      );
    });

    expect(findPersonalBestBanner(root, TRICK.name)).toHaveLength(0);

    act(() => {
      root.update(
        <ActiveSesh
          trick={TRICK}
          plan={PLAN}
          startedAt={Date.now()}
          landings={[landing(1000), landing(2000)]}
          pausedDurationMs={0}
          personalBest={2}
          liveChallengeEnabled={false}
          hadPriorLaceAtSeshStart={true}
          onLaced={noop}
          onPause={noop}
          onResume={noop}
          onEnd={noop}
          onTimerElapsed={noop}
        />,
      );
    });

    expect(findPersonalBestBanner(root, TRICK.name)).toHaveLength(0);

    act(() => {
      root.update(
        <ActiveSesh
          trick={TRICK}
          plan={PLAN}
          startedAt={Date.now()}
          landings={[landing(1000), landing(2000), landing(3000)]}
          pausedDurationMs={0}
          personalBest={2}
          liveChallengeEnabled={false}
          hadPriorLaceAtSeshStart={true}
          onLaced={noop}
          onPause={noop}
          onResume={noop}
          onEnd={noop}
          onTimerElapsed={noop}
        />,
      );
    });

    expect(findPersonalBestBanner(root, TRICK.name).length).toBeGreaterThan(0);
    expect(JSON.stringify(root.toJSON())).toContain('New personal best');

    act(() => {
      root.update(
        <ActiveSesh
          trick={TRICK}
          plan={PLAN}
          startedAt={Date.now()}
          landings={[landing(1000), landing(2000), landing(3000), landing(4000)]}
          pausedDurationMs={0}
          personalBest={2}
          liveChallengeEnabled={false}
          hadPriorLaceAtSeshStart={true}
          onLaced={noop}
          onPause={noop}
          onResume={noop}
          onEnd={noop}
          onTimerElapsed={noop}
        />,
      );
    });

    expect(findPersonalBestBanner(root, TRICK.name)).toHaveLength(0);

    act(() => {
      root.unmount();
    });
  });

  it('auto-dismisses the personal-best banner a few seconds after it appears, with no further Laced press', () => {
    let root!: ReactTestRenderer;
    act(() => {
      root = create(
        <ActiveSesh
          trick={TRICK}
          plan={PLAN}
          startedAt={Date.now()}
          landings={[landing(1000), landing(2000)]}
          pausedDurationMs={0}
          personalBest={2}
          liveChallengeEnabled={false}
          hadPriorLaceAtSeshStart={true}
          onLaced={noop}
          onPause={noop}
          onResume={noop}
          onEnd={noop}
          onTimerElapsed={noop}
        />,
      );
    });

    act(() => {
      root.update(
        <ActiveSesh
          trick={TRICK}
          plan={PLAN}
          startedAt={Date.now()}
          landings={[landing(1000), landing(2000), landing(3000)]}
          pausedDurationMs={0}
          personalBest={2}
          liveChallengeEnabled={false}
          hadPriorLaceAtSeshStart={true}
          onLaced={noop}
          onPause={noop}
          onResume={noop}
          onEnd={noop}
          onTimerElapsed={noop}
        />,
      );
    });

    expect(findPersonalBestBanner(root, TRICK.name).length).toBeGreaterThan(0);

    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(findPersonalBestBanner(root, TRICK.name).length).toBeGreaterThan(0);

    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(findPersonalBestBanner(root, TRICK.name)).toHaveLength(0);

    act(() => {
      root.unmount();
    });
  });

  it('never celebrates when there is no comparable prior attempt (personalBest is undefined)', () => {
    let root!: ReactTestRenderer;
    act(() => {
      root = create(
        <ActiveSesh
          trick={TRICK}
          plan={PLAN}
          startedAt={Date.now()}
          landings={[]}
          pausedDurationMs={0}
          personalBest={undefined}
          liveChallengeEnabled={false}
          hadPriorLaceAtSeshStart={false}
          onLaced={noop}
          onPause={noop}
          onResume={noop}
          onEnd={noop}
          onTimerElapsed={noop}
        />,
      );
    });

    for (const count of [1, 2, 3, 4]) {
      act(() => {
        root.update(
          <ActiveSesh
            trick={TRICK}
            plan={PLAN}
            startedAt={Date.now()}
            landings={Array.from({ length: count }, (_, i) => landing((i + 1) * 1000))}
            pausedDurationMs={0}
            personalBest={undefined}
            liveChallengeEnabled={false}
            hadPriorLaceAtSeshStart={false}
            onLaced={noop}
            onPause={noop}
            onResume={noop}
            onEnd={noop}
            onTimerElapsed={noop}
          />,
        );
      });

      expect(findPersonalBestBanner(root, TRICK.name)).toHaveLength(0);
    }

    act(() => {
      root.unmount();
    });
  });
});

describe('ActiveSesh goal celebration - time-based goals', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows the banner exactly once when elapsed time crosses the target, then auto-dismisses and does not reappear', () => {
    const goal = buildTimeGoal({ targetMs: 10_000 });
    const baseline: GoalProgress = { goal, current: 9_000, target: 10_000, achieved: false };
    const startedAt = Date.now();

    let root!: ReactTestRenderer;
    act(() => {
      root = create(
        <ActiveSesh
          trick={TRICK}
          plan={PLAN}
          startedAt={startedAt}
          landings={[]}
          pausedDurationMs={0}
          liveChallengeEnabled={false}
          hadPriorLaceAtSeshStart={true}
          goalBaselines={[baseline]}
          onLaced={noop}
          onPause={noop}
          onResume={noop}
          onEnd={noop}
          onTimerElapsed={noop}
        />,
      );
    });

    expect(findGoalBanner(root, goal)).toHaveLength(0);

    // Elapsed time is under the 1,000ms needed to cross the goal — no celebration yet.
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(findGoalBanner(root, goal)).toHaveLength(0);

    // Crossing the target with no user action (no landings) should latch the celebration.
    act(() => {
      jest.advanceTimersByTime(1_000);
    });
    const bannerCountAfterCrossing = findGoalBanner(root, goal).length;
    expect(bannerCountAfterCrossing).toBeGreaterThan(0);
    expect(JSON.stringify(root.toJSON())).toContain('You just reached your goal');

    // Further ticks (the timer keeps crossing the already-met target every render) must not
    // re-add or duplicate the celebration.
    act(() => {
      jest.advanceTimersByTime(2_000);
    });
    expect(findGoalBanner(root, goal)).toHaveLength(bannerCountAfterCrossing);

    // Once the auto-dismiss window elapses, the banner goes away on its own — and stays gone on
    // subsequent ticks even though elapsed time (and crossedTimeGoalIds) is still past the goal.
    // Advance in small steps (matching useNow's 250ms polling interval): a single large jump
    // here can, under jest's fake timers, fail to flush a setTimeout that a component schedules
    // from an effect triggered mid-advance by that same polling interval.
    for (let i = 0; i < 16; i += 1) {
      act(() => {
        jest.advanceTimersByTime(250);
      });
    }
    expect(findGoalBanner(root, goal)).toHaveLength(0);

    for (let i = 0; i < 8; i += 1) {
      act(() => {
        jest.advanceTimersByTime(250);
      });
    }
    expect(findGoalBanner(root, goal)).toHaveLength(0);

    act(() => {
      root.unmount();
    });
  });
});

describe('CompletedSesh goal celebration', () => {
  const summary: SeshSummary = {
    trick: TRICK,
    plan: PLAN,
    startedAt: 0,
    endedAt: 5000,
    durationMs: 5000,
    landings: [landing(1000)],
  };

  it('shows the past-tense wrap-up banner for a goal in justAchievedGoals', async () => {
    const goal = buildCountGoal({ targetCount: 3 });
    const root = await mountWithNoteProvider(
      <CompletedSesh
        summary={summary}
        isFirstLace={false}
        justAchievedGoals={[goal]}
        onReset={noop}
        onRepeat={noop}
      />,
    );

    expect(findGoalBanner(root, goal).length).toBeGreaterThan(0);
    expect(JSON.stringify(root.toJSON())).toContain('You reached your goal');
    expect(JSON.stringify(root.toJSON())).not.toContain('You just reached your goal');
  });

  it('shows no wrap-up celebration for a goal already achieved before this sesh', async () => {
    const goal = buildCountGoal({ targetCount: 3 });
    const root = await mountWithNoteProvider(
      <CompletedSesh
        summary={summary}
        isFirstLace={false}
        justAchievedGoals={[]}
        onReset={noop}
        onRepeat={noop}
      />,
    );

    expect(findGoalBanner(root, goal)).toHaveLength(0);
  });
});

describe('Sesh wiring - goal celebration ordering (regression)', () => {
  // Regression coverage for computing the wrap-up celebration from a stale baseline: Sesh's
  // completion effect must read `sessions` as they were *before* recordCompletedSesh runs for
  // this sesh, mirroring the ordering guarantee isFirstLaceForTrick relies on. If the baseline
  // were (incorrectly) computed from post-record sessions, a goal crossed entirely within this
  // sesh would look "already achieved" and never celebrate.

  function Harness() {
    const { addGoal } = useGoalActions();
    return (
      <>
        <Pressable
          accessibilityLabel="add-count-goal"
          onPress={() =>
            addGoal({ kind: 'count', trickId: TRICK.id, trickName: TRICK.name, targetCount: 3 })
          }
        />
        <Sesh availableTricks={[TRICK]} selectedTrickIds={[TRICK.id]} />
      </>
    );
  }

  async function mountHarness() {
    let root!: ReactTestRenderer;
    await act(async () => {
      root = create(
        <NoteProvider>
          <GoalProvider>
            <PracticeHistoryProvider>
              <UserProfileProvider>
                <Harness />
              </UserProfileProvider>
            </PracticeHistoryProvider>
          </GoalProvider>
        </NoteProvider>,
      );
    });
    return root;
  }

  it('celebrates a goal crossed entirely within this sesh, computed from pre-sesh history', async () => {
    jest.useFakeTimers();
    try {
      const root = await mountHarness();

      act(() => {
        pressByAccessibilityLabel(root, 'add-count-goal');
      });

      act(() => {
        pressByAccessibilityLabel(root, `Start a sesh with ${TRICK.name}`);
      });

      // Countdown ticks down from 3, one setTimeout(1000ms) step at a time.
      act(() => {
        jest.advanceTimersByTime(1000);
      });
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
        pressByAccessibilityLabel(root, 'Laced');
      });
      act(() => {
        pressByAccessibilityLabel(root, 'Laced');
      });

      act(() => {
        pressByVisibleText(root, 'End Sesh');
      });

      const text = JSON.stringify(root.toJSON());
      expect(text).toContain('You reached your goal');
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('Sesh single-trick entry point - "Next trick" absence', () => {
  // Sesh's call to ActiveSesh never supplies onNextTrick, so the control must never appear
  // during a real single-trick sesh, not just when testing ActiveSesh in isolation.

  async function mountSesh() {
    let root!: ReactTestRenderer;
    await act(async () => {
      root = create(
        <NoteProvider>
          <GoalProvider>
            <PracticeHistoryProvider>
              <UserProfileProvider>
                <Sesh availableTricks={[TRICK]} selectedTrickIds={[TRICK.id]} />
              </UserProfileProvider>
            </PracticeHistoryProvider>
          </GoalProvider>
        </NoteProvider>,
      );
    });
    return root;
  }

  it('never renders "Next trick" during an active single-trick sesh', async () => {
    jest.useFakeTimers();
    try {
      const root = await mountSesh();

      act(() => {
        pressByAccessibilityLabel(root, `Start a sesh with ${TRICK.name}`);
      });

      // Countdown ticks down from 3, one setTimeout(1000ms) step at a time.
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      expect(root.root.findAll((node) => node.props.children === 'Next trick')).toHaveLength(0);

      act(() => {
        root.unmount();
      });
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('Sesh regular practice origin (T062.1)', () => {
  // Regular single-trick Sesh never passes an origin prop, so a completed run's practice-history
  // record must carry no origin — distinguishing it from the Kentei assessment flow's tagged
  // records at read time.

  function Harness() {
    const { sessions } = usePracticeHistory();
    return (
      <>
        {sessions.map((session, index) => (
          <Text
            key={session.id}
            accessibilityLabel={`session-${index}-origin:${session.origin ?? 'none'}`}
          />
        ))}
        <Sesh availableTricks={[TRICK]} selectedTrickIds={[TRICK.id]} />
      </>
    );
  }

  async function mountHarness() {
    let root!: ReactTestRenderer;
    await act(async () => {
      root = create(
        <NoteProvider>
          <GoalProvider>
            <PracticeHistoryProvider>
              <UserProfileProvider>
                <Harness />
              </UserProfileProvider>
            </PracticeHistoryProvider>
          </GoalProvider>
        </NoteProvider>,
      );
    });
    return root;
  }

  it('records a completed sesh with no origin', async () => {
    await AsyncStorage.clear();
    jest.useFakeTimers();
    try {
      const root = await mountHarness();

      act(() => {
        pressByAccessibilityLabel(root, `Start a sesh with ${TRICK.name}`);
      });

      act(() => {
        jest.advanceTimersByTime(1000);
      });
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
        pressByVisibleText(root, 'End Sesh');
      });

      expect(findByAccessibilityLabel(root, 'session-0-origin:none').length).toBeGreaterThan(0);

      act(() => {
        root.unmount();
      });
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('Sesh wiring - countdown cancel (T047)', () => {
  // A user who starts a sesh by accident must be able to back out during the countdown, before
  // any practice history is recorded, and land back on the trick picker.

  function Harness() {
    const { sessions } = usePracticeHistory();
    return (
      <>
        <Text accessibilityLabel={`session-count:${sessions.length}`} />
        <Sesh availableTricks={[TRICK]} selectedTrickIds={[TRICK.id]} />
      </>
    );
  }

  async function mountHarness() {
    let root!: ReactTestRenderer;
    await act(async () => {
      root = create(
        <NoteProvider>
          <GoalProvider>
            <PracticeHistoryProvider>
              <UserProfileProvider>
                <Harness />
              </UserProfileProvider>
            </PracticeHistoryProvider>
          </GoalProvider>
        </NoteProvider>,
      );
    });
    return root;
  }

  it('returns to the trick picker without recording a session when Cancel is pressed mid-countdown', async () => {
    await AsyncStorage.clear();
    jest.useFakeTimers();
    try {
      const root = await mountHarness();

      act(() => {
        pressByAccessibilityLabel(root, `Start a sesh with ${TRICK.name}`);
      });

      // Advance partway through the countdown, but not to completion — proving cancellation
      // during the countdown, not after it would have naturally completed.
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      expect(root.root.findAll((node) => node.props.children === 'Get ready').length).toBeGreaterThan(0);

      act(() => {
        pressByVisibleText(root, 'Cancel');
      });

      expect(findByAccessibilityLabel(root, `Start a sesh with ${TRICK.name}`).length).toBeGreaterThan(0);
      expect(root.root.findAll((node) => node.props.children === 'Get ready')).toHaveLength(0);
      expect(findByAccessibilityLabel(root, 'session-count:0').length).toBeGreaterThan(0);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('Countdown rank standing', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders the rank/class label when showRankStanding is true and the trick carries Kentei metadata', () => {
    let root!: ReactTestRenderer;
    act(() => {
      root = create(
        <Countdown trick={TRICK_WITH_KENTEI} plan={PLAN} onComplete={noop} showRankStanding />,
      );
    });

    expect(JSON.stringify(root.toJSON())).toContain('Rank 5 · 3rd Class · Basic');

    act(() => {
      root.unmount();
    });
  });

  it('renders nothing when showRankStanding is omitted', () => {
    let root!: ReactTestRenderer;
    act(() => {
      root = create(<Countdown trick={TRICK_WITH_KENTEI} plan={PLAN} onComplete={noop} />);
    });

    expect(JSON.stringify(root.toJSON())).not.toContain('Rank 5');
    expect(JSON.stringify(root.toJSON())).not.toContain('Skip');

    act(() => {
      root.unmount();
    });
  });

  it('renders nothing when showRankStanding is true but the trick lacks Kentei metadata', () => {
    let root!: ReactTestRenderer;
    act(() => {
      root = create(<Countdown trick={TRICK} plan={PLAN} onComplete={noop} showRankStanding />);
    });

    expect(JSON.stringify(root.toJSON())).not.toContain('Rank');

    act(() => {
      root.unmount();
    });
  });
});

describe('ActiveSesh rank standing', () => {
  it('renders the rank/class label when showRankStanding is true and the trick carries Kentei metadata', () => {
    let root!: ReactTestRenderer;
    act(() => {
      root = create(
        <ActiveSesh
          trick={TRICK_WITH_KENTEI}
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
          showRankStanding
        />,
      );
    });

    expect(JSON.stringify(root.toJSON())).toContain('Rank 5 · 3rd Class · Basic');

    act(() => {
      root.unmount();
    });
  });

  it('renders nothing when showRankStanding is omitted', () => {
    let root!: ReactTestRenderer;
    act(() => {
      root = create(
        <ActiveSesh
          trick={TRICK_WITH_KENTEI}
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

    expect(JSON.stringify(root.toJSON())).not.toContain('Rank 5');

    act(() => {
      root.unmount();
    });
  });

  it('renders nothing when showRankStanding is true but the trick lacks Kentei metadata', () => {
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
          showRankStanding
        />,
      );
    });

    expect(JSON.stringify(root.toJSON())).not.toContain('Rank');

    act(() => {
      root.unmount();
    });
  });
});


describe('Sesh quick-start variant (T063)', () => {
  // quickStart is the signal a practice entry point (Tricks-row Practice, Stats "Needs
  // attention" Practice, Home "Practice again"/"In rotation", Stats trick-detail Challenge)
  // sends alongside trickId -- it must render only the preselected trick and a Start-sesh
  // action, never the full format/duration/trick-list picker.

  const OTHER_TRICK: PracticeTrick = { id: 'lighthouse-flip', name: 'Lighthouse Flip' };

  async function mountSesh(props: Partial<ComponentProps<typeof Sesh>> = {}) {
    let root!: ReactTestRenderer;
    await act(async () => {
      root = create(
        <NoteProvider>
          <GoalProvider>
            <PracticeHistoryProvider>
              <UserProfileProvider>
                <Sesh
                  availableTricks={[TRICK, OTHER_TRICK]}
                  selectedTrickIds={[TRICK.id, OTHER_TRICK.id]}
                  {...props}
                />
              </UserProfileProvider>
            </PracticeHistoryProvider>
          </GoalProvider>
        </NoteProvider>,
      );
    });
    return root;
  }

  it('renders only the preselected trick and a Start-sesh action, no format/duration/trick-list UI', async () => {
    const root = await mountSesh({ quickStart: true, preferredTrickId: TRICK.id });

    const text = JSON.stringify(root.toJSON());
    expect(text).toContain(TRICK.name);
    expect(text).not.toContain(OTHER_TRICK.name);
    expect(text).not.toContain('Timed');
    expect(text).not.toContain('Open-ended');
    expect(text).not.toContain('Practice format');
    expect(findByAccessibilityLabel(root, `Start a sesh with ${TRICK.name}`).length).toBeGreaterThan(0);

    act(() => {
      root.unmount();
    });
  });

  it("pressing Start sesh begins that trick's countdown", async () => {
    jest.useFakeTimers();
    try {
      const root = await mountSesh({ quickStart: true, preferredTrickId: TRICK.id });

      act(() => {
        pressByAccessibilityLabel(root, `Start a sesh with ${TRICK.name}`);
      });

      expect(JSON.stringify(root.toJSON())).toContain('Get ready');

      act(() => {
        root.unmount();
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('falls back to the full picker when the preselected trick is not practiceable', async () => {
    const root = await mountSesh({ quickStart: true, preferredTrickId: 'not-a-real-trick' });

    const text = JSON.stringify(root.toJSON());
    expect(text).toContain('Practice format');
    expect(text).toContain(TRICK.name);
    expect(text).toContain(OTHER_TRICK.name);

    act(() => {
      root.unmount();
    });
  });

  it('still renders the full picker with "Up next" when quickStart is not set (plain visit, incl. lastSesh)', async () => {
    const root = await mountSesh({ preferredTrickId: TRICK.id });

    const text = JSON.stringify(root.toJSON());
    expect(text).toContain('Practice format');
    expect(text).toContain('Up next');
    expect(text).toContain(OTHER_TRICK.name);

    act(() => {
      root.unmount();
    });
  });
});

describe('Sesh multi-trick entry (T071)', () => {
  async function mountSeshHome() {
    let root!: ReactTestRenderer;
    await act(async () => {
      root = create(
        <NoteProvider>
          <GoalProvider>
            <PracticeHistoryProvider>
              <UserProfileProvider>
                <Sesh
                  availableTricks={[TRICK]}
                  selectedTrickIds={[TRICK.id]}
                />
              </UserProfileProvider>
            </PracticeHistoryProvider>
          </GoalProvider>
        </NoteProvider>,
      );
    });
    return root;
  }

  it('renders an accessible multi-trick route action while retaining single-trick controls', async () => {
    const root = await mountSeshHome();

    const [multiTrickAction] = root.root.findAll(
      (node) =>
        node.props.accessibilityRole === 'link' &&
        node.props.accessibilityLabel === 'Practice several tricks',
    );
    expect(multiTrickAction).toBeDefined();
    expect(multiTrickAction.props.href).toBe('/sesh/multi-trick');
    expect(JSON.stringify(root.toJSON())).toContain('Build a line and work through it one trick at a time.');

    const text = JSON.stringify(root.toJSON());
    expect(text).toContain('Practice format');
    expect(text).toContain('Timed');
    expect(text).toContain('Open-ended');
    expect(findByAccessibilityLabel(root, 'Sesh duration in minutes').length).toBeGreaterThan(0);

    act(() => {
      root.unmount();
    });
  });
});
