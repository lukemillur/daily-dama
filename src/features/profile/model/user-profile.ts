export interface UserProfile {
  readonly selectedTrickIds: readonly string[];
}

export const INITIAL_USER_PROFILE: UserProfile = {
  selectedTrickIds: [],
};

export type UserProfileAction =
  | { readonly type: 'selectedTrickToggled'; readonly trickId: string }
  | { readonly type: 'selectedTricksCleared' };

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
      return state.selectedTrickIds.length === 0 ? state : INITIAL_USER_PROFILE;
  }
}
