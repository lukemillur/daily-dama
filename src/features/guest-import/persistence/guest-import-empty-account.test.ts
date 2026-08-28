import { describe, expect, it } from '@jest/globals';
import { INITIAL_USER_PROFILE } from '@/features/profile/model/user-profile';
import { saveUserProfile, loadUserProfile } from '@/features/profile/persistence/user-profile-persistence';
import { saveCustomTricks, loadCustomTricks } from '@/features/custom-tricks/persistence/custom-trick-persistence';
import { savePracticeHistory, loadPracticeHistory } from '@/features/stats/persistence/practice-history-persistence';
import { saveGoals, loadGoals } from '@/features/goals/persistence/goal-persistence';
import { saveNotes, loadNotes } from '@/features/notes/persistence/note-persistence';
import { createUserIdentity, GUEST_IDENTITY } from '@/shared/persistence/identity';
import { createGuestMigratingStorage } from '@/shared/persistence/scoped-storage';
import type { KeyValueStorage } from '@/shared/persistence/storage';
import type { SyncPushRequest } from '@/shared/sync/transport';
import { prepareGuestImport, runEmptyGuestImport } from './guest-import-empty-account';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const USER = createUserIdentity(USER_ID)!;

function storage(): KeyValueStorage {
  const values = new Map<string, string>();
  return { getItem: async (key) => values.get(key) ?? null, setItem: async (key, value) => { values.set(key, value); } };
}

function repositories({ dropAck = false }: { dropAck?: boolean } = {}) {
  const applied = new Set<string>();
  const push = async (request: SyncPushRequest) => {
    const duplicate = applied.has(request.operationId);
    applied.add(request.operationId);
    if (dropAck && !duplicate) throw new Error('response lost after server commit');
    return { status: 'succeeded' as const, row: {} };
  };
  return {
    repositories: { profile: { push }, customTricks: { push }, practiceHistory: { push }, goals: { push }, notes: { push } },
    applied,
  };
}

async function seedAll(source: KeyValueStorage) {
  const guest = guestView(source);
  await saveUserProfile(guest, { ...INITIAL_USER_PROFILE, hasCompletedOnboarding: true, kenteiRank: 1, selectedTrickIds: ['trick-1'] });
  await saveCustomTricks(guest, { tricks: [{ id: 'custom-1', kind: 'standalone', name: 'Custom', kenteiRank: 1 }] });
  await savePracticeHistory(guest, { sessions: [{ id: 'session-1', trickId: 'trick-1', trickName: 'Trick', startedAt: 0, completedAt: 1000, durationMs: 1000, laceCount: 1 }] });
  await saveGoals(guest, { goals: [{ id: 'goal-1', trickId: 'trick-1', trickName: 'Trick', kind: 'count', targetCount: 3, createdAt: 0 }] });
  await saveNotes(guest, { notes: [{ id: 'note-1', trickId: 'trick-1', trickName: 'Trick', body: 'Keep it loose', createdAt: 0, updatedAt: 0 }] });
}

function guestView(source: KeyValueStorage) {
  return createGuestMigratingStorage(source, { getIdentity: () => GUEST_IDENTITY });
}

async function prepared(source: KeyValueStorage) {
  return prepareGuestImport({
    storage: source, destinationIdentity: USER, destinationUserId: USER_ID, importId: 'import-fixed', createdAt: 10,
    createOperationId: (domain, recordId) => `op:${domain}:${recordId}`,
  });
}

describe('empty guest-account import', () => {
  it('imports all five domains, keeps operation IDs stable, and removes only acknowledged source records', async () => {
    const source = storage(); await seedAll(source); const plan = await prepared(source); const fake = repositories();
    let progress = plan.progress;
    const saveProgress = async (next: typeof progress) => { progress = next; };
    const first = await runEmptyGuestImport({ storage: source, destinationIdentity: USER, destinationUserId: USER_ID, progress, repositories: fake.repositories as never, saveProgress });
    expect(first.status).toBe('completed');
    expect(fake.applied.size).toBe(6);
    expect(new Set(progress.operations.map((operation) => operation.operationId)).size).toBe(progress.operations.length);
    const guest = guestView(source);
    expect((await loadCustomTricks(guest)).value.tricks).toHaveLength(0);
    expect((await loadPracticeHistory(guest)).value.sessions).toHaveLength(0);
    expect((await loadGoals(guest)).value.goals).toHaveLength(0);
    expect((await loadNotes(guest)).value.notes).toHaveLength(0);
    expect((await loadUserProfile(guest)).value.selectedTrickIds).toEqual([]);
  });

  it('retries a server-committed lost acknowledgement without a duplicate operation', async () => {
    const source = storage(); await seedAll(source); const plan = await prepared(source); const fake = repositories({ dropAck: true });
    let progress = plan.progress;
    const saveProgress = async (next: typeof progress) => { progress = next; };
    const paused = await runEmptyGuestImport({ storage: source, destinationIdentity: USER, destinationUserId: USER_ID, progress, repositories: fake.repositories as never, saveProgress });
    expect(paused.status).toBe('paused');
    const retry = repositories();
    // The persisted progress, including the original operation ID, is the only input to resume.
    const resumed = await runEmptyGuestImport({ storage: source, destinationIdentity: USER, destinationUserId: USER_ID, progress: paused.progress, repositories: retry.repositories as never, saveProgress });
    expect(resumed.status).toBe('completed');
    expect(paused.progress.operations[0].operationId).toBe(plan.progress.operations[0].operationId);
    expect(paused.progress.operations[0].attemptCount).toBe(1);
  });

  it('persists acknowledgement before cleanup and resumes after cleanup failure without duplicating the server write', async () => {
    const source = storage(); await seedAll(source); const plan = await prepared(source); const fake = repositories();
    let progress = plan.progress; let failCleanup = true;
    const paused = await runEmptyGuestImport({ storage: source, destinationIdentity: USER, destinationUserId: USER_ID, progress, repositories: fake.repositories as never, saveProgress: async (next) => { progress = next; }, cleanupSourceRecord: async (operation) => { if (failCleanup) { failCleanup = false; throw new Error(`cleanup:${operation.domain}`); } } });
    expect(paused.status).toBe('paused');
    expect(paused.progress.operations[0].status).toBe('acknowledged');
    expect(paused.progress.operations[0].sourceCleanupStatus).toBe('pending');
    const resumed = await runEmptyGuestImport({ storage: source, destinationIdentity: USER, destinationUserId: USER_ID, progress: paused.progress, repositories: fake.repositories as never, saveProgress: async (next) => { progress = next; }, cleanupSourceRecord: async () => undefined });
    expect(resumed.status).toBe('completed');
    expect(fake.applied.size).toBe(plan.progress.operations.length);
    expect(resumed.progress.operations.every((operation) => operation.sourceCleanupStatus === 'completed')).toBe(true);
  });

  it.each(['profile', 'customTricks', 'practiceHistory', 'goals', 'notes'] as const)('resumes after interruption at the %s boundary', async (boundary) => {
    const source = storage(); await seedAll(source); const plan = await prepared(source); let progress = plan.progress;
    let interrupted = false;
    const fake = repositories();
    const saveProgress = async (next: typeof progress) => { progress = next; };
    const paused = await runEmptyGuestImport({ storage: source, destinationIdentity: USER, destinationUserId: USER_ID, progress, repositories: fake.repositories as never, saveProgress, beforeOperation: async (operation) => { if (!interrupted && operation.domain === boundary) { interrupted = true; throw new Error('interrupted'); } } });
    expect(paused.status).toBe('paused');
    const resumed = await runEmptyGuestImport({ storage: source, destinationIdentity: USER, destinationUserId: USER_ID, progress: paused.progress, repositories: fake.repositories as never, saveProgress });
    expect(resumed.status).toBe('completed');
    expect(new Set(resumed.progress.operations.map((operation) => operation.operationId)).size).toBe(resumed.progress.operations.length);
  });
});
