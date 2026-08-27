import { createContext, type PropsWithChildren, useCallback, useContext, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppColors } from '@/constants/theme';
import {
  applyGoalTargetEdit,
  type GoalAction,
  createGoal,
  createGoalId,
  type Goal,
  type GoalCollection,
  type GoalCreationInput,
  type GoalDraftErrors,
  goalReducer,
  type GoalTargetEditErrors,
  type GoalTargetEditInput,
  INITIAL_GOALS,
  validateGoalCreation,
  validateGoalTargetEdit,
} from '@/features/goals/model/goal';
import { loadGoals, saveGoals } from '@/features/goals/persistence/goal-persistence';
import { createGoalSyncTransportAdapter } from '@/features/goals/persistence/goal-sync-transport';
import { useGoalDomainSync } from '@/features/goals/state/use-goal-domain-sync';
import { useUserProfileActions } from '@/features/profile/state/user-profile-provider';
import { useIdentityHandle } from '@/shared/persistence/identity-provider';
import { useIdentityScopedDomain } from '@/shared/persistence/use-identity-scoped-domain';
import { getSupabaseClient } from '@/shared/supabase/supabase-client';
import type { DomainSyncRecord, SyncTrigger } from '@/shared/sync/coordinator';

type SaveGoalResult =
  | { readonly status: 'invalid'; readonly errors: GoalDraftErrors }
  | { readonly status: 'saved'; readonly goal: Goal };

type EditGoalResult =
  | { readonly status: 'invalid'; readonly errors: GoalTargetEditErrors }
  | { readonly status: 'saved'; readonly goal: Goal }
  | { readonly status: 'missing' };

interface GoalActions {
  readonly addGoal: (input: GoalCreationInput) => SaveGoalResult;
  readonly editGoal: (goalId: string, input: GoalTargetEditInput) => EditGoalResult;
  readonly deleteGoal: (goalId: string) => void;
}

const GoalStateContext = createContext<GoalCollection | undefined>(undefined);
const GoalActionsContext = createContext<GoalActions | undefined>(undefined);

export interface GoalSync {
  readonly runSync: (trigger: SyncTrigger) => Promise<DomainSyncRecord>;
  readonly isSyncing: boolean;
  readonly lastResult: DomainSyncRecord | undefined;
  readonly hasHydrated: boolean;
  readonly localMutationTick: number;
  readonly pendingCount: number;
  readonly retryableFailureCount: number;
  readonly conflictCount: number;
  readonly discardPending: () => Promise<void>;
}

const GoalSyncContext = createContext<GoalSync | undefined>(undefined);

export function GoalProvider({ children }: PropsWithChildren) {
  // GoalProvider must be rendered inside UserProfileProvider (see _layout.tsx's provider
  // nesting order) so addGoal can focus the goal's trick as part of the same save action.
  const { addSelectedTrick } = useUserProfileActions();
  const { state: collection, dispatch, hasHydrated } = useIdentityScopedDomain({
    reducer: goalReducer,
    initialState: INITIAL_GOALS,
    load: loadGoals,
    save: saveGoals,
    createRestoreAction: (value: GoalCollection): GoalAction => ({
      type: 'goalsRestored',
      collection: value,
    }),
    onRecovered: (error) => {
      console.warn('Unable to restore goals. Using an empty collection.', error);
    },
    onSaveFailed: (error) => {
      console.warn('Unable to persist goals.', error);
    },
  });

  // Additive: a second, parallel identity-scoped domain instance tracking
  // sync bookkeeping (T157.7). The primary reducer above stays completely
  // untouched and remains the sole source of truth for the rendered
  // `GoalCollection` -- this hook only pulls/pushes in the background and,
  // on a safe pull-adopt, dispatches the same `goalsRestored` action
  // hydration itself uses.
  const { identity } = useIdentityHandle();
  const getTransport = useCallback(() => {
    if (identity.kind !== 'user') return undefined;
    const client = getSupabaseClient();
    if (client === null) return undefined;
    return createGoalSyncTransportAdapter(client, identity.userId);
  }, [identity]);

  const sync = useGoalDomainSync({
    collection,
    hasHydratedCollection: hasHydrated,
    dispatchCollection: dispatch,
    getTransport,
  });

  const addGoal = useCallback((input: GoalCreationInput): SaveGoalResult => {
    const validation = validateGoalCreation(input);
    if (validation.status === 'invalid') return validation;

    const goal = createGoal(createGoalId(), validation.value);
    dispatch({ type: 'goalAdded', goal });
    addSelectedTrick(goal.trickId);
    return { status: 'saved', goal };
  }, [addSelectedTrick]);

  const editGoal = useCallback(
    (goalId: string, input: GoalTargetEditInput): EditGoalResult => {
      const existing = collection.goals.find((goal) => goal.id === goalId);
      if (!existing || existing.kind !== input.kind) return { status: 'missing' };

      const validation = validateGoalTargetEdit(input);
      if (validation.status === 'invalid') return validation;

      const goal = applyGoalTargetEdit(existing, validation.value);
      dispatch({ type: 'goalEdited', goal });
      return { status: 'saved', goal };
    },
    [collection.goals],
  );

  const deleteGoal = useCallback((goalId: string) => {
    dispatch({ type: 'goalDeleted', goalId });
  }, []);

  const actions = useMemo(
    () => ({ addGoal, editGoal, deleteGoal }),
    [addGoal, editGoal, deleteGoal],
  );

  if (!hasHydrated) {
    return (
      <View style={styles.hydrationFallback}>
        <Text style={styles.wordmark}>Daily Dama</Text>
        <Text style={styles.message}>Loading your tricks...</Text>
      </View>
    );
  }

  return (
    <GoalStateContext.Provider value={collection}>
      <GoalActionsContext.Provider value={actions}>
        <GoalSyncContext.Provider value={sync}>{children}</GoalSyncContext.Provider>
      </GoalActionsContext.Provider>
    </GoalStateContext.Provider>
  );
}

export function useGoals() {
  const collection = useContext(GoalStateContext);
  if (!collection) throw new Error('useGoals must be used within GoalProvider.');
  return collection;
}

export function useGoalActions() {
  const actions = useContext(GoalActionsContext);
  if (!actions) throw new Error('useGoalActions must be used within GoalProvider.');
  return actions;
}

// Exposed for a future manual-retry affordance (T160.1) and for tests --
// deliberately no UI consumes this yet.
export function useGoalSync(): GoalSync {
  const sync = useContext(GoalSyncContext);
  if (!sync) throw new Error('useGoalSync must be used within GoalProvider.');
  return sync;
}

const styles = StyleSheet.create({
  hydrationFallback: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: AppColors.yellow,
  },
  wordmark: {
    color: AppColors.ink,
    fontSize: 28,
    fontWeight: 900,
    letterSpacing: -0.8,
  },
  message: {
    color: AppColors.inkSoft,
    fontSize: 14,
    fontWeight: 700,
    marginTop: 8,
  },
});
