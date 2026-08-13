import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { ScrollView } from 'react-native';
import { styled } from 'styled-components/native';

import { Button } from '@/components/ui/button';
import { BodyText, DisplayTitle as BaseDisplayTitle, Eyebrow as BaseEyebrow } from '@/components/ui/typography';
import { AppColors } from '@/constants/theme';
import { ActiveSesh, Countdown } from '@/features/sesh/components/sesh';
import {
  formatDuration,
  INITIAL_SESH_STATE,
  type SeshPlan,
  seshReducer,
  type SeshState,
  type SeshSummary,
  shouldKeepScreenAwake,
} from '@/features/sesh/model/sesh';
import {
  advanceTrickSequence,
  advanceTrickSequenceToIndex,
  createTrickSequence,
  getCurrentSequenceTrick,
  isTrickSequenceFinished,
} from '@/features/sesh/model/trick-sequence';
import type { PracticeTrick } from '@/features/tricks/model/trick';
import { createPracticeSessionRecordId } from '@/features/stats/model/practice-history';
import { usePracticeHistoryActions } from '@/features/stats/state/practice-history-provider';
import { selectNotesForTrick } from '@/features/notes/model/note';
import { useNotes } from '@/features/notes/state/note-provider';

const MULTI_TRICK_SESH_KEEP_AWAKE_TAG = 'multi-trick-sesh-active';

interface MultiTrickSeshProps {
  readonly tricks: readonly PracticeTrick[];
  readonly plan: SeshPlan;
  readonly onFinished?: () => void;
  /**
   * When provided, renders a "Skip this rank" control and, when pressed,
   * jumps the sequence forward to the index this returns (given the current
   * index). Opaque to this component — it knows nothing about ranks, only
   * that skipping means jumping to an index without recording anything for
   * the tricks in between. Omit to disable skipping entirely.
   */
  readonly skipTarget?: (currentIndex: number) => number;
  /** Shows the static "You have 5 attempts." reminder on every trick. */
  readonly showAttemptsReminder?: boolean;
  /**
   * When true, forces a `seshEnded` dispatch immediately after the trick's
   * first landing, so the run advances to the next trick after a single
   * lace instead of waiting for the trick's normal completion condition
   * (timer elapsed / manual "End Sesh"). This is a second dispatch from the
   * same handler, not a second advance path — `MultiTrickSesh` still only
   * ever advances off the `completed` state.
   */
  readonly advanceOnFirstLace?: boolean;
  /**
   * Opaque to this component, forwarded to `ActiveSesh` as-is — replaces
   * the default "End Sesh" copy on the primary end action. Used by callers
   * (e.g. the assessment flow) that need different framing without this
   * component or `ActiveSesh` knowing what an assessment is.
   */
  readonly endActionLabel?: string;
  /**
   * When true, pairs every post-mount `trickSelected` dispatch (advancing
   * to the next trick after a completion, or via "Skip this rank") with an
   * immediate `countdownCompleted` dispatch, so the next trick lands
   * straight in `'active'` instead of `'countdown'`. Only affects
   * transitions *between* tricks — the very first trick, seeded at mount,
   * always shows its countdown regardless of this flag.
   */
  readonly skipCountdownBetweenTricks?: boolean;
  /**
   * Opaque to this component, forwarded to `ActiveSesh` as-is — hides the
   * elapsed-time readout and its label. Used by the assessment flow, since a
   * visible countdown implies time pressure that doesn't apply to an
   * assessment; `useNow` and the underlying elapsed-time math keep running
   * unaffected so recorded durations stay accurate.
   */
  readonly hideTimer?: boolean;
  /**
   * When provided, called every time `handleSkipRank` fires, with the
   * pre-jump index and the computed target index; its return value is
   * accumulated and rendered as a distinct "skipped" section in the
   * wrap-up. Mirrors `skipTarget`'s index-based shape — opaque to this
   * component, which knows nothing about ranks. Omit to preserve today's
   * behavior exactly (skipped tricks stay silently absent from the
   * wrap-up).
   */
  readonly describeSkippedRange?: (startIndex: number, endIndex: number) => string;
  /**
   * Rendered near the bottom of the wrap-up, above the "Finish sesh"
   * button. `undefined` renders nothing.
   */
  readonly wrapUpFooter?: ReactNode;
}

/**
 * Sequencing layer around the single-trick Sesh mechanics: steps through an
 * ordered list of tricks, running the same countdown/active/completed
 * reducer (`seshReducer`) for each one in turn and auto-advancing once a
 * trick's sesh completes, instead of returning to a picker. Each trick's
 * outcome is still recorded as its own practice-history record via the
 * same `recordCompletedSesh` path the single-trick Sesh uses — this layer
 * does not touch the record shape or the reducer regular practice relies on.
 *
 * `tricks` is only read at mount (via the lazy `useState`/`useReducer`
 * initializers below) — this component drives one run through a fixed
 * list, not a list that can change mid-run.
 */
export function MultiTrickSesh({
  tricks,
  plan,
  onFinished,
  skipTarget,
  showAttemptsReminder,
  advanceOnFirstLace,
  endActionLabel,
  skipCountdownBetweenTricks,
  hideTimer,
  describeSkippedRange,
  wrapUpFooter,
}: MultiTrickSeshProps) {
  const [sequence, setSequence] = useState(() => createTrickSequence(tricks));
  const [state, dispatch] = useReducer(
    seshReducer,
    sequence,
    (initialSequence): SeshState => {
      const trick = getCurrentSequenceTrick(initialSequence);
      return trick ? { status: 'countdown', trick, plan } : INITIAL_SESH_STATE;
    },
  );
  const { recordCompletedSesh } = usePracticeHistoryActions();
  const { notes } = useNotes();
  const recordedSummaryId = useRef<string | undefined>(undefined);
  const [summaries, setSummaries] = useState<SeshSummary[]>([]);
  const [skippedEntries, setSkippedEntries] = useState<string[]>([]);

  // The run is over once the sequence has no trick left to run, whether that
  // happened because every trick completed normally (leaves `state` at
  // 'completed', with nothing left to dispatch to) or because
  // `handleSkipRank` skipped past the last one (dispatches `seshReset`,
  // leaving `state` at 'choosing'). Derived directly from render-time state
  // rather than tracked separately, so there's no setState-in-effect to
  // sequence correctly across both paths.
  const isRunFinished =
    isTrickSequenceFinished(sequence) && (state.status === 'choosing' || state.status === 'completed');

  // Seeds the next trick and, when `skipCountdownBetweenTricks` is set,
  // immediately fast-forwards past its countdown. Two synchronous
  // dispatches to the same reducer fold in order against the queued
  // state, not the stale render closure — the same pattern already used
  // by `handleLaced`'s paired `trickLaced`/`seshEnded` dispatches below.
  const seedNextTrick = useCallback(
    (trick: PracticeTrick) => {
      dispatch({ type: 'trickSelected', trick, plan });
      if (skipCountdownBetweenTricks) {
        dispatch({ type: 'countdownCompleted', now: Date.now() });
      }
    },
    [plan, skipCountdownBetweenTricks],
  );

  const activeTrickId = state.status === 'active' ? state.trick.id : undefined;
  const trickNotes = useMemo(
    () => (activeTrickId ? selectNotesForTrick(notes, activeTrickId) : []),
    [notes, activeTrickId],
  );

  useEffect(() => {
    if (state.status !== 'completed') return;

    const summaryId = createPracticeSessionRecordId(state.summary);
    if (recordedSummaryId.current === summaryId) return;

    recordedSummaryId.current = summaryId;
    recordCompletedSesh(state.summary);
    setSummaries((prev) => [...prev, state.summary]);

    const nextSequence = advanceTrickSequence(sequence);
    setSequence(nextSequence);

    const nextTrick = getCurrentSequenceTrick(nextSequence);
    if (nextTrick) {
      seedNextTrick(nextTrick);
    }
  }, [recordCompletedSesh, sequence, state, seedNextTrick]);

  useEffect(() => {
    if (!shouldKeepScreenAwake(state.status)) return;

    activateKeepAwakeAsync(MULTI_TRICK_SESH_KEEP_AWAKE_TAG).catch(() => {
      // Best-effort: some browsers reject the wake-lock request (e.g. no
      // user gesture yet, or unsupported). Screen-sleep prevention is a
      // nice-to-have, not a blocker for practicing.
    });

    return () => {
      deactivateKeepAwake(MULTI_TRICK_SESH_KEEP_AWAKE_TAG).catch(() => {
        // Nothing to release if activation above never succeeded.
      });
    };
  }, [state.status]);

  const handleSkipRank = () => {
    if (!skipTarget) return;

    const targetIndex = skipTarget(sequence.currentIndex);
    if (describeSkippedRange) {
      setSkippedEntries((prev) => [...prev, describeSkippedRange(sequence.currentIndex, targetIndex)]);
    }

    const nextSequence = advanceTrickSequenceToIndex(sequence, targetIndex);
    setSequence(nextSequence);

    const nextTrick = getCurrentSequenceTrick(nextSequence);
    if (nextTrick) {
      seedNextTrick(nextTrick);
    } else {
      dispatch({ type: 'seshReset' });
    }
  };

  if (state.status === 'countdown') {
    return (
      <Countdown
        trick={state.trick}
        plan={state.plan}
        onComplete={() => dispatch({ type: 'countdownCompleted', now: Date.now() })}
        attemptsReminder={showAttemptsReminder}
        onSkipRank={skipTarget ? handleSkipRank : undefined}
      />
    );
  }

  if (state.status === 'active') {
    const handleLaced = () => {
      const now = Date.now();
      dispatch({ type: 'trickLaced', now });
      if (advanceOnFirstLace && state.status === 'active' && state.landings.length === 0) {
        dispatch({ type: 'seshEnded', now });
      }
    };

    return (
      <ActiveSesh
        trick={state.trick}
        plan={state.plan}
        startedAt={state.startedAt}
        landings={state.landings}
        pausedAt={state.pausedAt}
        pausedDurationMs={state.pausedDurationMs}
        personalBest={undefined}
        liveChallengeEnabled={false}
        trickNotes={trickNotes}
        onLaced={handleLaced}
        onPause={() => dispatch({ type: 'seshPaused', now: Date.now() })}
        onResume={() => dispatch({ type: 'seshResumed', now: Date.now() })}
        onEnd={() => dispatch({ type: 'seshEnded', now: Date.now() })}
        onTimerElapsed={() => dispatch({ type: 'timerElapsed', now: Date.now() })}
        attemptsReminder={showAttemptsReminder}
        onSkipRank={skipTarget ? handleSkipRank : undefined}
        // "Next trick" reuses the same completed-effect advance path as
        // "End Sesh" above — it's the identical `seshEnded` dispatch, not a
        // second advance mechanism. Unlike `handleSkipRank`, this always
        // records the current trick's landings before moving on.
        onNextTrick={() => dispatch({ type: 'seshEnded', now: Date.now() })}
        endActionLabel={endActionLabel}
        hideTimer={hideTimer}
      />
    );
  }

  // Reached once the run is over — either the effect above advanced past
  // the last trick, or handleSkipRank skipped past it. Renders the full
  // run's wrap-up and is the only place onFinished gets called now.
  if (isRunFinished) {
    return (
      <MultiTrickWrapUp
        summaries={summaries}
        skippedEntries={skippedEntries}
        footer={wrapUpFooter}
        onContinue={() => onFinished?.()}
      />
    );
  }

  // Reached for the one tick between a trick's sesh completing and the
  // effect above reacting to it. Not terminal — never the resting state a
  // user actually sees.
  return (
    <CenteredPanel>
      <Eyebrow>Sequence complete</Eyebrow>
      <DisplayTitle>Nice work.</DisplayTitle>
      <BodyCopy>You worked through every trick in this sesh.</BodyCopy>
    </CenteredPanel>
  );
}

/**
 * Wrap-up shown once a multi-trick run is over, whether every trick ran to
 * completion or the tail end was skipped. Lists only the tricks actually
 * attempted (`summaries`), in the order they were completed — skipped
 * tricks never produce a summary, so they're simply absent here.
 */
function MultiTrickWrapUp({
  summaries,
  skippedEntries,
  footer,
  onContinue,
}: {
  readonly summaries: readonly SeshSummary[];
  readonly skippedEntries: readonly string[];
  readonly footer?: ReactNode;
  readonly onContinue: () => void;
}) {
  return (
    <ScrollArea contentContainerStyle={{ padding: 24, paddingBottom: 140 }}>
      <ActiveContent>
        <Eyebrow>Sesh complete</Eyebrow>
        <DisplayTitle>Nice work.</DisplayTitle>
        <WrapUpList>
          {summaries.map((summary) => {
            const laceCount = summary.landings.length;
            const time = formatDuration(summary.durationMs);
            return (
              <WrapUpRow
                key={createPracticeSessionRecordId(summary)}
                accessibilityLabel={`Wrap-up entry: ${summary.trick.name}, ${summary.landings.length} laces, ${time}`}>
                <WrapUpTrickName>{summary.trick.name}</WrapUpTrickName>
                <WrapUpLaceCount>{laceCount} {laceCount === 1 ? 'lace' : 'laces'}</WrapUpLaceCount>
                <WrapUpTime>{time}</WrapUpTime>
              </WrapUpRow>
            );
          })}
        </WrapUpList>
        {skippedEntries.length > 0 && (
          <WrapUpList>
            {skippedEntries.map((entry, index) => (
              <WrapUpSkippedRow
                key={`${entry}-${index}`}
                accessibilityLabel={`Wrap-up skipped: ${entry}`}>
                <WrapUpSkippedText>
                  {entry} — Skipped
                </WrapUpSkippedText>
              </WrapUpSkippedRow>
            ))}
          </WrapUpList>
        )}
        {footer}
        <FinishButton accessibilityLabel="Finish sesh" onPress={onContinue}>
          Finish sesh
        </FinishButton>
      </ActiveContent>
    </ScrollArea>
  );
}

const ScrollArea = styled(ScrollView)`flex: 1; width: 100%;`;
const ActiveContent = styled.View`width: 100%; max-width: 680px; align-self: center; align-items: center;`;
const CenteredPanel = styled.View`flex: 1; width: 100%; max-width: 680px; align-self: center; align-items: center; justify-content: center; padding: 40px 24px 140px;`;
const Eyebrow = styled(BaseEyebrow)`margin-bottom: 14px;`;
const DisplayTitle = styled(BaseDisplayTitle)`text-align: center;`;
const BodyCopy = styled(BodyText)`max-width: 470px; text-align: center; margin-top: 18px;`;
const WrapUpList = styled.View`width: 100%; margin-top: 28px;`;
const WrapUpRow = styled.View`min-height: 50px; flex-direction: row; align-items: center; border-bottom-width: 1px; border-bottom-color: #c7ceb7;`;
const WrapUpTrickName = styled.Text`flex: 1; color: #18382e; font-size: 17px; font-weight: 800;`;
const WrapUpLaceCount = styled.Text`color: ${AppColors.textMuted}; font-size: 14px; font-weight: 700; margin-right: 14px;`;
const WrapUpTime = styled.Text`color: #18382e; font-size: 15px; font-variant: tabular-nums; font-weight: 800;`;
const WrapUpSkippedRow = styled.View`min-height: 50px; flex-direction: row; align-items: center; border-bottom-width: 1px; border-bottom-color: ${AppColors.borderMuted};`;
const WrapUpSkippedText = styled.Text`flex: 1; color: ${AppColors.textMuted}; font-size: 15px; font-weight: 700; font-style: italic;`;
const FinishButton = styled(Button).attrs({ size: 'medium' })`
  margin-top: 28px;
  border-radius: 5px;
`;
