import { describe, expect, it } from '@jest/globals';

import {
  getCurrentAssessmentTrick,
  INITIAL_KENTEI_ASSESSMENT,
  kenteiAssessmentReducer,
  type KenteiAssessmentState,
} from '@/features/onboarding/model/kentei-assessment';
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
    expect(afterLevel).toEqual({ status: 'assessing', rank: 4, trickIndex: 0 });
  });

  it.each<[KenteiLevel, number]>([
    ['Basic', 1],
    ['Advanced', 4],
    ['Expert', 7],
    ['Master', 10],
  ])('enters assessment at the right rank for level %s', (level, expectedRank) => {
    const state = kenteiAssessmentReducer({ status: 'levelSelect' }, { type: 'levelSelected', level });
    expect(state).toEqual({ status: 'assessing', rank: expectedRank, trickIndex: 0 });
  });

  it('advances trickIndex within a rank before moving to the next rank', () => {
    const start: KenteiAssessmentState = { status: 'assessing', rank: 4, trickIndex: 0 };
    const afterOneLanded = kenteiAssessmentReducer(start, { type: 'trickLanded' });
    expect(afterOneLanded).toEqual({ status: 'assessing', rank: 4, trickIndex: 1 });
  });

  it('advances to the next rank after landing all 5 tricks in the current rank', () => {
    const start: KenteiAssessmentState = { status: 'assessing', rank: 4, trickIndex: 0 };
    const afterRank = landAllTricksInRank(start);
    expect(afterRank).toEqual({ status: 'assessing', rank: 5, trickIndex: 0 });
  });

  it('rolls into the next level after landing every rank in a chosen level', () => {
    let state: KenteiAssessmentState = { status: 'assessing', rank: 4, trickIndex: 0 };
    state = landAllTricksInRank(state); // rank 5
    state = landAllTricksInRank(state); // rank 6
    state = landAllTricksInRank(state); // rolls into Expert, rank 7
    expect(state).toEqual({ status: 'assessing', rank: 7, trickIndex: 0 });
  });

  it('ends in rankReveal after landing every trick through rank 12', () => {
    let state: KenteiAssessmentState = { status: 'assessing', rank: 12, trickIndex: 0 };
    state = landAllTricksInRank(state, 4);
    state = kenteiAssessmentReducer(state, { type: 'trickLanded' });
    expect(state).toEqual({ status: 'rankReveal', rank: 12 });
  });

  it('falls back to the previous rank when the first trick of a rank is not landed', () => {
    const state: KenteiAssessmentState = { status: 'assessing', rank: 5, trickIndex: 0 };
    const result = kenteiAssessmentReducer(state, { type: 'trickNotLanded' });
    expect(result).toEqual({ status: 'rankReveal', rank: 4 });
  });

  it('floors at rank 1 when the first trick of rank 1 is not landed', () => {
    const state: KenteiAssessmentState = { status: 'assessing', rank: 1, trickIndex: 0 };
    const result = kenteiAssessmentReducer(state, { type: 'trickNotLanded' });
    expect(result).toEqual({ status: 'rankReveal', rank: 1 });
  });

  it('keeps the current rank when a later (non-first) trick is not landed', () => {
    const state: KenteiAssessmentState = { status: 'assessing', rank: 5, trickIndex: 2 };
    const result = kenteiAssessmentReducer(state, { type: 'trickNotLanded' });
    expect(result).toEqual({ status: 'rankReveal', rank: 5 });
  });

  it('moves from rankReveal to selecting on continue', () => {
    const state: KenteiAssessmentState = { status: 'rankReveal', rank: 6 };
    const result = kenteiAssessmentReducer(state, { type: 'rankRevealContinued' });
    expect(result).toEqual({ status: 'selecting', rank: 6, selectedTrickIds: [] });
  });

  it('toggles practice tricks only while selecting', () => {
    const state: KenteiAssessmentState = { status: 'selecting', rank: 6, selectedTrickIds: [] };
    const toggledOn = kenteiAssessmentReducer(state, { type: 'practiceTrickToggled', trickId: 'trick-a' });
    expect(toggledOn.status === 'selecting' && toggledOn.selectedTrickIds).toEqual(['trick-a']);

    const toggledOff = kenteiAssessmentReducer(toggledOn, { type: 'practiceTrickToggled', trickId: 'trick-a' });
    expect(toggledOff.status === 'selecting' && toggledOff.selectedTrickIds).toEqual([]);
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
