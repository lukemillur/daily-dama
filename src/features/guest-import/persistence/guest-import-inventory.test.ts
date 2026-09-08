import { describe, expect, it } from '@jest/globals';

import {
  buildGuestImportTransports,
  countCloudRecords,
  countLocalGuestRecords,
  type GuestImportTransports,
} from '@/features/guest-import/persistence/guest-import-inventory';
import { serializeCustomTricks } from '@/features/custom-tricks/persistence/custom-trick-persistence';
import type { CustomTrickRow } from '@/features/custom-tricks/persistence/custom-trick-cloud-repository';
import { serializeGoals } from '@/features/goals/persistence/goal-persistence';
import type { GoalRow } from '@/features/goals/persistence/goal-cloud-repository';
import { serializeNotes } from '@/features/notes/persistence/note-persistence';
import type { NoteRow } from '@/features/notes/persistence/note-cloud-repository';
import { serializePracticeHistory } from '@/features/stats/persistence/practice-history-persistence';
import type { PracticeSessionRow } from '@/features/stats/persistence/practice-history-cloud-repository';
import { serializeUserProfile } from '@/features/profile/persistence/user-profile-persistence';
import type { ProfileRow, UserTrickStateRow } from '@/features/profile/persistence/profile-cloud-repository';
import type { ProfileSyncTransport } from '@/features/profile/persistence/profile-sync-transport';
import type { KeyValueStorage } from '@/shared/persistence/storage';
import type { SyncTransportRepository } from '@/shared/sync/transport';

function createMemoryStorage(seed: Record<string, string> = { }): KeyValueStorage {
  const store = new Map<string, string>(Object.entries(seed));
  return {
    getItem: async (key) => store.get(key) ?? null,
    setItem: async (key, value) => {
      store.set(key, value);
    },
  };
}

describe('countLocalGuestRecords', () => {
  it('counts every guest domain, including the profile scalar/trick-id-union math, and picks up a pre-T156.2 legacy bare key', async () => {
    const profileDoc = serializeUserProfile({
      hasCompletedOnboarding: true,
      kenteiRank: 5,
      selectedTrickIds: ['a', 'b'],
      manuallyUnlockedTrickIds: ['b', 'c'],
    });
    const practiceHistoryDoc = serializePracticeHistory({
      sessions: [
        { id: 's1', trickId: 't1', trickName: 'Trick 1', startedAt: 0, completedAt: 1000, durationMs: 1000, laceCount: 1 },
        { id: 's2', trickId: 't2', trickName: 'Trick 2', startedAt: 0, completedAt: 1000, durationMs: 1000, laceCount: 1 },
        { id: 's3', trickId: 't3', trickName: 'Trick 3', startedAt: 0, completedAt: 1000, durationMs: 1000, laceCount: 1 },
      ],
    });
    const goalsDoc = serializeGoals({
      goals: [
        { id: 'g1', trickId: 't1', trickName: 'Trick 1', createdAt: 0, updatedAt: 0, kind: 'count', targetCount: 10 },
        { id: 'g2', trickId: 't2', trickName: 'Trick 2', createdAt: 0, updatedAt: 0, kind: 'time', targetMs: 60000 },
      ],
    });
    const notesDoc = serializeNotes({
      notes: [{ id: 'n1', trickId: 't1', trickName: 'Trick 1', body: 'hi', createdAt: 0, updatedAt: 0 }],
    });
    // Legacy pre-T156.2 fallback: custom tricks live at the bare (un-namespaced) key.
    const customTricksDoc = serializeCustomTricks({
      tricks: [
        { id: 'c1', name: 'Custom 1', kind: 'standalone', updatedAt: 0 },
        { id: 'c2', name: 'Custom 2', kind: 'standalone', updatedAt: 0 },
      ],
    });

    const storage = createMemoryStorage({
      'guest:daily-dama:user-profile': profileDoc,
      'guest:daily-dama:practice-history': practiceHistoryDoc,
      'guest:daily-dama:goals': goalsDoc,
      'guest:daily-dama:notes': notesDoc,
      'daily-dama:custom-tricks': customTricksDoc, // legacy bare key, no 'guest:' prefix
    });

    const counts = await countLocalGuestRecords(storage);

    expect(counts).toEqual({
      profile: { local: 4, cloud: 0 }, // 1 scalar op (onboarding/rank) + union(a,b,c) = 3
      customTricks: { local: 2, cloud: 0 },
      practiceHistory: { local: 3, cloud: 0 },
      goals: { local: 2, cloud: 0 },
      notes: { local: 1, cloud: 0 },
    });
  });

  it('counts a fully-empty guest workspace as all zeros', async () => {
    const storage = createMemoryStorage();
    const counts = await countLocalGuestRecords(storage);
    expect(counts).toEqual({
      profile: { local: 0, cloud: 0 },
      customTricks: { local: 0, cloud: 0 },
      practiceHistory: { local: 0, cloud: 0 },
      goals: { local: 0, cloud: 0 },
      notes: { local: 0, cloud: 0 },
    });
  });
});

const USER_ID = '11111111-1111-1111-1111-111111111111';
const TIMESTAMP = '2026-01-01T00:00:00.000Z';

function makeProfileRow(): ProfileRow {
  return {
    user_id: USER_ID,
    has_completed_onboarding: true,
    kentei_rank: 5,
    last_sesh: null,
    revision: 1,
    streak_threshold_ms: null,
    theme_accent_color: null,
    theme_background_color: null,
    theme_text_color: null,
    created_at: TIMESTAMP,
    updated_at: TIMESTAMP,
  };
}

function makeTrickStateRow(trickId: string): UserTrickStateRow {
  return {
    id: `state-${trickId}`,
    user_id: USER_ID,
    trick_id: trickId,
    is_selected: true,
    is_manually_unlocked: false,
    revision: 1,
    created_at: TIMESTAMP,
    updated_at: TIMESTAMP,
  };
}

function makeCustomTrickRow(id: string): CustomTrickRow {
  return {
    user_id: USER_ID,
    id,
    kind: 'standalone',
    name: `Custom ${id}`,
    kentei_rank: null,
    steps: null,
    revision: 1,
    created_at: TIMESTAMP,
    updated_at: TIMESTAMP,
  };
}

function makePracticeSessionRow(id: string): PracticeSessionRow {
  return {
    user_id: USER_ID,
    id,
    trick_id: 'lighthouse',
    trick_name: 'Lighthouse',
    started_at: 1000,
    completed_at: 5000,
    duration_ms: 4000,
    lace_count: 3,
    planned_duration_ms: null,
    origin: null,
    created_at: TIMESTAMP,
  };
}

function makeGoalRow(id: string, deletedAt: string | null = null): GoalRow {
  return {
    user_id: USER_ID,
    id,
    trick_id: 'lighthouse',
    trick_name: 'Lighthouse',
    kind: 'count',
    target_count: 10,
    target_ms: null,
    revision: 1,
    created_at: TIMESTAMP,
    updated_at: TIMESTAMP,
    deleted_at: deletedAt,
  };
}

function makeNoteRow(id: string, deletedAt: string | null = null): NoteRow {
  return {
    user_id: USER_ID,
    id,
    trick_id: 'lighthouse',
    trick_name: 'Lighthouse',
    body: 'Getting the timing down.',
    practice_session_id: null,
    revision: 1,
    created_at: TIMESTAMP,
    updated_at: TIMESTAMP,
    deleted_at: deletedAt,
  };
}

interface FakeTransportsOptions {
  readonly profileRow?: ProfileRow | null;
  readonly trickStateRows?: readonly UserTrickStateRow[];
  readonly customTrickRows?: readonly CustomTrickRow[];
  readonly practiceSessionRows?: readonly PracticeSessionRow[];
  readonly goalRows?: readonly GoalRow[];
  readonly noteRows?: readonly NoteRow[];
  readonly failDomain?: 'profile' | 'customTricks' | 'practiceHistory' | 'goals' | 'notes';
}

function buildFakeTransports(options: FakeTransportsOptions, callLog: string[]): GuestImportTransports {
  const profile: ProfileSyncTransport = {
    async pullProfileRow() {
      callLog.push('profile');
      if (options.failDomain === 'profile') {
        return { status: 'failed', error: { kind: 'network', message: 'fake profile failure' } };
      }
      return { status: 'succeeded', page: { items: options.profileRow ? [options.profileRow] : [], nextCursor: null } };
    },
    async pullTrickStatePage() {
      return { status: 'succeeded', page: { items: options.trickStateRows ?? [], nextCursor: null } };
    },
    async push() {
      throw new Error('push is never called by inventory counting');
    },
  };

  const customTricks: SyncTransportRepository<CustomTrickRow> = {
    async pull() {
      callLog.push('customTricks');
      if (options.failDomain === 'customTricks') {
        return { status: 'failed', error: { kind: 'network', message: 'fake custom-trick failure' } };
      }
      return { status: 'succeeded', page: { items: options.customTrickRows ?? [], nextCursor: null } };
    },
    async push() {
      throw new Error('push is never called by inventory counting');
    },
  };

  const practiceHistory: SyncTransportRepository<PracticeSessionRow> = {
    async pull() {
      callLog.push('practiceHistory');
      if (options.failDomain === 'practiceHistory') {
        return { status: 'failed', error: { kind: 'network', message: 'fake practice-history failure' } };
      }
      return { status: 'succeeded', page: { items: options.practiceSessionRows ?? [], nextCursor: null } };
    },
    async push() {
      throw new Error('push is never called by inventory counting');
    },
  };

  const goals: SyncTransportRepository<GoalRow> = {
    async pull() {
      callLog.push('goals');
      if (options.failDomain === 'goals') {
        return { status: 'failed', error: { kind: 'network', message: 'fake goal failure' } };
      }
      return { status: 'succeeded', page: { items: options.goalRows ?? [], nextCursor: null } };
    },
    async push() {
      throw new Error('push is never called by inventory counting');
    },
  };

  const notes: SyncTransportRepository<NoteRow> = {
    async pull() {
      callLog.push('notes');
      if (options.failDomain === 'notes') {
        return { status: 'failed', error: { kind: 'network', message: 'fake note failure' } };
      }
      return { status: 'succeeded', page: { items: options.noteRows ?? [], nextCursor: null } };
    },
    async push() {
      throw new Error('push is never called by inventory counting');
    },
  };

  return { profile, customTricks, practiceHistory, goals, notes };
}

describe('countCloudRecords', () => {
  it('counts every domain, excluding tombstoned goal/note rows', async () => {
    const callLog: string[] = [];
    const transports = buildFakeTransports(
      {
        profileRow: makeProfileRow(),
        trickStateRows: [makeTrickStateRow('t1'), makeTrickStateRow('t2')],
        customTrickRows: [makeCustomTrickRow('c1')],
        practiceSessionRows: [makePracticeSessionRow('s1'), makePracticeSessionRow('s2')],
        goalRows: [makeGoalRow('g1'), makeGoalRow('g2', TIMESTAMP)],
        noteRows: [makeNoteRow('n1'), makeNoteRow('n2', TIMESTAMP), makeNoteRow('n3')],
      },
      callLog,
    );

    const result = await countCloudRecords(transports, USER_ID);

    expect(result).toEqual({
      status: 'succeeded',
      counts: {
        profile: 3, // 1 present row + 2 trick-state rows
        customTricks: 1,
        practiceHistory: 2,
        goals: 1, // one tombstoned goal excluded
        notes: 2, // one tombstoned note excluded
      },
    });
    expect(callLog).toEqual(['profile', 'customTricks', 'practiceHistory', 'goals', 'notes']);
  });

  it('counts zero profile records when no cloud profile row exists', async () => {
    const callLog: string[] = [];
    const transports = buildFakeTransports({ profileRow: null }, callLog);
    const result = await countCloudRecords(transports, USER_ID);
    expect(result).toEqual({
      status: 'succeeded',
      counts: { profile: 0, customTricks: 0, practiceHistory: 0, goals: 0, notes: 0 },
    });
  });

  const shortCircuitCases: readonly (readonly [FakeTransportsOptions['failDomain'], readonly string[]])[] = [
    ['profile', ['profile']],
    ['customTricks', ['profile', 'customTricks']],
    ['practiceHistory', ['profile', 'customTricks', 'practiceHistory']],
    ['goals', ['profile', 'customTricks', 'practiceHistory', 'goals']],
    ['notes', ['profile', 'customTricks', 'practiceHistory', 'goals', 'notes']],
  ];

  it.each(shortCircuitCases)(
    'a pull failure on %s short-circuits before any later domain is called',
    async (failDomain, expectedCallLog) => {
      const callLog: string[] = [];
      const transports = buildFakeTransports({ failDomain }, callLog);
      const result = await countCloudRecords(transports, USER_ID);
      expect(result.status).toBe('failed');
      if (result.status === 'failed') {
        expect(result.domain).toBe(failDomain);
      }
      expect(callLog).toEqual(expectedCallLog);
    },
  );

  it('a mapping-invalid cloud row for a domain is reported as that domain failing', async () => {
    const callLog: string[] = [];
    const foreignUserGoalRow: GoalRow = { ...makeGoalRow('g1'), user_id: 'someone-else' };
    const transports = buildFakeTransports({ goalRows: [foreignUserGoalRow] }, callLog);
    const result = await countCloudRecords(transports, USER_ID);
    expect(result).toEqual({ status: 'failed', domain: 'goals', errorMessage: expect.any(String) });
    expect(callLog).toEqual(['profile', 'customTricks', 'practiceHistory', 'goals']);
  });
});

describe('buildGuestImportTransports', () => {
  it('bundles all five domain transports', () => {
    const fakeClient = { } as unknown as Parameters<typeof buildGuestImportTransports>[0];
    const transports = buildGuestImportTransports(fakeClient, USER_ID);
    expect(Object.keys(transports).sort()).toEqual(['customTricks', 'goals', 'notes', 'practiceHistory', 'profile']);
  });
});
