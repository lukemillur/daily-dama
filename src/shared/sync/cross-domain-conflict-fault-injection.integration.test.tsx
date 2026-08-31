// T160.3: cross-domain fault injection at the fully-wired
// SyncCoordinatorProvider level. Complements the per-domain-local coverage
// in each feature's `use-*-domain-sync.test.tsx` (which already proves the
// single-domain mechanics: one stale-revision conflict doesn't block a
// sibling record, an edit against a since-tombstoned record parks only
// itself, and resolving a conflict is scoped to its own record) by proving
// the same guarantees hold when four domains push in the same coordinated
// `retry()` run, interleaved with a genuine conflict in exactly one of
// them. Reuses the mounting/mocking scaffold from
// `sync-coordinator.sesh-isolation.test.tsx` verbatim, minus `Sesh` (this
// file only cares about domain data, not session-timer isolation).

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { type PropsWithChildren, useEffect, useState } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required by jest hoisting
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const mockCreateProfileSyncTransportAdapter = jest.fn();
jest.mock('@/features/profile/persistence/profile-sync-transport', () => ({
  createProfileSyncTransportAdapter: (...args: unknown[]) => mockCreateProfileSyncTransportAdapter(...args),
}));

const mockCreateCustomTrickSyncTransportAdapter = jest.fn();
jest.mock('@/features/custom-tricks/persistence/custom-trick-sync-transport', () => ({
  createCustomTrickSyncTransportAdapter: (...args: unknown[]) => mockCreateCustomTrickSyncTransportAdapter(...args),
}));

const mockCreateGoalSyncTransportAdapter = jest.fn();
jest.mock('@/features/goals/persistence/goal-sync-transport', () => ({
  createGoalSyncTransportAdapter: (...args: unknown[]) => mockCreateGoalSyncTransportAdapter(...args),
}));

const mockCreateNoteSyncTransportAdapter = jest.fn();
jest.mock('@/features/notes/persistence/note-sync-transport', () => ({
  createNoteSyncTransportAdapter: (...args: unknown[]) => mockCreateNoteSyncTransportAdapter(...args),
}));

const mockCreatePracticeHistorySyncTransportAdapter = jest.fn();
jest.mock('@/features/stats/persistence/practice-history-sync-transport', () => ({
  createPracticeHistorySyncTransportAdapter: (...args: unknown[]) =>
    mockCreatePracticeHistorySyncTransportAdapter(...args),
}));

jest.mock('@/shared/supabase/supabase-client', () => ({
  getSupabaseClient: () => ({}),
}));

import type { CustomTrickRow } from '@/features/custom-tricks/persistence/custom-trick-cloud-repository';
import { CustomTrickProvider, useCustomTrickActions, useCustomTricks, useCustomTrickSync } from '@/features/custom-tricks/state/custom-trick-provider';
import type { GoalRow } from '@/features/goals/persistence/goal-cloud-repository';
import { GoalProvider, useGoalActions, useGoals, useGoalSync } from '@/features/goals/state/goal-provider';
import type { NoteRow } from '@/features/notes/persistence/note-cloud-repository';
import { NoteProvider, useNoteActions, useNotes, useNoteSync } from '@/features/notes/state/note-provider';
import type { ProfileRow, UserTrickStateRow } from '@/features/profile/persistence/profile-cloud-repository';
import type { ProfileSyncTransport } from '@/features/profile/persistence/profile-sync-transport';
import { UserProfileProvider, useUserProfile, useUserProfileActions, useUserProfileSync } from '@/features/profile/state/user-profile-provider';
import { PracticeHistoryProvider } from '@/features/stats/state/practice-history-provider';
import { createIdentityContext } from '@/shared/persistence/identity-context';
import { createUserIdentity, type Identity } from '@/shared/persistence/identity';
import { IdentityHandleContext } from '@/shared/persistence/identity-provider';
import { SyncCoordinatorProvider, useSyncCoordinatorStatus } from '@/shared/sync/sync-coordinator-provider';
import type { SyncTransportRepository } from '@/shared/sync/transport';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const USER_IDENTITY: Identity = createUserIdentity(USER_ID)!;
const TIMESTAMP = '2026-01-01T00:00:00.000Z';

// -- Fake transports, mirroring each domain's own `use-*-domain-sync.test.tsx`
// fakes (revision-guarded upsert/delete, conflict on a stale revision) --
// kept local to this file rather than imported, since each domain's fake
// closes over that domain's own row shape.

function createFakeGoalTransport(seedRows: readonly GoalRow[] = []): SyncTransportRepository<GoalRow> & { getRow(id: string): GoalRow | undefined } {
  const rows = new Map<string, GoalRow>(seedRows.map((row) => [row.id, row]));
  return {
    async pull() {
      return { status: 'succeeded', page: { items: Array.from(rows.values()), nextCursor: null } };
    },
    async push(request) {
      const goalId = request.recordId;
      const existing = rows.get(goalId);
      if (request.operationType === 'delete') {
        rows.delete(goalId);
        return { status: 'succeeded', row: existing ?? ({ id: goalId, user_id: USER_ID, trick_id: 'deleted', trick_name: 'deleted', kind: 'count', target_count: 1, target_ms: null, revision: 0, created_at: TIMESTAMP, updated_at: TIMESTAMP, deleted_at: TIMESTAMP } as GoalRow) };
      }
      if (request.expectedRevision !== null && existing && existing.revision !== request.expectedRevision) {
        return { status: 'conflict', conflict: { operationId: request.operationId, recordId: goalId, expectedRevision: request.expectedRevision, serverRevision: existing.revision, serverRow: existing } };
      }
      const payload = request.payload as Record<string, unknown>;
      const row: GoalRow = {
        id: goalId,
        user_id: USER_ID,
        trick_id: (payload.trick_id as string) ?? '',
        trick_name: (payload.trick_name as string) ?? '',
        kind: (payload.kind as 'count' | 'time') ?? 'count',
        target_count: (payload.target_count as number | null) ?? null,
        target_ms: (payload.target_ms as number | null) ?? null,
        created_at: existing?.created_at ?? TIMESTAMP,
        updated_at: TIMESTAMP,
        deleted_at: null,
        revision: (existing?.revision ?? 0) + 1,
      };
      rows.set(goalId, row);
      return { status: 'succeeded', row };
    },
    getRow: (id: string) => rows.get(id),
  };
}

function createFakeNoteTransport(seedRows: readonly NoteRow[] = []): SyncTransportRepository<NoteRow> & { getRow(id: string): NoteRow | undefined } {
  const rows = new Map<string, NoteRow>(seedRows.map((row) => [row.id, row]));
  return {
    async pull() {
      return { status: 'succeeded', page: { items: Array.from(rows.values()), nextCursor: null } };
    },
    async push(request) {
      const noteId = request.recordId;
      const existing = rows.get(noteId);
      if (request.operationType === 'delete') {
        if (existing === undefined) {
          return { status: 'succeeded', row: { id: noteId, user_id: USER_ID, trick_id: 'deleted', trick_name: 'deleted', body: 'deleted', practice_session_id: null, revision: 0, created_at: TIMESTAMP, updated_at: TIMESTAMP, deleted_at: TIMESTAMP } as NoteRow };
        }
        if (existing.deleted_at !== null) return { status: 'succeeded', row: existing };
        if (request.expectedRevision !== null && existing.revision !== request.expectedRevision) {
          return { status: 'conflict', conflict: { operationId: request.operationId, recordId: noteId, expectedRevision: request.expectedRevision, serverRevision: existing.revision, serverRow: existing } };
        }
        const tombstoned: NoteRow = { ...existing, deleted_at: TIMESTAMP, revision: existing.revision + 1 };
        rows.set(noteId, tombstoned);
        return { status: 'succeeded', row: tombstoned };
      }
      if (existing?.deleted_at) {
        return { status: 'conflict', conflict: { operationId: request.operationId, recordId: noteId, expectedRevision: request.expectedRevision, serverRevision: existing.revision, serverRow: existing } };
      }
      if (request.expectedRevision !== null && existing && existing.revision !== request.expectedRevision) {
        return { status: 'conflict', conflict: { operationId: request.operationId, recordId: noteId, expectedRevision: request.expectedRevision, serverRevision: existing.revision, serverRow: existing } };
      }
      const payload = request.payload as Record<string, unknown>;
      const row: NoteRow = {
        id: noteId,
        user_id: USER_ID,
        trick_id: (payload.trick_id as string) ?? '',
        trick_name: (payload.trick_name as string) ?? '',
        body: (payload.body as string) ?? '',
        practice_session_id: (payload.practice_session_id as string | null) ?? null,
        created_at: existing?.created_at ?? TIMESTAMP,
        updated_at: TIMESTAMP,
        deleted_at: null,
        revision: (existing?.revision ?? 0) + 1,
      };
      rows.set(noteId, row);
      return { status: 'succeeded', row };
    },
    getRow: (id: string) => rows.get(id),
  };
}


function createFakeCustomTrickTransport(seedRows: readonly CustomTrickRow[] = []): SyncTransportRepository<CustomTrickRow> & { getRow(id: string): CustomTrickRow | undefined } {
  const rows = new Map<string, CustomTrickRow>(seedRows.map((row) => [row.id, row]));
  return {
    async pull() {
      return { status: 'succeeded', page: { items: Array.from(rows.values()), nextCursor: null } };
    },
    async push(request) {
      const trickId = request.recordId;
      const existing = rows.get(trickId);
      if (request.operationType === 'delete') {
        rows.delete(trickId);
        return { status: 'succeeded', row: existing ?? ({ id: trickId, user_id: USER_ID, kind: 'standalone', name: 'deleted', kentei_rank: null, steps: null, revision: 0, created_at: TIMESTAMP, updated_at: TIMESTAMP } as CustomTrickRow) };
      }
      if (request.expectedRevision !== null && existing && existing.revision !== request.expectedRevision) {
        return { status: 'conflict', conflict: { operationId: request.operationId, recordId: trickId, expectedRevision: request.expectedRevision, serverRevision: existing.revision } };
      }
      const payload = request.payload as Record<string, unknown>;
      const row: CustomTrickRow = {
        id: trickId,
        user_id: USER_ID,
        kind: (payload.kind as 'standalone' | 'sequence') ?? 'standalone',
        name: (payload.name as string) ?? '',
        kentei_rank: (payload.kentei_rank as number | null) ?? null,
        steps: (payload.steps as CustomTrickRow['steps']) ?? null,
        created_at: TIMESTAMP,
        updated_at: TIMESTAMP,
        revision: (existing?.revision ?? 0) + 1,
      };
      rows.set(trickId, row);
      return { status: 'succeeded', row };
    },
    getRow: (id: string) => rows.get(id),
  };
}

function createFakeProfileTransport(seedProfile: ProfileRow, seedTrickStates: readonly UserTrickStateRow[]): ProfileSyncTransport & { getTrickState(trickId: string): UserTrickStateRow | undefined } {
  let profileRow: ProfileRow = seedProfile;
  const trickStates = new Map<string, UserTrickStateRow>(seedTrickStates.map((row) => [row.trick_id, row]));
  return {
    async pullProfileRow() {
      return { status: 'succeeded', page: { items: [profileRow], nextCursor: null } };
    },
    async pullTrickStatePage() {
      return { status: 'succeeded', page: { items: Array.from(trickStates.values()), nextCursor: null } };
    },
    async push(request) {
      if (request.recordId === USER_ID) {
        if (request.expectedRevision !== null && profileRow.revision !== request.expectedRevision) {
          return { status: 'conflict', conflict: { operationId: request.operationId, recordId: request.recordId, expectedRevision: request.expectedRevision, serverRevision: profileRow.revision } };
        }
        const payload = request.payload as Record<string, unknown>;
        profileRow = {
          user_id: USER_ID,
          has_completed_onboarding: (payload.has_completed_onboarding as boolean) ?? false,
          kentei_rank: (payload.kentei_rank as number | null) ?? null,
          last_sesh: (payload.last_sesh as ProfileRow['last_sesh']) ?? null,
          streak_threshold_ms: (payload.streak_threshold_ms as number | null) ?? null,
          theme_accent_color: (payload.theme_accent_color as string | null) ?? null,
          theme_background_color: (payload.theme_background_color as string | null) ?? null,
          theme_text_color: (payload.theme_text_color as string | null) ?? null,
          created_at: TIMESTAMP,
          updated_at: TIMESTAMP,
          revision: profileRow.revision + 1,
        };
        return { status: 'succeeded', row: profileRow };
      }
      const trickId = request.recordId;
      const existing = trickStates.get(trickId);
      if (request.operationType === 'delete') {
        trickStates.delete(trickId);
        return { status: 'succeeded', row: existing ?? { id: trickId, user_id: USER_ID, trick_id: trickId, is_selected: false, is_manually_unlocked: false, revision: 0, created_at: TIMESTAMP, updated_at: TIMESTAMP } };
      }
      if (request.expectedRevision !== null && existing && existing.revision !== request.expectedRevision) {
        return { status: 'conflict', conflict: { operationId: request.operationId, recordId: trickId, expectedRevision: request.expectedRevision, serverRevision: existing.revision } };
      }
      const payload = request.payload as Record<string, unknown>;
      const row: UserTrickStateRow = {
        id: existing?.id ?? `row-${trickId}`,
        user_id: USER_ID,
        trick_id: trickId,
        is_selected: (payload.is_selected as boolean) ?? false,
        is_manually_unlocked: (payload.is_manually_unlocked as boolean) ?? false,
        created_at: TIMESTAMP,
        updated_at: TIMESTAMP,
        revision: (existing?.revision ?? 0) + 1,
      };
      trickStates.set(trickId, row);
      return { status: 'succeeded', row };
    },
    getTrickState: (trickId: string) => trickStates.get(trickId),
  };
}


function IdentityHandleTestProvider({ children }: PropsWithChildren) {
  const [handle] = useState(() => {
    const context = createIdentityContext(USER_IDENTITY);
    return { identity: USER_IDENTITY, generation: context.getGeneration(), context };
  });
  return <IdentityHandleContext.Provider value={handle}>{children}</IdentityHandleContext.Provider>;
}

interface Captured {
  status?: ReturnType<typeof useSyncCoordinatorStatus>;
  goals?: ReturnType<typeof useGoals>;
  goalActions?: ReturnType<typeof useGoalActions>;
  goalSync?: ReturnType<typeof useGoalSync>;
  notes?: ReturnType<typeof useNotes>;
  noteActions?: ReturnType<typeof useNoteActions>;
  noteSync?: ReturnType<typeof useNoteSync>;
  customTricks?: ReturnType<typeof useCustomTricks>;
  customTrickActions?: ReturnType<typeof useCustomTrickActions>;
  customTrickSync?: ReturnType<typeof useCustomTrickSync>;
  profile?: ReturnType<typeof useUserProfile>;
  profileActions?: ReturnType<typeof useUserProfileActions>;
  profileSync?: ReturnType<typeof useUserProfileSync>;
}

function makeActionsExposer(captured: Captured) {
  return function ActionsExposer() {
    const status = useSyncCoordinatorStatus();
    const goals = useGoals();
    const goalActions = useGoalActions();
    const goalSync = useGoalSync();
    const notes = useNotes();
    const noteActions = useNoteActions();
    const noteSync = useNoteSync();
    const customTricks = useCustomTricks();
    const customTrickActions = useCustomTrickActions();
    const customTrickSync = useCustomTrickSync();
    const profile = useUserProfile();
    const profileActions = useUserProfileActions();
    const profileSync = useUserProfileSync();

    useEffect(() => {
      captured.status = status;
      captured.goals = goals;
      captured.goalActions = goalActions;
      captured.goalSync = goalSync;
      captured.notes = notes;
      captured.noteActions = noteActions;
      captured.noteSync = noteSync;
      captured.customTricks = customTricks;
      captured.customTrickActions = customTrickActions;
      captured.customTrickSync = customTrickSync;
      captured.profile = profile;
      captured.profileActions = profileActions;
      captured.profileSync = profileSync;
    });

    return null;
  };
}

async function mountHarness(captured: Captured) {
  const ActionsExposer = makeActionsExposer(captured);
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(
      <IdentityHandleTestProvider>
        <CustomTrickProvider>
          <UserProfileProvider>
            <PracticeHistoryProvider>
              <NoteProvider>
                <GoalProvider>
                  <SyncCoordinatorProvider>
                    <ActionsExposer />
                  </SyncCoordinatorProvider>
                </GoalProvider>
              </NoteProvider>
            </PracticeHistoryProvider>
          </UserProfileProvider>
        </CustomTrickProvider>
      </IdentityHandleTestProvider>,
    );
  });
  return root;
}

async function flush(times = 6) {
  for (let i = 0; i < times; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}


describe('Cross-domain sync fault injection (fully wired)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    mockCreateProfileSyncTransportAdapter.mockReset();
    mockCreateCustomTrickSyncTransportAdapter.mockReset();
    mockCreateGoalSyncTransportAdapter.mockReset();
    mockCreateNoteSyncTransportAdapter.mockReset();
    mockCreatePracticeHistorySyncTransportAdapter.mockReset();
  });

  it('one conflicting record pauses while accepted operations across every other domain advance in the same run, and resolving it never disturbs siblings', async () => {
    const seededGoal: GoalRow = { id: 'goal-seed', user_id: USER_ID, trick_id: 'big-cup', trick_name: 'Big cup', kind: 'count', target_count: 10, target_ms: null, created_at: TIMESTAMP, updated_at: TIMESTAMP, deleted_at: null, revision: 1 };
    const goalTransport = createFakeGoalTransport([seededGoal]);
    mockCreateGoalSyncTransportAdapter.mockReturnValue(goalTransport);

    const seededNote: NoteRow = { id: 'note-seed', user_id: USER_ID, trick_id: 'big-cup', trick_name: 'Big cup', body: 'Original note.', practice_session_id: null, created_at: TIMESTAMP, updated_at: TIMESTAMP, deleted_at: null, revision: 1 };
    const noteTransport = createFakeNoteTransport([seededNote]);
    mockCreateNoteSyncTransportAdapter.mockReturnValue(noteTransport);

    const seededTrick: CustomTrickRow = { id: 'custom-seed', user_id: USER_ID, kind: 'standalone', name: 'Original trick', kentei_rank: null, steps: null, created_at: TIMESTAMP, updated_at: TIMESTAMP, revision: 1 } as CustomTrickRow;
    const customTrickTransport = createFakeCustomTrickTransport([seededTrick]);
    mockCreateCustomTrickSyncTransportAdapter.mockReturnValue(customTrickTransport);

    const seededProfile: ProfileRow = { user_id: USER_ID, has_completed_onboarding: true, kentei_rank: 5, last_sesh: null, streak_threshold_ms: null, theme_accent_color: null, theme_background_color: null, theme_text_color: null, created_at: TIMESTAMP, updated_at: TIMESTAMP, revision: 1 };
    const seededTrickState: UserTrickStateRow = { id: 'row-big-cup', user_id: USER_ID, trick_id: 'big-cup', is_selected: true, is_manually_unlocked: false, created_at: TIMESTAMP, updated_at: TIMESTAMP, revision: 1 };
    const profileTransport = createFakeProfileTransport(seededProfile, [seededTrickState]);
    mockCreateProfileSyncTransportAdapter.mockReturnValue(profileTransport);

    mockCreatePracticeHistorySyncTransportAdapter.mockReturnValue({
      async pull() {
        return { status: 'succeeded', page: { items: [], nextCursor: null } };
      },
      async push() {
        return { status: 'failed', error: { kind: 'network', message: 'not exercised in this test' } };
      },
    });

    const captured: Captured = {};
    const root = await mountHarness(captured);

    // Adopt every seed via the automatic login sync.
    await flush();
    expect(captured.goals?.goals).toHaveLength(1);
    expect(captured.notes?.notes).toHaveLength(1);
    expect(captured.customTricks?.tricks).toHaveLength(1);
    expect(captured.profile?.selectedTrickIds).toContain('big-cup');

    // Interleaved batch: edit the seeded goal locally (will conflict), and
    // make valid, unrelated edits to the profile trick-state, the custom
    // trick, and the note -- all queued before any push happens.
    act(() => {
      captured.goalActions?.editGoal('goal-seed', { kind: 'count', targetCount: 42 });
    });
    act(() => {
      captured.noteActions?.updateNote('note-seed', { body: 'Edited note.' });
    });
    act(() => {
      captured.customTrickActions?.updateCustomTrick('custom-seed', { kind: 'standalone', name: 'Edited trick' });
    });
    act(() => {
      captured.profileActions?.toggleSelectedTrick('big-cup');
    });
    await flush();

    // A concurrent write from another device lands on the goal server-side
    // before this run's push -- this device's still-pending goal op (cached
    // expectedRevision 1) will genuinely conflict.
    await goalTransport.push({
      operationId: 'seed-conflict',
      recordId: 'goal-seed',
      operationType: 'upsert',
      payload: { user_id: USER_ID, id: 'goal-seed', trick_id: 'big-cup', trick_name: 'Big cup', kind: 'count', target_count: 999, target_ms: null },
      expectedRevision: 1,
    });

    await act(async () => {
      captured.status?.retry();
    });
    await flush();

    // The goal record's conflict resolves automatically (T187.2): this
    // device's local edit was made via the real `editGoal` action just
    // now (real-time `updatedAt`), strictly later than the concurrent
    // write's fixed `TIMESTAMP` above, so local wins and is re-queued as a
    // fresh pending operation instead of being parked. Conflicts are never
    // surfaced at the coordinator level any more.
    expect(captured.status?.conflictCount).toBe(0);
    expect(captured.goalSync?.pendingCount).toBe(1);

    // Every other domain's edit pushed and was acknowledged: zero pending
    // in that domain specifically.
    expect(captured.noteSync?.pendingCount).toBe(0);
    expect(captured.customTrickSync?.pendingCount).toBe(0);
    expect(captured.profileSync?.pendingCount).toBe(0);

    // The three valid edits actually landed server-side.
    expect(noteTransport.getRow('note-seed')?.body).toBe('Edited note.');
    expect(customTrickTransport.getRow('custom-seed')?.name).toBe('Edited trick');
    // Unselecting a trick with no manual unlock removes its row entirely
    // (profile's own upsert-vs-delete diffing rule) -- the row's absence is
    // the proof this unrelated edit landed.
    expect(profileTransport.getTrickState('big-cup')).toBeUndefined();

    // The goal collection still shows the local (winning) edit, not the
    // conflicting server value -- it just hasn't been re-pushed yet.
    const goalAfterConflict = captured.goals?.goals.find((goal) => goal.id === 'goal-seed');
    expect(goalAfterConflict?.kind === 'count' ? goalAfterConflict.targetCount : undefined).toBe(42);
    expect(goalTransport.getRow('goal-seed')?.target_count).toBe(999);

    // Automatic resolution of the goal record must not disturb any other
    // domain's already-settled state. (A follow-up `retry()` legitimately
    // re-pulls and re-adopts every domain with an empty outbox -- so this
    // checks the settled *facts* -- pending count, and the values that
    // matter -- rather than exact object identity, which a routine
    // pull-adopt is expected to change regardless of any conflict.)
    expect(captured.noteSync?.pendingCount).toBe(0);
    expect(captured.customTrickSync?.pendingCount).toBe(0);
    expect(captured.profileSync?.pendingCount).toBe(0);

    // A follow-up retry fully converges: the local goal edit (the
    // automatically-chosen winner) now pushes cleanly against the
    // server's advanced revision.
    await act(async () => {
      captured.status?.retry();
    });
    await flush();

    expect(captured.status?.pendingCount).toBe(0);
    expect(captured.status?.conflictCount).toBe(0);
    expect(captured.status?.syncStatus.kind).toBe('synced');
    expect(goalTransport.getRow('goal-seed')?.target_count).toBe(42);

    expect(captured.notes?.notes.find((note) => note.id === 'note-seed')?.body).toBe('Edited note.');
    expect(captured.customTricks?.tricks.find((trick) => trick.id === 'custom-seed')?.name).toBe('Edited trick');
    expect(captured.profile?.selectedTrickIds).not.toContain('big-cup');
    expect(captured.noteSync?.pendingCount).toBe(0);
    expect(captured.customTrickSync?.pendingCount).toBe(0);
    expect(captured.profileSync?.pendingCount).toBe(0);

    act(() => {
      root.unmount();
    });
  });


  it('a tombstone-vs-edit race on one note parks only that note while valid cross-domain operations in the same run fully apply', async () => {
    const seededGoal: GoalRow = { id: 'goal-seed', user_id: USER_ID, trick_id: 'big-cup', trick_name: 'Big cup', kind: 'count', target_count: 10, target_ms: null, created_at: TIMESTAMP, updated_at: TIMESTAMP, deleted_at: null, revision: 1 };
    const goalTransport = createFakeGoalTransport([seededGoal]);
    mockCreateGoalSyncTransportAdapter.mockReturnValue(goalTransport);

    const seededNote: NoteRow = { id: 'note-tombstoned', user_id: USER_ID, trick_id: 'big-cup', trick_name: 'Big cup', body: 'Was active.', practice_session_id: null, created_at: TIMESTAMP, updated_at: TIMESTAMP, deleted_at: null, revision: 1 };
    const noteTransport = createFakeNoteTransport([seededNote]);
    mockCreateNoteSyncTransportAdapter.mockReturnValue(noteTransport);

    const seededTrick: CustomTrickRow = { id: 'custom-seed', user_id: USER_ID, kind: 'standalone', name: 'Original trick', kentei_rank: null, steps: null, created_at: TIMESTAMP, updated_at: TIMESTAMP, revision: 1 } as CustomTrickRow;
    const customTrickTransport = createFakeCustomTrickTransport([seededTrick]);
    mockCreateCustomTrickSyncTransportAdapter.mockReturnValue(customTrickTransport);

    const seededProfile: ProfileRow = { user_id: USER_ID, has_completed_onboarding: true, kentei_rank: 5, last_sesh: null, streak_threshold_ms: null, theme_accent_color: null, theme_background_color: null, theme_text_color: null, created_at: TIMESTAMP, updated_at: TIMESTAMP, revision: 1 };
    const seededTrickState: UserTrickStateRow = { id: 'row-big-cup', user_id: USER_ID, trick_id: 'big-cup', is_selected: true, is_manually_unlocked: false, created_at: TIMESTAMP, updated_at: TIMESTAMP, revision: 1 };
    const profileTransport = createFakeProfileTransport(seededProfile, [seededTrickState]);
    mockCreateProfileSyncTransportAdapter.mockReturnValue(profileTransport);

    mockCreatePracticeHistorySyncTransportAdapter.mockReturnValue({
      async pull() {
        return { status: 'succeeded', page: { items: [], nextCursor: null } };
      },
      async push() {
        return { status: 'failed', error: { kind: 'network', message: 'not exercised in this test' } };
      },
    });

    const captured: Captured = {};
    const root = await mountHarness(captured);
    await flush();
    expect(captured.notes?.notes).toHaveLength(1);

    // Interleaved batch: a stale local edit against the note that's about
    // to be tombstoned server-side, plus valid edits in every other domain.
    act(() => {
      captured.noteActions?.updateNote('note-tombstoned', { body: 'Resurrection attempt.' });
    });
    act(() => {
      captured.goalActions?.editGoal('goal-seed', { kind: 'count', targetCount: 55 });
    });
    act(() => {
      captured.customTrickActions?.updateCustomTrick('custom-seed', { kind: 'standalone', name: 'Edited trick' });
    });
    act(() => {
      captured.profileActions?.toggleSelectedTrick('big-cup');
    });
    await flush();

    // Another device tombstones the note server-side before this run's push.
    await noteTransport.push({
      operationId: 'seed-tombstone',
      recordId: 'note-tombstoned',
      operationType: 'delete',
      payload: null,
      expectedRevision: 1,
    });
    expect(noteTransport.getRow('note-tombstoned')?.deleted_at).not.toBeNull();

    await act(async () => {
      captured.status?.retry();
    });
    await flush();

    // The tombstone-vs-edit race surfaces as a real conflict, per
    // `use-note-domain-sync.ts` (confirmed above: notes classify a
    // tombstone-vs-edit push outcome as `'conflict'`, unlike custom-tricks'
    // hard-delete `'failed'` shape). It resolves automatically (T187.2):
    // this device's local edit was made via the real `updateNote` action
    // just now (real-time `updatedAt`), strictly later than the
    // tombstoning write's fixed `TIMESTAMP`, so local wins and is
    // re-queued instead of being parked -- but it parks only that one
    // note's resolution (a fresh pending op), never resurrecting the row
    // server-side (the transport's own tombstone-rejection posture
    // rejects any upsert against an already-tombstoned row regardless of
    // revision, so the re-queued local edit stays pending rather than
    // ever landing).
    expect(captured.status?.conflictCount).toBe(0);
    expect(captured.noteSync?.pendingCount).toBe(1);
    // The server-side row was never resurrected -- it stays exactly as the
    // tombstoning device left it, regardless of what this device's local
    // (still-unresolved) collection shows for its own pending edit.
    expect(noteTransport.getRow('note-tombstoned')?.body).toBe('Was active.');

    // Every other domain's valid edit in the same run fully applied.
    expect(captured.goalSync?.pendingCount).toBe(0);
    expect(captured.customTrickSync?.pendingCount).toBe(0);
    expect(captured.profileSync?.pendingCount).toBe(0);
    expect(goalTransport.getRow('goal-seed')?.target_count).toBe(55);
    expect(customTrickTransport.getRow('custom-seed')?.name).toBe('Edited trick');
    expect(profileTransport.getTrickState('big-cup')).toBeUndefined();

    act(() => {
      root.unmount();
    });
  });
});
