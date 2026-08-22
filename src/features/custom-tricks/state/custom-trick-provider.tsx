import { createContext, type PropsWithChildren, useCallback, useContext, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppColors } from '@/constants/theme';
import {
  type CustomTrickAction,
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
import { useIdentityScopedDomain } from '@/shared/persistence/use-identity-scoped-domain';

type SaveCustomTrickResult =
  | Extract<CustomTrickDraftValidation, { status: 'invalid' }>
  | { readonly status: 'saved'; readonly trick: CustomTrick };

interface CustomTrickActions {
  readonly addCustomTrick: (draft: CustomTrickDraft) => SaveCustomTrickResult;
  readonly updateCustomTrick: (trickId: string, draft: CustomTrickDraft) => SaveCustomTrickResult;
  readonly deleteCustomTrick: (trickId: string) => void;
}

const CustomTrickStateContext = createContext<CustomTrickCollection | undefined>(undefined);
const CustomTrickActionsContext = createContext<CustomTrickActions | undefined>(undefined);

export function CustomTrickProvider({ children }: PropsWithChildren) {
  const { state: collection, dispatch, hasHydrated } = useIdentityScopedDomain({
    reducer: customTrickReducer,
    initialState: INITIAL_CUSTOM_TRICKS,
    load: loadCustomTricks,
    save: saveCustomTricks,
    createRestoreAction: (value: CustomTrickCollection): CustomTrickAction => ({
      type: 'customTricksRestored',
      collection: value,
    }),
    onRecovered: (error) => {
      console.warn('Unable to restore custom tricks. Using an empty collection.', error);
    },
    onSaveFailed: (error) => {
      console.warn('Unable to persist custom tricks.', error);
    },
  });

  const addCustomTrick = useCallback((draft: CustomTrickDraft): SaveCustomTrickResult => {
    const validation = validateCustomTrickDraft(draft);
    if (validation.status === 'invalid') return validation;

    const trick = createCustomTrick(createCustomTrickId(), validation.value);
    dispatch({ type: 'customTrickAdded', trick });
    return { status: 'saved', trick };
  }, []);

  const updateCustomTrick = useCallback(
    (trickId: string, draft: CustomTrickDraft): SaveCustomTrickResult => {
      const validation = validateCustomTrickDraft(draft);
      if (validation.status === 'invalid') return validation;

      const trick = createCustomTrick(trickId, validation.value);
      dispatch({ type: 'customTrickUpdated', trick });
      return { status: 'saved', trick };
    },
    [],
  );

  const deleteCustomTrick = useCallback((trickId: string) => {
    dispatch({ type: 'customTrickDeleted', trickId });
  }, []);

  const actions = useMemo(
    () => ({ addCustomTrick, deleteCustomTrick, updateCustomTrick }),
    [addCustomTrick, deleteCustomTrick, updateCustomTrick],
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
