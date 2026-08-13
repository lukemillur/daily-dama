import { describe, expect, it } from '@jest/globals';

import type { PracticeSessionRecord } from '@/features/stats/model/practice-history';
import {
  calculateTimeLogged,
  DAY_MS,
  MONTH_MS,
  WEEK_MS,
  YEAR_MS,
} from '@/features/stats/model/time-logged';

const NOW = 400 * DAY_MS;

function session(
  id: string,
  completedAt: number,
  durationMs = 60_000,
): PracticeSessionRecord {
  return {
    id,
    trickId: 'big-cup',
    trickName: 'Big cup',
    startedAt: completedAt - durationMs,
    completedAt,
    durationMs,
    laceCount: 1,
  };
}

function keys(windows: readonly { key: string }[]) {
  return windows.map((window) => window.key);
}

describe('calculateTimeLogged', () => {
  it('always includes a day window, even with no sessions at all', () => {
    const result = calculateTimeLogged([], NOW);

    expect(keys(result)).toEqual(['day']);
    expect(result[0]).toEqual({ key: 'day', totalMs: 0 });
  });

  it('hides week, month, and year just under their own gating threshold', () => {
    const first = session('first', NOW - WEEK_MS + 1);

    expect(keys(calculateTimeLogged([first], NOW))).toEqual(['day']);
  });

  it('hides month and year but reveals week just under the month threshold', () => {
    const first = session('first', NOW - MONTH_MS + 1);

    expect(keys(calculateTimeLogged([first], NOW))).toEqual(['day', 'week']);
  });

  it('hides only year just under the year threshold', () => {
    const first = session('first', NOW - YEAR_MS + 1);

    expect(keys(calculateTimeLogged([first], NOW))).toEqual(['day', 'week', 'month']);
  });

  it('reveals week at exactly the seven-day boundary since the first record, with correct total', () => {
    const first = session('first', NOW - WEEK_MS, 30_000);
    const later = session('later', NOW - DAY_MS, 20_000);

    const result = calculateTimeLogged([first, later], NOW);

    expect(keys(result)).toEqual(['day', 'week']);
    const week = result.find((window) => window.key === 'week');
    expect(week).toEqual({ key: 'week', totalMs: 50_000 });
  });

  it('reveals month at exactly the thirty-day boundary since the first record, with correct total', () => {
    const first = session('first', NOW - MONTH_MS, 30_000);

    const result = calculateTimeLogged([first], NOW);

    expect(keys(result)).toEqual(['day', 'week', 'month']);
    const month = result.find((window) => window.key === 'month');
    expect(month).toEqual({ key: 'month', totalMs: 30_000 });
  });

  it('reveals year at exactly the 365-day boundary since the first record, with correct total', () => {
    const first = session('first', NOW - YEAR_MS, 30_000);

    const result = calculateTimeLogged([first], NOW);

    expect(keys(result)).toEqual(['day', 'week', 'month', 'year']);
    const year = result.find((window) => window.key === 'year');
    expect(year).toEqual({ key: 'year', totalMs: 30_000 });
  });

  it('sums only sessions inside each window’s own rolling range, excluding older and future sessions', () => {
    const first = session('first', NOW - YEAR_MS, 1_000);
    const tooOldForDay = session('too-old-for-day', NOW - DAY_MS - 1, 999_999);
    const insideDay = session('inside-day', NOW - 1_000, 5_000);
    const future = session('future', NOW + 1, 999_999);

    const result = calculateTimeLogged([first, tooOldForDay, insideDay, future], NOW);
    const day = result.find((window) => window.key === 'day');

    expect(day).toEqual({ key: 'day', totalMs: 5_000 });
  });

  it('keeps windows independent — a ten-day-old session counts toward month and year but not week', () => {
    const first = session('first', NOW - YEAR_MS, 1_000);
    const tenDaysOld = session('ten-days-old', NOW - 10 * DAY_MS, 7_000);

    const result = calculateTimeLogged([first, tenDaysOld], NOW);
    const week = result.find((window) => window.key === 'week');
    const month = result.find((window) => window.key === 'month');
    const year = result.find((window) => window.key === 'year');

    expect(week).toEqual({ key: 'week', totalMs: 0 });
    expect(month).toEqual({ key: 'month', totalMs: 7_000 });
    expect(year).toEqual({ key: 'year', totalMs: 8_000 });
  });

  it('unlocks a gate from the earliest session ever recorded, even one outside that window’s own range', () => {
    // The very first session is now more than a year old, so it no longer contributes to the
    // year total — but its age is still what determines whether the year window unlocks at all.
    const veryFirst = session('very-first', NOW - YEAR_MS - DAY_MS, 1_000);
    const recent = session('recent', NOW - DAY_MS, 2_000);

    const result = calculateTimeLogged([veryFirst, recent], NOW);
    const year = result.find((window) => window.key === 'year');

    expect(year).toEqual({ key: 'year', totalMs: 2_000 });
  });
});
