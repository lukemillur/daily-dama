import type { PracticeSessionRecord } from '@/features/stats/model/practice-history';

export const MAX_NEGLECTED_TRICKS = 3;

export interface FocusedTrickCandidate {
  readonly id: string;
}

export interface NeglectedTrick<T extends FocusedTrickCandidate = FocusedTrickCandidate> {
  readonly trick: T;
  // Absent when the trick has never been practiced.
  readonly mostRecentPracticeAt?: number;
}

// Pure selector: ranks the caller's focused tricks by practice neglect against completed
// practice history. Never-practiced tricks sort before practiced ones; practiced tricks are
// ordered oldest-most-recent-practice first. Ties (including all-never-practiced or
// same-mostRecentPracticeAt groups) preserve the input focusedTricks order. Result is capped
// at MAX_NEGLECTED_TRICKS. Consults no UI state and persists nothing.
export function selectNeglectedFocusedTricks<T extends FocusedTrickCandidate>(
  focusedTricks: readonly T[],
  sessions: readonly PracticeSessionRecord[],
): readonly NeglectedTrick<T>[] {
  const mostRecentByTrickId = new Map<string, number>();
  sessions.forEach((session) => {
    const existing = mostRecentByTrickId.get(session.trickId);
    if (existing === undefined || session.completedAt > existing) {
      mostRecentByTrickId.set(session.trickId, session.completedAt);
    }
  });

  return focusedTricks
    .map(
      (trick, index): { readonly candidate: NeglectedTrick<T>; readonly index: number } => ({
        candidate: {
          trick,
          ...(mostRecentByTrickId.has(trick.id)
            ? { mostRecentPracticeAt: mostRecentByTrickId.get(trick.id) }
            : {}),
        },
        index,
      }),
    )
    .sort((left, right) => {
      const leftPracticedAt = left.candidate.mostRecentPracticeAt;
      const rightPracticedAt = right.candidate.mostRecentPracticeAt;
      if (leftPracticedAt === undefined && rightPracticedAt === undefined) {
        return left.index - right.index;
      }
      if (leftPracticedAt === undefined) return -1;
      if (rightPracticedAt === undefined) return 1;
      if (leftPracticedAt === rightPracticedAt) return left.index - right.index;
      return leftPracticedAt - rightPracticedAt;
    })
    .slice(0, MAX_NEGLECTED_TRICKS)
    .map(({ candidate }) => candidate);
}
