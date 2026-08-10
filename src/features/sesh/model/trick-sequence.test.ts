import { describe, expect, it } from '@jest/globals';

import {
  advanceTrickSequence,
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
});
