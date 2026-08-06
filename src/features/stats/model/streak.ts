import type { PracticeSessionRecord } from '@/features/stats/model/practice-history';

export function getLocalDayKey(timestampMs: number): string {
  const date = new Date(timestampMs);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export interface StreakResult {
  readonly currentStreak: number;
  readonly qualifiesToday: boolean;
}

export function calculateStreak(
  sessions: readonly PracticeSessionRecord[],
  thresholdMs: number,
  now: number,
): StreakResult {
  const totalsByDay = new Map<string, number>();
  sessions.forEach((session) => {
    const dayKey = getLocalDayKey(session.completedAt);
    totalsByDay.set(dayKey, (totalsByDay.get(dayKey) ?? 0) + session.durationMs);
  });

  const qualifyingDays = new Set(
    [...totalsByDay.entries()]
      .filter(([, totalMs]) => totalMs >= thresholdMs)
      .map(([dayKey]) => dayKey),
  );

  const qualifiesToday = qualifyingDays.has(getLocalDayKey(now));

  const cursor = new Date(now);
  if (!qualifiesToday) cursor.setDate(cursor.getDate() - 1);

  let currentStreak = 0;
  while (qualifyingDays.has(getLocalDayKey(cursor.getTime()))) {
    currentStreak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return { currentStreak, qualifiesToday };
}
