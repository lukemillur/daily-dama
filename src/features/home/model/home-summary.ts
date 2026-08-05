import type { CustomTrick } from '@/features/custom-tricks/model/custom-trick';
import type { UserProfile } from '@/features/profile/model/user-profile';
import type { PracticeSessionRecord } from '@/features/stats/model/practice-history';
import type { TrickSummary } from '@/features/tricks/model/trick';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1_000;

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
  const windowStart = now - SEVEN_DAYS_MS;
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
  };
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
