import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useMemo,
  useReducer,
} from 'react';

import {
  INITIAL_USER_PROFILE,
  type UserProfile,
  userProfileReducer,
} from '@/features/profile/model/user-profile';

interface UserProfileActions {
  readonly toggleSelectedTrick: (trickId: string) => void;
  readonly clearSelectedTricks: () => void;
  readonly completeOnboarding: (kenteiRank: number, selectedTrickIds: readonly string[]) => void;
  readonly restartOnboarding: () => void;
}

const UserProfileStateContext = createContext<UserProfile | undefined>(undefined);
const UserProfileActionsContext = createContext<UserProfileActions | undefined>(undefined);

export function UserProfileProvider({ children }: PropsWithChildren) {
  const [profile, dispatch] = useReducer(userProfileReducer, INITIAL_USER_PROFILE);

  const toggleSelectedTrick = useCallback((trickId: string) => {
    dispatch({ type: 'selectedTrickToggled', trickId });
  }, []);

  const clearSelectedTricks = useCallback(() => {
    dispatch({ type: 'selectedTricksCleared' });
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
    () => ({ toggleSelectedTrick, clearSelectedTricks, completeOnboarding, restartOnboarding }),
    [clearSelectedTricks, completeOnboarding, restartOnboarding, toggleSelectedTrick],
  );

  return (
    <UserProfileStateContext.Provider value={profile}>
      <UserProfileActionsContext.Provider value={actions}>
        {children}
      </UserProfileActionsContext.Provider>
    </UserProfileStateContext.Provider>
  );
}

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
