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
import { createCustomTrickSyncTransportAdapter } from '@/features/custom-tricks/persistence/custom-trick-sync-transport';
import { useCustomTrickDomainSync } from '@/features/custom-tricks/state/use-custom-trick-domain-sync';
import { useIdentityHandle } from '@/shared/persistence/identity-provider';
import { useIdentityScopedDomain } from '@/shared/persistence/use-identity-scoped-domain';
import { getSupabaseClient } from '@/shared/supabase/supabase-client';
import type { DomainSyncRecord, SyncTrigger } from '@/shared/sync/coordinator';
import type { DomainDiscardOutcome } from '@/shared/sync/discard-outcome';

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

export interface CustomTrickSync {
  readonly runSync: (trigger: SyncTrigger) => Promise<DomainSyncRecord>;
  readonly isSyncing: boolean;
  readonly lastResult: DomainSyncRecord | undefined;
  readonly hasHydrated: boolean;
  readonly localMutationTick: number;
  readonly pendingCount: number;
  readonly retryableFailureCount: number;
  readonly discardPending: () => Promise<DomainDiscardOutcome>;
}

const CustomTrickSyncContext = createContext<CustomTrickSync | undefined>(undefined);

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

  // Additive: a second, parallel identity-scoped domain instance tracking
  // sync bookkeeping (T157.5). The primary reducer above stays completely
  // untouched and remains the sole source of truth for the rendered
  // `CustomTrickCollection` -- this hook only pulls/pushes in the background
  // and, on a safe pull-adopt, dispatches the same `customTricksRestored`
  // action hydration itself uses.
  const { identity } = useIdentityHandle();
  const getTransport = useCallback(() => {
    if (identity.kind !== 'user') return undefined;
    const client = getSupabaseClient();
    if (client === null) return undefined;
    return createCustomTrickSyncTransportAdapter(client, identity.userId);
  }, [identity]);

  const sync = useCustomTrickDomainSync({
    collection,
    hasHydratedCollection: hasHydrated,
    dispatchCollection: dispatch,
    getTransport,
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
        <CustomTrickSyncContext.Provider value={sync}>{children}</CustomTrickSyncContext.Provider>
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

// Exposed for a future manual-retry affordance (T160.1) and for tests --
// deliberately no UI consumes this yet.
export function useCustomTrickSync(): CustomTrickSync {
  const sync = useContext(CustomTrickSyncContext);
  if (!sync) {
    throw new Error('useCustomTrickSync must be used within CustomTrickProvider.');
  }
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
