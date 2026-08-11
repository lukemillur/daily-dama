import { getKenteiRankRangeForLevel, KENDAMA_KENTEI_TRICKS } from '@/features/tricks/data/kendama-kentei-tricks';
import type { KenteiLevel } from '@/features/tricks/model/trick';

const FIRST_KENTEI_RANK = 1;
const LAST_KENTEI_RANK = 12;

export type KenteiAssessmentState =
  | { readonly status: 'intro' }
  | { readonly status: 'levelSelect' }
  | {
      readonly status: 'assessing';
      readonly rank: number;
      readonly trickIndex: number;
      readonly startingRank: number;
      readonly landedTrickIds: readonly string[];
    }
  | {
      readonly status: 'rankReveal';
      readonly rank: number;
      readonly startingRank: number;
      readonly landedTrickIds: readonly string[];
    }
  | {
      readonly status: 'selecting';
      readonly rank: number;
      readonly selectedTrickIds: readonly string[];
      readonly startingRank: number;
      readonly landedTrickIds: readonly string[];
    };

export type KenteiAssessmentAction =
  | { readonly type: 'introContinued' }
  | { readonly type: 'levelSelected'; readonly level: KenteiLevel }
  | { readonly type: 'trickLanded' }
  | { readonly type: 'trickNotLanded' }
  | { readonly type: 'rankRevealContinued' }
  | { readonly type: 'practiceTrickToggled'; readonly trickId: string };

export const INITIAL_KENTEI_ASSESSMENT: KenteiAssessmentState = { status: 'intro' };

export function kenteiAssessmentReducer(
  state: KenteiAssessmentState,
  action: KenteiAssessmentAction,
): KenteiAssessmentState {
  switch (action.type) {
    case 'introContinued':
      return state.status === 'intro' ? { status: 'levelSelect' } : state;
    case 'levelSelected': {
      if (state.status !== 'levelSelect') return state;
      const { first } = getKenteiRankRangeForLevel(action.level);
      return { status: 'assessing', rank: first, trickIndex: 0, startingRank: first, landedTrickIds: [] };
    }
    case 'trickLanded': {
      if (state.status !== 'assessing') return state;
      const tricksInRank = getTricksForRank(state.rank);
      const isLastTrickInRank = state.trickIndex === tricksInRank.length - 1;
      const landedTrick = getCurrentAssessmentTrick(state.rank, state.trickIndex);
      const landedTrickIds = [...state.landedTrickIds, landedTrick.id];
      if (!isLastTrickInRank) {
        return { ...state, trickIndex: state.trickIndex + 1, landedTrickIds };
      }
      if (state.rank === LAST_KENTEI_RANK) {
        return {
          status: 'rankReveal',
          rank: LAST_KENTEI_RANK,
          startingRank: state.startingRank,
          landedTrickIds,
        };
      }
      return {
        status: 'assessing',
        rank: state.rank + 1,
        trickIndex: 0,
        startingRank: state.startingRank,
        landedTrickIds,
      };
    }
    case 'trickNotLanded': {
      if (state.status !== 'assessing') return state;
      const isFirstTrickInRank = state.trickIndex === 0;
      const finalRank =
        isFirstTrickInRank && state.rank > FIRST_KENTEI_RANK ? state.rank - 1 : state.rank;
      return {
        status: 'rankReveal',
        rank: finalRank,
        startingRank: state.startingRank,
        landedTrickIds: state.landedTrickIds,
      };
    }
    case 'rankRevealContinued':
      return state.status === 'rankReveal'
        ? {
            status: 'selecting',
            rank: state.rank,
            selectedTrickIds: [],
            startingRank: state.startingRank,
            landedTrickIds: state.landedTrickIds,
          }
        : state;
    case 'practiceTrickToggled':
      if (state.status !== 'selecting') return state;
      return {
        ...state,
        selectedTrickIds: state.selectedTrickIds.includes(action.trickId)
          ? state.selectedTrickIds.filter((trickId) => trickId !== action.trickId)
          : [...state.selectedTrickIds, action.trickId],
      };
  }
}

export function getCurrentAssessmentTrick(rank: number, trickIndex: number) {
  const trick = getTricksForRank(rank)[trickIndex];
  if (!trick) throw new Error(`No assessment trick exists for Kentei rank ${rank}, index ${trickIndex}.`);
  return trick;
}

export function getTricksForRank(rank: number) {
  return KENDAMA_KENTEI_TRICKS.filter((trick) => trick.kenteiRank === rank);
}

export function getSeedLacedTrickIds(
  startingRank: number,
  landedTrickIds: readonly string[],
): readonly string[] {
  const belowStartingRank = KENDAMA_KENTEI_TRICKS.filter(
    (trick) => trick.kenteiRank < startingRank,
  ).map((trick) => trick.id);
  return Array.from(new Set([...belowStartingRank, ...landedTrickIds]));
}
