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
  createCustomTrick,
  createCustomTrickId,
  type CustomTrick,
  type CustomTrickCollection,
  type CustomTrickDraft,
  type CustomTrickDraftValidation,
  customTrickReducer,
  INITIAL_CUSTOM_TRICKS,
  validateCustomTrickDraft,
} from '@/features/custom-tricks/model/custom-trick';
import {
  loadCustomTricks,
  saveCustomTricks,
} from '@/features/custom-tricks/persistence/custom-trick-persistence';
import { createWriteQueue } from '@/shared/persistence/storage';

type AddCustomTrickResult =
  | Extract<CustomTrickDraftValidation, { status: 'invalid' }>
  | { readonly status: 'created'; readonly trick: CustomTrick };

interface CustomTrickActions {
  readonly addCustomTrick: (draft: CustomTrickDraft) => AddCustomTrickResult;
}

const CustomTrickStateContext = createContext<CustomTrickCollection | undefined>(undefined);
const CustomTrickActionsContext = createContext<CustomTrickActions | undefined>(undefined);

export function CustomTrickProvider({ children }: PropsWithChildren) {
  const [collection, dispatch] = useReducer(customTrickReducer, INITIAL_CUSTOM_TRICKS);
  const [hasHydrated, setHasHydrated] = useState(false);
  const shouldSkipInitialWrite = useRef(true);
  const [enqueueWrite] = useState(() =>
    createWriteQueue(async (nextCollection: CustomTrickCollection) => {
      const result = await saveCustomTricks(AsyncStorage, nextCollection);
      if (result.status === 'failed') {
        console.warn('Unable to persist custom tricks.', result.error);
      }
    }),
  );

  useEffect(() => {
    let isCurrent = true;

    loadCustomTricks(AsyncStorage).then((result) => {
      if (!isCurrent) return;

      if (result.status === 'recovered') {
        console.warn('Unable to restore custom tricks. Using an empty collection.', result.error);
      }

      dispatch({ type: 'customTricksRestored', collection: result.value });
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

  const addCustomTrick = useCallback((draft: CustomTrickDraft): AddCustomTrickResult => {
    const validation = validateCustomTrickDraft(draft);
    if (validation.status === 'invalid') return validation;

    const trick = createCustomTrick(createCustomTrickId(), validation.value);
    dispatch({ type: 'customTrickAdded', trick });
    return { status: 'created', trick };
  }, []);

  const actions = useMemo(() => ({ addCustomTrick }), [addCustomTrick]);

  if (!hasHydrated) {
    return (
      <View style={styles.hydrationFallback}>
        <Text style={styles.wordmark}>Daily Dama</Text>
        <Text style={styles.message}>Loading your tricks...</Text>
      </View>
    );
  }

  return (
    <CustomTrickStateContext.Provider value={collection}>
      <CustomTrickActionsContext.Provider value={actions}>
        {children}
      </CustomTrickActionsContext.Provider>
    </CustomTrickStateContext.Provider>
  );
}

export function useCustomTricks() {
  const collection = useContext(CustomTrickStateContext);
  if (!collection) throw new Error('useCustomTricks must be used within CustomTrickProvider.');
  return collection;
}

export function useCustomTrickActions() {
  const actions = useContext(CustomTrickActionsContext);
  if (!actions) {
    throw new Error('useCustomTrickActions must be used within CustomTrickProvider.');
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
