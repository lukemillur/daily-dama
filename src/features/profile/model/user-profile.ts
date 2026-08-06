import type { SeshPlan } from '@/features/sesh/model/sesh';

export type LastSeshPlan =
  | { readonly kind: 'openEnded' }
  | { readonly kind: 'timed'; readonly durationMinutes: number };

export interface LastSesh {
  readonly trickId: string;
  readonly plan: LastSeshPlan;
}

export interface UserProfile {
  readonly selectedTrickIds: readonly string[];
  readonly kenteiRank?: number;
  readonly hasCompletedOnboarding: boolean;
  readonly lastSesh?: LastSesh;
}

export function createLastSesh(trickId: string, plan: SeshPlan): LastSesh {
  return {
    trickId,
    plan: plan.kind === 'timed' ? { kind: 'timed', durationMinutes: plan.durationMs / 60_000 } : { kind: 'openEnded' },
  };
}

export const INITIAL_USER_PROFILE: UserProfile = {
  selectedTrickIds: [],
  hasCompletedOnboarding: false,
};

export type UserProfileAction =
  | { readonly type: 'profileRestored'; readonly profile: UserProfile }
  | { readonly type: 'selectedTrickToggled'; readonly trickId: string }
  | { readonly type: 'selectedTrickRemoved'; readonly trickId: string }
  | { readonly type: 'selectedTricksCleared' }
  | { readonly type: 'lastSeshUpdated'; readonly lastSesh: LastSesh }
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
    case 'profileRestored':
      return action.profile;
    case 'selectedTrickToggled': {
      const isSelected = state.selectedTrickIds.includes(action.trickId);

      return {
        ...state,
        selectedTrickIds: isSelected
          ? state.selectedTrickIds.filter((trickId) => trickId !== action.trickId)
          : [...state.selectedTrickIds, action.trickId],
      };
    }
    case 'selectedTrickRemoved':
      return state.selectedTrickIds.includes(action.trickId)
        ? {
            ...state,
            selectedTrickIds: state.selectedTrickIds.filter(
              (trickId) => trickId !== action.trickId,
            ),
          }
        : state;
    case 'selectedTricksCleared':
      return state.selectedTrickIds.length === 0 ? state : { ...state, selectedTrickIds: [] };
    case 'lastSeshUpdated':
      return { ...state, lastSesh: action.lastSesh };
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
