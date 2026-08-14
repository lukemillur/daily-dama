import { describe, expect, it } from '@jest/globals';

import { formatKenteiStanding, isTrickSummary, type PracticeTrick, type TrickSummary } from '@/features/tricks/model/trick';

const PRACTICE_TRICK: PracticeTrick = { id: 'big-cup', name: 'Big Cup' };

const TRICK_SUMMARY: TrickSummary = {
  id: 'lighthouse',
  name: 'Lighthouse',
  kenteiRank: 5,
  kenteiClass: '3rd Class',
  kenteiLevel: 'Basic',
};

describe('isTrickSummary', () => {
  it('returns true for a trick carrying full Kentei metadata', () => {
    expect(isTrickSummary(TRICK_SUMMARY)).toBe(true);
  });

  it('returns false for a bare PracticeTrick lacking Kentei fields', () => {
    expect(isTrickSummary(PRACTICE_TRICK)).toBe(false);
  });
});

describe('formatKenteiStanding', () => {
  it('formats rank, class, and level in a single line', () => {
    expect(formatKenteiStanding(TRICK_SUMMARY)).toBe('Rank 5 · 3rd Class · Basic');
  });
});
