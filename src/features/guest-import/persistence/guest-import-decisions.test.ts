import { describe, expect, it } from '@jest/globals';
import { planConflictChoice, planProfileChoice } from './guest-import-decisions';

const comparison = { guest: { hasCompletedOnboarding: true }, cloud: { hasCompletedOnboarding: false } } as const;
const operation = { operationId: 'op', domain: 'goals' as const, operationType: 'upsert' as const, recordId: 'goal-1', payload: { id: 'goal-1' }, createdAt: 1, attemptCount: 0, lastAttemptedAt: null, lastErrorMessage: null, status: 'pending' as const, expectedRevision: null };

describe('guest import decisions', () => {
  it.each([
    ['guest', 7, true],
    ['cloud', 7, false],
  ])('profile %s produces the intended scalar mutation', (choice, revision, hasOperation) => {
    const result = planProfileChoice({ comparison, choice: choice as 'guest' | 'cloud', destinationUserId: 'user-1', expectedRevision: revision, operationId: 'profile-op', createdAt: 10 });
    expect(Boolean(result.operation)).toBe(hasOperation);
    if (result.operation) expect(result.operation.expectedRevision).toBe(revision);
  });

  it('does not fabricate a cloud choice when the cloud profile is absent', () => {
    expect(planProfileChoice({ comparison: { guest: comparison.guest, cloud: null }, choice: 'guest', destinationUserId: 'user-1', expectedRevision: 7, operationId: 'profile-op', createdAt: 10 }).operation?.expectedRevision).toBeNull();
  });

  it.each(['guest', 'cloud'] as const)('resolves one conflict without coupling sibling records (%s)', (choice) => {
    const result = planConflictChoice({ conflict: { domain: 'goals', recordId: 'goal-1', guestSnapshot: { id: 'goal-1' }, cloudSnapshot: { id: 'goal-1' }, cloudRevision: 3 }, choice, operation });
    expect(result.choice).toBe(choice);
    expect(result.operation === null ? null : result.operation.expectedRevision).toBe(choice === 'guest' ? 3 : null);
  });
});
