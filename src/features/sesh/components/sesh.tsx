import { Link } from 'expo-router';
import { useEffect, useMemo, useReducer, useState } from 'react';
import { Animated, Pressable, ScrollView } from 'react-native';
import { styled } from 'styled-components/native';

import {
  formatDuration,
  getAverageInterval,
  getFastestInterval,
  INITIAL_SESH_STATE,
  type Landing,
  seshReducer,
  type SeshSummary,
} from '@/features/sesh/model/sesh';
import { KENDAMA_KENTEI_TRICKS } from '@/features/tricks/data/kendama-kentei-tricks';
import type { TrickSummary } from '@/features/tricks/model/trick';

interface SeshProps {
  readonly selectedTrickIds: readonly string[];
}

export function Sesh({ selectedTrickIds }: SeshProps) {
  const [state, dispatch] = useReducer(seshReducer, INITIAL_SESH_STATE);
  const selectedTricks = useMemo(
    () => KENDAMA_KENTEI_TRICKS.filter((trick) => selectedTrickIds.includes(trick.id)),
    [selectedTrickIds],
  );

  if (state.status === 'choosing') {
    return selectedTricks.length === 0 ? (
      <EmptyState />
    ) : (
      <TrickPicker
        tricks={selectedTricks}
        onSelect={(trick) => dispatch({ type: 'trickSelected', trick })}
      />
    );
  }

  if (state.status === 'countdown') {
    return (
      <Countdown
        trick={state.trick}
        onComplete={() => dispatch({ type: 'countdownCompleted', now: Date.now() })}
      />
    );
  }

  if (state.status === 'active') {
    return (
      <ActiveSesh
        trick={state.trick}
        startedAt={state.startedAt}
        landings={state.landings}
        onLaced={() => dispatch({ type: 'trickLaced', now: Date.now() })}
        onEnd={() => dispatch({ type: 'seshEnded', now: Date.now() })}
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
          <PrimaryButtonText>Choose tricks</PrimaryButtonText>
        </PrimaryButton>
      </Link>
    </CenteredPanel>
  );
}

function TrickPicker({ tricks, onSelect }: { readonly tricks: readonly TrickSummary[]; readonly onSelect: (trick: TrickSummary) => void }) {
  return (
    <ScrollArea contentContainerStyle={{ padding: 24, paddingBottom: 140 }}>
      <PickerContent>
        <Eyebrow>Start a sesh</Eyebrow>
        <DisplayTitle>What are we{`\n`}working on?</DisplayTitle>
        <BodyCopy>Choose one of the tricks from your profile. The three-second countdown begins immediately.</BodyCopy>
        <TrickChoices>
          {tricks.map((trick) => (
            <TrickChoice
              key={trick.id}
              accessibilityRole="button"
              accessibilityLabel={`Start a sesh with ${trick.name}`}
              onPress={() => onSelect(trick)}>
              <ChoiceMeta>Rank {trick.kenteiRank} · {trick.kenteiLevel}</ChoiceMeta>
              <ChoiceName>{trick.name}</ChoiceName>
              <ChoiceArrow>→</ChoiceArrow>
            </TrickChoice>
          ))}
        </TrickChoices>
      </PickerContent>
    </ScrollArea>
  );
}

function Countdown({ trick, onComplete }: { readonly trick: TrickSummary; readonly onComplete: () => void }) {
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
      <BodyCopy>The clock starts after the countdown.</BodyCopy>
    </CenteredPanel>
  );
}

function ActiveSesh({ trick, startedAt, landings, onLaced, onEnd }: { readonly trick: TrickSummary; readonly startedAt: number; readonly landings: readonly Landing[]; readonly onLaced: () => void; readonly onEnd: () => void }) {
  const now = useNow(startedAt);

  return (
    <ScrollArea contentContainerStyle={{ padding: 24, paddingBottom: 140 }}>
      <ActiveContent>
        <Eyebrow>Sesh in progress</Eyebrow>
        <ActiveTrick>{trick.name}</ActiveTrick>
        <Timer accessibilityLabel={`Elapsed time ${formatDuration(now - startedAt)}`}>
          {formatDuration(now - startedAt)}
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
        <PrimaryButton accessibilityRole="button" onPress={onReset}><PrimaryButtonText>Start another sesh</PrimaryButtonText></PrimaryButton>
      </ActiveContent>
    </ScrollArea>
  );
}

const ScrollArea = styled(ScrollView)`flex: 1; width: 100%;`;
const CenteredPanel = styled.View`flex: 1; width: 100%; max-width: 680px; align-self: center; align-items: center; justify-content: center; padding: 40px 24px 140px;`;
const PickerContent = styled.View`width: 100%; max-width: 680px; align-self: center;`;
const ActiveContent = styled.View`width: 100%; max-width: 680px; align-self: center; align-items: center;`;
const Eyebrow = styled.Text`color: #d84929; font-size: 13px; font-weight: 900; letter-spacing: 1.8px; text-transform: uppercase; margin-bottom: 14px;`;
const DisplayTitle = styled.Text`color: #18382e; font-size: 42px; font-weight: 900; line-height: 44px; text-align: center; letter-spacing: -1.5px;`;
const BodyCopy = styled.Text`max-width: 470px; color: #53635d; font-size: 16px; line-height: 24px; text-align: center; margin-top: 18px;`;
const PrimaryButton = styled(Pressable)`min-height: 54px; align-items: center; justify-content: center; background-color: #18382e; padding: 14px 28px; margin-top: 28px; border-radius: 5px;`;
const PrimaryButtonText = styled.Text`color: #f4c94d; font-size: 16px; font-weight: 900;`;
const TrickChoices = styled.View`gap: 10px; margin-top: 28px;`;
const TrickChoice = styled(Pressable)`min-height: 82px; justify-content: center; background-color: #f8f1dd; border: 2px solid #18382e; padding: 15px 58px 15px 18px; position: relative;`;
const ChoiceMeta = styled.Text`color: #d84929; font-size: 11px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase;`;
const ChoiceName = styled.Text`color: #18382e; font-size: 20px; font-weight: 800; margin-top: 5px;`;
const ChoiceArrow = styled.Text`position: absolute; right: 20px; color: #18382e; font-size: 28px; font-weight: 900;`;
const CountdownTrick = styled.Text`max-width: 560px; color: #18382e; font-size: 26px; font-weight: 900; text-align: center;`;
const CountdownNumber = styled.Text`color: #d84929; font-size: 156px; font-weight: 900; line-height: 180px; text-align: center;`;
const ActiveTrick = styled.Text`color: #18382e; font-size: 30px; font-weight: 900; text-align: center;`;
const Timer = styled.Text`color: #18382e; font-size: 78px; font-variant: tabular-nums; font-weight: 900; letter-spacing: -4px; margin: 22px 0;`;
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
