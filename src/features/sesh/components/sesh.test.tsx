import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { ReactElement } from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { NoteProvider, useNotes } from '@/features/notes/state/note-provider';
import type { Note } from '@/features/notes/model/note';
import { ActiveSesh, CompletedSesh } from '@/features/sesh/components/sesh';
import { createTimedSeshPlan, type Landing, type SeshSummary } from '@/features/sesh/model/sesh';
import { createPracticeSessionRecordId } from '@/features/stats/model/practice-history';
import type { PracticeTrick } from '@/features/tricks/model/trick';

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
const PLAN = createTimedSeshPlan(5);

function findBanner(root: ReactTestRenderer) {
  return root.root.findAll(
    (node) => node.props.accessibilityLabel === 'First lace ever on Big Cup',
  );
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
