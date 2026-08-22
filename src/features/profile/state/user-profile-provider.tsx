import { createContext, type PropsWithChildren, useCallback, useContext, useMemo } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { track } from '@vercel/analytics';

import { AppColors } from '@/constants/theme';
import {
  createLastSesh,
  INITIAL_USER_PROFILE,
  type UserProfile,
  type UserProfileAction,
  userProfileReducer,
} from '@/features/profile/model/user-profile';
import {
  loadUserProfile,
  saveUserProfile,
} from '@/features/profile/persistence/user-profile-persistence';
import type { SeshPlan } from '@/features/sesh/model/sesh';
import { useIdentityScopedDomain } from '@/shared/persistence/use-identity-scoped-domain';

interface UserProfileActions {
  readonly toggleSelectedTrick: (trickId: string) => void;
  readonly addSelectedTrick: (trickId: string) => void;
  readonly removeSelectedTrick: (trickId: string) => void;
  readonly clearSelectedTricks: () => void;
  readonly toggleManualUnlock: (trickId: string) => void;
  readonly removeManualUnlock: (trickId: string) => void;
  readonly setLastSesh: (trickId: string, plan: SeshPlan) => void;
  readonly setStreakThresholdMs: (thresholdMs: number) => void;
  readonly setThemeColors: (
    themeBackgroundColor: string | undefined,
    themeAccentColor: string | undefined,
  ) => void;
  readonly setThemeTextColor: (themeTextColor: string | undefined) => void;
  readonly completeOnboarding: (
    kenteiRank: number,
    selectedTrickIds: readonly string[],
    lacedTrickIds: readonly string[],
  ) => void;
  readonly restartOnboarding: () => void;
  readonly advanceKenteiRank: (rank: number) => void;
}

const UserProfileStateContext = createContext<UserProfile | undefined>(undefined);
const UserProfileActionsContext = createContext<UserProfileActions | undefined>(undefined);

export function UserProfileProvider({ children }: PropsWithChildren) {
  const { state: profile, dispatch, hasHydrated } = useIdentityScopedDomain({
    reducer: userProfileReducer,
    initialState: INITIAL_USER_PROFILE,
    load: loadUserProfile,
    save: saveUserProfile,
    createRestoreAction: (value: UserProfile): UserProfileAction => ({
      type: 'profileRestored',
      profile: value,
    }),
    onRecovered: (error) => {
      console.warn('Unable to restore the saved user profile. Using safe defaults.', error);
    },
    onSaveFailed: (error) => {
      console.warn('Unable to persist the user profile.', error);
    },
  });

  const toggleSelectedTrick = useCallback((trickId: string) => {
    dispatch({ type: 'selectedTrickToggled', trickId });
  }, []);

  const addSelectedTrick = useCallback((trickId: string) => {
    dispatch({ type: 'selectedTrickAdded', trickId });
  }, []);

  const clearSelectedTricks = useCallback(() => {
    dispatch({ type: 'selectedTricksCleared' });
  }, []);

  const removeSelectedTrick = useCallback((trickId: string) => {
    dispatch({ type: 'selectedTrickRemoved', trickId });
  }, []);

  const toggleManualUnlock = useCallback((trickId: string) => {
    dispatch({ type: 'manualUnlockToggled', trickId });
  }, []);

  const removeManualUnlock = useCallback((trickId: string) => {
    dispatch({ type: 'manualUnlockRemoved', trickId });
  }, []);

  const setLastSesh = useCallback((trickId: string, plan: SeshPlan) => {
    dispatch({ type: 'lastSeshUpdated', lastSesh: createLastSesh(trickId, plan) });
  }, []);

  const setStreakThresholdMs = useCallback((thresholdMs: number) => {
    dispatch({ type: 'streakThresholdUpdated', thresholdMs });
  }, []);

  const setThemeColors = useCallback(
    (themeBackgroundColor: string | undefined, themeAccentColor: string | undefined) => {
      dispatch({ type: 'themeColorsUpdated', themeBackgroundColor, themeAccentColor });
    },
    [],
  );

  const setThemeTextColor = useCallback((themeTextColor: string | undefined) => {
    dispatch({ type: 'themeTextColorUpdated', themeTextColor });
  }, []);

  const completeOnboarding = useCallback(
    (kenteiRank: number, selectedTrickIds: readonly string[], lacedTrickIds: readonly string[]) => {
      dispatch({ type: 'onboardingCompleted', kenteiRank, selectedTrickIds, lacedTrickIds });
      if (Platform.OS === 'web') {
        track('onboarding_completed');
      }
    },
    [],
  );

  const restartOnboarding = useCallback(() => {
    dispatch({ type: 'onboardingRestarted' });
  }, []);

  const advanceKenteiRank = useCallback((rank: number) => {
    dispatch({ type: 'kenteiRankAdvanced', rank });
  }, []);

  const actions = useMemo(
    () => ({
      toggleSelectedTrick,
      addSelectedTrick,
      removeSelectedTrick,
      clearSelectedTricks,
      toggleManualUnlock,
      removeManualUnlock,
      setLastSesh,
      setStreakThresholdMs,
      setThemeColors,
      setThemeTextColor,
      completeOnboarding,
      restartOnboarding,
      advanceKenteiRank,
    }),
    [
      addSelectedTrick,
      advanceKenteiRank,
      clearSelectedTricks,
      completeOnboarding,
      removeManualUnlock,
      removeSelectedTrick,
      restartOnboarding,
      setLastSesh,
      setStreakThresholdMs,
      setThemeColors,
      setThemeTextColor,
      toggleManualUnlock,
      toggleSelectedTrick,
    ],
  );

  if (!hasHydrated) {
    return (
      <View style={styles.hydrationFallback}>
        <Text style={styles.hydrationWordmark}>Daily Dama</Text>
        <Text style={styles.hydrationMessage}>Loading your practice...</Text>
      </View>
    );
  }

  return (
    <UserProfileStateContext.Provider value={profile}>
      <UserProfileActionsContext.Provider value={actions}>
        {children}
      </UserProfileActionsContext.Provider>
    </UserProfileStateContext.Provider>
  );
}

const styles = StyleSheet.create({
  hydrationFallback: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: AppColors.yellow,
  },
  hydrationWordmark: {
    color: AppColors.ink,
    fontSize: 28,
    fontWeight: 900,
    letterSpacing: -0.8,
  },
  hydrationMessage: {
    color: AppColors.inkSoft,
    fontSize: 14,
    fontWeight: 700,
    marginTop: 8,
  },
});

export function useUserProfile() {
  const profile = useContext(UserProfileStateContext);

  if (!profile) {
    throw new Error('useUserProfile must be used within UserProfileProvider.');
  }

  return profile;
}

export function useUserProfileActions() {
  const actions = useContext(UserProfileActionsContext);

  if (!actions) {
    throw new Error('useUserProfileActions must be used within UserProfileProvider.');
  }

  return actions;
}
