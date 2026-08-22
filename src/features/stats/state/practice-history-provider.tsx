import { createContext, type PropsWithChildren, useCallback, useContext, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppColors } from '@/constants/theme';
import type { SeshSummary } from '@/features/sesh/model/sesh';
import {
  INITIAL_PRACTICE_HISTORY,
  type PracticeHistory,
  type PracticeHistoryAction,
  type PracticeSessionOrigin,
  practiceHistoryReducer,
} from '@/features/stats/model/practice-history';
import {
  loadPracticeHistory,
  savePracticeHistory,
} from '@/features/stats/persistence/practice-history-persistence';
import { useIdentityScopedDomain } from '@/shared/persistence/use-identity-scoped-domain';

interface PracticeHistoryActions {
  readonly recordCompletedSesh: (summary: SeshSummary, origin?: PracticeSessionOrigin) => void;
}

const PracticeHistoryStateContext = createContext<PracticeHistory | undefined>(undefined);
const PracticeHistoryActionsContext = createContext<PracticeHistoryActions | undefined>(undefined);

export function PracticeHistoryProvider({ children }: PropsWithChildren) {
  const { state: history, dispatch, hasHydrated } = useIdentityScopedDomain({
    reducer: practiceHistoryReducer,
    initialState: INITIAL_PRACTICE_HISTORY,
    load: loadPracticeHistory,
    save: savePracticeHistory,
    createRestoreAction: (value: PracticeHistory): PracticeHistoryAction => ({
      type: 'historyRestored',
      history: value,
    }),
    onRecovered: (error) => {
      console.warn('Unable to restore practice history. Using an empty history.', error);
    },
    onSaveFailed: (error) => {
      console.warn('Unable to persist practice history.', error);
    },
  });

  const recordCompletedSesh = useCallback((summary: SeshSummary, origin?: PracticeSessionOrigin) => {
    dispatch({ type: 'sessionRecorded', summary, origin });
  }, []);

  const actions = useMemo(() => ({ recordCompletedSesh }), [recordCompletedSesh]);

  if (!hasHydrated) {
    return (
      <View style={styles.hydrationFallback}>
        <Text style={styles.wordmark}>Daily Dama</Text>
        <Text style={styles.message}>Loading your practice history...</Text>
      </View>
    );
  }

  return (
    <PracticeHistoryStateContext.Provider value={history}>
      <PracticeHistoryActionsContext.Provider value={actions}>
        {children}
      </PracticeHistoryActionsContext.Provider>
    </PracticeHistoryStateContext.Provider>
  );
}

export function usePracticeHistory() {
  const history = useContext(PracticeHistoryStateContext);
  if (!history) throw new Error('usePracticeHistory must be used within PracticeHistoryProvider.');
  return history;
}

export function usePracticeHistoryActions() {
  const actions = useContext(PracticeHistoryActionsContext);
  if (!actions) {
    throw new Error('usePracticeHistoryActions must be used within PracticeHistoryProvider.');
  }
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
