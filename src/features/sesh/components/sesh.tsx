import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { Link } from 'expo-router';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, TextInput } from 'react-native';
import { styled } from 'styled-components/native';

import { Button } from '@/components/ui/button';
import { BodyText, DisplayTitle as BaseDisplayTitle, Eyebrow as BaseEyebrow } from '@/components/ui/typography';
import { AppColors } from '@/constants/theme';
import {
  createOpenEndedSeshPlan,
  createTimedSeshPlan,
  formatDuration,
  formatRemainingDuration,
  getAverageInterval,
  getFastestInterval,
  getSeshTargetLandingCount,
  INITIAL_SESH_STATE,
  isSeshTargetMet,
  isValidSeshTargetLandingCount,
  isValidTimedSeshMinutes,
  type Landing,
  selectSeshPracticeTricks,
  seshReducer,
  type SeshPlan,
  shouldKeepScreenAwake,
  type SeshSummary,
} from '@/features/sesh/model/sesh';
import type { PracticeTrick } from '@/features/tricks/model/trick';
import { getPersonalBest, type PracticeSessionRecord } from '@/features/stats/model/practice-history';
import { usePracticeHistory, usePracticeHistoryActions } from '@/features/stats/state/practice-history-provider';
import { useUserProfileActions } from '@/features/profile/state/user-profile-provider';

const SESH_KEEP_AWAKE_TAG = 'sesh-active';

interface SeshProps {
  readonly selectedTrickIds: readonly string[];
  readonly availableTricks: readonly PracticeTrick[];
  readonly preferredTrickId?: string;
  readonly initialPlan?: SeshPlan;
}

export function Sesh({ availableTricks, initialPlan, preferredTrickId, selectedTrickIds }: SeshProps) {
  const [state, dispatch] = useReducer(seshReducer, INITIAL_SESH_STATE);
  const { sessions } = usePracticeHistory();
  const { recordCompletedSesh } = usePracticeHistoryActions();
  const { setLastSesh } = useUserProfileActions();
  const recordedSummaryId = useRef<string | undefined>(undefined);
  const [personalBest, setPersonalBest] = useState<number | undefined>(undefined);
  const [liveChallengeEnabled, setLiveChallengeEnabled] = useState(false);
  const practiceTricks = useMemo(
    () => selectSeshPracticeTricks(availableTricks, selectedTrickIds, preferredTrickId),
    [availableTricks, preferredTrickId, selectedTrickIds],
  );
  const validatedPreferredTrickId = practiceTricks.some(
    (trick) => trick.id === preferredTrickId,
  )
    ? preferredTrickId
    : undefined;

  useEffect(() => {
    if (state.status !== 'completed') return;

    const summaryId = `${state.summary.startedAt}:${state.summary.endedAt}:${state.summary.trick.id}`;
    if (recordedSummaryId.current === summaryId) return;

    recordedSummaryId.current = summaryId;
    recordCompletedSesh(state.summary);
  }, [recordCompletedSesh, state]);

  useEffect(() => {
    if (!shouldKeepScreenAwake(state.status)) return;

    activateKeepAwakeAsync(SESH_KEEP_AWAKE_TAG).catch(() => {
      // Best-effort: some browsers reject the wake-lock request (e.g. no
      // user gesture yet, or unsupported). Screen-sleep prevention is a
      // nice-to-have, not a blocker for practicing.
    });

    return () => {
      deactivateKeepAwake(SESH_KEEP_AWAKE_TAG).catch(() => {
        // Nothing to release if activation above never succeeded.
      });
    };
  }, [state.status]);

  if (state.status === 'choosing') {
    return practiceTricks.length === 0 ? (
      <EmptyState />
    ) : (
      <TrickPicker
        initialPlan={initialPlan}
        preferredTrickId={validatedPreferredTrickId}
        tricks={practiceTricks}
        sessions={sessions}
        onSelect={(trick, plan, best, liveChallenge) => {
          setPersonalBest(best);
          setLiveChallengeEnabled(liveChallenge);
          dispatch({ type: 'trickSelected', trick, plan });
          setLastSesh(trick.id, plan);
        }}
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
        pausedAt={state.pausedAt}
        pausedDurationMs={state.pausedDurationMs}
        personalBest={personalBest}
        liveChallengeEnabled={liveChallengeEnabled}
        onLaced={() => dispatch({ type: 'trickLaced', now: Date.now() })}
        onPause={() => dispatch({ type: 'seshPaused', now: Date.now() })}
        onResume={() => dispatch({ type: 'seshResumed', now: Date.now() })}
        onEnd={() => dispatch({ type: 'seshEnded', now: Date.now() })}
        onTimerElapsed={() => dispatch({ type: 'timerElapsed', now: Date.now() })}
      />
    );
  }

  return (
    <CompletedSesh
      summary={state.summary}
      personalBest={personalBest}
      onReset={() => dispatch({ type: 'seshReset' })}
      onRepeat={() => {
        const best =
          state.summary.plan.kind === 'timed'
            ? getPersonalBest(sessions, state.summary.trick.id, state.summary.plan.durationMs)
            : undefined;
        setPersonalBest(best);
        setLiveChallengeEnabled(false);
        dispatch({ type: 'trickSelected', trick: state.summary.trick, plan: state.summary.plan });
        setLastSesh(state.summary.trick.id, state.summary.plan);
      }}
    />
  );
}

function EmptyState() {
  return (
    <CenteredPanel>
      <Eyebrow>Nothing queued</Eyebrow>
      <DisplayTitle>Build your{`\n`}practice list.</DisplayTitle>
      <BodyCopy>Select at least one trick in Tricks before starting a focused sesh.</BodyCopy>
      <Link href="/tricks" asChild>
        <PrimaryButton accessibilityRole="link">
          Choose tricks
        </PrimaryButton>
      </Link>
    </CenteredPanel>
  );
}

function TrickPicker({
  initialPlan,
  preferredTrickId,
  tricks,
  sessions,
  onSelect,
}: {
  readonly initialPlan?: SeshPlan;
  readonly preferredTrickId?: string;
  readonly tricks: readonly PracticeTrick[];
  readonly sessions: readonly PracticeSessionRecord[];
  readonly onSelect: (
    trick: PracticeTrick,
    plan: SeshPlan,
    personalBest: number | undefined,
    liveChallengeEnabled: boolean,
  ) => void;
}) {
  const [planKind, setPlanKind] = useState<SeshPlan['kind']>(initialPlan?.kind ?? 'timed');
  const [durationMinutes, setDurationMinutes] = useState(
    initialPlan?.kind === 'timed' ? String(initialPlan.durationMs / 60_000) : '5',
  );
  const [targetLandingCount, setTargetLandingCount] = useState(
    initialPlan?.kind === 'openEnded' && initialPlan.target
      ? String(initialPlan.target.landingCount)
      : '',
  );
  const [liveChallengeEnabled, setLiveChallengeEnabled] = useState(false);
  const parsedDuration = Number(durationMinutes);
  const hasValidDuration = isValidTimedSeshMinutes(parsedDuration);
  const parsedTargetLandingCount = Number(targetLandingCount);
  const hasTargetLandingCount = targetLandingCount.trim().length > 0;
  const hasValidTargetLandingCount =
    !hasTargetLandingCount || isValidSeshTargetLandingCount(parsedTargetLandingCount);
  const selectedPlan = planKind === 'openEnded'
    ? hasValidTargetLandingCount
      ? createOpenEndedSeshPlan(hasTargetLandingCount ? parsedTargetLandingCount : undefined)
      : undefined
    : hasValidDuration
      ? createTimedSeshPlan(parsedDuration)
      : undefined;

  const personalBestsByTrickId = useMemo(() => {
    const bests = new Map<string, number>();
    if (selectedPlan?.kind !== 'timed') return bests;
    tricks.forEach((trick) => {
      const best = getPersonalBest(sessions, trick.id, selectedPlan.durationMs);
      if (best !== undefined) bests.set(trick.id, best);
    });
    return bests;
  }, [selectedPlan, sessions, tricks]);
  const hasAnyPersonalBest = personalBestsByTrickId.size > 0;

  return (
    <ScrollArea contentContainerStyle={{ padding: 24, paddingBottom: 140 }}>
      <PickerContent>
        <Eyebrow>Start a sesh</Eyebrow>
        <DisplayTitle>What are we{`\n`}working on?</DisplayTitle>
        <BodyCopy>Choose how long you want to focus, then pick one of the tricks from your practice list.</BodyCopy>
        <PlanLabel>Practice format</PlanLabel>
        <PlanChoices>
          <PlanChoice
            accessibilityRole="radio"
            accessibilityState={{ checked: planKind === 'timed' }}
            $selected={planKind === 'timed'}
            onPress={() => setPlanKind('timed')}>
            <PlanChoiceTitle $selected={planKind === 'timed'}>Timed</PlanChoiceTitle>
            <PlanChoiceCopy $selected={planKind === 'timed'}>Count down to a defined finish.</PlanChoiceCopy>
          </PlanChoice>
          <PlanChoice
            accessibilityRole="radio"
            accessibilityState={{ checked: planKind === 'openEnded' }}
            $selected={planKind === 'openEnded'}
            onPress={() => setPlanKind('openEnded')}>
            <PlanChoiceTitle $selected={planKind === 'openEnded'}>Open-ended</PlanChoiceTitle>
            <PlanChoiceCopy $selected={planKind === 'openEnded'}>Count up until you end the sesh.</PlanChoiceCopy>
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
        {planKind === 'openEnded' ? (
          <DurationField>
            <DurationLabel>Target laces (optional)</DurationLabel>
            <DurationInput
              accessibilityLabel="Target lace count"
              inputMode="numeric"
              keyboardType="number-pad"
              maxLength={3}
              onChangeText={setTargetLandingCount}
              placeholder="—"
              selectTextOnFocus
              value={targetLandingCount}
            />
            <DurationHint $invalid={!hasValidTargetLandingCount}>
              {hasValidTargetLandingCount
                ? 'Leave blank to just count up, or set a lace count to hit.'
                : 'Enter a whole number from 1 to 999, or leave it blank.'}
            </DurationHint>
          </DurationField>
        ) : null}
        {hasAnyPersonalBest ? (
          <ChallengeField>
            <PlanLabel>When you beat your best</PlanLabel>
            <ChallengeChoices>
              <ChallengeChoice
                accessibilityRole="radio"
                accessibilityState={{ checked: !liveChallengeEnabled }}
                $selected={!liveChallengeEnabled}
                onPress={() => setLiveChallengeEnabled(false)}>
                <ChallengeChoiceTitle $selected={!liveChallengeEnabled}>Reveal at the end</ChallengeChoiceTitle>
                <ChallengeChoiceCopy $selected={!liveChallengeEnabled}>See how you did once the sesh is over.</ChallengeChoiceCopy>
              </ChallengeChoice>
              <ChallengeChoice
                accessibilityRole="radio"
                accessibilityState={{ checked: liveChallengeEnabled }}
                $selected={liveChallengeEnabled}
                onPress={() => setLiveChallengeEnabled(true)}>
                <ChallengeChoiceTitle $selected={liveChallengeEnabled}>Show live progress</ChallengeChoiceTitle>
                <ChallengeChoiceCopy $selected={liveChallengeEnabled}>Track it against your best as you go.</ChallengeChoiceCopy>
              </ChallengeChoice>
            </ChallengeChoices>
          </ChallengeField>
        ) : null}
        <TrickChoices>
          {tricks.map((trick) => {
            const isPreferred = trick.id === preferredTrickId;
            const personalBest = personalBestsByTrickId.get(trick.id);
            return <TrickChoice
              key={trick.id}
              accessibilityRole="button"
              accessibilityLabel={`Start a sesh with ${trick.name}`}
              accessibilityState={{ disabled: selectedPlan === undefined }}
              disabled={selectedPlan === undefined}
              $disabled={selectedPlan === undefined}
              onPress={() => selectedPlan && onSelect(trick, selectedPlan, personalBest, liveChallengeEnabled)}>
              <ChoiceMeta $preferred={isPreferred}>
                {isPreferred ? `Up next · ${trick.descriptor ?? 'Practice trick'}` : trick.descriptor ?? 'Practice trick'}
              </ChoiceMeta>
              <ChoiceName>{trick.name}</ChoiceName>
              <SequenceSteps trick={trick} compact />
              {personalBest !== undefined ? (
                <ChoiceBest>Best at {durationMinutes}:00 — {personalBest} {personalBest === 1 ? 'lace' : 'laces'}</ChoiceBest>
              ) : null}
              <ChoiceArrow>→</ChoiceArrow>
            </TrickChoice>;
          })}
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
      <SequenceSteps trick={trick} />
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

function ActiveSesh({
  trick,
  plan,
  startedAt,
  landings,
  pausedAt,
  pausedDurationMs,
  personalBest,
  liveChallengeEnabled,
  onLaced,
  onPause,
  onResume,
  onEnd,
  onTimerElapsed,
}: {
  readonly trick: PracticeTrick;
  readonly plan: SeshPlan;
  readonly startedAt: number;
  readonly landings: readonly Landing[];
  readonly pausedAt?: number;
  readonly pausedDurationMs: number;
  readonly personalBest?: number;
  readonly liveChallengeEnabled: boolean;
  readonly onLaced: () => void;
  readonly onPause: () => void;
  readonly onResume: () => void;
  readonly onEnd: () => void;
  readonly onTimerElapsed: () => void;
}) {
  const showChallenge = liveChallengeEnabled && personalBest !== undefined;
  const hasBeatenBest = showChallenge && landings.length > personalBest;
  const isPaused = pausedAt !== undefined;
  const targetLandingCount = getSeshTargetLandingCount(plan);
  const targetMet = isSeshTargetMet(plan, landings.length);
  const now = useNow(startedAt, isPaused);
  const totalPausedMs = pausedDurationMs + (isPaused ? Math.max(0, now - pausedAt) : 0);
  const elapsedMs = now - startedAt - totalPausedMs;
  const displayedTime =
    plan.kind === 'timed' ? Math.max(0, plan.durationMs - elapsedMs) : elapsedMs;
  const formattedTime =
    plan.kind === 'timed'
      ? formatRemainingDuration(displayedTime)
      : formatDuration(displayedTime);

  useEffect(() => {
    if (!isPaused && plan.kind === 'timed' && elapsedMs >= plan.durationMs) onTimerElapsed();
  }, [elapsedMs, isPaused, onTimerElapsed, plan]);

  return (
    <ScrollArea contentContainerStyle={{ padding: 24, paddingBottom: 140 }}>
      <ActiveContent>
        <Eyebrow>{isPaused ? 'Sesh paused' : 'Sesh in progress'}</Eyebrow>
        <ActiveTrick>{trick.name}</ActiveTrick>
        <SequenceSteps trick={trick} prominent />
        <TimerLabel>{plan.kind === 'timed' ? 'Time remaining' : 'Elapsed time'}</TimerLabel>
        <Timer
          accessibilityLabel={`${plan.kind === 'timed' ? 'Time remaining' : 'Elapsed time'} ${formattedTime}`}>
          {formattedTime}
        </Timer>
        <LacedButton
          accessibilityRole="button"
          accessibilityState={{ disabled: isPaused }}
          disabled={isPaused}
          $disabled={isPaused}
          onPress={onLaced}
          accessibilityLabel="Laced">
          <LacedButtonText>Laced.</LacedButtonText>
          <LacedCount>{landings.length}</LacedCount>
        </LacedButton>
        {showChallenge ? (
          <ChallengeStatus $beaten={hasBeatenBest}>
            {hasBeatenBest ? `New best — past ${personalBest}!` : `${landings.length} of ${personalBest} to beat your best`}
          </ChallengeStatus>
        ) : null}
        {targetLandingCount !== undefined ? (
          <TargetStatus $met={targetMet}>
            {targetMet
              ? 'Target met — end the sesh whenever you\'re ready.'
              : `${landings.length} of ${targetLandingCount} to hit your target`}
          </TargetStatus>
        ) : null}
        <LandingHistory landings={landings} />
        <SecondaryActions>
          <PauseButton
            accessibilityRole="button"
            onPress={isPaused ? onResume : onPause}>
            <PauseButtonText>{isPaused ? 'Resume Sesh' : 'Pause Sesh'}</PauseButtonText>
          </PauseButton>
          <EndButton
            accessibilityRole="button"
            accessibilityState={{ disabled: !targetMet }}
            disabled={!targetMet}
            $disabled={!targetMet}
            onPress={onEnd}>
            <EndButtonText>End Sesh</EndButtonText>
          </EndButton>
        </SecondaryActions>
        {targetLandingCount !== undefined && !targetMet ? (
          <EndAnywayButton accessibilityRole="button" onPress={onEnd}>
            <EndAnywayButtonText>End anyway</EndAnywayButtonText>
          </EndAnywayButton>
        ) : null}
      </ActiveContent>
    </ScrollArea>
  );
}

function useNow(initialTime: number, isPaused: boolean) {
  const [now, setNow] = useState(initialTime);
  useEffect(() => {
    if (isPaused) return;
    const interval = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, [isPaused]);
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

function CompletedSesh({
  summary,
  personalBest,
  onReset,
  onRepeat,
}: {
  readonly summary: SeshSummary;
  readonly personalBest?: number;
  readonly onReset: () => void;
  readonly onRepeat: () => void;
}) {
  const average = getAverageInterval(summary.landings);
  const fastest = getFastestInterval(summary.landings);
  const laceCount = summary.landings.length;
  const challengeResult =
    personalBest === undefined
      ? undefined
      : laceCount > personalBest
        ? { $beaten: true as const, text: `New best! Previous best was ${personalBest}.` }
        : laceCount === personalBest
          ? { $beaten: false as const, text: `Tied your best of ${personalBest}.` }
          : { $beaten: false as const, text: `${personalBest - laceCount} short of your best of ${personalBest}.` };

  return (
    <ScrollArea contentContainerStyle={{ padding: 24, paddingBottom: 140 }}>
      <ActiveContent>
        <Eyebrow>Sesh complete</Eyebrow>
        <DisplayTitle>{summary.trick.name}</DisplayTitle>
        <SequenceSteps trick={summary.trick} />
        {challengeResult ? (
          <ResultBanner $beaten={challengeResult.$beaten}>{challengeResult.text}</ResultBanner>
        ) : null}
        <SummaryGrid>
          <Metric><MetricValue>{formatDuration(summary.durationMs)}</MetricValue><MetricLabel>Total time</MetricLabel></Metric>
          <Metric><MetricValue>{summary.landings.length}</MetricValue><MetricLabel>Laces</MetricLabel></Metric>
          <Metric><MetricValue>{average === undefined ? '—' : formatDuration(average)}</MetricValue><MetricLabel>Average pace</MetricLabel></Metric>
          <Metric><MetricValue>{fastest === undefined ? '—' : formatDuration(fastest)}</MetricValue><MetricLabel>Fastest lace</MetricLabel></Metric>
        </SummaryGrid>
        <LandingHistory landings={summary.landings} />
        <PrimaryButton onPress={onRepeat}>Repeat sesh</PrimaryButton>
        <SecondaryButton variant="secondary" onPress={onReset}>Start another sesh</SecondaryButton>
      </ActiveContent>
    </ScrollArea>
  );
}

function SequenceSteps({
  trick,
  compact = false,
  prominent = false,
}: {
  readonly trick: PracticeTrick;
  readonly compact?: boolean;
  readonly prominent?: boolean;
}) {
  if (!trick.sequenceSteps) return null;

  if (compact) {
    return (
      <CompactSequence accessibilityLabel={`Sequence steps: ${trick.sequenceSteps.join(', then ')}`}>
        {trick.sequenceSteps.join('  →  ')}
      </CompactSequence>
    );
  }

  return (
    <SequenceBlock $prominent={prominent} accessibilityLabel={`Sequence steps: ${trick.sequenceSteps.join(', then ')}`}>
      <SequenceLabel>{prominent ? 'Your line' : 'Sequence'}</SequenceLabel>
      {trick.sequenceSteps.map((step, index) => (
        <SequenceRow key={`${step}-${index}`}>
          <SequenceNumber>{String(index + 1).padStart(2, '0')}</SequenceNumber>
          <SequenceName>{step}</SequenceName>
        </SequenceRow>
      ))}
    </SequenceBlock>
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
const SecondaryButton = styled(Button).attrs({ size: 'medium' })`
  margin-top: 12px;
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
const ChallengeField = styled.View`margin-top: 16px;`;
const ChallengeChoices = styled.View`flex-direction: row; gap: 10px; margin-top: 10px;`;
const ChallengeChoice = styled(Pressable)<{ $selected: boolean }>`flex: 1; min-height: 82px; background-color: ${({ $selected }) => ($selected ? AppColors.ink : AppColors.paper)}; border: 2px solid ${AppColors.ink}; padding: 15px;`;
const ChallengeChoiceTitle = styled.Text<{ $selected: boolean }>`color: ${({ $selected }) => ($selected ? AppColors.yellow : AppColors.ink)}; font-size: 15px; font-weight: 900;`;
const ChallengeChoiceCopy = styled.Text<{ $selected: boolean }>`color: ${({ $selected }) => ($selected ? AppColors.cream : AppColors.inkSoft)}; font-size: 12px; font-weight: 600; line-height: 17px; margin-top: 5px;`;
const TrickChoices = styled.View`gap: 10px; margin-top: 28px;`;
const TrickChoice = styled(Pressable)<{ $disabled: boolean }>`min-height: 82px; justify-content: center; background-color: #f8f1dd; border: 2px solid #18382e; opacity: ${({ $disabled }) => ($disabled ? 0.45 : 1)}; padding: 15px 58px 15px 18px; position: relative;`;
const ChoiceMeta = styled.Text<{ $preferred: boolean }>`color: ${({ $preferred }) => ($preferred ? AppColors.red : AppColors.textMuted)}; font-size: 11px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase;`;
const ChoiceName = styled.Text`color: ${AppColors.ink}; font-size: 20px; font-weight: 800; margin-top: 5px;`;
const ChoiceBest = styled.Text`color: ${AppColors.red}; font-size: 12px; font-weight: 800; margin-top: 6px;`;
const CompactSequence = styled.Text`color: ${AppColors.textMuted}; font-size: 11px; font-weight: 700; line-height: 16px; margin-top: 5px;`;
const ChoiceArrow = styled.Text`position: absolute; right: 20px; color: ${AppColors.ink}; font-size: 28px; font-weight: 900;`;
const CountdownTrick = styled.Text`max-width: 560px; color: #18382e; font-size: 26px; font-weight: 900; text-align: center;`;
const CountdownNumber = styled.Text`color: #d84929; font-size: 156px; font-weight: 900; line-height: 180px; text-align: center;`;
const ActiveTrick = styled.Text`color: #18382e; font-size: 30px; font-weight: 900; text-align: center;`;
const SequenceBlock = styled.View<{ readonly $prominent: boolean }>`width: 100%; max-width: 500px; gap: 4px; background-color: ${({ $prominent }) => $prominent ? '#e5edcf' : 'transparent'}; border-left-width: ${({ $prominent }) => $prominent ? '5px' : '0'}; border-left-color: ${AppColors.red}; margin-top: 16px; padding: ${({ $prominent }) => $prominent ? '14px 16px' : '0'};`;
const SequenceLabel = styled.Text`color: ${AppColors.red}; font-size: 10px; font-weight: 900; letter-spacing: 1.2px; margin-bottom: 3px; text-transform: uppercase;`;
const SequenceRow = styled.View`flex-direction: row; align-items: baseline; gap: 10px;`;
const SequenceNumber = styled.Text`width: 22px; color: ${AppColors.red}; font-size: 10px; font-weight: 900;`;
const SequenceName = styled.Text`flex: 1; color: ${AppColors.ink}; font-size: 14px; font-weight: 800; line-height: 20px;`;
const TimerLabel = styled.Text`color: ${AppColors.red}; font-size: 12px; font-weight: 900; letter-spacing: 1.4px; margin-top: 22px; text-transform: uppercase;`;
const Timer = styled.Text`color: #18382e; font-size: 78px; font-variant: tabular-nums; font-weight: 900; letter-spacing: -4px; margin: 4px 0 22px;`;
const LacedButton = styled(Pressable)<{ $disabled: boolean }>`width: 100%; min-height: 108px; flex-direction: row; align-items: center; justify-content: space-between; background-color: #d84929; opacity: ${({ $disabled }) => ($disabled ? 0.45 : 1)}; padding: 22px 26px; border-radius: 6px;`;
const LacedButtonText = styled.Text`color: #fff8e5; font-size: 34px; font-weight: 900;`;
const LacedCount = styled.Text`color: #f4c94d; font-size: 40px; font-weight: 900;`;
const ChallengeStatus = styled.Text<{ $beaten: boolean }>`width: 100%; text-align: center; margin-top: 12px; color: ${({ $beaten }) => ($beaten ? AppColors.red : AppColors.ink)}; font-size: 15px; font-weight: 900;`;
const History = styled.View`width: 100%; margin-top: 28px;`;
const HistoryTitle = styled.Text`color: #18382e; font-size: 14px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 8px;`;
const HistoryEmpty = styled.Text`width: 100%; color: #71807a; font-size: 15px; text-align: center; padding: 30px 0 12px;`;
const LandingRow = styled.View`min-height: 50px; flex-direction: row; align-items: center; border-bottom-width: 1px; border-bottom-color: #c7ceb7;`;
const LandingNumber = styled.Text`width: 54px; color: #d84929; font-size: 13px; font-weight: 900;`;
const LandingTime = styled.Text`flex: 1; color: #18382e; font-size: 20px; font-variant: tabular-nums; font-weight: 800;`;
const LandingInterval = styled.Text`color: #53635d; font-size: 14px; font-variant: tabular-nums; font-weight: 700;`;
const SecondaryActions = styled.View`flex-direction: row; gap: 10px; margin-top: 28px;`;
const PauseButton = styled(Pressable)`min-height: 48px; flex: 1; align-items: center; justify-content: center; padding: 12px 24px; background-color: #18382e; border: 2px solid #18382e; border-radius: 5px;`;
const PauseButtonText = styled.Text`color: #f4c94d; font-size: 15px; font-weight: 900;`;
const EndButton = styled(Pressable)<{ $disabled: boolean }>`min-height: 48px; flex: 1; align-items: center; justify-content: center; opacity: ${({ $disabled }) => ($disabled ? 0.45 : 1)}; padding: 12px 24px; border: 2px solid #18382e; border-radius: 5px;`;
const EndButtonText = styled.Text`color: #18382e; font-size: 15px; font-weight: 900;`;
const EndAnywayButton = styled(Pressable)`min-height: 40px; align-items: center; justify-content: center; margin-top: 10px; padding: 8px 24px;`;
const EndAnywayButtonText = styled.Text`color: ${AppColors.textMuted}; font-size: 13px; font-weight: 800; text-decoration-line: underline;`;
const TargetStatus = styled.Text<{ $met: boolean }>`width: 100%; text-align: center; margin-top: 12px; color: ${({ $met }) => ($met ? AppColors.red : AppColors.ink)}; font-size: 15px; font-weight: 900;`;
const ResultBanner = styled.Text<{ $beaten: boolean }>`width: 100%; text-align: center; margin-top: 18px; padding: 12px 16px; background-color: ${({ $beaten }) => ($beaten ? '#e5edcf' : '#f8f1dd')}; border-left-width: 5px; border-left-color: ${({ $beaten }) => ($beaten ? AppColors.red : AppColors.ink)}; color: ${AppColors.ink}; font-size: 15px; font-weight: 900;`;
const SummaryGrid = styled.View`width: 100%; flex-direction: row; flex-wrap: wrap; gap: 10px; margin-top: 28px;`;
const Metric = styled.View`min-width: 46%; flex-grow: 1; background-color: #f8f1dd; border-top-width: 5px; border-top-color: #d84929; padding: 18px;`;
const MetricValue = styled.Text`color: #18382e; font-size: 30px; font-variant: tabular-nums; font-weight: 900;`;
const MetricLabel = styled.Text`color: #53635d; font-size: 12px; font-weight: 800; margin-top: 3px; text-transform: uppercase;`;
