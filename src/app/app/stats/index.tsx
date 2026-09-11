import { Link, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView } from 'react-native';
import { styled } from 'styled-components/native';

import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { BodyText, DisplayTitle, Eyebrow } from '@/components/ui/typography';
import { AppColors } from '@/constants/theme';
import { useCustomTricks } from '@/features/custom-tricks/state/custom-trick-provider';
import { isGuestImportPendingResolution } from '@/features/guest-import/model/guest-import';
import { useGuestImport } from '@/features/guest-import/state/use-guest-import';
import { useRequireOnboarding } from '@/features/onboarding/state/require-onboarding';
import { useUserProfile } from '@/features/profile/state/user-profile-provider';
import { formatDuration } from '@/features/sesh/model/sesh';
import { NeglectedTricksSection } from '@/features/stats/components/neglected-tricks-section';
import { formatPracticeDate } from '@/features/stats/model/format-practice-date';
import { selectNeglectedFocusedTricks, type NeglectedTrick } from '@/features/stats/model/neglected-tricks';
import {
  aggregatePracticeStats,
  selectRegularSessions,
  type PracticeSessionRecord,
} from '@/features/stats/model/practice-history';
import { usePracticeHistory, usePracticeHistorySync } from '@/features/stats/state/practice-history-provider';
import { KENDAMA_KENTEI_TRICKS } from '@/features/tricks/data/kendama-kentei-tricks';
import { selectAvailablePracticeTricks } from '@/features/tricks/model/trick-directory';
import { useIdentityHandle } from '@/shared/persistence/identity-provider';

export default function StatsScreen() {
  const isOnboardingComplete = useRequireOnboarding();
  const { sessions } = usePracticeHistory();
  const regularSessions = selectRegularSessions(sessions);
  const { selectedTrickIds } = useUserProfile();
  const { tricks: customTricks } = useCustomTricks();
  const stats = aggregatePracticeStats(regularSessions);
  const neglectedTricks = useSelectNeglectedTricks(selectedTrickIds, customTricks, regularSessions);

  const { identity } = useIdentityHandle();
  const { state: guestImportState } = useGuestImport();
  const { runSync: runPracticeHistorySync } = usePracticeHistorySync();

  // T186.1-style gate: never render EmptyStats while a guest import is
  // still inventorying/uploading/awaiting confirmation.
  const importPending = identity.kind === 'user' && isGuestImportPendingResolution(guestImportState);

  // T215: mirrors home.tsx's T199 resync effect, but targets the
  // practiceHistory domain instead of profile. The guest import's upload
  // phase pushes imported practice-history rows straight to the cloud
  // practice-history repository, bypassing this component's own
  // usePracticeHistory() reducer entirely. SyncCoordinatorProvider's
  // login-triggered pull fires once per identity generation, before the
  // import has finished uploading, so it never picks up the newly-imported
  // sessions on its own. Without this explicit resync, Stats would show a
  // false EmptyStats until a manual refresh re-triggers hydration.
  const [isResyncingAfterImport, setIsResyncingAfterImport] = useState(false);
  const resyncedImportIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (identity.kind !== 'user') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsResyncingAfterImport(false);
      return;
    }
    if (guestImportState.status !== 'completed') return;
    const importId = guestImportState.importId;
    if (importId === undefined) return;
    if (resyncedImportIdsRef.current.has(importId)) return;
    resyncedImportIdsRef.current.add(importId);

    let cancelled = false;
    setIsResyncingAfterImport(true);
    void runPracticeHistorySync('login').finally(() => {
      if (!cancelled) setIsResyncingAfterImport(false);
    });
    return () => {
      cancelled = true;
    };
  }, [identity, guestImportState.status, guestImportState.importId, runPracticeHistorySync]);

  const blockingRender = importPending || isResyncingAfterImport;

  if (!isOnboardingComplete) return null;

  return (
    <Screen edges={['top', 'left', 'right']}>
      {blockingRender ? null : stats.sessionCount === 0 ? (
        <EmptyStats />
      ) : (
        <PopulatedStats neglectedTricks={neglectedTricks} stats={stats} />
      )}
    </Screen>
  );
}

function useSelectNeglectedTricks(
  selectedTrickIds: readonly string[],
  customTricks: Parameters<typeof selectAvailablePracticeTricks>[1],
  sessions: readonly PracticeSessionRecord[],
): readonly NeglectedTrick<{ readonly id: string; readonly name: string }>[] {
  return useMemo(() => {
    const availableTricks = selectAvailablePracticeTricks(KENDAMA_KENTEI_TRICKS, customTricks);
    const availableTrickById = new Map(availableTricks.map((trick) => [trick.id, trick]));
    const focusedTricks = selectedTrickIds.flatMap((trickId) => {
      const trick = availableTrickById.get(trickId);
      return trick ? [{ id: trick.id, name: trick.name }] : [];
    });
    return selectNeglectedFocusedTricks(focusedTricks, sessions);
  }, [customTricks, selectedTrickIds, sessions]);
}

function EmptyStats() {
  return (
    <EmptyContent>
      <StyledEyebrow>Practice history</StyledEyebrow>
      <CenteredTitle>Your progress{`\n`}starts with a sesh.</CenteredTitle>
      <CenteredBody>
        Complete a sesh and your time, laces, and trick history will collect here.
      </CenteredBody>
      <Link href="/app/sesh" asChild>
        <StartButton accessibilityRole="link">Start a sesh</StartButton>
      </Link>
    </EmptyContent>
  );
}

type Stats = ReturnType<typeof aggregatePracticeStats>;

function PopulatedStats({
  neglectedTricks,
  stats,
}: {
  readonly neglectedTricks: readonly NeglectedTrick<{ readonly id: string; readonly name: string }>[];
  readonly stats: Stats;
}) {
  const router = useRouter();

  return (
    <StatsScroll contentContainerStyle={{ paddingBottom: 24 }}>
      <StatsContent>
        <StyledEyebrow>Practice history</StyledEyebrow>
        <Title>You&apos;re putting in the work.</Title>

        <Overview>
          <OverviewMetric>
            <OverviewValue>{stats.totalLaces}</OverviewValue>
            <OverviewLabel>Total laces</OverviewLabel>
          </OverviewMetric>
          <OverviewMetric>
            <OverviewValue>{formatDuration(stats.totalPracticeMs)}</OverviewValue>
            <OverviewLabel>Practice time</OverviewLabel>
          </OverviewMetric>
          <OverviewMetric>
            <OverviewValue>{stats.sessionCount}</OverviewValue>
            <OverviewLabel>{stats.sessionCount === 1 ? 'Sesh' : 'Seshes'}</OverviewLabel>
          </OverviewMetric>
        </Overview>

        <NeglectedTricksSection neglectedTricks={neglectedTricks} />

        <SectionLabel>By trick</SectionLabel>
        <TrickList>
          {stats.tricks.map((trick) => (
            <TrickStat
              key={trick.trickId}
              accessibilityRole="button"
              accessibilityLabel={`View history for ${trick.trickName}`}
              onPress={() => router.push(`/app/stats/${trick.trickId}`)}>
              <TrickHeader>
                <TrickName>{trick.trickName}</TrickName>
                <LastPracticed>{formatPracticeDate(trick.mostRecentPracticeAt)}</LastPracticed>
              </TrickHeader>
              <TrickMetrics>
                <TrickMetric>
                  <TrickMetricValue>{trick.totalLaces}</TrickMetricValue>
                  <TrickMetricLabel>Laces</TrickMetricLabel>
                </TrickMetric>
                <TrickMetric>
                  <TrickMetricValue>{formatDuration(trick.totalPracticeMs)}</TrickMetricValue>
                  <TrickMetricLabel>Time</TrickMetricLabel>
                </TrickMetric>
                <TrickMetric>
                  <TrickMetricValue>{trick.sessionCount}</TrickMetricValue>
                  <TrickMetricLabel>{trick.sessionCount === 1 ? 'Sesh' : 'Seshes'}</TrickMetricLabel>
                </TrickMetric>
              </TrickMetrics>
            </TrickStat>
          ))}
        </TrickList>
      </StatsContent>
    </StatsScroll>
  );
}

const StatsScroll = styled(ScrollView)`flex: 1; width: 100%;`;
const StatsContent = styled.View`width: 100%; max-width: 760px; align-self: center; padding: 36px 22px 0;`;
const EmptyContent = styled.View`width: 100%; max-width: 620px; flex: 1; align-self: center; align-items: center; justify-content: center; padding: 40px 22px 130px;`;
const StyledEyebrow = styled(Eyebrow)`margin-bottom: 14px;`;
const Title = styled(DisplayTitle)``;
const CenteredTitle = styled(DisplayTitle)`text-align: center;`;
const CenteredBody = styled(BodyText)`max-width: 480px; text-align: center; margin-top: 18px;`;
const StartButton = styled(Button).attrs({ size: 'medium' })`margin-top: 28px;`;
const Overview = styled.View`flex-direction: row; flex-wrap: wrap; gap: 10px; margin-top: 30px;`;
const OverviewMetric = styled.View`min-width: 150px; flex: 1; background-color: ${AppColors.ink}; padding: 20px; border-radius: 4px;`;
const OverviewValue = styled.Text`color: ${({ theme }) => theme.accent}; font-size: 30px; font-weight: 900; font-variant: tabular-nums;`;
const OverviewLabel = styled.Text`color: ${AppColors.cream}; font-size: 12px; font-weight: 800; margin-top: 4px; text-transform: uppercase;`;
const SectionLabel = styled.Text`color: ${({ theme }) => theme.text}; font-size: 13px; font-weight: 900; letter-spacing: 1.8px; margin: 38px 0 12px; text-transform: uppercase;`;
const TrickList = styled.View`gap: 12px;`;
const TrickStat = styled(Pressable)`background-color: ${AppColors.paper}; border-left-width: 5px; border-left-color: ${AppColors.red}; padding: 18px;`;
const TrickHeader = styled.View`flex-direction: row; align-items: baseline; justify-content: space-between; gap: 16px;`;
const TrickName = styled.Text`flex: 1; color: ${({ theme }) => theme.text}; font-size: 22px; font-weight: 900;`;
const LastPracticed = styled.Text`color: ${({ theme }) => theme.text}; font-size: 12px; font-weight: 700;`;
const TrickMetrics = styled.View`flex-direction: row; gap: 24px; margin-top: 18px;`;
const TrickMetric = styled.View``;
const TrickMetricValue = styled.Text`color: ${({ theme }) => theme.text}; font-size: 20px; font-weight: 900; font-variant: tabular-nums;`;
const TrickMetricLabel = styled.Text`color: ${({ theme }) => theme.text}; font-size: 11px; font-weight: 800; margin-top: 2px; text-transform: uppercase;`;
