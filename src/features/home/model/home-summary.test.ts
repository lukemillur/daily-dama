import { describe, expect, it } from '@jest/globals';

import type { CustomTrick } from '@/features/custom-tricks/model/custom-trick';
import { createHomeSummary } from '@/features/home/model/home-summary';
import type { UserProfile } from '@/features/profile/model/user-profile';
import type { PracticeSessionRecord } from '@/features/stats/model/practice-history';
import type { TrickSummary } from '@/features/tricks/model/trick';

const DAY = 24 * 60 * 60 * 1_000;
const NOW = 20 * DAY;
const BIG_CUP: TrickSummary = {
  id: 'big-cup',
  name: 'Big cup',
  kenteiRank: 1,
  kenteiLevel: 'Basic',
  kenteiClass: '3rd Class',
};
const AIRPLANE: TrickSummary = {
  id: 'airplane',
  name: 'Airplane',
  kenteiRank: 2,
  kenteiLevel: 'Basic',
  kenteiClass: '2nd Class',
};
const MORNING_LINE: CustomTrick = {
  id: 'custom-morning-line',
  name: 'Morning line',
  kind: 'sequence',
  kenteiRank: 4,
  steps: [
    { kind: 'existingTrick', sourceTrickId: 'big-cup', name: 'Big cup' },
    { kind: 'customText', name: 'Kenflip' },
  ],
};
const PROFILE: UserProfile = {
  hasCompletedOnboarding: true,
  kenteiRank: 4,
  selectedTrickIds: ['custom-morning-line', 'big-cup'],
};

function session(
  id: string,
  trickId: string,
  trickName: string,
  completedAt: number,
  durationMs = 60_000,
  laceCount = 2,
): PracticeSessionRecord {
  return {
    id,
    trickId,
    trickName,
    startedAt: completedAt - durationMs,
    completedAt,
    durationMs,
    laceCount,
  };
}

function summary(overrides: Partial<Parameters<typeof createHomeSummary>[0]> = {}) {
  return createHomeSummary({
    profile: PROFILE,
    standardTricks: [BIG_CUP, AIRPLANE],
    customTricks: [MORNING_LINE],
    sessions: [],
    now: NOW,
    ...overrides,
  });
}

describe('daily home summary', () => {
  it('represents a first-time practice state without history', () => {
    const result = summary();

    expect(result).toMatchObject({
      kenteiRank: 4,
      momentum: { sessionCount: 0, totalPracticeMs: 0, totalLaces: 0 },
    });
    expect(result.recentSession).toBeUndefined();
  });

  it('returns selected available tricks in profile order with useful context', () => {
    expect(summary().selectedTricks).toEqual([
      {
        id: 'custom-morning-line',
        name: 'Morning line',
        kind: 'customSequence',
        kenteiRank: 4,
        sequenceSteps: ['Big cup', 'Kenflip'],
      },
      {
        id: 'big-cup',
        name: 'Big cup',
        kind: 'standard',
        kenteiRank: 1,
        kenteiLevel: 'Basic',
      },
    ]);
  });

  it('supports an empty selected list and omits unavailable selections', () => {
    expect(
      summary({ profile: { ...PROFILE, selectedTrickIds: ['deleted-custom'] } }).selectedTricks,
    ).toEqual([]);
  });

  it('chooses the most recently completed session by timestamp rather than array order', () => {
    const newest = session('newest', 'airplane', 'Airplane', NOW - DAY);
    const older = session('older', 'big-cup', 'Big cup', NOW - 2 * DAY);

    expect(summary({ sessions: [newest, older] }).recentSession).toEqual({
      record: newest,
      availableTrick: {
        id: 'airplane',
        name: 'Airplane',
        kind: 'standard',
        kenteiRank: 2,
        kenteiLevel: 'Basic',
      },
    });
  });

  it('keeps a custom sequence name snapshot while resolving its current practice details', () => {
    const record = session(
      'sequence',
      MORNING_LINE.id,
      'Morning line before rename',
      NOW - DAY,
    );

    expect(summary({ sessions: [record] }).recentSession).toEqual({
      record,
      availableTrick: {
        id: MORNING_LINE.id,
        name: MORNING_LINE.name,
        kind: 'customSequence',
        kenteiRank: 4,
        sequenceSteps: ['Big cup', 'Kenflip'],
      },
    });
  });

  it('models a deleted historical custom trick as unavailable for repeat practice', () => {
    const record = session('deleted', 'custom-deleted', 'Deleted line', NOW - DAY);

    expect(summary({ sessions: [record] }).recentSession).toEqual({
      record,
      availableTrick: undefined,
    });
  });

  it('includes the exact seven-day boundary and excludes older and future sessions', () => {
    const onBoundary = session('boundary', 'big-cup', 'Big cup', NOW - 7 * DAY, 10_000, 1);
    const inside = session('inside', 'big-cup', 'Big cup', NOW - DAY, 20_000, 3);
    const tooOld = session('old', 'big-cup', 'Big cup', NOW - 7 * DAY - 1, 40_000, 8);
    const future = session('future', 'big-cup', 'Big cup', NOW + 1, 80_000, 16);

    expect(summary({ sessions: [tooOld, inside, future, onBoundary] }).momentum).toEqual({
      sessionCount: 2,
      totalPracticeMs: 30_000,
      totalLaces: 4,
    });
  });

  it('can advance its injected clock when a mounted Home receives a newly completed session', () => {
    const mountedAt = NOW;
    const newlyCompleted = session('new', 'big-cup', 'Big cup', NOW + 7_000, 7_000, 1);
    const summaryNow = Math.max(mountedAt, newlyCompleted.completedAt);

    expect(summary({ sessions: [newlyCompleted], now: summaryNow }).momentum).toEqual({
      sessionCount: 1,
      totalPracticeMs: 7_000,
      totalLaces: 1,
    });
  });

  it('computes the current streak using the profile threshold, defaulting to five minutes', () => {
    const today = session('today', 'big-cup', 'Big cup', NOW, 300_000, 5);
    const yesterday = session('yesterday', 'big-cup', 'Big cup', NOW - DAY, 300_000, 5);

    expect(summary({ sessions: [today, yesterday] }).currentStreak).toBe(2);
  });

  it('respects a custom streak threshold from the profile', () => {
    const shortToday = session('short-today', 'big-cup', 'Big cup', NOW, 30_000, 5);

    expect(
      summary({
        profile: { ...PROFILE, streakThresholdMs: 60_000 },
        sessions: [shortToday],
      }).currentStreak,
    ).toBe(0);
    expect(
      summary({
        profile: { ...PROFILE, streakThresholdMs: 30_000 },
        sessions: [shortToday],
      }).currentStreak,
    ).toBe(1);
  });
});
