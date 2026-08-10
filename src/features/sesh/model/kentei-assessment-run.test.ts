import { describe, expect, it } from '@jest/globals';

import { KENDAMA_KENTEI_TRICKS } from '@/features/tricks/data/kendama-kentei-tricks';
import {
  selectAssessmentRankBounds,
  selectAssessmentTricks,
} from '@/features/sesh/model/kentei-assessment-run';

describe('selectAssessmentTricks', () => {
  it('currentRankOnly produces exactly that rank\'s tricks, in declaration order', () => {
    const expected = KENDAMA_KENTEI_TRICKS.filter((trick) => trick.kenteiRank === 5);

    const result = selectAssessmentTricks({ kind: 'currentRankOnly', rank: 5 }, KENDAMA_KENTEI_TRICKS);

    expect(result).toEqual(expected);
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((trick) => trick.kenteiRank === 5)).toBe(true);
  });

  it('fullBottomToTop produces every rank\'s tricks concatenated in rank order', () => {
    const result = selectAssessmentTricks({ kind: 'fullBottomToTop' }, KENDAMA_KENTEI_TRICKS);

    expect(result).toEqual(KENDAMA_KENTEI_TRICKS);

    const ranks = result.map((trick) => trick.kenteiRank);
    const sortedRanks = [...ranks].sort((a, b) => a - b);
    expect(ranks).toEqual(sortedRanks);
  });

  it('fromRank produces only ranks at or above the starting rank, in order, omitting lower ranks', () => {
    const result = selectAssessmentTricks(
      { kind: 'fromRank', startingRank: 7 },
      KENDAMA_KENTEI_TRICKS,
    );

    const expected = KENDAMA_KENTEI_TRICKS.filter((trick) => trick.kenteiRank >= 7);
    expect(result).toEqual(expected);
    expect(result.some((trick) => trick.kenteiRank < 7)).toBe(false);
  });

  it('fromRank at the max rank yields just that rank\'s tricks', () => {
    const { maxRank } = selectAssessmentRankBounds(KENDAMA_KENTEI_TRICKS);

    const result = selectAssessmentTricks(
      { kind: 'fromRank', startingRank: maxRank },
      KENDAMA_KENTEI_TRICKS,
    );

    const expected = KENDAMA_KENTEI_TRICKS.filter((trick) => trick.kenteiRank === maxRank);
    expect(result).toEqual(expected);
  });
});

describe('selectAssessmentRankBounds', () => {
  it('derives min and max rank from the trick data', () => {
    const bounds = selectAssessmentRankBounds(KENDAMA_KENTEI_TRICKS);

    const ranks = KENDAMA_KENTEI_TRICKS.map((trick) => trick.kenteiRank);
    expect(bounds.minRank).toBe(Math.min(...ranks));
    expect(bounds.maxRank).toBe(Math.max(...ranks));
  });
});
