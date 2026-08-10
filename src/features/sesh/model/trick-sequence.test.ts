import { describe, expect, it } from '@jest/globals';

import {
  advanceTrickSequence,
  advanceTrickSequenceToIndex,
  createTrickSequence,
  getCurrentSequenceTrick,
  isTrickSequenceFinished,
} from '@/features/sesh/model/trick-sequence';
import type { PracticeTrick } from '@/features/tricks/model/trick';

const AIRPLANE: PracticeTrick = { id: 'airplane', name: 'Airplane' };
const LIGHTHOUSE: PracticeTrick = { id: 'lighthouse', name: 'Lighthouse' };
const SPIKE: PracticeTrick = { id: 'spike', name: 'Spike' };

const TRICKS = [AIRPLANE, LIGHTHOUSE, SPIKE];

describe('trick sequence', () => {
  it('starts on the first trick', () => {
    const sequence = createTrickSequence(TRICKS);
    expect(getCurrentSequenceTrick(sequence)).toBe(AIRPLANE);
    expect(isTrickSequenceFinished(sequence)).toBe(false);
  });

  it('steps through tricks in order and finishes only after the last one', () => {
    let sequence = createTrickSequence(TRICKS);

    expect(getCurrentSequenceTrick(sequence)).toBe(AIRPLANE);

    sequence = advanceTrickSequence(sequence);
    expect(getCurrentSequenceTrick(sequence)).toBe(LIGHTHOUSE);
    expect(isTrickSequenceFinished(sequence)).toBe(false);

    sequence = advanceTrickSequence(sequence);
    expect(getCurrentSequenceTrick(sequence)).toBe(SPIKE);
    expect(isTrickSequenceFinished(sequence)).toBe(false);

    sequence = advanceTrickSequence(sequence);
    expect(getCurrentSequenceTrick(sequence)).toBeUndefined();
    expect(isTrickSequenceFinished(sequence)).toBe(true);
  });

  it('does not advance past the end of the sequence', () => {
    let sequence = createTrickSequence(TRICKS);
    for (let i = 0; i < TRICKS.length + 3; i += 1) {
      sequence = advanceTrickSequence(sequence);
    }
    expect(isTrickSequenceFinished(sequence)).toBe(true);
    expect(getCurrentSequenceTrick(sequence)).toBeUndefined();
  });

  it('handles an empty trick list as already finished', () => {
    const sequence = createTrickSequence([]);
    expect(isTrickSequenceFinished(sequence)).toBe(true);
    expect(getCurrentSequenceTrick(sequence)).toBeUndefined();
  });

  describe('advanceTrickSequenceToIndex', () => {
    it('jumps forward to the given index', () => {
      const sequence = createTrickSequence(TRICKS);
      const jumped = advanceTrickSequenceToIndex(sequence, 2);
      expect(getCurrentSequenceTrick(jumped)).toBe(SPIKE);
      expect(isTrickSequenceFinished(jumped)).toBe(false);
    });

    it('clamps at tricks.length, finishing the sequence', () => {
      const sequence = createTrickSequence(TRICKS);
      const jumped = advanceTrickSequenceToIndex(sequence, 99);
      expect(isTrickSequenceFinished(jumped)).toBe(true);
      expect(getCurrentSequenceTrick(jumped)).toBeUndefined();
    });

    it('does not move backward when given an index at or before the current one', () => {
      let sequence = createTrickSequence(TRICKS);
      sequence = advanceTrickSequenceToIndex(sequence, 2);
      expect(getCurrentSequenceTrick(sequence)).toBe(SPIKE);

      const notMoved = advanceTrickSequenceToIndex(sequence, 0);
      expect(getCurrentSequenceTrick(notMoved)).toBe(SPIKE);

      const stayed = advanceTrickSequenceToIndex(sequence, 2);
      expect(getCurrentSequenceTrick(stayed)).toBe(SPIKE);
    });
  });
});
