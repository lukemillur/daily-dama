import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useEffect, useReducer, useRef, useState } from 'react';
import { styled } from 'styled-components/native';

import { BodyText, DisplayTitle as BaseDisplayTitle, Eyebrow as BaseEyebrow } from '@/components/ui/typography';
import { ActiveSesh, Countdown } from '@/features/sesh/components/sesh';
import {
  INITIAL_SESH_STATE,
  type SeshPlan,
  seshReducer,
  type SeshState,
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
export function MultiTrickSesh({ tricks, plan, onFinished, skipTarget, showAttemptsReminder }: MultiTrickSeshProps) {
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
  const recordedSummaryId = useRef<string | undefined>(undefined);

  const hasReportedEmptySequence = useRef(false);

  useEffect(() => {
    // An empty trick list starts already finished (state stays 'choosing',
    // since there's no trick to seed the reducer with) — finish immediately
    // rather than rendering the countdown/active states forever.
    if (state.status !== 'choosing' || !isTrickSequenceFinished(sequence)) return;
    if (hasReportedEmptySequence.current) return;

    hasReportedEmptySequence.current = true;
    onFinished?.();
  }, [onFinished, sequence, state.status]);

  useEffect(() => {
    if (state.status !== 'completed') return;

    const summaryId = createPracticeSessionRecordId(state.summary);
    if (recordedSummaryId.current === summaryId) return;

    recordedSummaryId.current = summaryId;
    recordCompletedSesh(state.summary);

    const nextSequence = advanceTrickSequence(sequence);
    setSequence(nextSequence);

    const nextTrick = getCurrentSequenceTrick(nextSequence);
    if (nextTrick) {
      dispatch({ type: 'trickSelected', trick: nextTrick, plan });
    } else {
      onFinished?.();
    }
  }, [onFinished, plan, recordCompletedSesh, sequence, state]);

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

    const nextSequence = advanceTrickSequenceToIndex(sequence, skipTarget(sequence.currentIndex));
    setSequence(nextSequence);

    const nextTrick = getCurrentSequenceTrick(nextSequence);
    if (nextTrick) {
      dispatch({ type: 'trickSelected', trick: nextTrick, plan });
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
        onLaced={() => dispatch({ type: 'trickLaced', now: Date.now() })}
        onPause={() => dispatch({ type: 'seshPaused', now: Date.now() })}
        onResume={() => dispatch({ type: 'seshResumed', now: Date.now() })}
        onEnd={() => dispatch({ type: 'seshEnded', now: Date.now() })}
        onTimerElapsed={() => dispatch({ type: 'timerElapsed', now: Date.now() })}
        attemptsReminder={showAttemptsReminder}
        onSkipRank={skipTarget ? handleSkipRank : undefined}
      />
    );
  }

  // Reached once the effect above has advanced past the last trick and
  // called onFinished. T013/T014 own what the user actually sees after a
  // multi-trick run; this is just a safe fallback render for the instant
  // in between.
  return (
    <CenteredPanel>
      <Eyebrow>Sequence complete</Eyebrow>
      <DisplayTitle>Nice work.</DisplayTitle>
      <BodyCopy>You worked through every trick in this sesh.</BodyCopy>
    </CenteredPanel>
  );
}

const CenteredPanel = styled.View`flex: 1; width: 100%; max-width: 680px; align-self: center; align-items: center; justify-content: center; padding: 40px 24px 140px;`;
const Eyebrow = styled(BaseEyebrow)`margin-bottom: 14px;`;
const DisplayTitle = styled(BaseDisplayTitle)`text-align: center;`;
const BodyCopy = styled(BodyText)`max-width: 470px; text-align: center; margin-top: 18px;`;
