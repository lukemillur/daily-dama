import { describe, expect, it } from '@jest/globals';

import {
  getCurrentAssessmentTrick,
  getSeedLacedTrickIds,
  getTricksForRank,
  INITIAL_KENTEI_ASSESSMENT,
  kenteiAssessmentReducer,
  type KenteiAssessmentState,
} from '@/features/onboarding/model/kentei-assessment';
import { KENDAMA_KENTEI_TRICKS } from '@/features/tricks/data/kendama-kentei-tricks';
import type { KenteiLevel } from '@/features/tricks/model/trick';

function landAllTricksInRank(state: KenteiAssessmentState, count = 5) {
  let next = state;
  for (let i = 0; i < count; i += 1) {
    next = kenteiAssessmentReducer(next, { type: 'trickLanded' });
  }
  return next;
}

describe('kenteiAssessmentReducer', () => {
  it('starts on the intro step', () => {
    expect(INITIAL_KENTEI_ASSESSMENT).toEqual({ status: 'intro' });
  });

  it('walks intro -> levelSelect -> assessing at the level\'s first rank', () => {
    const afterIntro = kenteiAssessmentReducer(INITIAL_KENTEI_ASSESSMENT, { type: 'introContinued' });
    expect(afterIntro).toEqual({ status: 'levelSelect' });

    const afterLevel = kenteiAssessmentReducer(afterIntro, { type: 'levelSelected', level: 'Advanced' });
    expect(afterLevel).toEqual({
      status: 'assessing',
      rank: 4,
      trickIndex: 0,
      startingRank: 4,
      landedTrickIds: [],
    });
  });

  it.each<[KenteiLevel, number]>([
    ['Basic', 1],
    ['Advanced', 4],
    ['Expert', 7],
    ['Master', 10],
  ])('enters assessment at the right rank for level %s', (level, expectedRank) => {
    const state = kenteiAssessmentReducer({ status: 'levelSelect' }, { type: 'levelSelected', level });
    expect(state).toEqual({
      status: 'assessing',
      rank: expectedRank,
      trickIndex: 0,
      startingRank: expectedRank,
      landedTrickIds: [],
    });
  });

  it('advances trickIndex within a rank before moving to the next rank', () => {
    const start: KenteiAssessmentState = {
      status: 'assessing',
      rank: 4,
      trickIndex: 0,
      startingRank: 4,
      landedTrickIds: [],
    };
    const firstTrick = getCurrentAssessmentTrick(4, 0);
    const afterOneLanded = kenteiAssessmentReducer(start, { type: 'trickLanded' });
    expect(afterOneLanded).toEqual({
      status: 'assessing',
      rank: 4,
      trickIndex: 1,
      startingRank: 4,
      landedTrickIds: [firstTrick.id],
    });
  });

  it('appends the landed trick id to landedTrickIds', () => {
    const start: KenteiAssessmentState = {
      status: 'assessing',
      rank: 4,
      trickIndex: 0,
      startingRank: 4,
      landedTrickIds: [],
    };
    const firstTrick = getCurrentAssessmentTrick(4, 0);
    const afterOneLanded = kenteiAssessmentReducer(start, { type: 'trickLanded' });
    expect(afterOneLanded.status === 'assessing' && afterOneLanded.landedTrickIds).toEqual([
      firstTrick.id,
    ]);
  });

  it('advances to the next rank after landing all 5 tricks in the current rank', () => {
    const start: KenteiAssessmentState = {
      status: 'assessing',
      rank: 4,
      trickIndex: 0,
      startingRank: 4,
      landedTrickIds: [],
    };
    const afterRank = landAllTricksInRank(start);
    const expectedLandedIds = getTricksForRank(4).map((trick) => trick.id);
    expect(afterRank).toEqual({
      status: 'assessing',
      rank: 5,
      trickIndex: 0,
      startingRank: 4,
      landedTrickIds: expectedLandedIds,
    });
  });

  it('accumulates landedTrickIds across a rank rollover', () => {
    let state: KenteiAssessmentState = {
      status: 'assessing',
      rank: 4,
      trickIndex: 0,
      startingRank: 4,
      landedTrickIds: [],
    };
    state = landAllTricksInRank(state); // rank 5
    state = landAllTricksInRank(state); // rank 6
    const expectedLandedIds = [
      ...getTricksForRank(4).map((trick) => trick.id),
      ...getTricksForRank(5).map((trick) => trick.id),
    ];
    expect(state.status === 'assessing' && state.landedTrickIds).toEqual(expectedLandedIds);
  });

  it('rolls into the next level after landing every rank in a chosen level', () => {
    let state: KenteiAssessmentState = {
      status: 'assessing',
      rank: 4,
      trickIndex: 0,
      startingRank: 4,
      landedTrickIds: [],
    };
    state = landAllTricksInRank(state); // rank 5
    state = landAllTricksInRank(state); // rank 6
    state = landAllTricksInRank(state); // rolls into Expert, rank 7
    expect(state).toEqual({
      status: 'assessing',
      rank: 7,
      trickIndex: 0,
      startingRank: 4,
      landedTrickIds: [
        ...getTricksForRank(4).map((trick) => trick.id),
        ...getTricksForRank(5).map((trick) => trick.id),
        ...getTricksForRank(6).map((trick) => trick.id),
      ],
    });
  });

  it('ends in rankReveal after landing every trick through rank 12', () => {
    let state: KenteiAssessmentState = {
      status: 'assessing',
      rank: 12,
      trickIndex: 0,
      startingRank: 12,
      landedTrickIds: [],
    };
    state = landAllTricksInRank(state, 4);
    state = kenteiAssessmentReducer(state, { type: 'trickLanded' });
    expect(state).toEqual({
      status: 'rankReveal',
      rank: 12,
      startingRank: 12,
      landedTrickIds: getTricksForRank(12).map((trick) => trick.id),
    });
  });

  it('falls back to the previous rank when the first trick of a rank is not landed', () => {
    const state: KenteiAssessmentState = {
      status: 'assessing',
      rank: 5,
      trickIndex: 0,
      startingRank: 4,
      landedTrickIds: ['some-trick'],
    };
    const result = kenteiAssessmentReducer(state, { type: 'trickNotLanded' });
    expect(result).toEqual({
      status: 'rankReveal',
      rank: 4,
      startingRank: 4,
      landedTrickIds: ['some-trick'],
    });
  });

  it('floors at rank 1 when the first trick of rank 1 is not landed', () => {
    const state: KenteiAssessmentState = {
      status: 'assessing',
      rank: 1,
      trickIndex: 0,
      startingRank: 1,
      landedTrickIds: [],
    };
    const result = kenteiAssessmentReducer(state, { type: 'trickNotLanded' });
    expect(result).toEqual({
      status: 'rankReveal',
      rank: 1,
      startingRank: 1,
      landedTrickIds: [],
    });
  });

  it('keeps the current rank when a later (non-first) trick is not landed', () => {
    const state: KenteiAssessmentState = {
      status: 'assessing',
      rank: 5,
      trickIndex: 2,
      startingRank: 4,
      landedTrickIds: [],
    };
    const result = kenteiAssessmentReducer(state, { type: 'trickNotLanded' });
    expect(result).toEqual({
      status: 'rankReveal',
      rank: 5,
      startingRank: 4,
      landedTrickIds: [],
    });
  });

  it('does not add the trick being asked about when not landed', () => {
    const state: KenteiAssessmentState = {
      status: 'assessing',
      rank: 5,
      trickIndex: 2,
      startingRank: 4,
      landedTrickIds: ['prior-trick'],
    };
    const result = kenteiAssessmentReducer(state, { type: 'trickNotLanded' });
    expect(result.status === 'rankReveal' && result.landedTrickIds).toEqual(['prior-trick']);
  });

  it('moves from rankReveal to selecting on continue', () => {
    const state: KenteiAssessmentState = {
      status: 'rankReveal',
      rank: 6,
      startingRank: 4,
      landedTrickIds: ['trick-a'],
    };
    const result = kenteiAssessmentReducer(state, { type: 'rankRevealContinued' });
    expect(result).toEqual({
      status: 'selecting',
      rank: 6,
      selectedTrickIds: [],
      startingRank: 4,
      landedTrickIds: ['trick-a'],
    });
  });

  it('toggles practice tricks only while selecting', () => {
    const state: KenteiAssessmentState = {
      status: 'selecting',
      rank: 6,
      selectedTrickIds: [],
      startingRank: 4,
      landedTrickIds: [],
    };
    const toggledOn = kenteiAssessmentReducer(state, { type: 'practiceTrickToggled', trickId: 'trick-a' });
    expect(toggledOn.status === 'selecting' && toggledOn.selectedTrickIds).toEqual(['trick-a']);

    const toggledOff = kenteiAssessmentReducer(toggledOn, { type: 'practiceTrickToggled', trickId: 'trick-a' });
    expect(toggledOff.status === 'selecting' && toggledOff.selectedTrickIds).toEqual([]);
  });

  it('moves from selecting to themeSelect on themeStepEntered, carrying fields through', () => {
    const state: KenteiAssessmentState = {
      status: 'selecting',
      rank: 6,
      selectedTrickIds: ['trick-a'],
      startingRank: 4,
      landedTrickIds: ['trick-b'],
    };
    const next = kenteiAssessmentReducer(state, { type: 'themeStepEntered' });
    expect(next).toEqual({
      status: 'themeSelect',
      rank: 6,
      selectedTrickIds: ['trick-a'],
      startingRank: 4,
      landedTrickIds: ['trick-b'],
    });
  });

  it('ignores themeStepEntered outside of selecting', () => {
    const state: KenteiAssessmentState = { status: 'intro' };
    expect(kenteiAssessmentReducer(state, { type: 'themeStepEntered' })).toEqual(state);
  });
});

describe('getCurrentAssessmentTrick', () => {
  it('returns the trick at the given index within a rank', () => {
    const trick = getCurrentAssessmentTrick(4, 0);
    expect(trick.kenteiRank).toBe(4);
  });

  it('throws for an out-of-range index', () => {
    expect(() => getCurrentAssessmentTrick(4, 99)).toThrow();
  });
});

describe('getSeedLacedTrickIds', () => {
  it('unions tricks below the resolved rank with explicitly landed tricks', () => {
    const rank = 4;
    const landedTrickIds = ['trick-x', 'trick-y'];
    const result = getSeedLacedTrickIds(rank, landedTrickIds);

    const belowRankIds = KENDAMA_KENTEI_TRICKS.filter((trick) => trick.kenteiRank < rank).map(
      (trick) => trick.id,
    );

    expect(new Set(result)).toEqual(new Set([...belowRankIds, ...landedTrickIds]));
    expect(result.length).toBe(new Set(result).size);
  });

  it('de-duplicates when a landed trick id is also below the resolved rank', () => {
    const rank = 4;
    const belowRankTrick = getTricksForRank(1)[0];
    const result = getSeedLacedTrickIds(rank, [belowRankTrick.id]);

    expect(result.filter((id) => id === belowRankTrick.id)).toHaveLength(1);
  });

  it('returns just the landed tricks when resolved at rank 1 (Basic level)', () => {
    const landedTrickIds = ['trick-a', 'trick-b'];
    const result = getSeedLacedTrickIds(1, landedTrickIds);
    expect(result).toEqual(landedTrickIds);
  });

  it('does not seed the resolved rank itself when it was never verified (T032 regression)', () => {
    // Entrance rank 4, immediate first-trick failure -> resolved rank 3, nothing landed.
    const result = getSeedLacedTrickIds(3, []);

    const rank1Ids = getTricksForRank(1).map((trick) => trick.id);
    const rank2Ids = getTricksForRank(2).map((trick) => trick.id);
    const rank3Ids = getTricksForRank(3).map((trick) => trick.id);

    for (const id of [...rank1Ids, ...rank2Ids]) {
      expect(result).toContain(id);
    }
    for (const id of rank3Ids) {
      expect(result).not.toContain(id);
    }
  });
});

describe('getSeedLacedTrickIds via the reducer (T032 regression)', () => {
  it('does not seed the resolved rank when the entrance rank is failed immediately', () => {
    let state = kenteiAssessmentReducer(INITIAL_KENTEI_ASSESSMENT, { type: 'introContinued' });
    state = kenteiAssessmentReducer(state, { type: 'levelSelected', level: 'Advanced' });
    state = kenteiAssessmentReducer(state, { type: 'trickNotLanded' });

    if (state.status !== 'rankReveal') throw new Error('Expected rankReveal status');
    expect(state.rank).toBe(3);
    expect(state.landedTrickIds).toEqual([]);

    const result = getSeedLacedTrickIds(state.rank, state.landedTrickIds);

    const rank1Ids = getTricksForRank(1).map((trick) => trick.id);
    const rank2Ids = getTricksForRank(2).map((trick) => trick.id);
    const rank3Ids = getTricksForRank(3).map((trick) => trick.id);

    for (const id of [...rank1Ids, ...rank2Ids]) {
      expect(result).toContain(id);
    }
    for (const id of rank3Ids) {
      expect(result).not.toContain(id);
    }
  });
});
