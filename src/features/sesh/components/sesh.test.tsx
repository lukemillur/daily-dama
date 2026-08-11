import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ActiveSesh, CompletedSesh } from '@/features/sesh/components/sesh';
import { createTimedSeshPlan, type Landing, type SeshSummary } from '@/features/sesh/model/sesh';
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

  it('shows the past-tense banner when isFirstLace is true', () => {
    let root!: ReactTestRenderer;
    act(() => {
      root = create(
        <CompletedSesh summary={summary} isFirstLace={true} onReset={noop} onRepeat={noop} />,
      );
    });

    expect(findBanner(root).length).toBeGreaterThan(0);
    expect(JSON.stringify(root.toJSON())).toContain('You landed');
    expect(JSON.stringify(root.toJSON())).not.toContain('You just landed');
  });

  it('shows no banner when isFirstLace is false', () => {
    let root!: ReactTestRenderer;
    act(() => {
      root = create(
        <CompletedSesh summary={summary} isFirstLace={false} onReset={noop} onRepeat={noop} />,
      );
    });

    expect(findBanner(root)).toHaveLength(0);
  });
});
