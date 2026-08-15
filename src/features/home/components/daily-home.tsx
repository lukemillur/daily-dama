import { Link } from 'expo-router';
import { Pressable, ScrollView } from 'react-native';
import { styled } from 'styled-components/native';

import { Button } from '@/components/ui/button';
import { BodyText, DisplayTitle, Eyebrow } from '@/components/ui/typography';
import { AppColors, BottomTabInset } from '@/constants/theme';
import type { HomePracticeTrick, HomeSummary } from '@/features/home/model/home-summary';
import { formatDuration } from '@/features/sesh/model/sesh';
import type { TimeLoggedWindowKey } from '@/features/stats/model/time-logged';

export function DailyHome({ summary }: { readonly summary: HomeSummary }) {
  return (
    <HomeScroll contentContainerStyle={{ paddingBottom: 110 + BottomTabInset }}>
      <HomeContent>
        <HomeHeader>
          <BrandBlock>
            <Brand>Daily Dama</Brand>
            {summary.kenteiRank ? (
              <RankContext>Current frontier · Rank {summary.kenteiRank}</RankContext>
            ) : null}
          </BrandBlock>
          {summary.currentStreak > 0 ? (
            <StreakBadge accessibilityLabel={`${summary.currentStreak} day practice streak`}>
              <StreakValue>{summary.currentStreak}</StreakValue>
              <StreakLabel>day streak</StreakLabel>
            </StreakBadge>
          ) : null}
        </HomeHeader>

        <PrimaryPractice summary={summary} />
        <NextKenteiTrick trick={summary.nextKenteiTrick} />
        <PracticeQueue tricks={summary.selectedTricks} />
        <TimeLogged summary={summary} />
        <Momentum summary={summary} />
      </HomeContent>
    </HomeScroll>
  );
}

function PrimaryPractice({ summary }: { readonly summary: HomeSummary }) {
  const recent = summary.recentSession;

  if (!recent) {
    return (
      <Hero>
        <HeroMarker>Today’s practice</HeroMarker>
        <HeroTitle>Start your{`\n`}first sesh.</HeroTitle>
        <HeroCopy>
          Your practice list is ready when you are. A little focused work is enough to begin.
        </HeroCopy>
        <Link href="/sesh" asChild>
          <HeroButton accessibilityRole="link">Start a sesh</HeroButton>
        </Link>
      </Hero>
    );
  }

  const canPracticeAgain = recent.availableTrick !== undefined;

  return (
    <Hero>
      <HeroMarker>Pick up where you left off</HeroMarker>
      <HeroTitle>{recent.record.trickName}</HeroTitle>
      <LastSeshLine>
        Last sesh · {formatDuration(recent.record.durationMs)} · {recent.record.laceCount}{' '}
        {recent.record.laceCount === 1 ? 'lace' : 'laces'}
      </LastSeshLine>
      {canPracticeAgain ? (
        <Link
          href={{ pathname: '/sesh', params: { trickId: recent.availableTrick.id, mode: 'practice' } }}
          asChild>
          <HeroButton accessibilityRole="link">Practice again</HeroButton>
        </Link>
      ) : (
        <UnavailableAction>
          <UnavailableCopy>
            This trick is no longer in your library, but the work still counts.
          </UnavailableCopy>
          <Link href="/sesh" asChild>
            <HeroButton accessibilityRole="link">Start a sesh</HeroButton>
          </Link>
        </UnavailableAction>
      )}
    </Hero>
  );
}

// Separate, additive nudge alongside the in-rotation queue: the next standard Kentei trick
// to learn at the user's current rank (or the next rank's first trick once the current rank
// is fully laced). Standard tricks only, since rank data doesn't apply to custom tricks.
// Renders nothing once every rank is fully laced.
function NextKenteiTrick({ trick }: { readonly trick?: HomePracticeTrick }) {
  if (!trick) return null;

  return (
    <Section>
      <SectionHeading>
        <SectionHeadingCopy>
          <SectionEyebrow>Next up in Kentei</SectionEyebrow>
          <SectionTitle>Learn your next trick</SectionTitle>
        </SectionHeadingCopy>
      </SectionHeading>
      <NextTrickCard>
        <NextTrickMeta>Rank {trick.kenteiRank} · {trick.kenteiLevel}</NextTrickMeta>
        <NextTrickName>{trick.name}</NextTrickName>
        <Link
          href={{ pathname: '/sesh', params: { trickId: trick.id, mode: 'practice' } }}
          asChild>
          <NextTrickAction accessibilityRole="link">Practice →</NextTrickAction>
        </Link>
      </NextTrickCard>
    </Section>
  );
}

function PracticeQueue({ tricks }: { readonly tricks: readonly HomePracticeTrick[] }) {
  return (
    <Section>
      <SectionHeading>
        <SectionHeadingCopy>
          <SectionEyebrow>In rotation</SectionEyebrow>
          <SectionTitle>What you’re working on</SectionTitle>
        </SectionHeadingCopy>
        {tricks.length > 0 ? (
          <Link href="/tricks" asChild>
            <TextLink accessibilityRole="link">Edit practice list</TextLink>
          </Link>
        ) : null}
      </SectionHeading>

      {tricks.length === 0 ? (
        <QueueEmpty>
          <EmptyTitle>Your rotation is wide open.</EmptyTitle>
          <EmptyCopy>
            Choose a few tricks to make starting a focused sesh quick and deliberate.
          </EmptyCopy>
          <Link href="/tricks" asChild>
            <ChooseButton accessibilityRole="link" variant="secondary" size="medium">
              Choose tricks
            </ChooseButton>
          </Link>
        </QueueEmpty>
      ) : (
        <QueueList>
          {tricks.map((trick, index) => (
            <Link
              key={trick.id}
              href={{ pathname: '/sesh', params: { trickId: trick.id, mode: 'practice' } }}
              asChild>
              <QueueItem accessibilityRole="link">
                <QueueNumber>{String(index + 1).padStart(2, '0')}</QueueNumber>
                <QueueIdentity>
                  <QueueMeta>{getTrickContext(trick)}</QueueMeta>
                  <QueueName>{trick.name}</QueueName>
                  {trick.sequenceSteps ? (
                    <SequencePreview numberOfLines={2}>
                      {trick.sequenceSteps.join('  →  ')}
                    </SequencePreview>
                  ) : null}
                </QueueIdentity>
                <PracticeLabel>Practice →</PracticeLabel>
              </QueueItem>
            </Link>
          ))}
        </QueueList>
      )}
    </Section>
  );
}

// Labels name the rolling windows calculateTimeLogged actually computes (last 24h/7d/30d/365d
// from `now`), not calendar day/week/month/year — do not swap these for calendar-aligned copy
// without also changing the underlying calculation. Exported so tests can assert on the copy
// directly without needing a full router-aware render.
export const TIME_LOGGED_LABELS: Record<TimeLoggedWindowKey, string> = {
  day: 'Last 24 hours',
  week: 'Last 7 days',
  month: 'Last 30 days',
  year: 'Last 365 days',
};

function TimeLogged({ summary }: { readonly summary: HomeSummary }) {
  const { timeLoggedWindows } = summary;

  return (
    <TimeLoggedSection>
      <SectionEyebrow>Time on the string</SectionEyebrow>
      <TimeLoggedIntro>How much you’ve logged.</TimeLoggedIntro>
      <TimeLoggedGrid>
        {timeLoggedWindows.map((window) => (
          <TimeLoggedTile key={window.key}>
            <TimeLoggedValue>{formatDuration(window.totalMs)}</TimeLoggedValue>
            <TimeLoggedLabel>{TIME_LOGGED_LABELS[window.key]}</TimeLoggedLabel>
          </TimeLoggedTile>
        ))}
      </TimeLoggedGrid>
    </TimeLoggedSection>
  );
}

function Momentum({ summary }: { readonly summary: HomeSummary }) {
  const { momentum } = summary;

  return (
    <MomentumSection>
      <SectionEyebrow>Last seven days</SectionEyebrow>
      <MomentumIntro>Showing up, in three numbers.</MomentumIntro>
      <MomentumStrip>
        <MomentumMetric>
          <MomentumValue>{momentum.sessionCount}</MomentumValue>
          <MomentumLabel>{momentum.sessionCount === 1 ? 'Sesh' : 'Seshes'}</MomentumLabel>
        </MomentumMetric>
        <MetricRule />
        <MomentumMetric>
          <MomentumValue>{formatDuration(momentum.totalPracticeMs)}</MomentumValue>
          <MomentumLabel>Practice time</MomentumLabel>
        </MomentumMetric>
        <MetricRule />
        <MomentumMetric>
          <MomentumValue>{momentum.totalLaces}</MomentumValue>
          <MomentumLabel>Laces</MomentumLabel>
        </MomentumMetric>
      </MomentumStrip>
      <Link href="/stats" asChild>
        <StatsLink accessibilityRole="link">See all stats →</StatsLink>
      </Link>
    </MomentumSection>
  );
}

function getTrickContext(trick: HomePracticeTrick) {
  if (trick.kind === 'customSequence') {
    return trick.kenteiRank ? `Custom sequence · Rank ${trick.kenteiRank}` : 'Custom sequence';
  }
  if (trick.kind === 'customTrick') {
    return trick.kenteiRank ? `Custom trick · Rank ${trick.kenteiRank}` : 'Custom trick';
  }
  return `Rank ${trick.kenteiRank} · ${trick.kenteiLevel}`;
}

const HomeScroll = styled(ScrollView)`flex: 1; width: 100%;`;
const HomeContent = styled.View`width: 100%; max-width: 820px; align-self: center; padding: 28px 20px 0;`;
const HomeHeader = styled.View`flex-direction: row; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 24px;`;
const BrandBlock = styled.View`gap: 4px;`;
const Brand = styled.Text`color: ${AppColors.ink}; font-size: 18px; font-weight: 900; letter-spacing: -0.4px;`;
const RankContext = styled.Text`color: ${AppColors.inkSoft}; font-size: 12px; font-weight: 800; text-transform: uppercase;`;
const StreakBadge = styled.View`flex-direction: row; align-items: baseline; gap: 6px; background-color: ${AppColors.ink}; padding: 8px 14px; border-radius: 20px;`;
const StreakValue = styled.Text`color: ${({ theme }) => theme.accent}; font-size: 18px; font-weight: 900; font-variant: tabular-nums;`;
const StreakLabel = styled.Text`color: ${AppColors.cream}; font-size: 10px; font-weight: 800; text-transform: uppercase;`;
const Hero = styled.View`min-height: 320px; justify-content: center; background-color: ${({ theme }) => theme.accent}; border-bottom-width: 7px; border-bottom-color: ${AppColors.red}; padding: 34px 26px 38px;`;
const HeroMarker = styled(Eyebrow)`margin-bottom: 13px;`;
const HeroTitle = styled(DisplayTitle)`max-width: 620px; font-size: 48px; line-height: 49px;`;
const HeroCopy = styled(BodyText)`max-width: 500px; color: ${AppColors.inkSoft}; margin-top: 16px;`;
const LastSeshLine = styled.Text`color: ${AppColors.inkSoft}; font-size: 15px; font-weight: 800; margin-top: 16px;`;
const HeroButton = styled(Button).attrs({ size: 'medium' })`align-self: flex-start; margin-top: 26px;`;
const UnavailableAction = styled.View`align-items: flex-start;`;
const UnavailableCopy = styled(BodyText)`max-width: 500px; color: ${AppColors.inkSoft}; margin-top: 16px;`;
const Section = styled.View`margin-top: 42px;`;
const SectionHeading = styled.View`flex-direction: row; align-items: flex-end; justify-content: space-between; gap: 18px; margin-bottom: 14px;`;
const SectionHeadingCopy = styled.View`flex: 1;`;
const SectionEyebrow = styled(Eyebrow)`font-size: 11px;`;
const SectionTitle = styled.Text`color: ${AppColors.ink}; font-size: 26px; font-weight: 900; letter-spacing: -0.7px; margin-top: 7px;`;
const TextLink = styled.Text`padding: 8px 0; color: ${AppColors.ink}; font-size: 13px; font-weight: 900; text-decoration-line: underline;`;
const NextTrickCard = styled.View`background-color: ${AppColors.paper}; border-left-width: 6px; border-left-color: ${AppColors.red}; padding: 20px 22px;`;
const NextTrickMeta = styled.Text`color: ${AppColors.red}; font-size: 11px; font-weight: 900; letter-spacing: 0.8px; text-transform: uppercase;`;
const NextTrickName = styled.Text`color: ${AppColors.ink}; font-size: 22px; font-weight: 900; margin-top: 6px;`;
const NextTrickAction = styled.Text`align-self: flex-start; color: ${AppColors.ink}; font-size: 13px; font-weight: 900; margin-top: 16px;`;
const QueueList = styled.View`border-top-width: 2px; border-top-color: ${AppColors.ink};`;
const QueueItem = styled(Pressable)`min-height: 88px; flex-direction: row; align-items: center; gap: 14px; border-bottom-width: 1px; border-bottom-color: #b9c3aa; padding: 15px 2px;`;
const QueueNumber = styled.Text`width: 24px; color: ${AppColors.red}; font-size: 11px; font-weight: 900;`;
const QueueIdentity = styled.View`flex: 1;`;
const QueueMeta = styled.Text`color: ${AppColors.red}; font-size: 10px; font-weight: 900; letter-spacing: 0.8px; text-transform: uppercase;`;
const QueueName = styled.Text`color: ${AppColors.ink}; font-size: 19px; font-weight: 900; margin-top: 3px;`;
const SequencePreview = styled.Text`color: ${AppColors.textMuted}; font-size: 11px; font-weight: 700; line-height: 16px; margin-top: 4px;`;
const PracticeLabel = styled.Text`color: ${AppColors.ink}; font-size: 12px; font-weight: 900;`;
const QueueEmpty = styled.View`background-color: ${AppColors.paper}; border-left-width: 6px; border-left-color: ${AppColors.red}; padding: 24px;`;
const EmptyTitle = styled.Text`color: ${AppColors.ink}; font-size: 22px; font-weight: 900;`;
const EmptyCopy = styled(BodyText)`max-width: 500px; margin-top: 8px;`;
const ChooseButton = styled(Button)`align-self: flex-start; margin-top: 20px;`;
const TimeLoggedSection = styled.View`margin-top: 42px;`;
const TimeLoggedIntro = styled.Text`color: ${AppColors.ink}; font-size: 22px; font-weight: 900; margin-top: 7px;`;
const TimeLoggedGrid = styled.View`flex-direction: row; flex-wrap: wrap; gap: 10px; margin-top: 15px;`;
const TimeLoggedTile = styled.View`flex-grow: 1; flex-basis: 130px; background-color: ${AppColors.paper}; border-left-width: 6px; border-left-color: ${AppColors.red}; padding: 16px 14px;`;
const TimeLoggedValue = styled.Text`color: ${AppColors.ink}; font-size: 22px; font-weight: 900; font-variant: tabular-nums;`;
const TimeLoggedLabel = styled.Text`color: ${AppColors.inkSoft}; font-size: 11px; font-weight: 800; margin-top: 4px; text-transform: uppercase;`;
const MomentumSection = styled.View`margin-top: 46px;`;
const MomentumIntro = styled.Text`color: ${AppColors.ink}; font-size: 22px; font-weight: 900; margin-top: 7px;`;
const MomentumStrip = styled.View`flex-direction: row; align-items: stretch; background-color: ${AppColors.ink}; margin-top: 15px; padding: 20px 8px;`;
const MomentumMetric = styled.View`flex: 1; justify-content: center; padding: 0 10px;`;
const MomentumValue = styled.Text`color: ${({ theme }) => theme.accent}; font-size: 25px; font-weight: 900; font-variant: tabular-nums;`;
const MomentumLabel = styled.Text`color: ${AppColors.cream}; font-size: 10px; font-weight: 800; margin-top: 4px; text-transform: uppercase;`;
const MetricRule = styled.View`width: 1px; background-color: #456157;`;
const StatsLink = styled.Text`align-self: flex-start; color: ${AppColors.ink}; font-size: 13px; font-weight: 900; margin-top: 14px; padding: 6px 0;`;
