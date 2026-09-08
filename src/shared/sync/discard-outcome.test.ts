import { describe, expect, it } from '@jest/globals';

import { aggregateDiscardOutcomes, type DomainDiscardOutcome } from '@/shared/sync/discard-outcome';
import type { SyncDomain } from '@/shared/sync/domain';

const discarded: DomainDiscardOutcome = { status: 'discarded' };
const superseded: DomainDiscardOutcome = { status: 'superseded' };
const failed = (error: unknown): DomainDiscardOutcome => ({ status: 'failed', error });

function entries(pairs: readonly (readonly [SyncDomain, DomainDiscardOutcome])[]) {
  return pairs;
}

describe('aggregateDiscardOutcomes', () => {
  it('reports discarded when every domain discarded', () => {
    const result = aggregateDiscardOutcomes(
      entries([
        ['profile', discarded],
        ['customTricks', discarded],
        ['practiceHistory', discarded],
        ['goals', discarded],
        ['notes', discarded],
      ]),
    );
    expect(result).toEqual({ status: 'discarded' });
  });

  it('reports failed naming the one domain that failed', () => {
    const error = new Error('disk full');
    const result = aggregateDiscardOutcomes(
      entries([
        ['profile', discarded],
        ['customTricks', failed(error)],
        ['practiceHistory', discarded],
        ['goals', discarded],
        ['notes', discarded],
      ]),
    );
    expect(result).toEqual({ status: 'failed', failures: [{ domain: 'customTricks', error }] });
  });

  it('reports failed with two failures in caller entry order', () => {
    const errorA = new Error('a');
    const errorB = new Error('b');
    const result = aggregateDiscardOutcomes(
      entries([
        ['profile', failed(errorA)],
        ['customTricks', discarded],
        ['practiceHistory', discarded],
        ['goals', failed(errorB)],
        ['notes', discarded],
      ]),
    );
    expect(result).toEqual({
      status: 'failed',
      failures: [
        { domain: 'profile', error: errorA },
        { domain: 'goals', error: errorB },
      ],
    });
  });

  it('reports superseded when a single domain is superseded, with no failures', () => {
    const result = aggregateDiscardOutcomes(
      entries([
        ['profile', discarded],
        ['customTricks', superseded],
        ['practiceHistory', discarded],
        ['goals', discarded],
        ['notes', discarded],
      ]),
    );
    expect(result).toEqual({ status: 'superseded' });
  });

  it('resolves superseded plus failed to superseded (precedence)', () => {
    const result = aggregateDiscardOutcomes(
      entries([
        ['profile', failed(new Error('x'))],
        ['customTricks', superseded],
        ['practiceHistory', discarded],
        ['goals', discarded],
        ['notes', discarded],
      ]),
    );
    expect(result).toEqual({ status: 'superseded' });
  });
});
