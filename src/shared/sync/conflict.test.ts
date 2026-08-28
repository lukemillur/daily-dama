import { describe, expect, it } from '@jest/globals';
import { isSyncConflictRecord } from '@/shared/sync/conflict';

const conflict = {
  domain: 'goals' as const, recordId: 'goal-1', operationId: 'op-1',
  operationType: 'upsert' as const, expectedRevision: 2, serverRevision: 3,
  localSnapshot: { target_count: 10 }, serverSnapshot: { target_count: 20 }, createdAt: 100,
};

describe('sync conflict contract', () => {
  it('accepts a JSON round-trip comparison', () => {
    expect(isSyncConflictRecord(JSON.parse(JSON.stringify(conflict)))).toBe(true);
  });
  it.each([
    ['cross-domain immutable session', { ...conflict, domain: 'practiceHistory' }],
    ['invalid revision', { ...conflict, serverRevision: 0 }],
    ['non-json snapshot', { ...conflict, localSnapshot: BigInt(1) }],
  ])('rejects %s', (_, value) => expect(isSyncConflictRecord(value)).toBe(false));
});
