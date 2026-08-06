import { Link, useRouter } from 'expo-router';
import { Pressable, ScrollView } from 'react-native';
import { styled } from 'styled-components/native';

import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { BodyText, DisplayTitle, Eyebrow } from '@/components/ui/typography';
import { AppColors, BottomTabInset } from '@/constants/theme';
import { useRequireOnboarding } from '@/features/onboarding/state/require-onboarding';
import { formatDuration } from '@/features/sesh/model/sesh';
import { aggregatePracticeStats } from '@/features/stats/model/practice-history';
import { usePracticeHistory } from '@/features/stats/state/practice-history-provider';

export default function StatsScreen() {
  const isOnboardingComplete = useRequireOnboarding();
  const { sessions } = usePracticeHistory();
  const stats = aggregatePracticeStats(sessions);

  if (!isOnboardingComplete) return null;

  return (
    <Screen edges={['top', 'left', 'right']}>
      {stats.sessionCount === 0 ? <EmptyStats /> : <PopulatedStats stats={stats} />}
    </Screen>
  );
}

function EmptyStats() {
  return (
    <EmptyContent>
      <StyledEyebrow>Practice history</StyledEyebrow>
      <CenteredTitle>Your progress{`\n`}starts with a sesh.</CenteredTitle>
      <CenteredBody>
        Complete a focused practice session and your time, laces, and trick history will collect here.
      </CenteredBody>
      <Link href="/sesh" asChild>
        <StartButton accessibilityRole="link">Start a sesh</StartButton>
      </Link>
    </EmptyContent>
  );
}

type Stats = ReturnType<typeof aggregatePracticeStats>;

function PopulatedStats({ stats }: { readonly stats: Stats }) {
  const router = useRouter();

  return (
    <StatsScroll contentContainerStyle={{ paddingBottom: 120 + BottomTabInset }}>
      <StatsContent>
        <StyledEyebrow>Practice history</StyledEyebrow>
        <Title>Your work,{`\n`}adding up.</Title>

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

        <SectionLabel>By trick</SectionLabel>
        <TrickList>
          {stats.tricks.map((trick) => (
            <TrickStat
              key={trick.trickId}
              accessibilityRole="button"
              accessibilityLabel={`View history for ${trick.trickName}`}
              onPress={() => router.push(`/stats/${trick.trickId}`)}>
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

export function formatPracticeDate(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(timestamp);
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
const OverviewValue = styled.Text`color: ${AppColors.yellow}; font-size: 30px; font-weight: 900; font-variant: tabular-nums;`;
const OverviewLabel = styled.Text`color: ${AppColors.cream}; font-size: 12px; font-weight: 800; margin-top: 4px; text-transform: uppercase;`;
const SectionLabel = styled.Text`color: ${AppColors.red}; font-size: 13px; font-weight: 900; letter-spacing: 1.8px; margin: 38px 0 12px; text-transform: uppercase;`;
const TrickList = styled.View`gap: 12px;`;
const TrickStat = styled(Pressable)`background-color: ${AppColors.paper}; border-left-width: 5px; border-left-color: ${AppColors.red}; padding: 18px;`;
const TrickHeader = styled.View`flex-direction: row; align-items: baseline; justify-content: space-between; gap: 16px;`;
const TrickName = styled.Text`flex: 1; color: ${AppColors.ink}; font-size: 22px; font-weight: 900;`;
const LastPracticed = styled.Text`color: ${AppColors.textMuted}; font-size: 12px; font-weight: 700;`;
const TrickMetrics = styled.View`flex-direction: row; gap: 24px; margin-top: 18px;`;
const TrickMetric = styled.View``;
const TrickMetricValue = styled.Text`color: ${AppColors.ink}; font-size: 20px; font-weight: 900; font-variant: tabular-nums;`;
const TrickMetricLabel = styled.Text`color: ${AppColors.textMuted}; font-size: 11px; font-weight: 800; margin-top: 2px; text-transform: uppercase;`;
