import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { useCustomTrickSync } from '@/features/custom-tricks/state/custom-trick-provider';
import { useGoalSync } from '@/features/goals/state/goal-provider';
import { useNoteSync } from '@/features/notes/state/note-provider';
import { usePracticeHistorySync } from '@/features/stats/state/practice-history-provider';
import { useUserProfileSync } from '@/features/profile/state/user-profile-provider';
import { useIdentityHandle } from '@/shared/persistence/identity-provider';
import { identityNamespace } from '@/shared/persistence/identity';
import { createWriteQueue } from '@/shared/persistence/storage';
import { useSyncCoordinator, type SyncDomainHandles, type UseSyncCoordinatorResult } from '@/shared/sync/use-sync-coordinator';
import { deriveSyncStatus, type SyncStatus } from '@/shared/sync/sync-status';
import { aggregateDiscardOutcomes, type DiscardAllPendingResult } from '@/shared/sync/discard-outcome';
import type { SyncDomain } from '@/shared/sync/domain';

const STATUS_KEY = 'daily-dama-sync-status-v1';
const statusStorageKey = (identity: ReturnType<typeof useIdentityHandle>['identity']) => `${identityNamespace(identity)}:${STATUS_KEY}`;
export interface SyncCoordinatorStatus extends UseSyncCoordinatorResult {
  readonly hasHydrated: boolean;
  readonly pendingCount: number; readonly conflictCount: number; readonly retryableFailureCount: number;
  readonly syncStatus: SyncStatus; readonly retry: () => void; readonly discardAllPending: () => Promise<DiscardAllPendingResult>;
}
const SyncCoordinatorContext = createContext<SyncCoordinatorStatus | undefined>(undefined);

export function SyncCoordinatorProvider({ children }: PropsWithChildren) {
  const { identity, generation, context } = useIdentityHandle();
  const profile = useUserProfileSync(); const customTricks = useCustomTrickSync(); const practiceHistory = usePracticeHistorySync(); const goals = useGoalSync(); const notes = useNoteSync();
  const domains: SyncDomainHandles = useMemo(() => ({ profile, customTricks, practiceHistory, goals, notes }), [profile, customTricks, practiceHistory, goals, notes]);
  const coordinator = useSyncCoordinator(domains);
  const [lastSuccessfulSyncAt, setLastSuccessfulSyncAt] = useState<number | undefined>();
  const [online, setOnline] = useState(() => Platform.OS !== 'web' || typeof window === 'undefined' || window.navigator === undefined ? true : window.navigator.onLine);
  const loadedGeneration = useRef<number | undefined>(undefined); const persistedRunId = useRef<string | undefined>(undefined);
  const writeStatus = useMemo(() => createWriteQueue(async (value: string) => AsyncStorage.setItem(statusStorageKey(identity), value)), [identity]);
  useEffect(() => {
    let cancelled = false; loadedGeneration.current = undefined; persistedRunId.current = undefined;
    // Identity changes must immediately hide the previous identity's freshness.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLastSuccessfulSyncAt(undefined);
    AsyncStorage.getItem(statusStorageKey(identity)).then((raw) => {
      if (cancelled || !context.isCurrentGeneration(generation)) return;
      loadedGeneration.current = generation; if (!raw) return;
      try { const parsed: unknown = JSON.parse(raw); const value = parsed as { lastSuccessfulSyncAt?: unknown };
        if (typeof value.lastSuccessfulSyncAt === 'number' && Number.isFinite(value.lastSuccessfulSyncAt)) setLastSuccessfulSyncAt(value.lastSuccessfulSyncAt);
      } catch { /* malformed metadata is treated as no sync yet */ }
    });
    return () => { cancelled = true; };
  }, [context, generation, identity]);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
    const onOnline = () => setOnline(true); const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline); window.addEventListener('offline', onOffline);
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
  }, []);
  useEffect(() => {
    if (coordinator.state.status !== 'idle' || !coordinator.state.lastRun || loadedGeneration.current !== generation) return;
    const run = coordinator.state.lastRun; if (run.outcome !== 'completed' || persistedRunId.current === run.runId) return;
    persistedRunId.current = run.runId;
    const allSucceeded = Object.values(run.domainResults).length === 5 && Object.values(run.domainResults).every((result) => result?.outcome.status === 'succeeded');
    if (!allSucceeded || !context.isCurrentGeneration(generation)) return;
    // This is a state transition caused by an external coordinator completion.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLastSuccessfulSyncAt(run.endedAt); void writeStatus(JSON.stringify({ version: 1, lastSuccessfulSyncAt: run.endedAt }));
  }, [context, coordinator.state, generation, writeStatus]);
  const pendingCount = profile.pendingCount + customTricks.pendingCount + practiceHistory.pendingCount + goals.pendingCount + notes.pendingCount;
  const hasHydrated = profile.hasHydrated && customTricks.hasHydrated && practiceHistory.hasHydrated && goals.hasHydrated && notes.hasHydrated;
  // Conflicts are now resolved automatically inside each domain's own push
  // loop (T187.2) and never surface here -- this fact is kept as a literal
  // zero (rather than removed) so deriveSyncStatus/SyncStatus stay
  // structurally unchanged.
  const conflictCount = 0;
  const retryableFailureCount = (profile.retryableFailureCount ?? 0) + (customTricks.retryableFailureCount ?? 0) + (practiceHistory.retryableFailureCount ?? 0) + (goals.retryableFailureCount ?? 0) + (notes.retryableFailureCount ?? 0);
  const syncStatus = useMemo(() => deriveSyncStatus({ coordinator: coordinator.state.status, pendingCount, conflictCount, retryableFailureCount, online, lastSuccessfulSyncAt }), [coordinator.state.status, pendingCount, conflictCount, retryableFailureCount, online, lastSuccessfulSyncAt]);
  const discardAllPending = useCallback(async (): Promise<DiscardAllPendingResult> => {
    // `allSettled`, not `all`, is load-bearing: `all` would short-circuit on the first
    // rejection and lose which of the other four domains actually failed, exactly how a
    // partial failure would become an unreported sign-out. A rejected settlement (defense in
    // depth -- domain hooks no longer reject) maps to a failure for that domain.
    const entries: readonly (readonly [SyncDomain, () => ReturnType<typeof profile.discardPending>])[] = [
      ['profile', profile.discardPending],
      ['customTricks', customTricks.discardPending],
      ['practiceHistory', practiceHistory.discardPending],
      ['goals', goals.discardPending],
      ['notes', notes.discardPending],
    ];
    const settled = await Promise.allSettled(entries.map(([, discard]) => discard()));
    const outcomes = entries.map(([domain], index) => {
      const settlement = settled[index];
      if (settlement.status === 'fulfilled') return [domain, settlement.value] as const;
      return [domain, { status: 'failed', error: settlement.reason } as const] as const;
    });
    return aggregateDiscardOutcomes(outcomes);
  }, [profile, customTricks, practiceHistory, goals, notes]);
  const value = useMemo(() => ({ ...coordinator, hasHydrated, pendingCount, conflictCount, retryableFailureCount, syncStatus, retry: coordinator.requestManualSync, discardAllPending }), [coordinator, hasHydrated, pendingCount, conflictCount, retryableFailureCount, syncStatus, discardAllPending]);
  return <SyncCoordinatorContext.Provider value={value}>{children}</SyncCoordinatorContext.Provider>;
}
export function useSyncCoordinatorStatus(): SyncCoordinatorStatus { const status = useContext(SyncCoordinatorContext); if (!status) throw new Error('useSyncCoordinatorStatus must be used within SyncCoordinatorProvider.'); return status; }
