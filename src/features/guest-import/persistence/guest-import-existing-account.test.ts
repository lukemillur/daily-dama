/// <reference types="jest" />

import { planExistingAccountMerge, type ExistingAccountSnapshot } from '@/features/guest-import/persistence/guest-import-existing-account';
import type { UserProfile } from '@/features/profile/model/user-profile';
import type { CustomTrick } from '@/features/custom-tricks/model/custom-trick';
import type { PracticeSessionRecord } from '@/features/stats/model/practice-history';
import type { Goal } from '@/features/goals/model/goal';
import type { Note } from '@/features/notes/model/note';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const profile = (selectedTrickIds: readonly string[] = []): UserProfile => ({ hasCompletedOnboarding: true, selectedTrickIds });
const trick = (id: string, name = id): CustomTrick => ({ id, kind: 'standalone', name });
const session = (id: string, laceCount = 1): PracticeSessionRecord => ({ id, trickId: 'lighthouse', trickName: 'Lighthouse', startedAt: 1000, completedAt: 2000, durationMs: 1000, laceCount });
const goal = (id: string, targetCount = 3): Goal => ({ id, trickId: 'lighthouse', trickName: 'Lighthouse', kind: 'count', targetCount, createdAt: 1000 });
const note = (id: string, body = 'note'): Note => ({ id, trickId: 'lighthouse', trickName: 'Lighthouse', body, createdAt: 1000, updatedAt: 1000 });

function cloud(overrides: Partial<ExistingAccountSnapshot> = {}): ExistingAccountSnapshot {
  return { profile: null, trickStates: [], customTricks: { tricks: [] }, practiceHistory: { sessions: [] }, goals: [], notes: [], ...overrides };
}

function plan(guest: Partial<Parameters<typeof planExistingAccountMerge>[0]['guest']>, target = cloud()) {
  return planExistingAccountMerge({
    guest: { profile: profile(), customTricks: { tricks: [] }, practiceHistory: { sessions: [] }, goals: { goals: [] }, notes: { notes: [] }, ...guest },
    cloud: target, destinationUserId: USER_ID, importId: 'import-1', createdAt: 10,
    createOperationId: (domain, recordId) => `${domain}:${recordId}`,
  });
}

describe('planExistingAccountMerge', () => {
  it.each([
    ['customTricks', { customTricks: { tricks: [trick('new')] } }],
    ['practiceHistory', { practiceHistory: { sessions: [session('new')] } }],
    ['goals', { goals: { goals: [goal('new')] } }],
    ['notes', { notes: { notes: [note('new')] } }],
  ])('%s emits a create for a disjoint ID', (domain, guest) => {
    const result = plan(guest as never);
    expect(result.operations.map((item) => `${item.domain}:${item.recordId}`)).toContain(`${domain}:new`);
    expect(result.conflicts).toHaveLength(0);
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
    expect(result.conflicts).toHaveLength(0);
  });

  it.each([
    ['customTricks', { customTricks: { tricks: [trick('same', 'guest')] } }, { customTricks: { tricks: [trick('same', 'cloud')] } }],
    ['practiceHistory', { practiceHistory: { sessions: [session('same', 1)] } }, { practiceHistory: { sessions: [session('same', 2)] } }],
    ['goals', { goals: { goals: [goal('same', 3)] } }, { goals: [{ status: 'active', goal: goal('same', 4), meta: { revision: 2 } }] }],
    ['notes', { notes: { notes: [note('same', 'guest')] } }, { notes: [{ status: 'active', note: note('same', 'cloud'), meta: { revision: 2 } }] }],
  ])('%s emits a conflict without a write for a different payload', (domain, guest, target) => {
    const result = plan(guest as never, cloud(target as never));
    expect(result.operations).toHaveLength(0);
    expect(result.conflicts).toEqual([expect.objectContaining({ domain, recordId: 'same', cloudRevision: domain === 'customTricks' || domain === 'practiceHistory' ? null : 2 })]);
  });

  it('unions trick state with boolean OR and preserves the target revision', () => {
    const result = plan({ profile: profile(['a', 'b']) }, cloud({
      trickStates: [{ trickId: 'a', isSelected: false, isManuallyUnlocked: true, revision: 7 }],
    }));
    expect(result.operations).toEqual([
      expect.objectContaining({ domain: 'profile', recordId: 'a', expectedRevision: 7, payload: expect.objectContaining({ is_selected: true, is_manually_unlocked: true }) }),
      expect.objectContaining({ domain: 'profile', recordId: 'b', expectedRevision: null }),
    ]);
    expect(result.conflicts).toHaveLength(0);
  });

  it('keeps profile scalars as a comparison and never emits a profile scalar write', () => {
    const result = plan({ profile: { ...profile(), hasCompletedOnboarding: false } }, cloud({ profile: { hasCompletedOnboarding: true } }));
    expect(result.profileComparison).toEqual({ guest: { hasCompletedOnboarding: false }, cloud: { hasCompletedOnboarding: true } });
    expect(result.operations).toHaveLength(0);
  });

  it.each([
    ['goals', { goals: { goals: [goal('same')] } }, { goals: [{ status: 'deleted', goal: goal('same'), meta: { revision: 4, deletedAt: 5000 } }] }],
    ['notes', { notes: { notes: [note('same')] } }, { notes: [{ status: 'deleted', note: note('same'), meta: { revision: 4, deletedAt: 5000 } }] }],
  ])('%s treats a tombstone as a payload conflict', (domain, guest, target) => {
    const result = plan(guest as never, cloud(target as never));
    expect(result.conflicts).toEqual([expect.objectContaining({ domain, recordId: 'same', cloudRevision: 4, cloudSnapshot: expect.objectContaining({ status: 'deleted', deletedAt: 5000 }) })]);
    expect(result.operations).toHaveLength(0);
  });
});
