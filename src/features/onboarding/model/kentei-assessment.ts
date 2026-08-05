import { KENDAMA_KENTEI_TRICKS } from '@/features/tricks/data/kendama-kentei-tricks';

const FIRST_KENTEI_RANK = 1;
const LAST_KENTEI_RANK = 12;

export type KenteiAssessmentState =
  | { readonly status: 'assessing'; readonly rank: number }
  | { readonly status: 'selecting'; readonly rank: number; readonly selectedTrickIds: readonly string[] };

export type KenteiAssessmentAction =
  | { readonly type: 'trickLanded' }
  | { readonly type: 'trickNotLanded' }
  | { readonly type: 'practiceTrickToggled'; readonly trickId: string };

export const INITIAL_KENTEI_ASSESSMENT: KenteiAssessmentState = {
  status: 'assessing',
  rank: FIRST_KENTEI_RANK,
};

export function kenteiAssessmentReducer(
  state: KenteiAssessmentState,
  action: KenteiAssessmentAction,
): KenteiAssessmentState {
  switch (action.type) {
    case 'trickLanded':
      if (state.status !== 'assessing') return state;
      return state.rank === LAST_KENTEI_RANK
        ? { status: 'selecting', rank: LAST_KENTEI_RANK, selectedTrickIds: [] }
        : { status: 'assessing', rank: state.rank + 1 };
    case 'trickNotLanded':
      return state.status === 'assessing'
        ? { status: 'selecting', rank: state.rank, selectedTrickIds: [] }
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

export function getRepresentativeTrick(rank: number) {
  const trick = KENDAMA_KENTEI_TRICKS.find((candidate) => candidate.kenteiRank === rank);
  if (!trick) throw new Error(`No representative trick exists for Kentei rank ${rank}.`);
  return trick;
}

export function getTricksForRank(rank: number) {
  return KENDAMA_KENTEI_TRICKS.filter((trick) => trick.kenteiRank === rank);
}
