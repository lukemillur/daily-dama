import type { PracticeSessionRecord } from '@/features/stats/model/practice-history';

export const DAY_MS = 24 * 60 * 60 * 1_000;
export const WEEK_MS = 7 * DAY_MS;
export const MONTH_MS = 30 * DAY_MS;
export const YEAR_MS = 365 * DAY_MS;

export type TimeLoggedWindowKey = 'day' | 'week' | 'month' | 'year';

export interface TimeLoggedWindow {
  readonly key: TimeLoggedWindowKey;
  readonly totalMs: number;
}

interface WindowDefinition {
  readonly key: TimeLoggedWindowKey;
  readonly windowMs: number;
  readonly gated: boolean;
}

const WINDOW_DEFINITIONS: readonly WindowDefinition[] = [
  { key: 'day', windowMs: DAY_MS, gated: false },
  { key: 'week', windowMs: WEEK_MS, gated: true },
  { key: 'month', windowMs: MONTH_MS, gated: true },
  { key: 'year', windowMs: YEAR_MS, gated: true },
];

// Windows are rolling (last 24h/7d/30d/365d from `now`), not calendar-aligned. A gated window
// (week/month/year) only appears once enough real time has elapsed since the very first practice
// history record ever — not merely since a record inside that specific window — so a lone session
// from over a year ago still unlocks the year gate even though it no longer contributes to the
// year total.
export function calculateTimeLogged(
  sessions: readonly PracticeSessionRecord[],
  now: number,
): readonly TimeLoggedWindow[] {
  const firstRecordAt = sessions.reduce<number | undefined>(
    (earliest, session) =>
      earliest === undefined ? session.completedAt : Math.min(earliest, session.completedAt),
    undefined,
  );

  return WINDOW_DEFINITIONS.flatMap((definition) => {
    const unlocked =
      !definition.gated || (firstRecordAt !== undefined && now - firstRecordAt >= definition.windowMs);
    if (!unlocked) return [];

    const windowStart = now - definition.windowMs;
    const totalMs = sessions.reduce(
      (total, session) =>
        session.completedAt >= windowStart && session.completedAt <= now
          ? total + session.durationMs
          : total,
      0,
    );

    return [{ key: definition.key, totalMs }];
  });
}
