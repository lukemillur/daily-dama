import type { CustomTrick } from '@/features/custom-tricks/model/custom-trick';
import { DEFAULT_STREAK_THRESHOLD_MS, type UserProfile } from '@/features/profile/model/user-profile';
import type { PracticeSessionRecord } from '@/features/stats/model/practice-history';
import { calculateStreak } from '@/features/stats/model/streak';
import { calculateTimeLogged, WEEK_MS, type TimeLoggedWindow } from '@/features/stats/model/time-logged';
import type { TrickSummary } from '@/features/tricks/model/trick';

export interface HomePracticeTrick {
  readonly id: string;
  readonly name: string;
  readonly kind: 'standard' | 'customTrick' | 'customSequence';
  readonly kenteiRank?: number;
  readonly kenteiLevel?: TrickSummary['kenteiLevel'];
  readonly sequenceSteps?: readonly string[];
}

export interface HomeRecentSession {
  readonly record: PracticeSessionRecord;
  readonly availableTrick?: HomePracticeTrick;
}

export interface HomeMomentum {
  readonly sessionCount: number;
  readonly totalPracticeMs: number;
  readonly totalLaces: number;
}

export interface HomeSummary {
  readonly kenteiRank?: number;
  readonly recentSession?: HomeRecentSession;
  readonly selectedTricks: readonly HomePracticeTrick[];
  readonly momentum: HomeMomentum;
  readonly currentStreak: number;
  readonly timeLoggedWindows: readonly TimeLoggedWindow[];
  readonly nextKenteiTrick?: HomePracticeTrick;
}

interface CreateHomeSummaryInput {
  readonly profile: UserProfile;
  readonly standardTricks: readonly TrickSummary[];
  readonly customTricks: readonly CustomTrick[];
  readonly sessions: readonly PracticeSessionRecord[];
  readonly now: number;
}

export function createHomeSummary({
  profile,
  standardTricks,
  customTricks,
  sessions,
  now,
}: CreateHomeSummaryInput): HomeSummary {
  const availableTricks = createAvailableTrickMap(standardTricks, customTricks);
  const recentRecord = sessions.reduce<PracticeSessionRecord | undefined>(
    (mostRecent, session) =>
      mostRecent === undefined || session.completedAt > mostRecent.completedAt
        ? session
        : mostRecent,
    undefined,
  );
  const windowStart = now - WEEK_MS;
  const recentSessions = sessions.filter(
    (session) => session.completedAt >= windowStart && session.completedAt <= now,
  );

  return {
    kenteiRank: profile.kenteiRank,
    ...(recentRecord
      ? {
          recentSession: {
            record: recentRecord,
            availableTrick: availableTricks.get(recentRecord.trickId),
          },
        }
      : {}),
    selectedTricks: profile.selectedTrickIds.flatMap((trickId) => {
      const trick = availableTricks.get(trickId);
      return trick ? [trick] : [];
    }),
    momentum: recentSessions.reduce<HomeMomentum>(
      (totals, session) => ({
        sessionCount: totals.sessionCount + 1,
        totalPracticeMs: totals.totalPracticeMs + session.durationMs,
        totalLaces: totals.totalLaces + session.laceCount,
      }),
      { sessionCount: 0, totalPracticeMs: 0, totalLaces: 0 },
    ),
    currentStreak: calculateStreak(sessions, profile.streakThresholdMs ?? DEFAULT_STREAK_THRESHOLD_MS, now)
      .currentStreak,
    timeLoggedWindows: calculateTimeLogged(sessions, now),
    nextKenteiTrick: selectNextKenteiTrick(profile, standardTricks),
  };
}

// Pure selector: the first standard Kentei trick (in existing rank/data order) at the user's
// current rank that is not yet in manuallyUnlockedTrickIds. Once every trick at the current
// rank is laced, rolls forward to the first not-yet-laced trick at the next rank with tricks,
// and so on. Returns undefined once no rank at or above the user's current rank has an
// unlaced trick (including when the user has no assessed rank yet). Standard tricks only:
// rank data doesn't apply to custom tricks, so they're excluded from this suggestion.
export function selectNextKenteiTrick(
  profile: UserProfile,
  standardTricks: readonly TrickSummary[],
): HomePracticeTrick | undefined {
  if (profile.kenteiRank === undefined) return undefined;

  const lacedTrickIds = new Set(profile.manuallyUnlockedTrickIds ?? []);
  const eligibleRanks = Array.from(new Set(standardTricks.map((trick) => trick.kenteiRank)))
    .filter((rank) => rank >= profile.kenteiRank!)
    .sort((left, right) => left - right);

  for (const rank of eligibleRanks) {
    const nextTrick = standardTricks.find(
      (trick) => trick.kenteiRank === rank && !lacedTrickIds.has(trick.id),
    );
    if (nextTrick) {
      return {
        id: nextTrick.id,
        name: nextTrick.name,
        kind: 'standard',
        kenteiRank: nextTrick.kenteiRank,
        kenteiLevel: nextTrick.kenteiLevel,
      };
    }
  }

  return undefined;
}

function createAvailableTrickMap(
  standardTricks: readonly TrickSummary[],
  customTricks: readonly CustomTrick[],
) {
  const tricks: HomePracticeTrick[] = [
    ...standardTricks.map(
      (trick): HomePracticeTrick => ({
        id: trick.id,
        name: trick.name,
        kind: 'standard',
        kenteiRank: trick.kenteiRank,
        kenteiLevel: trick.kenteiLevel,
      }),
    ),
    ...customTricks.map(
      (trick): HomePracticeTrick => ({
        id: trick.id,
        name: trick.name,
        kind: trick.kind === 'sequence' ? 'customSequence' : 'customTrick',
        ...(trick.kenteiRank === undefined ? {} : { kenteiRank: trick.kenteiRank }),
        ...(trick.kind === 'sequence'
          ? { sequenceSteps: trick.steps.map((step) => step.name) }
          : {}),
      }),
    ),
  ];

  return new Map(tricks.map((trick) => [trick.id, trick]));
}
