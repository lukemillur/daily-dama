import { describe, expect, it } from '@jest/globals';

import type { CustomTrick } from '@/features/custom-tricks/model/custom-trick';
import type { Goal } from '@/features/goals/model/goal';
import type { Note } from '@/features/notes/model/note';
import type { PracticeSessionRecord } from '@/features/stats/model/practice-history';
import { KENDAMA_KENTEI_TRICKS } from '@/features/tricks/data/kendama-kentei-tricks';
import {
  createProfileDirectoryTricks,
  createTrickSections,
  isKenteiRankComplete,
  selectAvailablePracticeTricks,
  selectEffectiveLacedTrickIds,
  selectGoalCountByTrickId,
  selectLacedCountByTrickId,
  selectLacedTrickIds,
  selectNoteCountByTrickId,
  selectPromotedKenteiRank,
} from '@/features/tricks/model/trick-directory';

const CUSTOM_TRICKS: readonly CustomTrick[] = [
  { id: 'custom-ranked', kind: 'standalone', name: 'Rank one custom', kenteiRank: 1 },
  {
    id: 'custom-sequence',
    kind: 'sequence',
    name: 'Unranked line',
    steps: [
      { kind: 'existingTrick', sourceTrickId: 'big-cup', name: 'Big cup' },
      { kind: 'customText', name: 'Spike variation' },
    ],
  },
];

describe('profile trick directory', () => {
  it('places a ranked custom trick after all standard tricks at that rank', () => {
    const sections = createTrickSections(
      createProfileDirectoryTricks(KENDAMA_KENTEI_TRICKS, CUSTOM_TRICKS),
    );
    const rankOne = sections.find(
      (section) => section.kind === 'ranked' && section.rank === 1,
    );

    expect(rankOne?.data.at(-1)).toMatchObject({
      id: 'custom-ranked',
      customKind: 'standalone',
      kenteiRank: 1,
      kenteiLevel: 'Basic',
      kenteiClass: '3rd Class',
    });
    expect(rankOne?.data.slice(0, -1)).toHaveLength(5);
  });

  it('places unranked tricks in a Custom section at the bottom', () => {
    const sections = createTrickSections(
      createProfileDirectoryTricks(KENDAMA_KENTEI_TRICKS, CUSTOM_TRICKS),
    );

    expect(sections.at(-1)).toEqual({
      kind: 'custom',
      data: [
        {
          id: 'custom-sequence',
          name: 'Unranked line',
          customKind: 'sequence',
        },
      ],
    });
  });

  it('makes standard and custom tricks available to Sesh by stable ID', () => {
    const available = selectAvailablePracticeTricks(KENDAMA_KENTEI_TRICKS, CUSTOM_TRICKS);

    expect(available).toContainEqual({
      id: 'big-cup',
      name: 'Big cup',
      descriptor: 'Rank 1 · Basic',
    });
    expect(available).toContainEqual({
      id: 'custom-ranked',
      name: 'Rank one custom',
      descriptor: 'Custom trick',
    });
    expect(available).toContainEqual({
      id: 'custom-sequence',
      name: 'Unranked line',
      descriptor: 'Custom sequence',
      sequenceSteps: ['Big cup', 'Spike variation'],
    });
  });
});

function session(overrides: Partial<PracticeSessionRecord>): PracticeSessionRecord {
  return {
    id: 'session-1',
    trickId: 'big-cup',
    trickName: 'Big cup',
    startedAt: 1_000,
    completedAt: 61_000,
    durationMs: 60_000,
    laceCount: 0,
    ...overrides,
  };
}

describe('selectLacedCountByTrickId', () => {
  it('sums laceCount across multiple sessions for the same trick', () => {
    const counts = selectLacedCountByTrickId([
      session({ id: 'big-cup-1', trickId: 'big-cup', laceCount: 8 }),
      session({ id: 'big-cup-2', trickId: 'big-cup', laceCount: 3 }),
    ]);

    expect(counts.get('big-cup')).toBe(11);
  });

  it('keeps a trick with a zero-lace session in the map at value 0', () => {
    const counts = selectLacedCountByTrickId([
      session({ id: 'airplane-1', trickId: 'airplane', laceCount: 0 }),
    ]);

    expect(counts.has('airplane')).toBe(true);
    expect(counts.get('airplane')).toBe(0);
  });

  it('leaves a trick with no sessions absent from the map', () => {
    const counts = selectLacedCountByTrickId([
      session({ id: 'big-cup-1', trickId: 'big-cup', laceCount: 5 }),
    ]);

    expect(counts.has('never-practiced')).toBe(false);
  });

  it('does not let unrelated trick IDs bleed into each other', () => {
    const counts = selectLacedCountByTrickId([
      session({ id: 'big-cup-1', trickId: 'big-cup', laceCount: 8 }),
      session({ id: 'airplane-1', trickId: 'airplane', laceCount: 2 }),
    ]);

    expect(counts.get('big-cup')).toBe(8);
    expect(counts.get('airplane')).toBe(2);
  });
});

function note(overrides: Partial<Note>): Note {
  return {
    id: 'note-1',
    trickId: 'big-cup',
    trickName: 'Big cup',
    body: 'Keep the elbow tucked.',
    createdAt: 1_000,
    updatedAt: 1_000,
    ...overrides,
  };
}

describe('selectNoteCountByTrickId', () => {
  it('sums multiple notes for the same trick', () => {
    const counts = selectNoteCountByTrickId([
      note({ id: 'note-1', trickId: 'big-cup' }),
      note({ id: 'note-2', trickId: 'big-cup' }),
    ]);

    expect(counts.get('big-cup')).toBe(2);
  });

  it('leaves a trick with zero notes absent from the map', () => {
    const counts = selectNoteCountByTrickId([note({ id: 'note-1', trickId: 'big-cup' })]);

    expect(counts.has('airplane')).toBe(false);
  });

  it('does not let unrelated trick IDs bleed into each other', () => {
    const counts = selectNoteCountByTrickId([
      note({ id: 'note-1', trickId: 'big-cup' }),
      note({ id: 'note-2', trickId: 'airplane' }),
      note({ id: 'note-3', trickId: 'airplane' }),
    ]);

    expect(counts.get('big-cup')).toBe(1);
    expect(counts.get('airplane')).toBe(2);
  });
});

function goal(overrides: { readonly id?: string; readonly trickId: string }): Goal {
  return {
    id: overrides.id ?? 'goal-1',
    trickId: overrides.trickId,
    trickName: 'Big cup',
    kind: 'count',
    targetCount: 10,
    createdAt: 1_000,
  };
}

describe('selectGoalCountByTrickId', () => {
  it('sums multiple goals for the same trick', () => {
    const counts = selectGoalCountByTrickId([
      goal({ id: 'goal-1', trickId: 'big-cup' }),
      goal({ id: 'goal-2', trickId: 'big-cup' }),
    ]);

    expect(counts.get('big-cup')).toBe(2);
  });

  it('leaves a trick with zero goals absent from the map', () => {
    const counts = selectGoalCountByTrickId([goal({ id: 'goal-1', trickId: 'big-cup' })]);

    expect(counts.has('airplane')).toBe(false);
  });

  it('does not let unrelated trick IDs bleed into each other', () => {
    const counts = selectGoalCountByTrickId([
      goal({ id: 'goal-1', trickId: 'big-cup' }),
      goal({ id: 'goal-2', trickId: 'airplane' }),
      goal({ id: 'goal-3', trickId: 'airplane' }),
    ]);

    expect(counts.get('big-cup')).toBe(1);
    expect(counts.get('airplane')).toBe(2);
  });
});

describe('selectLacedTrickIds', () => {
  it('marks a trick laced once one of its sessions lands a real lace', () => {
    const laced = selectLacedTrickIds([
      session({ id: 'big-cup-1', trickId: 'big-cup', laceCount: 4 }),
    ]);

    expect(laced.has('big-cup')).toBe(true);
  });

  it('leaves a trick unlaced when its only record has zero laces', () => {
    const laced = selectLacedTrickIds([
      session({ id: 'airplane-1', trickId: 'airplane', laceCount: 0 }),
    ]);

    expect(laced.has('airplane')).toBe(false);
  });

  it('leaves a trick with no practice-history records unlaced', () => {
    const laced = selectLacedTrickIds([
      session({ id: 'big-cup-1', trickId: 'big-cup', laceCount: 5 }),
    ]);

    expect(laced.has('never-practiced')).toBe(false);
  });

  it('counts a trick as laced when any of its sessions lands a lace, not just the first', () => {
    const laced = selectLacedTrickIds([
      session({ id: 'airplane-1', trickId: 'airplane', laceCount: 0 }),
      session({ id: 'airplane-2', trickId: 'airplane', laceCount: 2 }),
    ]);

    expect(laced.has('airplane')).toBe(true);
  });
});

function lacedTrickIdsForRankOne(excludingTrickId?: string): Set<string> {
  const rankOneIds = KENDAMA_KENTEI_TRICKS.filter((trick) => trick.kenteiRank === 1).map(
    (trick) => trick.id,
  );
  return new Set(rankOneIds.filter((trickId) => trickId !== excludingTrickId));
}

describe('isKenteiRankComplete', () => {
  it('is false when every rank-1 trick but one has been laced', () => {
    const lastRankOneId = KENDAMA_KENTEI_TRICKS.filter((trick) => trick.kenteiRank === 1).at(
      -1,
    )!.id;

    expect(
      isKenteiRankComplete(1, KENDAMA_KENTEI_TRICKS, lacedTrickIdsForRankOne(lastRankOneId)),
    ).toBe(false);
  });

  it('is true once every rank-1 trick has been laced', () => {
    expect(isKenteiRankComplete(1, KENDAMA_KENTEI_TRICKS, lacedTrickIdsForRankOne())).toBe(true);
  });

  it('is false for a rank with no standard tricks assigned', () => {
    expect(isKenteiRankComplete(999, KENDAMA_KENTEI_TRICKS, new Set())).toBe(false);
  });
});

describe('selectPromotedKenteiRank', () => {
  it('does not promote while a trick in the current rank is still unlaced', () => {
    const lastRankOneId = KENDAMA_KENTEI_TRICKS.filter((trick) => trick.kenteiRank === 1).at(
      -1,
    )!.id;

    expect(
      selectPromotedKenteiRank(1, KENDAMA_KENTEI_TRICKS, lacedTrickIdsForRankOne(lastRankOneId)),
    ).toBe(1);
  });

  it('promotes to the next rank once the last trick in the current rank is laced', () => {
    expect(selectPromotedKenteiRank(1, KENDAMA_KENTEI_TRICKS, lacedTrickIdsForRankOne())).toBe(2);
  });

  it('does not advance past the highest rank present even if fully laced', () => {
    const maxRank = Math.max(...KENDAMA_KENTEI_TRICKS.map((trick) => trick.kenteiRank));
    const laced = new Set(KENDAMA_KENTEI_TRICKS.map((trick) => trick.id));

    expect(selectPromotedKenteiRank(maxRank, KENDAMA_KENTEI_TRICKS, laced)).toBe(maxRank);
  });

  it('cascades through multiple already-complete ranks in one call', () => {
    const laced = new Set(
      KENDAMA_KENTEI_TRICKS.filter((trick) => trick.kenteiRank <= 3).map((trick) => trick.id),
    );

    expect(selectPromotedKenteiRank(1, KENDAMA_KENTEI_TRICKS, laced)).toBe(4);
  });

  it('promotes when the last unlaced rank-1 trick is completed only via manual marking, with no practice history for it', () => {
    const lastRankOneId = KENDAMA_KENTEI_TRICKS.filter((trick) => trick.kenteiRank === 1).at(
      -1,
    )!.id;
    const practiceLaced = lacedTrickIdsForRankOne(lastRankOneId);
    const manuallyUnlockedTrickIds = [lastRankOneId];
    const effective = selectEffectiveLacedTrickIds(practiceLaced, manuallyUnlockedTrickIds);

    expect(selectPromotedKenteiRank(1, KENDAMA_KENTEI_TRICKS, effective)).toBe(2);
  });
});

describe('selectEffectiveLacedTrickIds', () => {
  it('shows a trick as laced when the manual flag is set despite no lace history', () => {
    const effective = selectEffectiveLacedTrickIds(new Set(), ['never-practiced']);

    expect(effective.has('never-practiced')).toBe(true);
  });

  it('returns a trick to lace-derived status once the manual flag is cleared', () => {
    const effective = selectEffectiveLacedTrickIds(new Set(), []);

    expect(effective.has('never-practiced')).toBe(false);
  });

  it('keeps a trick with real lace history laced regardless of the manual flag', () => {
    const withManualFlagCleared = selectEffectiveLacedTrickIds(new Set(['big-cup']), []);
    const withManualFlagSet = selectEffectiveLacedTrickIds(new Set(['big-cup']), ['big-cup']);

    expect(withManualFlagCleared.has('big-cup')).toBe(true);
    expect(withManualFlagSet.has('big-cup')).toBe(true);
  });
});
