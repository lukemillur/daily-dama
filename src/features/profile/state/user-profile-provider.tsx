import { createContext, type PropsWithChildren, useCallback, useContext, useMemo } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { track } from '@vercel/analytics';

import { AppColors } from '@/constants/theme';
import {
  createLastSesh,
  INITIAL_USER_PROFILE,
  type UserProfile,
  type UserProfileAction,
  type UserProfileActionPayload,
  userProfileReducer,
} from '@/features/profile/model/user-profile';
import {
  loadUserProfile,
  saveUserProfile,
} from '@/features/profile/persistence/user-profile-persistence';
import { createProfileSyncTransportAdapter } from '@/features/profile/persistence/profile-sync-transport';
import { useProfileDomainSync } from '@/features/profile/state/use-profile-domain-sync';
import type { SeshPlan } from '@/features/sesh/model/sesh';
import { useIdentityHandle } from '@/shared/persistence/identity-provider';
import { useIdentityScopedDomain } from '@/shared/persistence/use-identity-scoped-domain';
import { getSupabaseClient } from '@/shared/supabase/supabase-client';
import type { DomainSyncRecord, SyncTrigger } from '@/shared/sync/coordinator';
import type { SyncConflictRecord } from '@/shared/sync/conflict';

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

export interface UserProfileSync {
  readonly runSync: (trigger: SyncTrigger) => Promise<DomainSyncRecord>;
  readonly isSyncing: boolean;
  readonly lastResult: DomainSyncRecord | undefined;
  readonly hasHydrated: boolean;
  readonly localMutationTick: number;
  readonly pendingCount: number;
  readonly retryableFailureCount: number;
  readonly conflictCount: number;
  readonly conflicts: readonly SyncConflictRecord[];
  readonly resolveConflict: (recordId: string, choice: 'local' | 'server') => Promise<void>;
  readonly discardPending: () => Promise<void>;
}

const UserProfileSyncContext = createContext<UserProfileSync | undefined>(undefined);

export function UserProfileProvider({ children }: PropsWithChildren) {
  const { state: profile, dispatch, hasHydrated } = useIdentityScopedDomain({
    reducer: userProfileReducer,
    initialState: INITIAL_USER_PROFILE,
    load: loadUserProfile,
    save: saveUserProfile,
    createRestoreAction: (value: UserProfile): UserProfileAction => ({
      type: 'profileRestored',
      profile: value,
      updatedAt: value.updatedAt ?? 0,
    }),
    onRecovered: (error) => {
      console.warn('Unable to restore the saved user profile. Using safe defaults.', error);
    },
    onSaveFailed: (error) => {
      console.warn('Unable to persist the user profile.', error);
    },
  });

  // Additive: a second, parallel identity-scoped domain instance tracking
  // sync bookkeeping (T157.4). The primary reducer above stays completely
  // untouched and remains the sole source of truth for the rendered
  // `UserProfile` -- this hook only pulls/pushes in the background and, on
  // a safe pull-adopt, dispatches the same `profileRestored` action
  // hydration itself uses.
  const { identity } = useIdentityHandle();
  const getTransport = useCallback(() => {
    if (identity.kind !== 'user') return undefined;
    const client = getSupabaseClient();
    if (client === null) return undefined;
    return createProfileSyncTransportAdapter(client, identity.userId);
  }, [identity]);

  const sync = useProfileDomainSync({
    profile,
    hasHydratedProfile: hasHydrated,
    dispatchProfile: dispatch,
    getTransport,
  });

  // Single Date.now() call site for the whole profile domain (AGENTS.md:
  // keep timer/Date.now() calls outside pure reducer logic). Every
  // action-creator below dispatches through this wrapper instead of
  // `dispatch` directly so `UserProfileAction.updatedAt` is always fresh.
  const dispatchWithTimestamp = useCallback(
    (payload: UserProfileActionPayload) => dispatch({ ...payload, updatedAt: Date.now() }),
    [dispatch],
  );

  const toggleSelectedTrick = useCallback((trickId: string) => {
    dispatchWithTimestamp({ type: 'selectedTrickToggled', trickId });
  }, [dispatchWithTimestamp]);

  const addSelectedTrick = useCallback((trickId: string) => {
    dispatchWithTimestamp({ type: 'selectedTrickAdded', trickId });
  }, [dispatchWithTimestamp]);

  const clearSelectedTricks = useCallback(() => {
    dispatchWithTimestamp({ type: 'selectedTricksCleared' });
  }, [dispatchWithTimestamp]);

  const removeSelectedTrick = useCallback((trickId: string) => {
    dispatchWithTimestamp({ type: 'selectedTrickRemoved', trickId });
  }, [dispatchWithTimestamp]);

  const toggleManualUnlock = useCallback((trickId: string) => {
    dispatchWithTimestamp({ type: 'manualUnlockToggled', trickId });
  }, [dispatchWithTimestamp]);

  const removeManualUnlock = useCallback((trickId: string) => {
    dispatchWithTimestamp({ type: 'manualUnlockRemoved', trickId });
  }, [dispatchWithTimestamp]);

  const setLastSesh = useCallback((trickId: string, plan: SeshPlan) => {
    dispatchWithTimestamp({ type: 'lastSeshUpdated', lastSesh: createLastSesh(trickId, plan) });
  }, [dispatchWithTimestamp]);

  const setStreakThresholdMs = useCallback((thresholdMs: number) => {
    dispatchWithTimestamp({ type: 'streakThresholdUpdated', thresholdMs });
  }, [dispatchWithTimestamp]);

  const setThemeColors = useCallback(
    (themeBackgroundColor: string | undefined, themeAccentColor: string | undefined) => {
      dispatchWithTimestamp({ type: 'themeColorsUpdated', themeBackgroundColor, themeAccentColor });
    },
    [dispatchWithTimestamp],
  );

  const setThemeTextColor = useCallback((themeTextColor: string | undefined) => {
    dispatchWithTimestamp({ type: 'themeTextColorUpdated', themeTextColor });
  }, [dispatchWithTimestamp]);

  const completeOnboarding = useCallback(
    (kenteiRank: number, selectedTrickIds: readonly string[], lacedTrickIds: readonly string[]) => {
      dispatchWithTimestamp({ type: 'onboardingCompleted', kenteiRank, selectedTrickIds, lacedTrickIds });
      if (Platform.OS === 'web') {
        track('onboarding_completed');
      }
    },
    [dispatchWithTimestamp],
  );

  const restartOnboarding = useCallback(() => {
    dispatchWithTimestamp({ type: 'onboardingRestarted' });
  }, [dispatchWithTimestamp]);

  const advanceKenteiRank = useCallback((rank: number) => {
    dispatchWithTimestamp({ type: 'kenteiRankAdvanced', rank });
  }, [dispatchWithTimestamp]);

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
        <UserProfileSyncContext.Provider value={sync}>{children}</UserProfileSyncContext.Provider>
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

// Exposed for a future manual-retry affordance (T160.1) and for tests --
// deliberately no UI consumes this yet.
export function useUserProfileSync(): UserProfileSync {
  const sync = useContext(UserProfileSyncContext);

  if (!sync) {
    throw new Error('useUserProfileSync must be used within UserProfileProvider.');
  }

  return sync;
}
