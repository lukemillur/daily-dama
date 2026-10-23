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
import type { PracticeSessionRow } from '@/features/stats/persistence/practice-history-cloud-repository';
import {
  loadPracticeHistory,
  savePracticeHistory,
} from '@/features/stats/persistence/practice-history-persistence';
import { createPracticeHistorySyncTransportAdapter } from '@/features/stats/persistence/practice-history-sync-transport';
import { usePracticeHistoryDomainSync } from '@/features/stats/state/use-practice-history-domain-sync';
import { useIdentityHandle } from '@/shared/persistence/identity-provider';
import type { LocalDurabilityStatus } from '@/shared/persistence/storage';
import { useIdentityScopedDomain } from '@/shared/persistence/use-identity-scoped-domain';
import { getSupabaseClient } from '@/shared/supabase/supabase-client';
import type { DomainSyncRecord, SyncTrigger } from '@/shared/sync/coordinator';
import type { DomainDiscardOutcome } from '@/shared/sync/discard-outcome';
import type { SyncTransportRepository } from '@/shared/sync/transport';

interface PracticeHistoryActions {
  readonly recordCompletedSesh: (summary: SeshSummary, origin?: PracticeSessionOrigin) => void;
}

const PracticeHistoryStateContext = createContext<PracticeHistory | undefined>(undefined);
const PracticeHistoryActionsContext = createContext<PracticeHistoryActions | undefined>(undefined);

export interface PracticeHistorySync {
  readonly runSync: (trigger: SyncTrigger) => Promise<DomainSyncRecord>;
  readonly isSyncing: boolean;
  readonly lastResult: DomainSyncRecord | undefined;
  readonly hasHydrated: boolean;
  readonly localMutationTick: number;
  readonly pendingCount: number;
  readonly retryableFailureCount: number;
  readonly conflictCount: number;
  readonly discardPending: () => Promise<DomainDiscardOutcome>;
}

const PracticeHistorySyncContext = createContext<PracticeHistorySync | undefined>(undefined);

// Runtime-only local-durability status, distinct from the cloud-facing
// PracticeHistorySync context above -- see `LocalDurabilityStatus`'s doc comment.
const PracticeHistoryDurabilityContext = createContext<
  LocalDurabilityStatus<PracticeHistory> | undefined
>(undefined);

export function PracticeHistoryProvider({ children }: PropsWithChildren) {
  const { state: history, dispatch, hasHydrated, durability } = useIdentityScopedDomain({
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

  // Additive: a second, parallel identity-scoped domain instance tracking
  // sync bookkeeping. The primary reducer above stays completely
  // untouched and remains the sole source of truth for the rendered
  // `PracticeHistory` -- this hook only pulls/pushes in the background and,
  // on a pull-adopt merge, dispatches the same `historyRestored` action
  // hydration itself uses.
  const { identity } = useIdentityHandle();
  const getTransport = useCallback((): SyncTransportRepository<PracticeSessionRow> | undefined => {
    if (identity.kind !== 'user') return undefined;
    const client = getSupabaseClient();
    if (client === null) return undefined;
    return createPracticeHistorySyncTransportAdapter(client, identity.userId);
  }, [identity]);

  const sync = usePracticeHistoryDomainSync({
    history,
    hasHydratedHistory: hasHydrated,
    dispatchHistory: dispatch,
    getTransport,
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
        <PracticeHistorySyncContext.Provider value={sync}>
          <PracticeHistoryDurabilityContext.Provider value={durability}>
            {children}
          </PracticeHistoryDurabilityContext.Provider>
        </PracticeHistorySyncContext.Provider>
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

// Exposed for a future manual-retry affordance and for tests --
// deliberately no UI consumes this yet.
export function usePracticeHistorySync(): PracticeHistorySync {
  const sync = useContext(PracticeHistorySyncContext);
  if (!sync) {
    throw new Error('usePracticeHistorySync must be used within PracticeHistoryProvider.');
  }
  return sync;
}

export function usePracticeHistoryDurability(): LocalDurabilityStatus<PracticeHistory> {
  const durability = useContext(PracticeHistoryDurabilityContext);
  if (!durability) {
    throw new Error('usePracticeHistoryDurability must be used within PracticeHistoryProvider.');
  }
  return durability;
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
