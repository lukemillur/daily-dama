// T157.9: thin context wrapper around useSyncCoordinator. Calls all five
// real domain useXSync() hooks (each of which throws if called outside its
// own provider -- so this must be mounted innermost among the six providers
// in src/app/app/_layout.tsx), builds the SyncDomainHandles map, and
// exposes useSyncCoordinatorStatus() for a future manual-retry affordance
// (T160.1) and for tests. No UI consumes this yet.
//
// No persistence, no hydration fallback screen -- this provider owns no
// durable state of its own. Each domains own sync envelope already
// persists independently; SyncCoordinatorState is intentionally
// ephemeral/in-memory only, reset to idle on reload.

import { createContext, type PropsWithChildren, useCallback, useContext, useMemo } from "react";

import { useCustomTrickSync } from "@/features/custom-tricks/state/custom-trick-provider";
import { useGoalSync } from "@/features/goals/state/goal-provider";
import { useNoteSync } from "@/features/notes/state/note-provider";
import { useUserProfileSync } from "@/features/profile/state/user-profile-provider";
import { usePracticeHistorySync } from "@/features/stats/state/practice-history-provider";
import { useSyncCoordinator, type SyncDomainHandles, type UseSyncCoordinatorResult } from "@/shared/sync/use-sync-coordinator";

export interface SyncCoordinatorStatus extends UseSyncCoordinatorResult {
  // Sum of all five domains own pendingCount, reactive across renders.
  // T158 (logout guard) is the only consumer today; T160.1s eventual
  // Profile-wide sync-status surface is expected to reuse this same
  // aggregation rather than duplicate it -- do not add further derived
  // fields (last synced/offline/etc) here without that tasks own plan.
  readonly pendingCount: number;
  // Discards every domains pending outbox in parallel. Each domains own
  // discardPending() durably persists its cleared envelope (via that
  // domains saveNow, routed through the shared write queue) before this
  // combined promise resolves.
  readonly discardAllPending: () => Promise<void>;
}

const SyncCoordinatorContext = createContext<SyncCoordinatorStatus | undefined>(undefined);

export function SyncCoordinatorProvider({ children }: PropsWithChildren) {
  const profile = useUserProfileSync();
  const customTricks = useCustomTrickSync();
  const practiceHistory = usePracticeHistorySync();
  const goals = useGoalSync();
  const notes = useNoteSync();

  const domains: SyncDomainHandles = useMemo(
    () => ({ profile, customTricks, practiceHistory, goals, notes }),
    [profile, customTricks, practiceHistory, goals, notes],
  );

  const status = useSyncCoordinator(domains);

  const pendingCount =
    profile.pendingCount +
    customTricks.pendingCount +
    practiceHistory.pendingCount +
    goals.pendingCount +
    notes.pendingCount;

  const discardAllPending = useCallback(async () => {
    await Promise.all([
      profile.discardPending(),
      customTricks.discardPending(),
      practiceHistory.discardPending(),
      goals.discardPending(),
      notes.discardPending(),
    ]);
  }, [profile, customTricks, practiceHistory, goals, notes]);

  const value: SyncCoordinatorStatus = useMemo(
    () => ({ ...status, pendingCount, discardAllPending }),
    [status, pendingCount, discardAllPending],
  );

  return <SyncCoordinatorContext.Provider value={value}>{children}</SyncCoordinatorContext.Provider>;
}

export function useSyncCoordinatorStatus(): SyncCoordinatorStatus {
  const status = useContext(SyncCoordinatorContext);

  if (!status) {
    throw new Error("useSyncCoordinatorStatus must be used within SyncCoordinatorProvider.");
  }

  return status;
}
