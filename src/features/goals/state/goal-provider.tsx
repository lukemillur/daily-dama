import AsyncStorage from '@react-native-async-storage/async-storage';
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

import { AppColors } from '@/constants/theme';
import {
  createGoal,
  createGoalId,
  type Goal,
  type GoalCollection,
  type GoalCreationInput,
  type GoalDraftErrors,
  goalReducer,
  INITIAL_GOALS,
  validateGoalCreation,
} from '@/features/goals/model/goal';
import { loadGoals, saveGoals } from '@/features/goals/persistence/goal-persistence';
import { useUserProfileActions } from '@/features/profile/state/user-profile-provider';
import { createWriteQueue } from '@/shared/persistence/storage';

type SaveGoalResult =
  | { readonly status: 'invalid'; readonly errors: GoalDraftErrors }
  | { readonly status: 'saved'; readonly goal: Goal };

interface GoalActions {
  readonly addGoal: (input: GoalCreationInput) => SaveGoalResult;
  readonly deleteGoal: (goalId: string) => void;
}

const GoalStateContext = createContext<GoalCollection | undefined>(undefined);
const GoalActionsContext = createContext<GoalActions | undefined>(undefined);

export function GoalProvider({ children }: PropsWithChildren) {
  const [collection, dispatch] = useReducer(goalReducer, INITIAL_GOALS);
  // GoalProvider must be rendered inside UserProfileProvider (see _layout.tsx's provider
  // nesting order) so addGoal can focus the goal's trick as part of the same save action.
  const { addSelectedTrick } = useUserProfileActions();
  const [hasHydrated, setHasHydrated] = useState(false);
  const shouldSkipInitialWrite = useRef(true);
  const [enqueueWrite] = useState(() =>
    createWriteQueue(async (nextCollection: GoalCollection) => {
      const result = await saveGoals(AsyncStorage, nextCollection);
      if (result.status === 'failed') {
        console.warn('Unable to persist goals.', result.error);
      }
    }),
  );

  useEffect(() => {
    let isCurrent = true;

    loadGoals(AsyncStorage).then((result) => {
      if (!isCurrent) return;

      if (result.status === 'recovered') {
        console.warn('Unable to restore goals. Using an empty collection.', result.error);
      }

      dispatch({ type: 'goalsRestored', collection: result.value });
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

    void enqueueWrite(collection);
  }, [collection, enqueueWrite, hasHydrated]);

  const addGoal = useCallback((input: GoalCreationInput): SaveGoalResult => {
    const validation = validateGoalCreation(input);
    if (validation.status === 'invalid') return validation;

    const goal = createGoal(createGoalId(), validation.value);
    dispatch({ type: 'goalAdded', goal });
    addSelectedTrick(goal.trickId);
    return { status: 'saved', goal };
  }, [addSelectedTrick]);

  const deleteGoal = useCallback((goalId: string) => {
    dispatch({ type: 'goalDeleted', goalId });
  }, []);

  const actions = useMemo(() => ({ addGoal, deleteGoal }), [addGoal, deleteGoal]);

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
      <GoalActionsContext.Provider value={actions}>{children}</GoalActionsContext.Provider>
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
