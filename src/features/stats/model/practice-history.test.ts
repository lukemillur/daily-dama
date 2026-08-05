import { describe, expect, it } from '@jest/globals';

import {
  aggregatePracticeStats,
  practiceHistoryReducer,
  type PracticeSessionRecord,
} from '@/features/stats/model/practice-history';

const BIG_CUP_FIRST: PracticeSessionRecord = {
  id: 'big-cup-1',
  trickId: 'big-cup',
  trickName: 'Big cup',
  startedAt: 1_000,
  completedAt: 61_000,
  durationMs: 60_000,
  laceCount: 8,
};

const BIG_CUP_SECOND: PracticeSessionRecord = {
  id: 'big-cup-2',
  trickId: 'big-cup',
  trickName: 'Big cup',
  startedAt: 100_000,
  completedAt: 220_000,
  durationMs: 120_000,
  laceCount: 3,
};

const AIRPLANE_ZERO_LACES: PracticeSessionRecord = {
  id: 'airplane-1',
  trickId: 'airplane',
  trickName: 'Airplane',
  startedAt: 300_000,
  completedAt: 390_000,
  durationMs: 90_000,
  laceCount: 0,
};

describe('practice history', () => {
  it('aggregates multiple sessions per trick and totals across tricks', () => {
    const stats = aggregatePracticeStats([
      BIG_CUP_FIRST,
      BIG_CUP_SECOND,
      AIRPLANE_ZERO_LACES,
    ]);

    expect(stats).toEqual({
      totalLaces: 11,
      totalPracticeMs: 270_000,
      sessionCount: 3,
      tricks: [
        {
          trickId: 'airplane',
          trickName: 'Airplane',
          totalLaces: 0,
          totalPracticeMs: 90_000,
          sessionCount: 1,
          mostRecentPracticeAt: 390_000,
        },
        {
          trickId: 'big-cup',
          trickName: 'Big cup',
          totalLaces: 11,
          totalPracticeMs: 180_000,
          sessionCount: 2,
          mostRecentPracticeAt: 220_000,
        },
      ],
    });
  });

  it('counts zero-lace sessions as practice time and completed sessions', () => {
    expect(aggregatePracticeStats([AIRPLANE_ZERO_LACES])).toMatchObject({
      totalLaces: 0,
      totalPracticeMs: 90_000,
      sessionCount: 1,
    });
  });

  it('does not duplicate a completed session with the same operation id', () => {
    const once = practiceHistoryReducer(
      { sessions: [] },
      { type: 'sessionRecorded', session: BIG_CUP_FIRST },
    );
    const twice = practiceHistoryReducer(once, {
      type: 'sessionRecorded',
      session: BIG_CUP_FIRST,
    });

    expect(twice).toBe(once);
    expect(twice.sessions).toHaveLength(1);
  });
});
