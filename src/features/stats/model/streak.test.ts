import { describe, expect, it } from '@jest/globals';

import { calculateStreak, getLocalDayKey } from '@/features/stats/model/streak';
import type { PracticeSessionRecord } from '@/features/stats/model/practice-history';

const THRESHOLD_MS = 60_000;

function dayAt(year: number, month: number, day: number, hour = 12): number {
  return new Date(year, month, day, hour).getTime();
}

function session(overrides: Partial<PracticeSessionRecord>): PracticeSessionRecord {
  return {
    id: `session-${Math.random()}`,
    trickId: 'big-cup',
    trickName: 'Big cup',
    startedAt: 0,
    completedAt: 0,
    durationMs: THRESHOLD_MS,
    laceCount: 5,
    ...overrides,
  };
}

describe('getLocalDayKey', () => {
  it('buckets timestamps by local calendar day', () => {
    expect(getLocalDayKey(dayAt(2024, 0, 10))).toBe('2024-01-10');
  });

  it('treats moments on either side of local midnight as different days', () => {
    const beforeMidnight = new Date(2024, 0, 10, 23, 59).getTime();
    const afterMidnight = new Date(2024, 0, 11, 0, 1).getTime();

    expect(getLocalDayKey(beforeMidnight)).not.toBe(getLocalDayKey(afterMidnight));
  });
});

describe('calculateStreak', () => {
  it('counts consecutive qualifying days including today', () => {
    const now = dayAt(2024, 0, 10);
    const sessions = [
      session({ id: 'today', completedAt: dayAt(2024, 0, 10) }),
      session({ id: 'yesterday', completedAt: dayAt(2024, 0, 9) }),
      session({ id: 'two-days-ago', completedAt: dayAt(2024, 0, 8) }),
    ];

    const result = calculateStreak(sessions, THRESHOLD_MS, now);

    expect(result).toEqual({ currentStreak: 3, qualifiesToday: true });
  });

  it('stops at the first gap in qualifying days', () => {
    const now = dayAt(2024, 0, 10);
    const sessions = [
      session({ id: 'today', completedAt: dayAt(2024, 0, 10) }),
      session({ id: 'two-days-ago', completedAt: dayAt(2024, 0, 8) }),
    ];

    const result = calculateStreak(sessions, THRESHOLD_MS, now);

    expect(result).toEqual({ currentStreak: 1, qualifiesToday: true });
  });

  it('does not zero the streak when today has not yet qualified', () => {
    const now = dayAt(2024, 0, 10);
    const sessions = [
      session({ id: 'yesterday', completedAt: dayAt(2024, 0, 9) }),
      session({ id: 'two-days-ago', completedAt: dayAt(2024, 0, 8) }),
    ];

    const result = calculateStreak(sessions, THRESHOLD_MS, now);

    expect(result).toEqual({ currentStreak: 2, qualifiesToday: false });
  });

  it('treats a day total exactly at the threshold as qualifying', () => {
    const now = dayAt(2024, 0, 10);
    const sessions = [
      session({ id: 'a', completedAt: dayAt(2024, 0, 10), durationMs: 30_000 }),
      session({ id: 'b', completedAt: dayAt(2024, 0, 10, 13), durationMs: 30_000 }),
    ];

    const result = calculateStreak(sessions, THRESHOLD_MS, now);

    expect(result).toEqual({ currentStreak: 1, qualifiesToday: true });
  });

  it('does not count a day whose total falls short of the threshold', () => {
    const now = dayAt(2024, 0, 10);
    const sessions = [session({ id: 'short', completedAt: dayAt(2024, 0, 10), durationMs: THRESHOLD_MS - 1 })];

    const result = calculateStreak(sessions, THRESHOLD_MS, now);

    expect(result).toEqual({ currentStreak: 0, qualifiesToday: false });
  });

  it('returns a zero streak when there are no sessions', () => {
    const result = calculateStreak([], THRESHOLD_MS, dayAt(2024, 0, 10));

    expect(result).toEqual({ currentStreak: 0, qualifiesToday: false });
  });
});
