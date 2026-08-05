import { Link } from 'expo-router';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, TextInput } from 'react-native';
import { styled } from 'styled-components/native';

import { Button } from '@/components/ui/button';
import { BodyText, DisplayTitle as BaseDisplayTitle, Eyebrow as BaseEyebrow } from '@/components/ui/typography';
import { AppColors } from '@/constants/theme';
import {
  createTimedSeshPlan,
  formatDuration,
  formatRemainingDuration,
  getAverageInterval,
  getFastestInterval,
  INITIAL_SESH_STATE,
  isValidTimedSeshMinutes,
  type Landing,
  OPEN_ENDED_SESH_PLAN,
  seshReducer,
  type SeshPlan,
  type SeshSummary,
} from '@/features/sesh/model/sesh';
import type { PracticeTrick } from '@/features/tricks/model/trick';
import { usePracticeHistoryActions } from '@/features/stats/state/practice-history-provider';

interface SeshProps {
  readonly selectedTrickIds: readonly string[];
  readonly availableTricks: readonly PracticeTrick[];
}

export function Sesh({ availableTricks, selectedTrickIds }: SeshProps) {
  const [state, dispatch] = useReducer(seshReducer, INITIAL_SESH_STATE);
  const { recordCompletedSesh } = usePracticeHistoryActions();
  const recordedSummaryId = useRef<string | undefined>(undefined);
  const selectedTricks = useMemo(
    () => availableTricks.filter((trick) => selectedTrickIds.includes(trick.id)),
    [availableTricks, selectedTrickIds],
  );

  useEffect(() => {
    if (state.status !== 'completed') return;

    const summaryId = `${state.summary.startedAt}:${state.summary.endedAt}:${state.summary.trick.id}`;
    if (recordedSummaryId.current === summaryId) return;

    recordedSummaryId.current = summaryId;
    recordCompletedSesh(state.summary);
  }, [recordCompletedSesh, state]);

  if (state.status === 'choosing') {
    return selectedTricks.length === 0 ? (
      <EmptyState />
    ) : (
      <TrickPicker
        tricks={selectedTricks}
        onSelect={(trick, plan) => dispatch({ type: 'trickSelected', trick, plan })}
      />
    );
  }

  if (state.status === 'countdown') {
    return (
      <Countdown
        trick={state.trick}
        plan={state.plan}
        onComplete={() => dispatch({ type: 'countdownCompleted', now: Date.now() })}
      />
    );
  }

  if (state.status === 'active') {
    return (
      <ActiveSesh
        trick={state.trick}
        plan={state.plan}
        startedAt={state.startedAt}
        landings={state.landings}
        onLaced={() => dispatch({ type: 'trickLaced', now: Date.now() })}
        onEnd={() => dispatch({ type: 'seshEnded', now: Date.now() })}
        onTimerElapsed={() => dispatch({ type: 'timerElapsed', now: Date.now() })}
      />
    );
  }

  return <CompletedSesh summary={state.summary} onReset={() => dispatch({ type: 'seshReset' })} />;
}

function EmptyState() {
  return (
    <CenteredPanel>
      <Eyebrow>Nothing queued</Eyebrow>
      <DisplayTitle>Build your{`\n`}practice list.</DisplayTitle>
      <BodyCopy>Select at least one trick in your profile before starting a focused sesh.</BodyCopy>
      <Link href="/profile" asChild>
        <PrimaryButton accessibilityRole="link">
          Choose tricks
        </PrimaryButton>
      </Link>
    </CenteredPanel>
  );
}

function TrickPicker({ tricks, onSelect }: { readonly tricks: readonly PracticeTrick[]; readonly onSelect: (trick: PracticeTrick, plan: SeshPlan) => void }) {
  const [planKind, setPlanKind] = useState<SeshPlan['kind']>('openEnded');
  const [durationMinutes, setDurationMinutes] = useState('5');
  const parsedDuration = Number(durationMinutes);
  const hasValidDuration = isValidTimedSeshMinutes(parsedDuration);
  const selectedPlan = planKind === 'openEnded'
    ? OPEN_ENDED_SESH_PLAN
    : hasValidDuration
      ? createTimedSeshPlan(parsedDuration)
      : undefined;

  return (
    <ScrollArea contentContainerStyle={{ padding: 24, paddingBottom: 140 }}>
      <PickerContent>
        <Eyebrow>Start a sesh</Eyebrow>
        <DisplayTitle>What are we{`\n`}working on?</DisplayTitle>
        <BodyCopy>Choose how long you want to focus, then pick one of the tricks from your profile.</BodyCopy>
        <PlanLabel>Practice format</PlanLabel>
        <PlanChoices>
          <PlanChoice
            accessibilityRole="radio"
            accessibilityState={{ checked: planKind === 'openEnded' }}
            $selected={planKind === 'openEnded'}
            onPress={() => setPlanKind('openEnded')}>
            <PlanChoiceTitle $selected={planKind === 'openEnded'}>Open-ended</PlanChoiceTitle>
            <PlanChoiceCopy $selected={planKind === 'openEnded'}>Count up until you end the sesh.</PlanChoiceCopy>
          </PlanChoice>
          <PlanChoice
            accessibilityRole="radio"
            accessibilityState={{ checked: planKind === 'timed' }}
            $selected={planKind === 'timed'}
            onPress={() => setPlanKind('timed')}>
            <PlanChoiceTitle $selected={planKind === 'timed'}>Timed</PlanChoiceTitle>
            <PlanChoiceCopy $selected={planKind === 'timed'}>Count down to a defined finish.</PlanChoiceCopy>
          </PlanChoice>
        </PlanChoices>
        {planKind === 'timed' ? (
          <DurationField>
            <DurationLabel>Minutes</DurationLabel>
            <DurationInput
              accessibilityLabel="Sesh duration in minutes"
              inputMode="numeric"
              keyboardType="number-pad"
              maxLength={2}
              onChangeText={setDurationMinutes}
              selectTextOnFocus
              value={durationMinutes}
            />
            <DurationHint $invalid={!hasValidDuration}>
              {hasValidDuration ? 'Choose any whole minute from 1 to 60.' : 'Enter a whole number from 1 to 60.'}
            </DurationHint>
          </DurationField>
        ) : null}
        <TrickChoices>
          {tricks.map((trick) => (
            <TrickChoice
              key={trick.id}
              accessibilityRole="button"
              accessibilityLabel={`Start a sesh with ${trick.name}`}
              accessibilityState={{ disabled: selectedPlan === undefined }}
              disabled={selectedPlan === undefined}
              $disabled={selectedPlan === undefined}
              onPress={() => selectedPlan && onSelect(trick, selectedPlan)}>
              <ChoiceMeta>{trick.descriptor ?? 'Practice trick'}</ChoiceMeta>
              <ChoiceName>{trick.name}</ChoiceName>
              <ChoiceArrow>→</ChoiceArrow>
            </TrickChoice>
          ))}
        </TrickChoices>
      </PickerContent>
    </ScrollArea>
  );
}

function Countdown({ trick, plan, onComplete }: { readonly trick: PracticeTrick; readonly plan: SeshPlan; readonly onComplete: () => void }) {
  const [count, setCount] = useState(3);
  const [scale] = useState(() => new Animated.Value(0.55));
  const [opacity] = useState(() => new Animated.Value(0));

  useEffect(() => {
    scale.setValue(0.55);
    opacity.setValue(0);
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, damping: 9, stiffness: 180, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();

    const timeout = setTimeout(() => {
      if (count === 1) onComplete();
      else setCount((current) => current - 1);
    }, 1000);

    return () => clearTimeout(timeout);
  }, [count, onComplete, opacity, scale]);

  return (
    <CenteredPanel>
      <Eyebrow>Get ready</Eyebrow>
      <CountdownTrick>{trick.name}</CountdownTrick>
      <Animated.View style={{ opacity, transform: [{ scale }] }}>
        <CountdownNumber>{count}</CountdownNumber>
      </Animated.View>
      <BodyCopy>
        {plan.kind === 'timed'
          ? `${formatDuration(plan.durationMs)} begins after the countdown.`
          : 'The clock starts after the countdown.'}
      </BodyCopy>
    </CenteredPanel>
  );
}

function ActiveSesh({ trick, plan, startedAt, landings, onLaced, onEnd, onTimerElapsed }: { readonly trick: PracticeTrick; readonly plan: SeshPlan; readonly startedAt: number; readonly landings: readonly Landing[]; readonly onLaced: () => void; readonly onEnd: () => void; readonly onTimerElapsed: () => void }) {
  const now = useNow(startedAt);
  const elapsedMs = now - startedAt;
  const displayedTime =
    plan.kind === 'timed' ? Math.max(0, plan.durationMs - elapsedMs) : elapsedMs;
  const formattedTime =
    plan.kind === 'timed'
      ? formatRemainingDuration(displayedTime)
      : formatDuration(displayedTime);

  useEffect(() => {
    if (plan.kind === 'timed' && elapsedMs >= plan.durationMs) onTimerElapsed();
  }, [elapsedMs, onTimerElapsed, plan]);

  return (
    <ScrollArea contentContainerStyle={{ padding: 24, paddingBottom: 140 }}>
      <ActiveContent>
        <Eyebrow>Sesh in progress</Eyebrow>
        <ActiveTrick>{trick.name}</ActiveTrick>
        <TimerLabel>{plan.kind === 'timed' ? 'Time remaining' : 'Elapsed time'}</TimerLabel>
        <Timer
          accessibilityLabel={`${plan.kind === 'timed' ? 'Time remaining' : 'Elapsed time'} ${formattedTime}`}>
          {formattedTime}
        </Timer>
        <LacedButton accessibilityRole="button" onPress={onLaced} accessibilityLabel="Laced">
          <LacedButtonText>Laced.</LacedButtonText>
          <LacedCount>{landings.length}</LacedCount>
        </LacedButton>
        <LandingHistory landings={landings} />
        <EndButton accessibilityRole="button" onPress={onEnd}><EndButtonText>End Sesh</EndButtonText></EndButton>
      </ActiveContent>
    </ScrollArea>
  );
}

function useNow(initialTime: number) {
  const [now, setNow] = useState(initialTime);
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, []);
  return now;
}

function LandingHistory({ landings }: { readonly landings: readonly Landing[] }) {
  if (landings.length === 0) {
    return <HistoryEmpty>Your laces will stack up here.</HistoryEmpty>;
  }

  return (
    <History>
      <HistoryTitle>Lace timeline</HistoryTitle>
      {[...landings].reverse().map((landing, reverseIndex) => {
        const laceNumber = landings.length - reverseIndex;
        return (
          <LandingRow key={laceNumber}>
            <LandingNumber>#{String(laceNumber).padStart(2, '0')}</LandingNumber>
            <LandingTime>{formatDuration(landing.elapsedMs)}</LandingTime>
            <LandingInterval>+{formatDuration(landing.intervalMs)}</LandingInterval>
          </LandingRow>
        );
      })}
    </History>
  );
}

function CompletedSesh({ summary, onReset }: { readonly summary: SeshSummary; readonly onReset: () => void }) {
  const average = getAverageInterval(summary.landings);
  const fastest = getFastestInterval(summary.landings);

  return (
    <ScrollArea contentContainerStyle={{ padding: 24, paddingBottom: 140 }}>
      <ActiveContent>
        <Eyebrow>Sesh complete</Eyebrow>
        <DisplayTitle>{summary.trick.name}</DisplayTitle>
        <SummaryGrid>
          <Metric><MetricValue>{formatDuration(summary.durationMs)}</MetricValue><MetricLabel>Total time</MetricLabel></Metric>
          <Metric><MetricValue>{summary.landings.length}</MetricValue><MetricLabel>Laces</MetricLabel></Metric>
          <Metric><MetricValue>{average === undefined ? '—' : formatDuration(average)}</MetricValue><MetricLabel>Average pace</MetricLabel></Metric>
          <Metric><MetricValue>{fastest === undefined ? '—' : formatDuration(fastest)}</MetricValue><MetricLabel>Fastest lace</MetricLabel></Metric>
        </SummaryGrid>
        <LandingHistory landings={summary.landings} />
        <PrimaryButton onPress={onReset}>Start another sesh</PrimaryButton>
      </ActiveContent>
    </ScrollArea>
  );
}

const ScrollArea = styled(ScrollView)`flex: 1; width: 100%;`;
const CenteredPanel = styled.View`flex: 1; width: 100%; max-width: 680px; align-self: center; align-items: center; justify-content: center; padding: 40px 24px 140px;`;
const PickerContent = styled.View`width: 100%; max-width: 680px; align-self: center;`;
const ActiveContent = styled.View`width: 100%; max-width: 680px; align-self: center; align-items: center;`;
const Eyebrow = styled(BaseEyebrow)`margin-bottom: 14px;`;
const DisplayTitle = styled(BaseDisplayTitle)`text-align: center;`;
const BodyCopy = styled(BodyText)`max-width: 470px; text-align: center; margin-top: 18px;`;
const PrimaryButton = styled(Button).attrs({ size: 'medium' })`
  margin-top: 28px;
  border-radius: 5px;
`;
const PlanLabel = styled.Text`color: ${AppColors.ink}; font-size: 13px; font-weight: 900; letter-spacing: 1.2px; margin-top: 30px; text-transform: uppercase;`;
const PlanChoices = styled.View`flex-direction: row; gap: 10px; margin-top: 10px;`;
const PlanChoice = styled(Pressable)<{ $selected: boolean }>`flex: 1; min-height: 94px; background-color: ${({ $selected }) => ($selected ? AppColors.ink : AppColors.paper)}; border: 2px solid ${AppColors.ink}; padding: 15px;`;
const PlanChoiceTitle = styled.Text<{ $selected: boolean }>`color: ${({ $selected }) => ($selected ? AppColors.yellow : AppColors.ink)}; font-size: 17px; font-weight: 900;`;
const PlanChoiceCopy = styled.Text<{ $selected: boolean }>`color: ${({ $selected }) => ($selected ? AppColors.cream : AppColors.inkSoft)}; font-size: 12px; font-weight: 600; line-height: 17px; margin-top: 5px;`;
const DurationField = styled.View`margin-top: 16px;`;
const DurationLabel = styled.Text`color: ${AppColors.ink}; font-size: 12px; font-weight: 900; margin-bottom: 6px; text-transform: uppercase;`;
const DurationInput = styled(TextInput)`height: 54px; width: 110px; background-color: ${AppColors.paper}; border: 2px solid ${AppColors.ink}; color: ${AppColors.ink}; font-size: 24px; font-weight: 900; padding: 8px 12px;`;
const DurationHint = styled.Text<{ $invalid: boolean }>`color: ${({ $invalid }) => ($invalid ? AppColors.red : AppColors.textMuted)}; font-size: 12px; font-weight: 700; margin-top: 7px;`;
const TrickChoices = styled.View`gap: 10px; margin-top: 28px;`;
const TrickChoice = styled(Pressable)<{ $disabled: boolean }>`min-height: 82px; justify-content: center; background-color: #f8f1dd; border: 2px solid #18382e; opacity: ${({ $disabled }) => ($disabled ? 0.45 : 1)}; padding: 15px 58px 15px 18px; position: relative;`;
const ChoiceMeta = styled.Text`color: ${AppColors.red}; font-size: 11px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase;`;
const ChoiceName = styled.Text`color: ${AppColors.ink}; font-size: 20px; font-weight: 800; margin-top: 5px;`;
const ChoiceArrow = styled.Text`position: absolute; right: 20px; color: ${AppColors.ink}; font-size: 28px; font-weight: 900;`;
const CountdownTrick = styled.Text`max-width: 560px; color: #18382e; font-size: 26px; font-weight: 900; text-align: center;`;
const CountdownNumber = styled.Text`color: #d84929; font-size: 156px; font-weight: 900; line-height: 180px; text-align: center;`;
const ActiveTrick = styled.Text`color: #18382e; font-size: 30px; font-weight: 900; text-align: center;`;
const TimerLabel = styled.Text`color: ${AppColors.red}; font-size: 12px; font-weight: 900; letter-spacing: 1.4px; margin-top: 22px; text-transform: uppercase;`;
const Timer = styled.Text`color: #18382e; font-size: 78px; font-variant: tabular-nums; font-weight: 900; letter-spacing: -4px; margin: 4px 0 22px;`;
const LacedButton = styled(Pressable)`width: 100%; min-height: 108px; flex-direction: row; align-items: center; justify-content: space-between; background-color: #d84929; padding: 22px 26px; border-radius: 6px;`;
const LacedButtonText = styled.Text`color: #fff8e5; font-size: 34px; font-weight: 900;`;
const LacedCount = styled.Text`color: #f4c94d; font-size: 40px; font-weight: 900;`;
const History = styled.View`width: 100%; margin-top: 28px;`;
const HistoryTitle = styled.Text`color: #18382e; font-size: 14px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 8px;`;
const HistoryEmpty = styled.Text`width: 100%; color: #71807a; font-size: 15px; text-align: center; padding: 30px 0 12px;`;
const LandingRow = styled.View`min-height: 50px; flex-direction: row; align-items: center; border-bottom-width: 1px; border-bottom-color: #c7ceb7;`;
const LandingNumber = styled.Text`width: 54px; color: #d84929; font-size: 13px; font-weight: 900;`;
const LandingTime = styled.Text`flex: 1; color: #18382e; font-size: 20px; font-variant: tabular-nums; font-weight: 800;`;
const LandingInterval = styled.Text`color: #53635d; font-size: 14px; font-variant: tabular-nums; font-weight: 700;`;
const EndButton = styled(Pressable)`min-height: 48px; align-items: center; justify-content: center; padding: 12px 24px; margin-top: 28px; border: 2px solid #18382e; border-radius: 5px;`;
const EndButtonText = styled.Text`color: #18382e; font-size: 15px; font-weight: 900;`;
const SummaryGrid = styled.View`width: 100%; flex-direction: row; flex-wrap: wrap; gap: 10px; margin-top: 28px;`;
const Metric = styled.View`min-width: 46%; flex-grow: 1; background-color: #f8f1dd; border-top-width: 5px; border-top-color: #d84929; padding: 18px;`;
const MetricValue = styled.Text`color: #18382e; font-size: 30px; font-variant: tabular-nums; font-weight: 900;`;
const MetricLabel = styled.Text`color: #53635d; font-size: 12px; font-weight: 800; margin-top: 3px; text-transform: uppercase;`;
