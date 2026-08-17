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
import {
  createPracticeSessionRecordId,
  type PracticeSessionOrigin,
} from '@/features/stats/model/practice-history';
import { usePracticeHistoryActions } from '@/features/stats/state/practice-history-provider';
import { selectNotesForTrick } from '@/features/notes/model/note';
import { useNotes } from '@/features/notes/state/note-provider';

const MULTI_TRICK_SESH_KEEP_AWAKE_TAG = 'multi-trick-sesh-active';
const LACE_ACKNOWLEDGMENT_DURATION_MS = 1500;

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
   * When true (and only meaningful alongside `advanceOnFirstLace` — a pause
   * before an advance that isn't happening has nothing to delay), shows a
   * brief "Trick landed" acknowledgment panel for
   * `LACE_ACKNOWLEDGMENT_DURATION_MS` before the `seshEnded` dispatch that
   * `advanceOnFirstLace` would otherwise fire immediately. Purely a delay on
   * *when* that dispatch happens, not a new advance path.
   */
  readonly pauseAfterLace?: boolean;
  /**
   * Opaque to this component, forwarded to `ActiveSesh` as-is — replaces
   * the default "End Sesh" copy on the primary end action. This action ends
   * the *whole run* (see `handleEndRun`), not just the current trick — the
   * current trick's landings-so-far are still recorded, but no further
   * tricks in the sequence are run or recorded. Used by callers (e.g. the
   * assessment flow) that need different framing without this component or
   * `ActiveSesh` knowing what an assessment is.
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
  /**
   * When provided, renders a "Cancel" control alongside the very first
   * trick countdown of the run only — mirrors `skipCountdownBetweenTricks`'s
   * "only affects transitions between tricks, not the first trick" framing,
   * inverted: this affects only the first trick, never any transition
   * between tricks later in the run. Called instead of any reducer
   * dispatch; the caller decides what "back out of the run" means (e.g.
   * returning to a setup/flow-picker step). Omit to disable cancelling
   * entirely.
   */
  readonly onCancelRun?: () => void;
  /**
   * Forwarded to `Countdown`/`ActiveSesh` as-is — renders the current
   * trick's Kentei rank/class when its metadata is present. Used by the
   * assessment flow.
   */
  readonly showRankStanding?: boolean;
  /**
   * Label for the wrap-up's final button, which also always fires
   * `onFinished`. Defaults to "Finish sesh" — the ad hoc multi-trick flow's
   * wrap-up just resets local run state, so that generic copy still fits.
   * The Kentei assessment flow overrides it to describe navigating Home.
   */
  readonly finishButtonLabel?: string;
  /**
   * Opaque pass-through recorded on every trick's practice-history record
   * for this run, forwarded as-is to `recordCompletedSesh`. Omit for
   * regular ad hoc multi-trick practice; the Kentei assessment flow passes
   * `'assessment'`.
   */
  readonly origin?: PracticeSessionOrigin;
  /**
   * Hides the one-render completed-state fallback while an assessment's
   * auto-advance effect moves to its next trick or wrap-up. Regular
   * multi-trick runs deliberately retain that fallback behavior.
   */
  readonly suppressTransientCompletionFallback?: boolean;
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
  pauseAfterLace,
  endActionLabel,
  skipCountdownBetweenTricks,
  hideTimer,
  describeSkippedRange,
  wrapUpFooter,
  onCancelRun,
  showRankStanding,
  finishButtonLabel,
  origin,
  suppressTransientCompletionFallback,
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
  const endRunRequestedRef = useRef(false);
  const [summaries, setSummaries] = useState<SeshSummary[]>([]);
  const [skippedEntries, setSkippedEntries] = useState<string[]>([]);
  // Set between a "Skip this rank" tap and the user confirming or
  // canceling that skip. Holds the range a confirmed skip would commit,
  // computed once at request time so the preview and the eventual commit
  // can never disagree. Nothing observable (`sequence`, `state`,
  // `isFirstCountdown`) changes while this is set — canceling just clears it.
  const [pendingSkip, setPendingSkip] = useState<
    { readonly fromIndex: number; readonly targetIndex: number } | undefined
  >(undefined);
  // Tracks whether the run is still on its very first trick's countdown, so
  // the Cancel control (wired via `onCancelRun`) only ever renders there —
  // never on a later trick's countdown. Flipped to false the moment the run
  // progresses past that first countdown by any path (normal completion or
  // skip); nothing resets it back to true afterward.
  const [isFirstCountdown, setIsFirstCountdown] = useState(true);
  // Set for the brief window between a `pauseAfterLace` landing and the
  // deferred `seshEnded` dispatch that actually advances the run. Renders
  // an acknowledgment panel in place of `ActiveSesh` while set; the effect
  // below is the only thing that clears it.
  const [laceAcknowledgment, setLaceAcknowledgment] = useState<{ readonly trickName: string } | undefined>(
    undefined,
  );

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
    recordCompletedSesh(state.summary, origin);
    setSummaries((prev) => [...prev, state.summary]);

    if (endRunRequestedRef.current) {
      endRunRequestedRef.current = false;
      setIsFirstCountdown(false);
      setSequence((prev) => advanceTrickSequenceToIndex(prev, prev.tricks.length));
      dispatch({ type: 'seshReset' });
      return;
    }

    const nextSequence = advanceTrickSequence(sequence);
    setSequence(nextSequence);

    const nextTrick = getCurrentSequenceTrick(nextSequence);
    if (nextTrick) {
      seedNextTrick(nextTrick);
    }
  }, [origin, recordCompletedSesh, sequence, state, seedNextTrick]);

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

  useEffect(() => {
    if (!laceAcknowledgment) return;

    const timeoutId = setTimeout(() => {
      setLaceAcknowledgment(undefined);
      dispatch({ type: 'seshEnded', now: Date.now() });
    }, LACE_ACKNOWLEDGMENT_DURATION_MS);

    return () => clearTimeout(timeoutId);
  }, [laceAcknowledgment]);

  const handleSkipRankRequest = () => {
    if (!skipTarget) return;

    const targetIndex = skipTarget(sequence.currentIndex);
    setPendingSkip({ fromIndex: sequence.currentIndex, targetIndex });
  };

  const handleCancelSkip = () => {
    setPendingSkip(undefined);
  };

  const handleConfirmSkip = () => {
    if (!pendingSkip) return;

    const { fromIndex, targetIndex } = pendingSkip;

    setIsFirstCountdown(false);

    if (describeSkippedRange) {
      setSkippedEntries((prev) => [...prev, describeSkippedRange(fromIndex, targetIndex)]);
    }

    const nextSequence = advanceTrickSequenceToIndex(sequence, targetIndex);
    setSequence(nextSequence);

    const nextTrick = getCurrentSequenceTrick(nextSequence);
    if (nextTrick) {
      seedNextTrick(nextTrick);
    } else {
      dispatch({ type: 'seshReset' });
    }

    setPendingSkip(undefined);
  };

  if (pendingSkip) {
    const skippedTricks = sequence.tricks.slice(pendingSkip.fromIndex, pendingSkip.targetIndex);
    return (
      <SkipRankConfirmation
        tricks={skippedTricks}
        description={describeSkippedRange?.(pendingSkip.fromIndex, pendingSkip.targetIndex)}
        onCancel={handleCancelSkip}
        onConfirm={handleConfirmSkip}
      />
    );
  }

  if (state.status === 'countdown') {
    return (
      <Countdown
        trick={state.trick}
        plan={state.plan}
        onComplete={() => {
          setIsFirstCountdown(false);
          dispatch({ type: 'countdownCompleted', now: Date.now() });
        }}
        onSkipCountdown={
          origin === undefined
            ? () => {
                setIsFirstCountdown(false);
                dispatch({ type: 'countdownCompleted', now: Date.now() });
              }
            : undefined
        }
        attemptsReminder={showAttemptsReminder}
        onSkipRank={skipTarget ? handleSkipRankRequest : undefined}
        onCancel={isFirstCountdown ? onCancelRun : undefined}
        showRankStanding={showRankStanding}
      />
    );
  }

  if (state.status === 'active') {
    const handleLaced = () => {
      const now = Date.now();
      dispatch({ type: 'trickLaced', now });
      if (advanceOnFirstLace && state.status === 'active' && state.landings.length === 0) {
        if (pauseAfterLace) {
          setLaceAcknowledgment({ trickName: state.trick.name });
        } else {
          dispatch({ type: 'seshEnded', now });
        }
      }
    };

    // Ends the *whole run*, not just the current trick: the current
    // trick's landings-so-far are still recorded (same as today's
    // per-trick completion), but the `completed` effect above reads this
    // ref and jumps the sequence straight to its end instead of advancing
    // to the next trick — see `endRunRequestedRef`. Backs both the
    // primary "End Sesh"/"End assessment" button and the "End anyway"
    // confirmation in `ActiveSesh`, since both call this same `onEnd` prop.
    const handleEndRun = () => {
      endRunRequestedRef.current = true;
      dispatch({ type: 'seshEnded', now: Date.now() });
    };

    if (laceAcknowledgment) {
      return (
        <CenteredPanel accessibilityLabel="Trick landed">
          <Eyebrow>Trick landed</Eyebrow>
          <DisplayTitle>{laceAcknowledgment.trickName}</DisplayTitle>
          <BodyCopy>Nice! Next trick coming up.</BodyCopy>
        </CenteredPanel>
      );
    }

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
        onEnd={handleEndRun}
        onTimerElapsed={() => dispatch({ type: 'timerElapsed', now: Date.now() })}
        attemptsReminder={showAttemptsReminder}
        onSkipRank={skipTarget ? handleSkipRankRequest : undefined}
        // "Next trick" is a distinct action from "End Sesh"/handleEndRun
        // above: both dispatch `seshEnded` and reuse the same
        // completed-effect advance path, but "Next trick" never sets
        // `endRunRequestedRef`, so it always advances one trick and keeps
        // the run going — unlike `handleSkipRank`, it always records the
        // current trick's landings before moving on. Omitted on the final
        // trick of the run, where it would be functionally identical to
        // "End Sesh" but mislabeled, and omitted entirely when
        // `advanceOnFirstLace` does not suppress this manual escape hatch:
        // "Next trick" and first-lace auto-advance are separate actions that
        // share the completed-effect path. The final trick still omits it,
        // where it would be functionally identical to "End Sesh".
        onNextTrick={
          sequence.currentIndex < sequence.tricks.length - 1
            ? () => dispatch({ type: 'seshEnded', now: Date.now() })
            : undefined
        }
        endActionLabel={endActionLabel}
        hideTimer={hideTimer}
        showRankStanding={showRankStanding}
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
        finishButtonLabel={finishButtonLabel}
      />
    );
  }

  // Reached for the one tick between a trick's sesh completing and the
  // effect above reacting to it. Not terminal — never the resting state a
  // user actually sees.
  if (suppressTransientCompletionFallback) return null;

  return (
    <CenteredPanel>
      <Eyebrow>Sequence complete</Eyebrow>
      <DisplayTitle>Nice work.</DisplayTitle>
      <BodyCopy>You worked through every trick in this sesh.</BodyCopy>
    </CenteredPanel>
  );
}

/**
 * Confirmation panel shown after a "Skip this rank" tap, before the skip is
 * committed. Full-screen replace, same pattern as `laceAcknowledgment`
 * above -- reads only local state and dispatches nothing, so canceling
 * returns exactly to whatever countdown/active render was already correct.
 */
function SkipRankConfirmation({
  tricks,
  description,
  onCancel,
  onConfirm,
}: {
  readonly tricks: readonly PracticeTrick[];
  readonly description?: string;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}) {
  const heading =
    description ?? `${tricks.length} trick${tricks.length === 1 ? '' : 's'} in this rank`;

  return (
    <ScrollArea contentContainerStyle={{ padding: 24, paddingBottom: 140 }}>
      <ActiveContent accessibilityLabel="Skip rank confirmation">
        <Eyebrow>Skip this rank?</Eyebrow>
        <DisplayTitle>{heading}</DisplayTitle>
        <BodyCopy>
          These tricks won&apos;t be recorded -- you can revisit this rank later.
        </BodyCopy>
        <WrapUpList>
          {tricks.map((trick) => (
            <WrapUpRow key={trick.id} accessibilityLabel={`Skip preview: ${trick.name}`}>
              <WrapUpTrickName>{trick.name}</WrapUpTrickName>
            </WrapUpRow>
          ))}
        </WrapUpList>
        <SkipConfirmationActions>
          <SkipConfirmationButton
            accessibilityLabel="Cancel skip rank"
            variant="secondary"
            onPress={onCancel}>
            Cancel
          </SkipConfirmationButton>
          <SkipConfirmationButton accessibilityLabel="Confirm skip rank" onPress={onConfirm}>
            Skip rank
          </SkipConfirmationButton>
        </SkipConfirmationActions>
      </ActiveContent>
    </ScrollArea>
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
  finishButtonLabel = 'Finish sesh',
}: {
  readonly summaries: readonly SeshSummary[];
  readonly skippedEntries: readonly string[];
  readonly footer?: ReactNode;
  readonly onContinue: () => void;
  readonly finishButtonLabel?: string;
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
        <FinishButton accessibilityLabel={finishButtonLabel} onPress={onContinue}>
          {finishButtonLabel}
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
const WrapUpLaceCount = styled.Text`color: ${({ theme }) => theme.text}; font-size: 14px; font-weight: 700; margin-right: 14px;`;
const WrapUpTime = styled.Text`color: #18382e; font-size: 15px; font-variant: tabular-nums; font-weight: 800;`;
const WrapUpSkippedRow = styled.View`min-height: 50px; flex-direction: row; align-items: center; border-bottom-width: 1px; border-bottom-color: ${AppColors.borderMuted};`;
const WrapUpSkippedText = styled.Text`flex: 1; color: ${({ theme }) => theme.text}; font-size: 15px; font-weight: 700; font-style: italic;`;
const FinishButton = styled(Button).attrs({ size: 'medium' })`
  margin-top: 28px;
  border-radius: 5px;
`;
const SkipConfirmationActions = styled.View`
  width: 100%;
  flex-direction: row;
  justify-content: center;
  gap: 12px;
  margin-top: 28px;
`;
const SkipConfirmationButton = styled(Button).attrs({ size: 'medium' })`
  border-radius: 5px;
`;
