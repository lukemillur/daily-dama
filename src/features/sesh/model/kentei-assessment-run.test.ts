import { describe, expect, it } from '@jest/globals';

import { KENDAMA_KENTEI_TRICKS } from '@/features/tricks/data/kendama-kentei-tricks';
import {
  selectAssessmentGapNotice,
  selectAssessmentRankBounds,
  selectAssessmentResultCopy,
  selectAssessmentTricks,
  selectNextRankStartIndex,
  selectStartedAboveStoredRank,
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

describe('selectNextRankStartIndex', () => {
  it('skipping from the middle of a rank lands on the first trick of the next rank', () => {
    const rank5Start = KENDAMA_KENTEI_TRICKS.findIndex((trick) => trick.kenteiRank === 5);
    const rank6Start = KENDAMA_KENTEI_TRICKS.findIndex((trick) => trick.kenteiRank === 6);

    const result = selectNextRankStartIndex(KENDAMA_KENTEI_TRICKS, rank5Start + 2);

    expect(result).toBe(rank6Start);
    expect(KENDAMA_KENTEI_TRICKS[result].kenteiRank).toBe(6);
  });

  it('skipping from the second-to-last trick of a rank still lands on the next rank (off-by-one check)', () => {
    const rank6Start = KENDAMA_KENTEI_TRICKS.findIndex((trick) => trick.kenteiRank === 6);
    const secondToLastOfRank5 = rank6Start - 2;

    const result = selectNextRankStartIndex(KENDAMA_KENTEI_TRICKS, secondToLastOfRank5);

    expect(result).toBe(rank6Start);
  });

  it('skipping from the last rank returns tricks.length', () => {
    const lastRankStart = KENDAMA_KENTEI_TRICKS.findIndex((trick) => trick.kenteiRank === 12);

    const result = selectNextRankStartIndex(KENDAMA_KENTEI_TRICKS, lastRankStart);

    expect(result).toBe(KENDAMA_KENTEI_TRICKS.length);
  });

  it('returns tricks.length when fromIndex is already past the end', () => {
    const result = selectNextRankStartIndex(KENDAMA_KENTEI_TRICKS, KENDAMA_KENTEI_TRICKS.length + 5);

    expect(result).toBe(KENDAMA_KENTEI_TRICKS.length);
  });
});

describe('selectAssessmentResultCopy', () => {
  it('shows "not yet earned" copy when no rank has been earned, regardless of starting rank', () => {
    expect(selectAssessmentResultCopy(undefined, undefined)).toMatch(/not earned/i);
    expect(selectAssessmentResultCopy(3, undefined)).toMatch(/not earned/i);
  });

  it('treats the first rank ever earned as an advance, not a hold', () => {
    const result = selectAssessmentResultCopy(undefined, 1);

    expect(result).toMatch(/rank up/i);
    expect(result).toContain('1');
  });

  it('shows "advanced" copy with the new rank when resultRank is higher than startingRank', () => {
    const result = selectAssessmentResultCopy(3, 4);

    expect(result).toMatch(/rank up/i);
    expect(result).toContain('4');
    expect(result).not.toContain('3');
  });

  it('shows "held" copy, with no assessed/replaced language, when resultRank equals startingRank', () => {
    const result = selectAssessmentResultCopy(5, 5);

    expect(result).toMatch(/held/i);
    expect(result).not.toMatch(/assess/i);
  });
});

describe('selectStartedAboveStoredRank', () => {
  it('fromRank starting strictly above the stored rank is out-of-order', () => {
    expect(selectStartedAboveStoredRank({ kind: 'fromRank', startingRank: 3 }, 1, 1)).toBe(true);
  });

  it('fromRank starting exactly at the stored rank is not out-of-order (a re-test)', () => {
    expect(selectStartedAboveStoredRank({ kind: 'fromRank', startingRank: 3 }, 3, 1)).toBe(false);
  });

  it('fromRank starting below the stored rank is not out-of-order', () => {
    expect(selectStartedAboveStoredRank({ kind: 'fromRank', startingRank: 2 }, 5, 1)).toBe(false);
  });

  it('falls back to minRank when startingKenteiRank is undefined', () => {
    expect(selectStartedAboveStoredRank({ kind: 'fromRank', startingRank: 2 }, undefined, 1)).toBe(true);
    expect(selectStartedAboveStoredRank({ kind: 'fromRank', startingRank: 1 }, undefined, 1)).toBe(false);
  });

  it('fullBottomToTop is never out-of-order', () => {
    expect(selectStartedAboveStoredRank({ kind: 'fullBottomToTop' }, 1, 1)).toBe(false);
    expect(selectStartedAboveStoredRank({ kind: 'fullBottomToTop' }, undefined, 1)).toBe(false);
  });

  it('currentRankOnly is never out-of-order', () => {
    expect(selectStartedAboveStoredRank({ kind: 'currentRankOnly', rank: 5 }, 5, 1)).toBe(false);
  });
});

describe('selectAssessmentGapNotice', () => {
  it('returns undefined when the run was not out-of-order, regardless of promotion outcome', () => {
    expect(selectAssessmentGapNotice(3, 3, false)).toBeUndefined();
    expect(selectAssessmentGapNotice(3, 4, false)).toBeUndefined();
  });

  it('returns undefined when out-of-order but the run still promoted', () => {
    expect(selectAssessmentGapNotice(3, 4, true)).toBeUndefined();
    expect(selectAssessmentGapNotice(undefined, 1, true)).toBeUndefined();
  });

  it('returns explanatory copy when out-of-order and the run did not promote', () => {
    const result = selectAssessmentGapNotice(3, 3, true);

    expect(result).toMatch(/clear|earlier|skip/i);
  });

  it('returns explanatory copy when out-of-order and no rank was earned at all', () => {
    const result = selectAssessmentGapNotice(undefined, undefined, true);

    expect(result).toMatch(/clear|earlier|skip/i);
  });
});
