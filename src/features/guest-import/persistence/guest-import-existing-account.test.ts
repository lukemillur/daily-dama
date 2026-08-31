/// <reference types="jest" />

import { planExistingAccountMerge, resolveGuestImportChoice, type ExistingAccountSnapshot } from '@/features/guest-import/persistence/guest-import-existing-account';
import type { UserProfile } from '@/features/profile/model/user-profile';
import type { CustomTrick } from '@/features/custom-tricks/model/custom-trick';
import type { PracticeSessionRecord } from '@/features/stats/model/practice-history';
import type { Goal } from '@/features/goals/model/goal';
import type { Note } from '@/features/notes/model/note';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const profile = (selectedTrickIds: readonly string[] = [], updatedAt?: number): UserProfile => ({ hasCompletedOnboarding: true, selectedTrickIds, updatedAt });
const trick = (id: string, name = id, updatedAt = 1000): CustomTrick => ({ id, kind: 'standalone', name, updatedAt });
const session = (id: string, laceCount = 1): PracticeSessionRecord => ({ id, trickId: 'lighthouse', trickName: 'Lighthouse', startedAt: 1000, completedAt: 2000, durationMs: 1000, laceCount });
const goal = (id: string, targetCount = 3, updatedAt = 1000): Goal => ({ id, trickId: 'lighthouse', trickName: 'Lighthouse', kind: 'count', targetCount, createdAt: 1000, updatedAt });
const note = (id: string, body = 'note', updatedAt = 1000): Note => ({ id, trickId: 'lighthouse', trickName: 'Lighthouse', body, createdAt: 1000, updatedAt });

// Defaults the cloud profile to a scalar match against the default guest
// profile() (with a defined profileUpdatedAt, which always beats the
// default guest's undefined updatedAt) so tests unrelated to the
// profile-preference comparison don't incidentally pick up a spurious
// profile scalar operation -- see the dedicated profile-comparison tests
// below for that behavior.
function cloud(overrides: Partial<ExistingAccountSnapshot> = {}): ExistingAccountSnapshot {
  return { profile: { hasCompletedOnboarding: true }, profileUpdatedAt: 1, trickStates: [], customTricks: { tricks: [] }, practiceHistory: { sessions: [] }, goals: [], notes: [], ...overrides };
}

function plan(guest: Partial<Parameters<typeof planExistingAccountMerge>[0]['guest']>, target = cloud()) {
  return planExistingAccountMerge({
    guest: { profile: profile(), customTricks: { tricks: [] }, practiceHistory: { sessions: [] }, goals: { goals: [] }, notes: { notes: [] }, ...guest },
    cloud: target, destinationUserId: USER_ID, importId: 'import-1', createdAt: 10,
    createOperationId: (domain, recordId) => `${domain}:${recordId}`,
  });
}

describe('resolveGuestImportChoice', () => {
  it('picks guest when strictly newer', () => {
    expect(resolveGuestImportChoice(20, 10)).toBe('guest');
  });

  it('picks cloud on a tie', () => {
    expect(resolveGuestImportChoice(10, 10)).toBe('cloud');
  });

  it('picks cloud when guest is older', () => {
    expect(resolveGuestImportChoice(5, 10)).toBe('cloud');
  });

  it('picks cloud when guest has no updatedAt at all, regardless of cloud', () => {
    expect(resolveGuestImportChoice(undefined, 10)).toBe('cloud');
    expect(resolveGuestImportChoice(undefined, undefined)).toBe('cloud');
  });
});

describe('planExistingAccountMerge', () => {
  it.each([
    ['customTricks', { customTricks: { tricks: [trick('new')] } }],
    ['practiceHistory', { practiceHistory: { sessions: [session('new')] } }],
    ['goals', { goals: { goals: [goal('new')] } }],
    ['notes', { notes: { notes: [note('new')] } }],
  ])('%s emits a create for a disjoint ID', (domain, guest) => {
    const result = plan(guest as never);
    expect(result.operations.map((item) => `${item.domain}:${item.recordId}`)).toContain(`${domain}:new`);
  });

  it.each([
    ['customTricks', { customTricks: { tricks: [trick('same')] } }, { customTricks: { tricks: [trick('same')] } }],
    ['practiceHistory', { practiceHistory: { sessions: [session('same')] } }, { practiceHistory: { sessions: [session('same')] } }],
    ['goals', { goals: { goals: [goal('same')] } }, { goals: [{ status: 'active', goal: goal('same'), meta: { revision: 2 } }] }],
    ['notes', { notes: { notes: [note('same')] } }, { notes: [{ status: 'active', note: note('same'), meta: { revision: 2 } }] }],
  ])('%s deduplicates an identical canonical payload', (domain, guest, target) => {
    const result = plan(guest as never, cloud(target as never));
    expect(result.deduplications).toEqual([{ domain, recordId: 'same' }]);
    expect(result.operations).toHaveLength(0);
  });

  it.each([
    ['customTricks', { customTricks: { tricks: [trick('same', 'guest', 20)] } }, { customTricks: { tricks: [trick('same', 'cloud', 10)] } }],
    ['goals', { goals: { goals: [goal('same', 3, 20)] } }, { goals: [{ status: 'active', goal: goal('same', 4, 10), meta: { revision: 2 } }] }],
    ['notes', { notes: { notes: [note('same', 'guest', 20)] } }, { notes: [{ status: 'active', note: note('same', 'cloud', 10), meta: { revision: 2 } }] }],
  ])('%s: a strictly-newer guest edit wins automatically and emits a write', (domain, guest, target) => {
    const result = plan(guest as never, cloud(target as never));
    expect(result.operations.map((item) => `${item.domain}:${item.recordId}`)).toEqual([`${domain}:same`]);
    expect(result.deduplications).toHaveLength(0);
  });

  it.each([
    ['customTricks', { customTricks: { tricks: [trick('same', 'guest', 10)] } }, { customTricks: { tricks: [trick('same', 'cloud', 20)] } }],
    ['goals', { goals: { goals: [goal('same', 3, 10)] } }, { goals: [{ status: 'active', goal: goal('same', 4, 20), meta: { revision: 2 } }] }],
    ['notes', { notes: { notes: [note('same', 'guest', 10)] } }, { notes: [{ status: 'active', note: note('same', 'cloud', 20), meta: { revision: 2 } }] }],
  ])('%s: a strictly-newer cloud edit wins automatically and dedupes the guest copy', (domain, guest, target) => {
    const result = plan(guest as never, cloud(target as never));
    expect(result.operations).toHaveLength(0);
    expect(result.deduplications).toEqual([{ domain, recordId: 'same' }]);
  });

  it('practiceHistory always keeps cloud on a payload mismatch, since it has no updatedAt to prove local is newer', () => {
    const result = plan({ practiceHistory: { sessions: [session('same', 1)] } }, cloud({ practiceHistory: { sessions: [session('same', 2)] } }));
    expect(result.operations).toHaveLength(0);
    expect(result.deduplications).toEqual([{ domain: 'practiceHistory', recordId: 'same' }]);
  });

  it('unions trick state with boolean OR and preserves the target revision', () => {
    const result = plan({ profile: profile(['a', 'b']) }, cloud({
      trickStates: [{ trickId: 'a', isSelected: false, isManuallyUnlocked: true, revision: 7 }],
    }));
    expect(result.operations).toEqual([
      expect.objectContaining({ domain: 'profile', recordId: 'a', expectedRevision: 7, payload: expect.objectContaining({ is_selected: true, is_manually_unlocked: true }) }),
      expect.objectContaining({ domain: 'profile', recordId: 'b', expectedRevision: null }),
    ]);
  });

  it('a guest-newer profile-preference comparison resolves automatically and emits the guest scalar write', () => {
    const result = plan({ profile: { ...profile([], 20), hasCompletedOnboarding: false } }, cloud({ profile: { hasCompletedOnboarding: true }, profileUpdatedAt: 10 }));
    const profileOps = result.operations.filter((item) => item.domain === 'profile' && item.recordId === USER_ID);
    expect(profileOps).toEqual([expect.objectContaining({ domain: 'profile', recordId: USER_ID, payload: expect.objectContaining({ has_completed_onboarding: false }) })]);
  });

  it('a cloud-newer (or tied) profile-preference comparison resolves automatically and emits no scalar write', () => {
    const result = plan({ profile: { ...profile([], 10), hasCompletedOnboarding: false } }, cloud({ profile: { hasCompletedOnboarding: true }, profileUpdatedAt: 20 }));
    const profileOps = result.operations.filter((item) => item.domain === 'profile' && item.recordId === USER_ID);
    expect(profileOps).toHaveLength(0);
  });

  it('a cloud profile that does not exist always takes the guest scalar fields', () => {
    const result = plan({ profile: { ...profile(), hasCompletedOnboarding: false } }, cloud({ profile: null, profileUpdatedAt: null }));
    const profileOps = result.operations.filter((item) => item.domain === 'profile' && item.recordId === USER_ID);
    expect(profileOps).toEqual([expect.objectContaining({ domain: 'profile', recordId: USER_ID, payload: expect.objectContaining({ has_completed_onboarding: false }) })]);
  });

  it.each([
    ['goals', { goals: { goals: [goal('same', 3, 6000)] } }, { goals: [{ status: 'deleted', goal: goal('same', 3, 1000), meta: { revision: 4, deletedAt: 5000 } }] }],
    ['notes', { notes: { notes: [note('same', 'x', 6000)] } }, { notes: [{ status: 'deleted', note: note('same', 'x', 1000), meta: { revision: 4, deletedAt: 5000 } }] }],
  ])('%s: a guest edit made after a cloud deletion (compared against deletedAt, not the tombstone\'s stale updatedAt) wins and recreates the record', (domain, guest, target) => {
    const result = plan(guest as never, cloud(target as never));
    expect(result.operations.map((item) => `${item.domain}:${item.recordId}`)).toEqual([`${domain}:same`]);
    expect(result.deduplications).toHaveLength(0);
  });

  it.each([
    ['goals', { goals: { goals: [goal('same', 3, 2000)] } }, { goals: [{ status: 'deleted', goal: goal('same', 3, 1000), meta: { revision: 4, deletedAt: 5000 } }] }],
    ['notes', { notes: { notes: [note('same', 'x', 2000)] } }, { notes: [{ status: 'deleted', note: note('same', 'x', 1000), meta: { revision: 4, deletedAt: 5000 } }] }],
  ])('%s: a cloud deletion after the guest edit wins and the guest copy is deduplicated away, not recreated', (domain, guest, target) => {
    const result = plan(guest as never, cloud(target as never));
    expect(result.operations).toHaveLength(0);
    expect(result.deduplications).toEqual([{ domain, recordId: 'same' }]);
  });
});
