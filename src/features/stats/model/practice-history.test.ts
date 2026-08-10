import { describe, expect, it } from '@jest/globals';

import {
  aggregatePracticeStats,
  createPracticeSessionRecord,
  createPracticeSessionRecordId,
  getPersonalBest,
  isEligibleTimedAttempt,
  isFirstLaceForTrick,
  practiceHistoryReducer,
  type PracticeSessionRecord,
} from '@/features/stats/model/practice-history';
import { OPEN_ENDED_SESH_PLAN, type Landing, type SeshSummary } from '@/features/sesh/model/sesh';

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

function landings(count: number): readonly Landing[] {
  return Array.from({ length: count }, (_, index) => ({
    landedAt: 1_000 + index * 1_000,
    elapsedMs: index * 1_000,
    intervalMs: 1_000,
  }));
}

function makeSummary(overrides: Partial<SeshSummary> = {}): SeshSummary {
  return {
    trick: { id: 'big-cup', name: 'Big cup' },
    plan: OPEN_ENDED_SESH_PLAN,
    startedAt: 1_000,
    endedAt: 61_000,
    durationMs: 60_000,
    landings: landings(8),
    ...overrides,
  };
}

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
    const summary = makeSummary();
    const once = practiceHistoryReducer({ sessions: [] }, { type: 'sessionRecorded', summary });
    const twice = practiceHistoryReducer(once, { type: 'sessionRecorded', summary });

    expect(twice).toBe(once);
    expect(twice.sessions).toHaveLength(1);
  });

  it('aggregates a custom-trick session from its completed name snapshot', () => {
    const summary: SeshSummary = {
      trick: { id: 'custom-stable-id', name: 'Morning line', descriptor: 'Custom sequence' },
      plan: OPEN_ENDED_SESH_PLAN,
      startedAt: 1_000,
      endedAt: 31_000,
      durationMs: 30_000,
      landings: [{ landedAt: 21_000, elapsedMs: 20_000, intervalMs: 20_000 }],
    };
    const record = createPracticeSessionRecord(summary, undefined);

    expect(record).toMatchObject({
      trickId: 'custom-stable-id',
      trickName: 'Morning line',
      durationMs: 30_000,
      laceCount: 1,
    });
    expect(aggregatePracticeStats([record]).tricks).toEqual([
      {
        trickId: 'custom-stable-id',
        trickName: 'Morning line',
        totalLaces: 1,
        totalPracticeMs: 30_000,
        sessionCount: 1,
        mostRecentPracticeAt: 31_000,
      },
    ]);

    const renamedCurrentTrick = { ...summary.trick, name: 'Renamed later' };
    expect(renamedCurrentTrick.name).toBe('Renamed later');
    expect(record.trickName).toBe('Morning line');

    const historyAfterCurrentTrickDeletion = [record];
    expect(aggregatePracticeStats(historyAfterCurrentTrickDeletion).tricks[0]?.trickName).toBe(
      'Morning line',
    );
  });
});

describe('createPracticeSessionRecordId', () => {
  it('matches the id createPracticeSessionRecord assigns for the same summary', () => {
    const summary = makeSummary();
    expect(createPracticeSessionRecordId(summary)).toBe(
      createPracticeSessionRecord(summary, undefined).id,
    );
  });
});

describe('isEligibleTimedAttempt', () => {
  it('is never eligible for an open-ended sesh', () => {
    const summary = makeSummary({ plan: OPEN_ENDED_SESH_PLAN });
    expect(isEligibleTimedAttempt(summary, undefined)).toBe(false);
    expect(isEligibleTimedAttempt(summary, 2)).toBe(false);
  });

  it('is eligible when the timed sesh reaches its full planned duration', () => {
    const summary = makeSummary({
      plan: { kind: 'timed', durationMs: 300_000 },
      durationMs: 300_000,
    });
    expect(isEligibleTimedAttempt(summary, undefined)).toBe(true);
    expect(isEligibleTimedAttempt(summary, 20)).toBe(true);
  });

  it('is not eligible when ended early and below the previous best', () => {
    const summary = makeSummary({
      plan: { kind: 'timed', durationMs: 300_000 },
      durationMs: 243_000,
      landings: landings(6),
    });
    expect(isEligibleTimedAttempt(summary, 8)).toBe(false);
    expect(isEligibleTimedAttempt(summary, undefined)).toBe(false);
  });

  it('is eligible when ended early but the lace count already exceeds the previous best', () => {
    const summary = makeSummary({
      plan: { kind: 'timed', durationMs: 300_000 },
      durationMs: 243_000,
      landings: landings(9),
    });
    expect(isEligibleTimedAttempt(summary, 8)).toBe(true);
  });
});

describe('sessionRecorded reducer (plannedDurationMs eligibility)', () => {
  it('records plannedDurationMs for a completed timed sesh', () => {
    const summary = makeSummary({
      trick: { id: 'whirlwind', name: 'Whirlwind' },
      plan: { kind: 'timed', durationMs: 300_000 },
      durationMs: 300_000,
      landings: landings(8),
    });
    const result = practiceHistoryReducer({ sessions: [] }, { type: 'sessionRecorded', summary });

    expect(result.sessions[0]?.plannedDurationMs).toBe(300_000);
  });

  it('omits plannedDurationMs for an early-ended timed sesh that did not beat the standing best', () => {
    const priorBest = makeSummary({
      trick: { id: 'whirlwind', name: 'Whirlwind' },
      plan: { kind: 'timed', durationMs: 300_000 },
      durationMs: 300_000,
      landings: landings(8),
      startedAt: 1_000,
      endedAt: 301_000,
    });
    const afterFirst = practiceHistoryReducer({ sessions: [] }, { type: 'sessionRecorded', summary: priorBest });

    const earlyEnded = makeSummary({
      trick: { id: 'whirlwind', name: 'Whirlwind' },
      plan: { kind: 'timed', durationMs: 300_000 },
      durationMs: 243_000,
      landings: landings(6),
      startedAt: 500_000,
      endedAt: 743_000,
    });
    const result = practiceHistoryReducer(afterFirst, { type: 'sessionRecorded', summary: earlyEnded });

    expect(result.sessions[1]?.plannedDurationMs).toBeUndefined();
    expect(getPersonalBest(result.sessions, 'whirlwind', 300_000)).toBe(8);
  });

  it('records plannedDurationMs for an early-ended timed sesh that already beat the standing best', () => {
    const priorBest = makeSummary({
      trick: { id: 'whirlwind', name: 'Whirlwind' },
      plan: { kind: 'timed', durationMs: 300_000 },
      durationMs: 300_000,
      landings: landings(8),
      startedAt: 1_000,
      endedAt: 301_000,
    });
    const afterFirst = practiceHistoryReducer({ sessions: [] }, { type: 'sessionRecorded', summary: priorBest });

    const earlyEndedBeatsBest = makeSummary({
      trick: { id: 'whirlwind', name: 'Whirlwind' },
      plan: { kind: 'timed', durationMs: 300_000 },
      durationMs: 243_000,
      landings: landings(9),
      startedAt: 500_000,
      endedAt: 743_000,
    });
    const result = practiceHistoryReducer(afterFirst, {
      type: 'sessionRecorded',
      summary: earlyEndedBeatsBest,
    });

    expect(result.sessions[1]?.plannedDurationMs).toBe(300_000);
    expect(getPersonalBest(result.sessions, 'whirlwind', 300_000)).toBe(9);
  });
});

describe('isFirstLaceForTrick', () => {
  it('is true when there is no prior session for the trick', () => {
    const summary = makeSummary({ trick: { id: 'big-cup', name: 'Big cup' } });
    expect(isFirstLaceForTrick([], summary)).toBe(true);
  });

  it('is true when the only prior session for the trick had zero laces', () => {
    const summary = makeSummary({ trick: { id: 'airplane', name: 'Airplane' } });
    expect(isFirstLaceForTrick([AIRPLANE_ZERO_LACES], summary)).toBe(true);
  });

  it('is false when a prior session for the trick already has laces', () => {
    const summary = makeSummary({ trick: { id: 'big-cup', name: 'Big cup' } });
    expect(isFirstLaceForTrick([BIG_CUP_FIRST], summary)).toBe(false);
  });

  it('is false when this sesh itself landed zero laces', () => {
    const summary = makeSummary({ trick: { id: 'whirlwind', name: 'Whirlwind' }, landings: [] });
    expect(isFirstLaceForTrick([], summary)).toBe(false);
  });
});

describe('getPersonalBest', () => {
  const sessions: readonly PracticeSessionRecord[] = [
    { ...BIG_CUP_FIRST, plannedDurationMs: 300_000 },
    { ...BIG_CUP_SECOND, plannedDurationMs: 300_000, laceCount: 6 },
    { ...AIRPLANE_ZERO_LACES, plannedDurationMs: undefined },
    { ...BIG_CUP_FIRST, id: 'big-cup-3', plannedDurationMs: 600_000, laceCount: 20 },
  ];

  it('returns the max lace count matching the exact trick and planned duration', () => {
    expect(getPersonalBest(sessions, 'big-cup', 300_000)).toBe(8);
  });

  it('ignores sessions with a different planned duration', () => {
    expect(getPersonalBest(sessions, 'big-cup', 600_000)).toBe(20);
  });

  it('ignores open-ended (undefined plannedDurationMs) sessions', () => {
    expect(getPersonalBest(sessions, 'airplane', 90_000)).toBeUndefined();
  });

  it('returns undefined when there is no match', () => {
    expect(getPersonalBest(sessions, 'big-cup', 120_000)).toBeUndefined();
    expect(getPersonalBest(sessions, 'unknown-trick', 300_000)).toBeUndefined();
  });
});
