import AsyncStorage from '@react-native-async-storage/async-storage';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { ComponentProps, ReactElement } from 'react';
import { Pressable, Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { ThemeProvider as StyledThemeProvider, type DefaultTheme } from 'styled-components/native';

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

describe('CompletedSesh signup invite', () => {
  const summary: SeshSummary = {
    trick: TRICK,
    plan: PLAN,
    startedAt: 0,
    endedAt: 5000,
    durationMs: 5000,
    landings: [landing(1000)],
  };

  it('renders the invite with a link to sign-up when showSignupInvite is true', async () => {
    const root = await mountWithNoteProvider(
      <CompletedSesh
        summary={summary}
        isFirstLace={false}
        showSignupInvite={true}
        onReset={noop}
        onRepeat={noop}
      />,
    );

    expect(findByAccessibilityLabel(root, 'Guest signup invitation').length).toBeGreaterThan(0);
    const signUpLinks = root.root.findAll((node) => node.props.href === '/auth/sign-up');
    expect(signUpLinks.length).toBeGreaterThan(0);
  });

  it('dismisses the invite without changing the completed record', async () => {
    const root = await mountWithNoteProvider(
      <CompletedSesh
        summary={summary}
        isFirstLace={false}
        showSignupInvite={true}
        onReset={noop}
        onRepeat={noop}
      />,
    );

    const beforeText = JSON.stringify(root.toJSON());
    expect(beforeText).toContain(summary.trick.name);

    act(() => {
      pressByAccessibilityLabel(root, 'Dismiss signup invitation');
    });

    expect(findByAccessibilityLabel(root, 'Guest signup invitation')).toHaveLength(0);
    const afterText = JSON.stringify(root.toJSON());
    expect(afterText).toContain(summary.trick.name);
    expect(afterText).toContain(String(summary.landings.length));
  });

  it('does not render the invite when showSignupInvite is omitted (regression default)', async () => {
    const root = await mountWithNoteProvider(
      <CompletedSesh summary={summary} isFirstLace={false} onReset={noop} onRepeat={noop} />,
    );

    expect(findByAccessibilityLabel(root, 'Guest signup invitation')).toHaveLength(0);
  });

  it('does not render the invite when showSignupInvite is explicitly false', async () => {
    const root = await mountWithNoteProvider(
      <CompletedSesh
        summary={summary}
        isFirstLace={false}
        showSignupInvite={false}
        onReset={noop}
        onRepeat={noop}
      />,
    );

    expect(findByAccessibilityLabel(root, 'Guest signup invitation')).toHaveLength(0);
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
        <UserProfileProvider>
          <NoteProvider>
            <GoalProvider>
              <PracticeHistoryProvider>
                <Harness />
              </PracticeHistoryProvider>
            </GoalProvider>
          </NoteProvider>
        </UserProfileProvider>,
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
        <UserProfileProvider>
          <NoteProvider>
            <GoalProvider>
              <PracticeHistoryProvider>
                <Harness />
              </PracticeHistoryProvider>
            </GoalProvider>
          </NoteProvider>
        </UserProfileProvider>,
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

describe('Sesh signup invite integration', () => {
  // Practice history persists to the shared AsyncStorage mock across every test in this file.
  // These tests assert on "is this the first ever regular session" from a clean slate, so they
  // need genuinely empty persisted history rather than whatever earlier tests left behind.
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  function SessionCount() {
    const { sessions } = usePracticeHistory();
    return <Text accessibilityLabel={`session-count:${sessions.length}`} />;
  }

  async function mountSesh(authStatus?: ComponentProps<typeof Sesh>['authStatus']) {
    let root!: ReactTestRenderer;
    await act(async () => {
      root = create(
        <UserProfileProvider>
          <NoteProvider>
            <GoalProvider>
              <PracticeHistoryProvider>
                <Sesh
                  availableTricks={[TRICK]}
                  selectedTrickIds={[TRICK.id]}
                  authStatus={authStatus}
                />
                <SessionCount />
              </PracticeHistoryProvider>
            </GoalProvider>
          </NoteProvider>
        </UserProfileProvider>,
      );
    });
    return root;
  }

  function completeASesh(root: ReactTestRenderer, startLabel: string) {
    act(() => {
      pressByAccessibilityLabel(root, startLabel);
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
  }

  it('shows the invite for a guest completing their first sesh', async () => {
    jest.useFakeTimers();
    try {
      const root = await mountSesh('guest');
      completeASesh(root, `Start a sesh with ${TRICK.name}`);

      expect(findByAccessibilityLabel(root, 'Guest signup invitation').length).toBeGreaterThan(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not show the invite on a later completion in the same session', async () => {
    jest.useFakeTimers();
    try {
      const root = await mountSesh('guest');
      completeASesh(root, `Start a sesh with ${TRICK.name}`);
      expect(findByAccessibilityLabel(root, 'Guest signup invitation').length).toBeGreaterThan(0);

      act(() => {
        pressByVisibleText(root, 'Repeat sesh');
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

      expect(findByAccessibilityLabel(root, 'Guest signup invitation')).toHaveLength(0);
      expect(findByAccessibilityLabel(root, 'session-count:2').length).toBeGreaterThan(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('never shows the invite for an authenticated user, even on the first completion', async () => {
    jest.useFakeTimers();
    try {
      const root = await mountSesh('authenticated');
      completeASesh(root, `Start a sesh with ${TRICK.name}`);

      expect(findByAccessibilityLabel(root, 'Guest signup invitation')).toHaveLength(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('never shows the invite when authStatus is omitted (fail-closed default)', async () => {
    jest.useFakeTimers();
    try {
      const root = await mountSesh(undefined);
      completeASesh(root, `Start a sesh with ${TRICK.name}`);

      expect(findByAccessibilityLabel(root, 'Guest signup invitation')).toHaveLength(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not affect completion dedup or history whether the invite is dismissed or not', async () => {
    jest.useFakeTimers();
    try {
      const root = await mountSesh('guest');
      completeASesh(root, `Start a sesh with ${TRICK.name}`);

      expect(findByAccessibilityLabel(root, 'session-count:1').length).toBeGreaterThan(0);

      act(() => {
        pressByAccessibilityLabel(root, 'Dismiss signup invitation');
      });

      expect(findByAccessibilityLabel(root, 'session-count:1').length).toBeGreaterThan(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('a fresh mount with a persisted first regular session lands on the picker, never the invite (reload semantics)', async () => {
    // Sesh's reducer is plain in-memory React state -- no persistence of `state.status`. A real
    // page reload always restarts a fresh Sesh instance at 'choosing', which never renders
    // CompletedSesh (and therefore never the invite) regardless of practice-history content. This
    // test constructs the only thing "reload" can mean here: seed one regular session through the
    // real persistence path, unmount, then mount a brand-new tree that rehydrates it from
    // AsyncStorage -- landing on the picker, not on a stale completed screen.
    function SeedRecorder() {
      const { recordCompletedSesh } = usePracticeHistoryActions();
      return (
        <Pressable
          accessibilityLabel="seed-first-session"
          onPress={() =>
            recordCompletedSesh({
              trick: TRICK,
              plan: PLAN,
              startedAt: 0,
              endedAt: 5000,
              durationMs: 5000,
              landings: [landing(1000)],
            })
          }
        />
      );
    }

    let seedRoot!: ReactTestRenderer;
    await act(async () => {
      seedRoot = create(
        <PracticeHistoryProvider>
          <SeedRecorder />
        </PracticeHistoryProvider>,
      );
    });
    act(() => {
      pressByAccessibilityLabel(seedRoot, 'seed-first-session');
    });
    await act(async () => {
      seedRoot.unmount();
    });

    let root!: ReactTestRenderer;
    await act(async () => {
      root = create(
        <UserProfileProvider>
          <NoteProvider>
            <GoalProvider>
              <PracticeHistoryProvider>
                <Sesh availableTricks={[TRICK]} selectedTrickIds={[TRICK.id]} authStatus="guest" />
              </PracticeHistoryProvider>
            </GoalProvider>
          </NoteProvider>
        </UserProfileProvider>,
      );
    });

    expect(findByAccessibilityLabel(root, 'Guest signup invitation')).toHaveLength(0);
    expect(findByAccessibilityLabel(root, `Start a sesh with ${TRICK.name}`).length).toBeGreaterThan(0);
  });
});

describe('Sesh single-trick entry point - "Next trick" absence', () => {
  // Sesh's call to ActiveSesh never supplies onNextTrick, so the control must never appear
  // during a real single-trick sesh, not just when testing ActiveSesh in isolation.

  async function mountSesh() {
    let root!: ReactTestRenderer;
    await act(async () => {
      root = create(
        <UserProfileProvider>
          <NoteProvider>
            <GoalProvider>
              <PracticeHistoryProvider>
                <Sesh availableTricks={[TRICK]} selectedTrickIds={[TRICK.id]} />
              </PracticeHistoryProvider>
            </GoalProvider>
          </NoteProvider>
        </UserProfileProvider>,
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
        <UserProfileProvider>
          <NoteProvider>
            <GoalProvider>
              <PracticeHistoryProvider>
                <Harness />
              </PracticeHistoryProvider>
            </GoalProvider>
          </NoteProvider>
        </UserProfileProvider>,
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
        <UserProfileProvider>
          <NoteProvider>
            <GoalProvider>
              <PracticeHistoryProvider>
                <Harness />
              </PracticeHistoryProvider>
            </GoalProvider>
          </NoteProvider>
        </UserProfileProvider>,
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


describe('Sesh direct-practice planning (T077.2)', () => {

  const OTHER_TRICK: PracticeTrick = { id: 'lighthouse-flip', name: 'Lighthouse Flip' };

  async function mountSesh(props: Partial<ComponentProps<typeof Sesh>> = {}) {
    let root!: ReactTestRenderer;
    await act(async () => {
      root = create(
        <UserProfileProvider>
          <NoteProvider>
            <GoalProvider>
              <PracticeHistoryProvider>
                <Sesh
                  availableTricks={[TRICK, OTHER_TRICK]}
                  selectedTrickIds={[TRICK.id, OTHER_TRICK.id]}
                  {...props}
                />
              </PracticeHistoryProvider>
            </GoalProvider>
          </NoteProvider>
        </UserProfileProvider>,
      );
    });
    return root;
  }

  it('uses the normal picker while prioritizing the direct-practice trick', async () => {
    const root = await mountSesh({ preferredTrickId: TRICK.id });

    const text = JSON.stringify(root.toJSON());
    expect(text).toContain(TRICK.name);
    expect(text).toContain(OTHER_TRICK.name);
    expect(text).toContain('Timed');
    expect(text).toContain('Open-ended');
    expect(text).toContain('Practice format');
    const trickChoices = root.root.findAll(
      (node) =>
        typeof node.props.accessibilityLabel === 'string' &&
        node.props.accessibilityLabel.startsWith('Start a sesh with ') &&
        typeof node.props.onPress === 'function',
    );
    expect(trickChoices[0]?.props.accessibilityLabel).toBe(`Start a sesh with ${TRICK.name}`);
    expect(findByAccessibilityLabel(root, `Start a sesh with ${TRICK.name}`).length).toBeGreaterThan(0);

    act(() => {
      root.unmount();
    });
  });

  it("passes a customized timed plan into the linked trick's countdown", async () => {
    jest.useFakeTimers();
    try {
      const root = await mountSesh({ preferredTrickId: TRICK.id });

      act(() => {
        root.root.findByProps({ accessibilityLabel: 'Sesh duration in minutes' }).props.onChangeText('0');
      });
      const disabledChoice = root.root.find(
        (node) => node.props.accessibilityLabel === `Start a sesh with ${TRICK.name}`,
      );
      expect(disabledChoice.props.disabled).toBe(true);
      expect(JSON.stringify(root.toJSON())).toContain('Enter a whole number from 1 to 60.');

      act(() => {
        root.root.findByProps({ accessibilityLabel: 'Sesh duration in minutes' }).props.onChangeText('7');
      });

      act(() => {
        pressByAccessibilityLabel(root, `Start a sesh with ${TRICK.name}`);
      });

      expect(JSON.stringify(root.toJSON())).toContain('7:00 begins after the countdown.');

      act(() => {
        root.unmount();
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('passes a customized open-ended target into the linked trick session', async () => {
    jest.useFakeTimers();
    try {
      const root = await mountSesh({ preferredTrickId: TRICK.id });

      act(() => {
        pressByVisibleText(root, 'Open-ended');
      });
      act(() => {
        root.root.findByProps({ accessibilityLabel: 'Target lace count' }).props.onChangeText('0');
      });
      const disabledChoice = root.root.find(
        (node) => node.props.accessibilityLabel === `Start a sesh with ${TRICK.name}`,
      );
      expect(disabledChoice.props.disabled).toBe(true);
      expect(JSON.stringify(root.toJSON())).toContain('Enter a whole number from 1 to 999, or leave it blank.');

      act(() => {
        root.root.findByProps({ accessibilityLabel: 'Target lace count' }).props.onChangeText('3');
      });

      act(() => {
        pressByAccessibilityLabel(root, `Start a sesh with ${TRICK.name}`);
      });
      act(() => {
        jest.advanceTimersByTime(1_000);
      });
      act(() => {
        jest.advanceTimersByTime(1_000);
      });
      act(() => {
        jest.advanceTimersByTime(1_000);
      });
      act(() => {
        jest.advanceTimersByTime(1_000);
      });
      expect(JSON.stringify(root.toJSON())).toContain('0 of 3 to hit your target');

      act(() => {
        root.unmount();
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('falls back to the focused practice list when the preferred trick is unavailable', async () => {
    const root = await mountSesh({ preferredTrickId: 'not-a-real-trick' });

    const text = JSON.stringify(root.toJSON());
    expect(text).toContain('Practice format');
    expect(text).toContain(TRICK.name);
    expect(text).toContain(OTHER_TRICK.name);

    act(() => {
      root.unmount();
    });
  });

  it('keeps the plain visit picker behavior unchanged', async () => {
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

describe('Sesh direct-practice entry (T081)', () => {

  const OTHER_TRICK: PracticeTrick = { id: 'lighthouse-flip', name: 'Lighthouse Flip' };

  async function mountSesh(props: Partial<ComponentProps<typeof Sesh>> = {}) {
    let root!: ReactTestRenderer;
    await act(async () => {
      root = create(
        <UserProfileProvider>
          <NoteProvider>
            <GoalProvider>
              <PracticeHistoryProvider>
                <Sesh
                  availableTricks={[TRICK, OTHER_TRICK]}
                  selectedTrickIds={[TRICK.id, OTHER_TRICK.id]}
                  {...props}
                />
              </PracticeHistoryProvider>
            </GoalProvider>
          </NoteProvider>
        </UserProfileProvider>,
      );
    });
    return root;
  }

  it('renders only the linked trick, with no other trick cards shown', async () => {
    const root = await mountSesh({ directPracticeTrickId: TRICK.id });

    const text = JSON.stringify(root.toJSON());
    expect(text).toContain(`Start a sesh with ${TRICK.name}`);
    expect(text).not.toContain(OTHER_TRICK.name);
    expect(text).not.toContain('Practice several tricks');
    expect(findByAccessibilityLabel(root, `Start a sesh with ${TRICK.name}`).length).toBeGreaterThan(0);
    expect(findByAccessibilityLabel(root, `Start a sesh with ${OTHER_TRICK.name}`)).toHaveLength(0);

    act(() => {
      root.unmount();
    });
  });

  it("keeps the linked trick's timed plan editable before starting", async () => {
    jest.useFakeTimers();
    try {
      const root = await mountSesh({ directPracticeTrickId: TRICK.id });

      act(() => {
        root.root.findByProps({ accessibilityLabel: 'Sesh duration in minutes' }).props.onChangeText('0');
      });
      const disabledChoice = root.root.find(
        (node) => node.props.accessibilityLabel === `Start a sesh with ${TRICK.name}`,
      );
      expect(disabledChoice.props.disabled).toBe(true);
      expect(JSON.stringify(root.toJSON())).toContain('Enter a whole number from 1 to 60.');

      act(() => {
        root.root.findByProps({ accessibilityLabel: 'Sesh duration in minutes' }).props.onChangeText('7');
      });

      act(() => {
        pressByAccessibilityLabel(root, `Start a sesh with ${TRICK.name}`);
      });

      expect(JSON.stringify(root.toJSON())).toContain('7:00 begins after the countdown.');

      act(() => {
        root.unmount();
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps an open-ended target editable and carries it into the started session', async () => {
    jest.useFakeTimers();
    try {
      const root = await mountSesh({ directPracticeTrickId: TRICK.id });

      act(() => {
        pressByVisibleText(root, 'Open-ended');
      });
      act(() => {
        root.root.findByProps({ accessibilityLabel: 'Target lace count' }).props.onChangeText('0');
      });
      const disabledChoice = root.root.find(
        (node) => node.props.accessibilityLabel === `Start a sesh with ${TRICK.name}`,
      );
      expect(disabledChoice.props.disabled).toBe(true);
      expect(JSON.stringify(root.toJSON())).toContain('Enter a whole number from 1 to 999, or leave it blank.');

      act(() => {
        root.root.findByProps({ accessibilityLabel: 'Target lace count' }).props.onChangeText('3');
      });

      act(() => {
        pressByAccessibilityLabel(root, `Start a sesh with ${TRICK.name}`);
      });
      act(() => {
        jest.advanceTimersByTime(1_000);
      });
      act(() => {
        jest.advanceTimersByTime(1_000);
      });
      act(() => {
        jest.advanceTimersByTime(1_000);
      });
      act(() => {
        jest.advanceTimersByTime(1_000);
      });
      expect(JSON.stringify(root.toJSON())).toContain('0 of 3 to hit your target');

      act(() => {
        root.unmount();
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('returns to the standard multi-trick picker when "Cancel practice" is pressed', async () => {
    const root = await mountSesh({ directPracticeTrickId: TRICK.id });

    expect(findByAccessibilityLabel(root, 'Cancel practice').length).toBeGreaterThan(0);

    act(() => {
      pressByAccessibilityLabel(root, 'Cancel practice');
    });

    const text = JSON.stringify(root.toJSON());
    expect(text).toContain(`Start a sesh with ${TRICK.name}`);
    expect(text).toContain(`Start a sesh with ${OTHER_TRICK.name}`);
    expect(text).toContain('Practice several tricks');
    expect(findByAccessibilityLabel(root, 'Cancel practice')).toHaveLength(0);

    act(() => {
      root.unmount();
    });
  });

  it('falls back to the normal multi-trick picker when the linked trick is unavailable', async () => {
    const root = await mountSesh({ directPracticeTrickId: 'not-a-real-trick' });

    const text = JSON.stringify(root.toJSON());
    expect(text).toContain('Practice format');
    expect(text).toContain(TRICK.name);
    expect(text).toContain(OTHER_TRICK.name);
    expect(findByAccessibilityLabel(root, 'Cancel practice')).toHaveLength(0);

    act(() => {
      root.unmount();
    });
  });

  it('renders the single card even when the focused practice list is empty', async () => {
    const root = await mountSesh({ directPracticeTrickId: TRICK.id, selectedTrickIds: [] });

    const text = JSON.stringify(root.toJSON());
    expect(text).toContain(`Start a sesh with ${TRICK.name}`);
    expect(text).not.toContain('Nothing queued');

    act(() => {
      root.unmount();
    });
  });

  function seshElement(props: Partial<ComponentProps<typeof Sesh>>) {
    return (
      <UserProfileProvider>
        <NoteProvider>
          <GoalProvider>
            <PracticeHistoryProvider>
              <Sesh
                availableTricks={[TRICK, OTHER_TRICK]}
                selectedTrickIds={[TRICK.id, OTHER_TRICK.id]}
                {...props}
              />
            </PracticeHistoryProvider>
          </GoalProvider>
        </NoteProvider>
      </UserProfileProvider>
    );
  }

  it('picks up a newly linked trick when the screen instance is reused across navigations', async () => {
    // Expo Router keeps this route's screen instance mounted across param
    // changes rather than remounting it, so `update` (not a fresh `mountSesh`)
    // is what actually reproduces following a second, different
    // direct-practice link without ever leaving the Sesh tab.
    const root = await mountSesh({ directPracticeTrickId: TRICK.id });

    await act(async () => {
      root.update(seshElement({ directPracticeTrickId: OTHER_TRICK.id }));
    });

    const text = JSON.stringify(root.toJSON());
    expect(text).toContain(`Start a sesh with ${OTHER_TRICK.name}`);
    expect(text).not.toContain(`Start a sesh with ${TRICK.name}`);
    expect(findByAccessibilityLabel(root, `Start a sesh with ${OTHER_TRICK.name}`).length).toBeGreaterThan(0);
    expect(findByAccessibilityLabel(root, `Start a sesh with ${TRICK.name}`)).toHaveLength(0);

    act(() => {
      root.unmount();
    });
  });

  it('stays on the standard picker after Cancel practice even though the route param is unchanged', async () => {
    const root = await mountSesh({ directPracticeTrickId: TRICK.id });

    act(() => {
      pressByAccessibilityLabel(root, 'Cancel practice');
    });

    // A re-render with the same directPracticeTrickId (e.g. an unrelated
    // provider update) must not snap the user back into direct-practice mode.
    await act(async () => {
      root.update(seshElement({ directPracticeTrickId: TRICK.id }));
    });

    const text = JSON.stringify(root.toJSON());
    expect(text).toContain('Practice several tricks');
    expect(findByAccessibilityLabel(root, 'Cancel practice')).toHaveLength(0);

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
        <UserProfileProvider>
          <NoteProvider>
            <GoalProvider>
              <PracticeHistoryProvider>
                <Sesh
                  availableTricks={[TRICK]}
                  selectedTrickIds={[TRICK.id]}
                />
              </PracticeHistoryProvider>
            </GoalProvider>
          </NoteProvider>
        </UserProfileProvider>,
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
    expect(multiTrickAction.props.href).toBe('/app/sesh/multi-trick');
    expect(JSON.stringify(root.toJSON())).toContain('Build a line and work through it one trick at a time.');

    const text = JSON.stringify(root.toJSON());
    expect(text).toContain('Practice format');
    expect(text).toContain('Timed');
    expect(text).toContain('Open-ended');
    expect(text).toContain('Focused tricks');
    expect(findByAccessibilityLabel(root, 'Sesh duration in minutes').length).toBeGreaterThan(0);

    act(() => {
      root.unmount();
    });
  });

  it('shows a "Focused tricks" heading directly above the focused-tricks list, below "Practice several tricks" (T151)', async () => {
    const root = await mountSeshHome();

    const text = JSON.stringify(root.toJSON());
    const multiTrickIndex = text.indexOf('Practice several tricks');
    const headingIndex = text.indexOf('Focused tricks');
    const trickNameIndex = text.indexOf(TRICK.name);

    expect(multiTrickIndex).toBeGreaterThan(-1);
    expect(headingIndex).toBeGreaterThan(multiTrickIndex);
    expect(trickNameIndex).toBeGreaterThan(headingIndex);

    act(() => {
      root.unmount();
    });
  });
});

describe('Sesh theming (T097)', () => {
  const customTheme: DefaultTheme = {
    background: '#123456',
    accent: '#abcdef',
    text: '#fedcba',
    textMuted: '#997755',
    buttonBackground: '#111111',
    buttonBackgroundSecondary: '#222222',
  };

  function resolvedHostStyle(matches: ReadonlyArray<{ props: { style?: unknown } }>) {
    const withPlainStyle = matches.find(
      (node) => typeof node.props.style === 'object' && node.props.style !== null && !Array.isArray(node.props.style),
    );
    return withPlainStyle?.props.style as { color?: string; backgroundColor?: string } | undefined;
  }

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('resolves the countdown number color from theme.accent', () => {
    let root!: ReactTestRenderer;
    act(() => {
      root = create(
        <StyledThemeProvider theme={customTheme}>
          <Countdown trick={TRICK} plan={PLAN} onComplete={noop} />
        </StyledThemeProvider>,
      );
    });

    const style = resolvedHostStyle(root.root.findAll((node) => node.props.children === 3));
    expect(style?.color).toBe(customTheme.accent);

    act(() => {
      root.unmount();
    });
  });

  it("resolves the laced button's background from theme.buttonBackground and its text/count from theme.accent", () => {
    let root!: ReactTestRenderer;
    act(() => {
      root = create(
        <StyledThemeProvider theme={customTheme}>
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
          />
        </StyledThemeProvider>,
      );
    });

    const buttonStyle = resolvedHostStyle(root.root.findAll((node) => node.props.accessibilityLabel === 'Laced'));
    expect(buttonStyle?.backgroundColor).toBe(customTheme.buttonBackground);

    const textStyle = resolvedHostStyle(root.root.findAll((node) => node.props.children === 'Laced.'));
    expect(textStyle?.color).toBe(customTheme.accent);

    const countStyle = resolvedHostStyle(root.root.findAll((node) => node.props.children === 0));
    expect(countStyle?.color).toBe(customTheme.accent);

    act(() => {
      root.unmount();
    });
  });
});
