import { describe, expect, it } from '@jest/globals';

import type { CustomTrick } from '@/features/custom-tricks/model/custom-trick';
import { createHomeSummary, selectNextKenteiTrick } from '@/features/home/model/home-summary';
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
  updatedAt: 1,
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
    expect(result.timeLoggedWindows).toEqual([{ key: 'day', totalMs: 0 }]);
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

  it('gates time-logged windows on elapsed time since the first-ever practice record', () => {
    const justUnderWeek = session('just-under-week', 'big-cup', 'Big cup', NOW - 7 * DAY + 1);

    expect(summary({ sessions: [justUnderWeek] }).timeLoggedWindows.map((w) => w.key)).toEqual([
      'day',
    ]);
  });

  it('reveals the week window with the correct total once seven days have elapsed since first use', () => {
    const first = session('first', 'big-cup', 'Big cup', NOW - 7 * DAY, 30_000, 3);

    const windows = summary({ sessions: [first] }).timeLoggedWindows;

    expect(windows.map((w) => w.key)).toEqual(['day', 'week']);
    expect(windows.find((w) => w.key === 'week')).toEqual({ key: 'week', totalMs: 30_000 });
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


describe('selectNextKenteiTrick', () => {
  const RANK_1_A: TrickSummary = {
    id: 'rank1-a',
    name: 'Rank 1 A',
    kenteiRank: 1,
    kenteiLevel: 'Basic',
    kenteiClass: '3rd Class',
  };
  const RANK_1_B: TrickSummary = {
    id: 'rank1-b',
    name: 'Rank 1 B',
    kenteiRank: 1,
    kenteiLevel: 'Basic',
    kenteiClass: '3rd Class',
  };
  const RANK_2_A: TrickSummary = {
    id: 'rank2-a',
    name: 'Rank 2 A',
    kenteiRank: 2,
    kenteiLevel: 'Basic',
    kenteiClass: '2nd Class',
  };
  const RANK_2_B: TrickSummary = {
    id: 'rank2-b',
    name: 'Rank 2 B',
    kenteiRank: 2,
    kenteiLevel: 'Basic',
    kenteiClass: '2nd Class',
  };
  const TRICKS: readonly TrickSummary[] = [RANK_1_A, RANK_1_B, RANK_2_A, RANK_2_B];

  it('suggests the first not-yet-laced trick at the current rank, in rank order', () => {
    const profile: UserProfile = {
      hasCompletedOnboarding: true,
      kenteiRank: 1,
      selectedTrickIds: [],
      manuallyUnlockedTrickIds: [RANK_1_A.id],
    };

    expect(selectNextKenteiTrick(profile, TRICKS)).toEqual({
      id: RANK_1_B.id,
      name: RANK_1_B.name,
      kind: 'standard',
      kenteiRank: 1,
      kenteiLevel: 'Basic',
    });
  });

  it('rolls forward to the next rank once the current rank is fully laced', () => {
    const profile: UserProfile = {
      hasCompletedOnboarding: true,
      kenteiRank: 1,
      selectedTrickIds: [],
      manuallyUnlockedTrickIds: [RANK_1_A.id, RANK_1_B.id],
    };

    expect(selectNextKenteiTrick(profile, TRICKS)).toEqual({
      id: RANK_2_A.id,
      name: RANK_2_A.name,
      kind: 'standard',
      kenteiRank: 2,
      kenteiLevel: 'Basic',
    });
  });

  it('returns undefined once the top rank is fully laced', () => {
    const profile: UserProfile = {
      hasCompletedOnboarding: true,
      kenteiRank: 1,
      selectedTrickIds: [],
      manuallyUnlockedTrickIds: [RANK_1_A.id, RANK_1_B.id, RANK_2_A.id, RANK_2_B.id],
    };

    expect(selectNextKenteiTrick(profile, TRICKS)).toBeUndefined();
  });

  it('returns undefined when the profile has no assessed rank yet', () => {
    const profile: UserProfile = {
      hasCompletedOnboarding: true,
      selectedTrickIds: [],
    };

    expect(selectNextKenteiTrick(profile, TRICKS)).toBeUndefined();
  });
});
