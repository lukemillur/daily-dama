import { Link, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView } from 'react-native';
import { styled } from 'styled-components/native';

import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { BodyText, DisplayTitle, Eyebrow } from '@/components/ui/typography';
import { formatPracticeDate } from '@/features/stats/model/format-practice-date';
import { AppColors, BottomTabInset } from '@/constants/theme';
import { useRequireOnboarding } from '@/features/onboarding/state/require-onboarding';
import { formatDuration } from '@/features/sesh/model/sesh';
import { getPersonalBest, selectRegularSessions } from '@/features/stats/model/practice-history';
import { usePracticeHistory } from '@/features/stats/state/practice-history-provider';

export default function TrickDetailScreen() {
  const isOnboardingComplete = useRequireOnboarding();
  const { trickId } = useLocalSearchParams<{ trickId: string }>();
  const { sessions } = usePracticeHistory();
  const regularSessions = selectRegularSessions(sessions);

  const trickSessions = useMemo(
    () =>
      [...regularSessions]
        .filter((session) => session.trickId === trickId)
        .sort((a, b) => b.completedAt - a.completedAt),
    [regularSessions, trickId],
  );

  const bestsByDuration = useMemo(() => {
    const durations = new Set<number>();
    trickSessions.forEach((session) => {
      if (session.plannedDurationMs !== undefined) durations.add(session.plannedDurationMs);
    });
    return [...durations]
      .sort((a, b) => a - b)
      .map((durationMs) => ({ durationMs, best: getPersonalBest(regularSessions, trickId, durationMs) ?? 0 }));
  }, [regularSessions, trickId, trickSessions]);

  if (!isOnboardingComplete) return null;

  if (trickSessions.length === 0) {
    return (
      <Screen edges={['top', 'left', 'right']}>
        <EmptyContent>
          <Link href="/stats" asChild>
            <BackLink accessibilityRole="link">← Back to Stats</BackLink>
          </Link>
          <StyledEyebrow>Trick history</StyledEyebrow>
          <CenteredTitle>No seshes{`\n`}on this trick yet.</CenteredTitle>
          <Link href="/stats" asChild>
            <StartButton accessibilityRole="link">Back to Stats</StartButton>
          </Link>
        </EmptyContent>
      </Screen>
    );
  }

  const trickName = trickSessions[0]?.trickName ?? 'Trick';

  return (
    <Screen edges={['top', 'left', 'right']}>
      <DetailScroll contentContainerStyle={{ paddingBottom: 120 + BottomTabInset }}>
        <DetailContent>
          <Link href="/stats" asChild>
            <BackLink accessibilityRole="link">← Back to Stats</BackLink>
          </Link>
          <StyledEyebrow>Trick history</StyledEyebrow>
          <Title>{trickName}</Title>

          {bestsByDuration.length > 0 ? (
            <>
              <SectionLabel>Personal bests</SectionLabel>
              <BestList>
                {bestsByDuration.map(({ durationMs, best }) => (
                  <BestRow key={durationMs}>
                    <BestRowInfo>
                      <BestDuration>{formatDuration(durationMs)}</BestDuration>
                      <BestValue>{best} {best === 1 ? 'lace' : 'laces'}</BestValue>
                    </BestRowInfo>
                    <Link
                      href={{ pathname: '/sesh', params: { trickId, plannedDurationMs: durationMs, mode: 'practice' } }}
                      asChild>
                      <ChallengeButton accessibilityRole="link">Challenge</ChallengeButton>
                    </Link>
                  </BestRow>
                ))}
              </BestList>
            </>
          ) : null}

          <SectionLabel>Past seshes</SectionLabel>
          <SessionList>
            {trickSessions.map((session) => (
              <SessionRow key={session.id}>
                <SessionDate>{formatPracticeDate(session.completedAt)}</SessionDate>
                <SessionMeta>
                  {formatDuration(session.durationMs)} · {session.laceCount} {session.laceCount === 1 ? 'lace' : 'laces'}
                </SessionMeta>
              </SessionRow>
            ))}
          </SessionList>
        </DetailContent>
      </DetailScroll>
    </Screen>
  );
}

const DetailScroll = styled(ScrollView)`flex: 1; width: 100%;`;
const DetailContent = styled.View`width: 100%; max-width: 760px; align-self: center; padding: 36px 22px 0;`;
const EmptyContent = styled.View`width: 100%; max-width: 620px; flex: 1; align-self: center; align-items: center; justify-content: center; padding: 40px 22px 130px;`;
const BackLink = styled.Text`align-self: flex-start; padding: 8px 0; margin-bottom: 10px; color: ${AppColors.ink}; font-size: 13px; font-weight: 900; text-decoration-line: underline;`;
const StyledEyebrow = styled(Eyebrow)`margin-bottom: 14px;`;
const CenteredTitle = styled(DisplayTitle)`text-align: center;`;
const StartButton = styled(Button).attrs({ size: 'medium' })`margin-top: 28px;`;
const Title = styled(DisplayTitle)``;
const SectionLabel = styled.Text`color: ${AppColors.red}; font-size: 13px; font-weight: 900; letter-spacing: 1.8px; margin: 32px 0 12px; text-transform: uppercase;`;
const BestList = styled.View`gap: 10px;`;
const BestRow = styled.View`flex-direction: row; align-items: center; justify-content: space-between; background-color: ${AppColors.ink}; padding: 16px 18px; border-radius: 4px;`;
const BestRowInfo = styled.View``;
const ChallengeButton = styled(Button).attrs({ size: 'medium', variant: 'secondary' })`min-height: 40px; padding: 8px 16px;`;
const BestDuration = styled.Text`color: ${AppColors.cream}; font-size: 15px; font-weight: 800;`;
const BestValue = styled.Text`color: ${({ theme }) => theme.accent}; font-size: 18px; font-weight: 900; font-variant: tabular-nums;`;
const SessionList = styled.View`gap: 10px;`;
const SessionRow = styled.View`flex-direction: row; align-items: center; justify-content: space-between; background-color: ${AppColors.paper}; border-left-width: 5px; border-left-color: ${AppColors.red}; padding: 14px 18px;`;
const SessionDate = styled.Text`color: ${AppColors.ink}; font-size: 14px; font-weight: 800;`;
const SessionMeta = styled(BodyText)`color: ${AppColors.textMuted}; font-size: 13px;`;
