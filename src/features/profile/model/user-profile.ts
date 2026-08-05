export interface UserProfile {
  readonly selectedTrickIds: readonly string[];
  readonly kenteiRank?: number;
  readonly hasCompletedOnboarding: boolean;
}

export const INITIAL_USER_PROFILE: UserProfile = {
  selectedTrickIds: [],
  hasCompletedOnboarding: false,
};

export type UserProfileAction =
  | { readonly type: 'selectedTrickToggled'; readonly trickId: string }
  | { readonly type: 'selectedTricksCleared' }
  | {
      readonly type: 'onboardingCompleted';
      readonly kenteiRank: number;
      readonly selectedTrickIds: readonly string[];
    }
  | { readonly type: 'onboardingRestarted' };

export function userProfileReducer(
  state: UserProfile,
  action: UserProfileAction,
): UserProfile {
  switch (action.type) {
    case 'selectedTrickToggled': {
      const isSelected = state.selectedTrickIds.includes(action.trickId);

      return {
        ...state,
        selectedTrickIds: isSelected
          ? state.selectedTrickIds.filter((trickId) => trickId !== action.trickId)
          : [...state.selectedTrickIds, action.trickId],
      };
    }
    case 'selectedTricksCleared':
      return state.selectedTrickIds.length === 0 ? state : { ...state, selectedTrickIds: [] };
    case 'onboardingCompleted':
      return {
        ...state,
        kenteiRank: action.kenteiRank,
        hasCompletedOnboarding: true,
        selectedTrickIds: [...action.selectedTrickIds],
      };
    case 'onboardingRestarted':
      return {
        ...state,
        kenteiRank: undefined,
        hasCompletedOnboarding: false,
      };
  }
}
