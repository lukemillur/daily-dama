import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { AppColors } from '@/constants/theme';
import {
  INITIAL_USER_PROFILE,
  type UserProfile,
  userProfileReducer,
} from '@/features/profile/model/user-profile';
import {
  loadUserProfile,
  saveUserProfile,
} from '@/features/profile/persistence/user-profile-persistence';
import { createWriteQueue } from '@/shared/persistence/storage';

interface UserProfileActions {
  readonly toggleSelectedTrick: (trickId: string) => void;
  readonly removeSelectedTrick: (trickId: string) => void;
  readonly clearSelectedTricks: () => void;
  readonly completeOnboarding: (kenteiRank: number, selectedTrickIds: readonly string[]) => void;
  readonly restartOnboarding: () => void;
}

const UserProfileStateContext = createContext<UserProfile | undefined>(undefined);
const UserProfileActionsContext = createContext<UserProfileActions | undefined>(undefined);

export function UserProfileProvider({ children }: PropsWithChildren) {
  const [profile, dispatch] = useReducer(userProfileReducer, INITIAL_USER_PROFILE);
  const [hasHydrated, setHasHydrated] = useState(false);
  const shouldSkipInitialWrite = useRef(true);
  const [enqueueWrite] = useState(() =>
    createWriteQueue(async (nextProfile: UserProfile) => {
      const result = await saveUserProfile(AsyncStorage, nextProfile);
      if (result.status === 'failed') {
        console.warn('Unable to persist the user profile.', result.error);
      }
    }),
  );

  useEffect(() => {
    let isCurrent = true;

    loadUserProfile(AsyncStorage).then((result) => {
      if (!isCurrent) return;

      if (result.status === 'recovered') {
        console.warn('Unable to restore the saved user profile. Using safe defaults.', result.error);
      }

      dispatch({ type: 'profileRestored', profile: result.value });
      setHasHydrated(true);
    });

    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    if (!hasHydrated) return;

    if (shouldSkipInitialWrite.current) {
      shouldSkipInitialWrite.current = false;
      return;
    }

    void enqueueWrite(profile);
  }, [enqueueWrite, hasHydrated, profile]);

  const toggleSelectedTrick = useCallback((trickId: string) => {
    dispatch({ type: 'selectedTrickToggled', trickId });
  }, []);

  const clearSelectedTricks = useCallback(() => {
    dispatch({ type: 'selectedTricksCleared' });
  }, []);

  const removeSelectedTrick = useCallback((trickId: string) => {
    dispatch({ type: 'selectedTrickRemoved', trickId });
  }, []);

  const completeOnboarding = useCallback(
    (kenteiRank: number, selectedTrickIds: readonly string[]) => {
      dispatch({ type: 'onboardingCompleted', kenteiRank, selectedTrickIds });
    },
    [],
  );

  const restartOnboarding = useCallback(() => {
    dispatch({ type: 'onboardingRestarted' });
  }, []);

  const actions = useMemo(
    () => ({
      toggleSelectedTrick,
      removeSelectedTrick,
      clearSelectedTricks,
      completeOnboarding,
      restartOnboarding,
    }),
    [
      clearSelectedTricks,
      completeOnboarding,
      removeSelectedTrick,
      restartOnboarding,
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
