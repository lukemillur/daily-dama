import { describe, expect, it } from '@jest/globals';

import { MAX_NEGLECTED_TRICKS, selectNeglectedFocusedTricks } from '@/features/stats/model/neglected-tricks';
import type { PracticeSessionRecord } from '@/features/stats/model/practice-history';

interface FocusedTrick {
  readonly id: string;
  readonly name: string;
}

function trick(id: string, name = id): FocusedTrick {
  return { id, name };
}

function session(trickId: string, completedAt: number, overrides: Partial<PracticeSessionRecord> = {}): PracticeSessionRecord {
  return {
    id: `session-${trickId}-${completedAt}-${Math.random()}`,
    trickId,
    trickName: trickId,
    startedAt: completedAt - 1000,
    completedAt,
    durationMs: 1000,
    laceCount: 1,
    ...overrides,
  };
}

describe('selectNeglectedFocusedTricks', () => {
  it('returns an empty result for empty focused tricks and empty history', () => {
    expect(selectNeglectedFocusedTricks([], [])).toEqual([]);
  });

  it('returns an empty result when there are focused tricks but no history', () => {
    const result = selectNeglectedFocusedTricks([trick('big-cup')], []);
    expect(result).toEqual([{ trick: trick('big-cup') }]);
  });

  it('orders never-practiced tricks before practiced tricks', () => {
    const practiced = trick('practiced');
    const neverPracticed = trick('never-practiced');
    const sessions = [session('practiced', 1000)];

    const result = selectNeglectedFocusedTricks([practiced, neverPracticed], sessions);

    expect(result.map((entry) => entry.trick.id)).toEqual(['never-practiced', 'practiced']);
  });

  it('orders practiced tricks by oldest most-recent-practice first', () => {
    const recentlyPracticed = trick('recent');
    const staleTrick = trick('stale');
    const sessions = [
      session('recent', 5000),
      session('stale', 1000),
      // An older session for the "recent" trick should not override its more recent session.
      session('recent', 500),
    ];

    const result = selectNeglectedFocusedTricks([recentlyPracticed, staleTrick], sessions);

    expect(result.map((entry) => entry.trick.id)).toEqual(['stale', 'recent']);
    expect(result[0]?.mostRecentPracticeAt).toBe(1000);
    expect(result[1]?.mostRecentPracticeAt).toBe(5000);
  });

  it('breaks ties deterministically using focused-list order, for both never-practiced and equal-recency groups', () => {
    const first = trick('first');
    const second = trick('second');
    const third = trick('third');
    const sessions = [session('second', 1000), session('third', 1000)];

    const result = selectNeglectedFocusedTricks([first, second, third], sessions);

    expect(result.map((entry) => entry.trick.id)).toEqual(['first', 'second', 'third']);
  });

  it('ignores practice records for tricks that are not in the focused list', () => {
    const focused = trick('focused');
    const sessions = [session('unrelated', 1000)];

    const result = selectNeglectedFocusedTricks([focused], sessions);

    expect(result).toEqual([{ trick: focused }]);
  });

  it('limits the result to three tricks', () => {
    const focusedTricks = Array.from({ length: 5 }, (_, index) => trick(`trick-${index}`));

    const result = selectNeglectedFocusedTricks(focusedTricks, []);

    expect(result).toHaveLength(MAX_NEGLECTED_TRICKS);
    expect(result.map((entry) => entry.trick.id)).toEqual(['trick-0', 'trick-1', 'trick-2']);
  });
});
