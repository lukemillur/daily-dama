import type { SeshPlan } from '@/features/sesh/model/sesh';

export type LastSeshPlan =
  | { readonly kind: 'openEnded'; readonly targetLandingCount?: number }
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
  readonly streakThresholdMs?: number;
  readonly manuallyUnlockedTrickIds?: readonly string[];
  readonly themeBackgroundColor?: string;
  readonly themeAccentColor?: string;
  readonly themeTextColor?: string;
}

export const MIN_STREAK_THRESHOLD_MINUTES = 1;
export const MAX_STREAK_THRESHOLD_MINUTES = 60;
export const DEFAULT_STREAK_THRESHOLD_MS = 300_000;

export function isValidStreakThresholdMinutes(minutes: number) {
  return (
    Number.isInteger(minutes) &&
    minutes >= MIN_STREAK_THRESHOLD_MINUTES &&
    minutes <= MAX_STREAK_THRESHOLD_MINUTES
  );
}

export function isValidThemeHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

export function createStreakThresholdMs(minutes: number): number {
  if (!isValidStreakThresholdMinutes(minutes)) {
    throw new RangeError('A streak threshold must be a whole number of minutes from 1 to 60.');
  }
  return minutes * 60_000;
}

export function createLastSesh(trickId: string, plan: SeshPlan): LastSesh {
  return {
    trickId,
    plan:
      plan.kind === 'timed'
        ? { kind: 'timed', durationMinutes: plan.durationMs / 60_000 }
        : plan.target
          ? { kind: 'openEnded', targetLandingCount: plan.target.landingCount }
          : { kind: 'openEnded' },
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
  | { readonly type: 'selectedTrickAdded'; readonly trickId: string }
  | { readonly type: 'selectedTricksCleared' }
  | { readonly type: 'manualUnlockToggled'; readonly trickId: string }
  | { readonly type: 'manualUnlockRemoved'; readonly trickId: string }
  | { readonly type: 'lastSeshUpdated'; readonly lastSesh: LastSesh }
  | { readonly type: 'streakThresholdUpdated'; readonly thresholdMs: number }
  | {
      readonly type: 'themeColorsUpdated';
      readonly themeBackgroundColor?: string;
      readonly themeAccentColor?: string;
    }
  | { readonly type: 'themeTextColorUpdated'; readonly themeTextColor?: string }
  | {
      readonly type: 'onboardingCompleted';
      readonly kenteiRank: number;
      readonly selectedTrickIds: readonly string[];
      readonly lacedTrickIds: readonly string[];
    }
  | { readonly type: 'onboardingRestarted' }
  | { readonly type: 'kenteiRankAdvanced'; readonly rank: number };

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
    case 'selectedTrickAdded':
      return state.selectedTrickIds.includes(action.trickId)
        ? state
        : { ...state, selectedTrickIds: [...state.selectedTrickIds, action.trickId] };
    case 'selectedTricksCleared':
      return state.selectedTrickIds.length === 0 ? state : { ...state, selectedTrickIds: [] };
    case 'manualUnlockToggled': {
      const manuallyUnlockedTrickIds = state.manuallyUnlockedTrickIds ?? [];
      const isManuallyUnlocked = manuallyUnlockedTrickIds.includes(action.trickId);

      return {
        ...state,
        manuallyUnlockedTrickIds: isManuallyUnlocked
          ? manuallyUnlockedTrickIds.filter((trickId) => trickId !== action.trickId)
          : [...manuallyUnlockedTrickIds, action.trickId],
      };
    }
    case 'manualUnlockRemoved': {
      const manuallyUnlockedTrickIds = state.manuallyUnlockedTrickIds ?? [];
      return manuallyUnlockedTrickIds.includes(action.trickId)
        ? {
            ...state,
            manuallyUnlockedTrickIds: manuallyUnlockedTrickIds.filter(
              (trickId) => trickId !== action.trickId,
            ),
          }
        : state;
    }
    case 'lastSeshUpdated':
      return { ...state, lastSesh: action.lastSesh };
    case 'streakThresholdUpdated':
      return { ...state, streakThresholdMs: action.thresholdMs };
    case 'themeColorsUpdated':
      return {
        ...state,
        themeBackgroundColor: action.themeBackgroundColor,
        themeAccentColor: action.themeAccentColor,
        themeTextColor: undefined,
      };
    case 'themeTextColorUpdated':
      return { ...state, themeTextColor: action.themeTextColor };
    case 'onboardingCompleted':
      return {
        ...state,
        kenteiRank: action.kenteiRank,
        hasCompletedOnboarding: true,
        selectedTrickIds: [...action.selectedTrickIds],
        manuallyUnlockedTrickIds: Array.from(
          new Set([...(state.manuallyUnlockedTrickIds ?? []), ...action.lacedTrickIds]),
        ),
      };
    case 'onboardingRestarted':
      return {
        ...state,
        kenteiRank: undefined,
        hasCompletedOnboarding: false,
      };
    case 'kenteiRankAdvanced':
      return state.kenteiRank === action.rank ? state : { ...state, kenteiRank: action.rank };
  }
}
