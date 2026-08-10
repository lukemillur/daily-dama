import type { PracticeTrick } from '@/features/tricks/model/trick';

/**
 * Pure, React-free ordering state for stepping through a fixed list of
 * tricks one at a time. Knows nothing about countdowns, landings, or
 * practice-history recording — those stay owned by `seshReducer` and the
 * component driving it. This is only "which trick are we on."
 */
export interface TrickSequenceState {
  readonly tricks: readonly PracticeTrick[];
  readonly currentIndex: number;
}

export function createTrickSequence(tricks: readonly PracticeTrick[]): TrickSequenceState {
  return { tricks, currentIndex: 0 };
}

/**
 * The trick currently up for practice, or undefined once the sequence has
 * run past its last trick.
 */
export function getCurrentSequenceTrick(state: TrickSequenceState): PracticeTrick | undefined {
  return state.tricks[state.currentIndex];
}

/**
 * True once every trick in the sequence has been stepped past — i.e. there
 * is no current trick left to practice.
 */
export function isTrickSequenceFinished(state: TrickSequenceState): boolean {
  return state.currentIndex >= state.tricks.length;
}

/**
 * Advances to the next trick in order. Calling this once the sequence is
 * already finished is a no-op (clamped, not wrapped) so callers don't need
 * to guard every call site.
 */
export function advanceTrickSequence(state: TrickSequenceState): TrickSequenceState {
  if (isTrickSequenceFinished(state)) return state;
  return { ...state, currentIndex: state.currentIndex + 1 };
}

/**
 * Jumps forward to an arbitrary index — e.g. skipping over an entire rank's
 * worth of tricks in one step. Clamped in both directions: never moves
 * backward from the current position, and never past the end of the
 * sequence. Rank-agnostic — callers decide what index means what.
 */
export function advanceTrickSequenceToIndex(
  state: TrickSequenceState,
  index: number,
): TrickSequenceState {
  const clamped = Math.max(state.currentIndex, Math.min(index, state.tricks.length));
  return { ...state, currentIndex: clamped };
}
