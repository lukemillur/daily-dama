import type { SeshSummary } from '@/features/sesh/model/sesh';

export interface PracticeSessionRecord {
  readonly id: string;
  readonly trickId: string;
  readonly trickName: string;
  readonly startedAt: number;
  readonly completedAt: number;
  readonly durationMs: number;
  readonly laceCount: number;
  // Set only when this session is a comparable timed attempt (see isEligibleTimedAttempt);
  // absent for open-ended seshes and for timed seshes that don't qualify.
  readonly plannedDurationMs?: number;
}

export interface PracticeHistory {
  readonly sessions: readonly PracticeSessionRecord[];
}

export const INITIAL_PRACTICE_HISTORY: PracticeHistory = { sessions: [] };

export type PracticeHistoryAction =
  | { readonly type: 'historyRestored'; readonly history: PracticeHistory }
  | { readonly type: 'sessionRecorded'; readonly summary: SeshSummary };

export function practiceHistoryReducer(
  state: PracticeHistory,
  action: PracticeHistoryAction,
): PracticeHistory {
  switch (action.type) {
    case 'historyRestored':
      return action.history;
    case 'sessionRecorded': {
      const previousBest =
        action.summary.plan.kind === 'timed'
          ? getPersonalBest(state.sessions, action.summary.trick.id, action.summary.plan.durationMs)
          : undefined;
      const session = createPracticeSessionRecord(action.summary, previousBest);
      return state.sessions.some((existing) => existing.id === session.id)
        ? state
        : { sessions: [...state.sessions, session] };
    }
  }
}

// A timed sesh only counts as a comparable attempt at its planned duration if it either ran the
// full duration, or the user had already beaten the standing best before ending early — an early
// stop shouldn't erase a genuine achievement, but it also shouldn't let an arbitrary short attempt
// become (or beat) a best on its own.
export function isEligibleTimedAttempt(summary: SeshSummary, previousBest: number | undefined): boolean {
  if (summary.plan.kind !== 'timed') return false;
  const reachedFullDuration = summary.durationMs >= summary.plan.durationMs;
  const exceededPreviousBest = previousBest !== undefined && summary.landings.length > previousBest;
  return reachedFullDuration || exceededPreviousBest;
}

// True when at least one recorded session for the trick has a laceCount above zero — i.e. the
// trick has been laced at least once in the given history.
export function hasPriorLaceForTrick(
  sessions: readonly PracticeSessionRecord[],
  trickId: string,
): boolean {
  return sessions.some((session) => session.trickId === trickId && session.laceCount > 0);
}

// True when this sesh landed the trick for the first time ever — i.e. no prior recorded session
// for the same trick has a laceCount above zero. `priorSessions` must be the history as it stood
// BEFORE this summary was recorded (a zero-lace record for the trick doesn't disqualify it).
export function isFirstLaceForTrick(
  priorSessions: readonly PracticeSessionRecord[],
  summary: SeshSummary,
): boolean {
  if (summary.landings.length === 0) return false;
  return !hasPriorLaceForTrick(priorSessions, summary.trick.id);
}

export function createPracticeSessionRecordId(summary: SeshSummary): string {
  return `${summary.startedAt}:${summary.endedAt}:${summary.trick.id}`;
}

export function createPracticeSessionRecord(
  summary: SeshSummary,
  previousBest: number | undefined,
): PracticeSessionRecord {
  return {
    id: createPracticeSessionRecordId(summary),
    trickId: summary.trick.id,
    trickName: summary.trick.name,
    startedAt: summary.startedAt,
    completedAt: summary.endedAt,
    durationMs: summary.durationMs,
    laceCount: summary.landings.length,
    plannedDurationMs:
      summary.plan.kind === 'timed' && isEligibleTimedAttempt(summary, previousBest)
        ? summary.plan.durationMs
        : undefined,
  };
}

export function getPersonalBest(
  sessions: readonly PracticeSessionRecord[],
  trickId: string,
  plannedDurationMs: number,
): number | undefined {
  return sessions
    .filter((session) => session.trickId === trickId && session.plannedDurationMs === plannedDurationMs)
    .reduce<number | undefined>(
      (best, session) => (best === undefined ? session.laceCount : Math.max(best, session.laceCount)),
      undefined,
    );
}

export interface TrickPracticeStats {
  readonly trickId: string;
  readonly trickName: string;
  readonly totalLaces: number;
  readonly totalPracticeMs: number;
  readonly sessionCount: number;
  readonly mostRecentPracticeAt: number;
}

export interface PracticeStats {
  readonly totalLaces: number;
  readonly totalPracticeMs: number;
  readonly sessionCount: number;
  readonly tricks: readonly TrickPracticeStats[];
}

export function aggregatePracticeStats(sessions: readonly PracticeSessionRecord[]): PracticeStats {
  const byTrick = new Map<string, TrickPracticeStats>();
  let totalLaces = 0;
  let totalPracticeMs = 0;

  sessions.forEach((session) => {
    totalLaces += session.laceCount;
    totalPracticeMs += session.durationMs;
    const existing = byTrick.get(session.trickId);

    byTrick.set(session.trickId, {
      trickId: session.trickId,
      trickName: session.trickName,
      totalLaces: (existing?.totalLaces ?? 0) + session.laceCount,
      totalPracticeMs: (existing?.totalPracticeMs ?? 0) + session.durationMs,
      sessionCount: (existing?.sessionCount ?? 0) + 1,
      mostRecentPracticeAt: Math.max(existing?.mostRecentPracticeAt ?? 0, session.completedAt),
    });
  });

  return {
    totalLaces,
    totalPracticeMs,
    sessionCount: sessions.length,
    tricks: [...byTrick.values()].sort(
      (left, right) => right.mostRecentPracticeAt - left.mostRecentPracticeAt,
    ),
  };
}
