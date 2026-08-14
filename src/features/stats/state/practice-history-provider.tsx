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
import type { SeshSummary } from '@/features/sesh/model/sesh';
import {
  INITIAL_PRACTICE_HISTORY,
  type PracticeHistory,
  type PracticeSessionOrigin,
  practiceHistoryReducer,
} from '@/features/stats/model/practice-history';
import {
  loadPracticeHistory,
  savePracticeHistory,
} from '@/features/stats/persistence/practice-history-persistence';
import { createWriteQueue } from '@/shared/persistence/storage';

interface PracticeHistoryActions {
  readonly recordCompletedSesh: (summary: SeshSummary, origin?: PracticeSessionOrigin) => void;
}

const PracticeHistoryStateContext = createContext<PracticeHistory | undefined>(undefined);
const PracticeHistoryActionsContext = createContext<PracticeHistoryActions | undefined>(undefined);

export function PracticeHistoryProvider({ children }: PropsWithChildren) {
  const [history, dispatch] = useReducer(practiceHistoryReducer, INITIAL_PRACTICE_HISTORY);
  const [hasHydrated, setHasHydrated] = useState(false);
  const shouldSkipInitialWrite = useRef(true);
  const [enqueueWrite] = useState(() =>
    createWriteQueue(async (nextHistory: PracticeHistory) => {
      const result = await savePracticeHistory(AsyncStorage, nextHistory);
      if (result.status === 'failed') {
        console.warn('Unable to persist practice history.', result.error);
      }
    }),
  );

  useEffect(() => {
    let isCurrent = true;

    loadPracticeHistory(AsyncStorage).then((result) => {
      if (!isCurrent) return;

      if (result.status === 'recovered') {
        console.warn('Unable to restore practice history. Using an empty history.', result.error);
      }

      dispatch({ type: 'historyRestored', history: result.value });
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

    void enqueueWrite(history);
  }, [enqueueWrite, hasHydrated, history]);

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
