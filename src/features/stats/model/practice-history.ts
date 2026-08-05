import type { SeshSummary } from '@/features/sesh/model/sesh';

export interface PracticeSessionRecord {
  readonly id: string;
  readonly trickId: string;
  readonly trickName: string;
  readonly startedAt: number;
  readonly completedAt: number;
  readonly durationMs: number;
  readonly laceCount: number;
}

export interface PracticeHistory {
  readonly sessions: readonly PracticeSessionRecord[];
}

export const INITIAL_PRACTICE_HISTORY: PracticeHistory = { sessions: [] };

export type PracticeHistoryAction =
  | { readonly type: 'historyRestored'; readonly history: PracticeHistory }
  | { readonly type: 'sessionRecorded'; readonly session: PracticeSessionRecord };

export function practiceHistoryReducer(
  state: PracticeHistory,
  action: PracticeHistoryAction,
): PracticeHistory {
  switch (action.type) {
    case 'historyRestored':
      return action.history;
    case 'sessionRecorded':
      return state.sessions.some((session) => session.id === action.session.id)
        ? state
        : { sessions: [...state.sessions, action.session] };
  }
}

export function createPracticeSessionRecord(summary: SeshSummary): PracticeSessionRecord {
  return {
    id: `${summary.startedAt}:${summary.endedAt}:${summary.trick.id}`,
    trickId: summary.trick.id,
    trickName: summary.trick.name,
    startedAt: summary.startedAt,
    completedAt: summary.endedAt,
    durationMs: summary.durationMs,
    laceCount: summary.landings.length,
  };
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
