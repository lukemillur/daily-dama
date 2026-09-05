import { useCallback, useMemo, useRef, useState } from "react";

import { useCustomTrickDurability } from "@/features/custom-tricks/state/custom-trick-provider";
import { useGoalDurability } from "@/features/goals/state/goal-provider";
import { useNoteDurability } from "@/features/notes/state/note-provider";
import { useUserProfileDurability } from "@/features/profile/state/user-profile-provider";
import { usePracticeHistoryDurability } from "@/features/stats/state/practice-history-provider";
import type { LocalDurabilityStatus } from "@/shared/persistence/storage";

/**
 * Aggregates the five domain use-Durability signals into one app-shell
 * warning contract. This is deliberately independent of SyncStatus
 * (src/shared/sync/sync-status.ts): it answers whether the current
 * in-memory value for each domain is known to be safely on this device,
 * never anything about cloud sync.
 */
export type AppLocalDurabilityDomain = "goals" | "customTricks" | "notes" | "profile" | "practiceHistory";

export interface AppLocalDurabilityDomainEntry {
  readonly domain: AppLocalDurabilityDomain;
  readonly label: string;
  readonly status: LocalDurabilityStatus<unknown>;
}

const DOMAIN_LABELS: Readonly<Record<AppLocalDurabilityDomain, string>> = {
  goals: "Goals",
  customTricks: "Custom tricks",
  notes: "Notes",
  profile: "Profile",
  practiceHistory: "Practice history",
};

/** Pure precedence and labeling logic, unit-testable without mounting any provider. */
export function deriveFailedDomainLabels(entries: readonly AppLocalDurabilityDomainEntry[]): readonly string[] {
  return entries.filter((entry) => entry.status.status === "failed").map((entry) => entry.label);
}

export interface AppLocalDurabilitySummary {
  readonly hasFailure: boolean;
  readonly failedLabels: readonly string[];
  readonly isRetrying: boolean;
  readonly retryAll: () => Promise<void>;
}

/**
 * Reads all five domain durability contexts directly. This hook is only
 * callable from inside GoalProvider (the innermost of the five), i.e. from
 * AppThemeProvider downward in src/app/app/_layout.tsx.
 */
export function useAppLocalDurability(): AppLocalDurabilitySummary {
  const goals = useGoalDurability();
  const customTricks = useCustomTrickDurability();
  const notes = useNoteDurability();
  const profile = useUserProfileDurability();
  const practiceHistory = usePracticeHistoryDurability();

  const [isRetrying, setIsRetrying] = useState(false);
  const isRetryInFlightRef = useRef(false);

  const entries: readonly AppLocalDurabilityDomainEntry[] = useMemo(
    () => [
      { domain: "goals", label: DOMAIN_LABELS.goals, status: goals as LocalDurabilityStatus<unknown> },
      {
        domain: "customTricks",
        label: DOMAIN_LABELS.customTricks,
        status: customTricks as LocalDurabilityStatus<unknown>,
      },
      { domain: "notes", label: DOMAIN_LABELS.notes, status: notes as LocalDurabilityStatus<unknown> },
      { domain: "profile", label: DOMAIN_LABELS.profile, status: profile as LocalDurabilityStatus<unknown> },
      {
        domain: "practiceHistory",
        label: DOMAIN_LABELS.practiceHistory,
        status: practiceHistory as LocalDurabilityStatus<unknown>,
      },
    ],
    [goals, customTricks, notes, profile, practiceHistory],
  );

  const failedLabels = deriveFailedDomainLabels(entries);

  // Guards against duplicate concurrent Retry invocations at the aggregate level. Each
  // domain's own write queue already serializes writes, but a second concurrent press of the
  // single Retry action must not fire a second retry() call per domain while the first is
  // still in flight.
  const retryAll = useCallback(async (): Promise<void> => {
    if (isRetryInFlightRef.current) return;
    isRetryInFlightRef.current = true;
    setIsRetrying(true);
    try {
      const failing = entries.filter((entry) => entry.status.status === "failed");
      await Promise.allSettled(
        failing.map((entry) => (entry.status.status === "failed" ? entry.status.retry() : Promise.resolve())),
      );
    } finally {
      isRetryInFlightRef.current = false;
      setIsRetrying(false);
    }
  }, [entries]);

  return {
    hasFailure: failedLabels.length > 0,
    failedLabels,
    isRetrying,
    retryAll,
  };
}
