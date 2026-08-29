// T160.3: two independent live browser fixtures sharing one simulated
// cloud (the same fake-transport instance/backing row `Map` per domain,
// injected into two separately-mounted provider trees), converging through
// concurrent edits, a genuine conflict, and a lost-acknowledgement replay.
// Every existing "second-browser" test elsewhere in the sync suite pulls a
// single static seeded fixture into one fresh envelope -- this file is the
// only place two live clients actually mutate the same simulated cloud
// concurrently and are proven to converge on identical domain state.
// Reuses the mounting/mocking scaffold from
// `sync-coordinator.sesh-isolation.test.tsx` (minus `Sesh`) and the fake
// transports from `cross-domain-conflict-fault-injection.integration.test.tsx`
// (duplicated locally per-file, since `jest.mock` factories are scoped to
// the file that declares them).

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
        return { status: 'conflict', conflict: { operationId: request.operationId, recordId: goalId, expectedRevision: request.expectedRevision, serverRevision: existing.revision } };
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
          return { status: 'conflict', conflict: { operationId: request.operationId, recordId: noteId, expectedRevision: request.expectedRevision, serverRevision: existing.revision } };
        }
        const tombstoned: NoteRow = { ...existing, deleted_at: TIMESTAMP, revision: existing.revision + 1 };
        rows.set(noteId, tombstoned);
        return { status: 'succeeded', row: tombstoned };
      }
      if (existing?.deleted_at) {
        return { status: 'conflict', conflict: { operationId: request.operationId, recordId: noteId, expectedRevision: request.expectedRevision, serverRevision: existing.revision } };
      }
      if (request.expectedRevision !== null && existing && existing.revision !== request.expectedRevision) {
        return { status: 'conflict', conflict: { operationId: request.operationId, recordId: noteId, expectedRevision: request.expectedRevision, serverRevision: existing.revision } };
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


describe('Two-browser convergence (fully wired, shared simulated cloud)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    mockCreateProfileSyncTransportAdapter.mockReset();
    mockCreateCustomTrickSyncTransportAdapter.mockReset();
    mockCreateGoalSyncTransportAdapter.mockReset();
    mockCreateNoteSyncTransportAdapter.mockReset();
    mockCreatePracticeHistorySyncTransportAdapter.mockReset();
  });

  it('two independently-mounted browsers converge to identical domain state through concurrent edits, a conflict, and a lost-acknowledgement replay', async () => {
    const sharedGoalTransport = createFakeGoalTransport();
    mockCreateGoalSyncTransportAdapter.mockReturnValue(sharedGoalTransport);
    const sharedNoteTransport = createFakeNoteTransport();
    mockCreateNoteSyncTransportAdapter.mockReturnValue(sharedNoteTransport);
    const sharedCustomTrickTransport = createFakeCustomTrickTransport();
    mockCreateCustomTrickSyncTransportAdapter.mockReturnValue(sharedCustomTrickTransport);
    const sharedSeedProfile: ProfileRow = { user_id: USER_ID, has_completed_onboarding: true, kentei_rank: 5, last_sesh: null, streak_threshold_ms: null, theme_accent_color: null, theme_background_color: null, theme_text_color: null, created_at: TIMESTAMP, updated_at: TIMESTAMP, revision: 0 };
    const sharedProfileTransport = createFakeProfileTransport(sharedSeedProfile, []);
    mockCreateProfileSyncTransportAdapter.mockReturnValue(sharedProfileTransport);
    mockCreatePracticeHistorySyncTransportAdapter.mockReturnValue({
      async pull() {
        return { status: 'succeeded', page: { items: [], nextCursor: null } };
      },
      async push() {
        return { status: 'failed', error: { kind: 'network', message: 'not exercised in this test' } };
      },
    });

    // 1. Mount Browser A only. Create one record in each mutable domain.
    const browserA: Captured = {};
    const rootA = await mountHarness(browserA);
    await flush();

    let goalId!: string;
    act(() => {
      const result = browserA.goalActions?.addGoal({ kind: 'count', trickId: 'big-cup', trickName: 'Big cup', targetCount: 5 });
      if (result?.status === 'saved') goalId = result.goal.id;
    });
    let sharedNoteId!: string;
    act(() => {
      const result = browserA.noteActions?.addNote({ trickId: 'big-cup', trickName: 'Big cup', body: 'Baseline note.' });
      if (result?.status === 'saved') sharedNoteId = result.note.id;
    });
    act(() => {
      browserA.customTrickActions?.addCustomTrick({ kind: 'standalone', name: 'Baseline trick' });
    });
    act(() => {
      browserA.profileActions?.toggleSelectedTrick('big-cup');
    });
    await flush();

    await act(async () => {
      browserA.status?.retry();
    });
    await flush();

    expect(sharedGoalTransport.getRow(goalId)?.target_count).toBe(5);
    expect(sharedNoteTransport.getRow(sharedNoteId)?.body).toBe('Baseline note.');
    expect(browserA.customTricks?.tricks).toHaveLength(1);
    expect(browserA.goalSync?.pendingCount).toBe(0);
    expect(browserA.noteSync?.pendingCount).toBe(0);
    expect(browserA.customTrickSync?.pendingCount).toBe(0);
    expect(browserA.profileSync?.pendingCount).toBe(0);

    // A's own outbox is now empty -- run one more retry so A's local view
    // converges onto the server-canonical composed collection (the same
    // full pull-adopt path Browser B is about to take fresh). Without this,
    // A's still-optimistic local `createdAt` (from `Date.now()` at creation
    // time) would differ from the server-derived value B pulls, which is a
    // real, expected characteristic of this sync design (the outbox upsert
    // payload deliberately omits `created_at`/`revision`/`updated_at` --
    // see `goal-cloud-mapping.ts`), not a bug -- it just means "identical
    // domain state across two browsers" is only meaningful once both sides
    // have actually completed a full sync round.
    await act(async () => {
      browserA.status?.retry();
    });
    await flush();

    // 2. Mount Browser B. Pull-adopt against the same simulated cloud.
    const browserB: Captured = {};
    const rootB = await mountHarness(browserB);
    await flush();
    await act(async () => {
      browserB.status?.retry();
    });
    await flush();

    expect(browserB.goals).toEqual(browserA.goals);
    expect(browserB.notes).toEqual(browserA.notes);
    expect(browserB.customTricks).toEqual(browserA.customTricks);
    expect(browserB.profile).toEqual(browserA.profile);

    // 3. Concurrent conflicting + valid edits, no sync yet on either side.
    act(() => {
      browserA.goalActions?.editGoal(goalId, { kind: 'count', targetCount: 100 });
    });
    let newNoteAId!: string;
    act(() => {
      const result = browserA.noteActions?.addNote({ trickId: 'big-cup', trickName: 'Big cup', body: "A's new note." });
      if (result?.status === 'saved') newNoteAId = result.note.id;
    });
    await flush();

    act(() => {
      browserB.goalActions?.editGoal(goalId, { kind: 'count', targetCount: 200 });
    });
    act(() => {
      browserB.customTrickActions?.addCustomTrick({ kind: 'standalone', name: "B's new trick" });
    });
    await flush();

    // 4. Sync A first: its goal edit and new note push cleanly (A was
    // still at the revision it pulled).
    await act(async () => {
      browserA.status?.retry();
    });
    await flush();
    expect(sharedGoalTransport.getRow(goalId)?.target_count).toBe(100);
    expect(sharedNoteTransport.getRow(newNoteAId)?.body).toBe("A's new note.");
    expect(browserA.status?.conflictCount).toBe(0);

    // 5. Sync B: its goal edit now conflicts (stale revision against A's
    // just-applied write) -- while B's new custom trick still pushes
    // successfully (unrelated record, unrelated domain).
    await act(async () => {
      browserB.status?.retry();
    });
    await flush();
    expect(browserB.status?.conflictCount).toBe(1);
    expect(browserB.status?.conflicts[0]?.domain).toBe('goals');
    expect(browserB.status?.conflicts[0]?.recordId).toBe(goalId);
    const bNewTrick = browserB.customTricks?.tricks.find((trick) => trick.name === "B's new trick");
    expect(bNewTrick).toBeDefined();
    expect(sharedCustomTrickTransport.getRow(bNewTrick!.id)).toBeDefined();

    // 6. Resolve B's conflict with 'server' (adopt A's value) -- the
    // less-covered "keep-server, discard local" branch. Sync B again.
    await act(async () => {
      await browserB.status?.resolveConflict('goals', goalId, 'server');
    });
    await flush();
    expect(browserB.status?.conflictCount).toBe(0);
    await act(async () => {
      browserB.status?.retry();
    });
    await flush();
    expect(browserB.status?.pendingCount).toBe(0);
    const bGoalAfterResolve = browserB.goals?.goals.find((goal) => goal.id === goalId);
    expect(bGoalAfterResolve?.kind === 'count' ? bGoalAfterResolve.targetCount : undefined).toBe(100);
    expect(browserB.notes?.notes.some((note) => note.id === newNoteAId)).toBe(true);

    // 7. Sync A once more so it pulls B's new custom trick (A's outbox was
    // empty going into this round, so this is a full pull-adopt).
    await act(async () => {
      browserA.status?.retry();
    });
    await flush();
    expect(browserA.customTricks?.tricks.some((trick) => trick.name === "B's new trick")).toBe(true);

    // 9. Idempotency/lost-ack fold-in: a third write reaches the shared
    // note's backing row whose ack reached neither browser (out-of-band,
    // bypassing both browsers' own outboxes entirely). Run each browser's
    // sync twice in a row without any new local edit in between.
    const sharedNoteRevisionBeforeOutOfBand = sharedNoteTransport.getRow(sharedNoteId)!.revision;
    await sharedNoteTransport.push({
      operationId: 'out-of-band-lost-ack',
      recordId: sharedNoteId,
      operationType: 'upsert',
      payload: { user_id: USER_ID, id: sharedNoteId, trick_id: 'big-cup', trick_name: 'Big cup', body: 'Out-of-band update.', practice_session_id: null },
      expectedRevision: sharedNoteRevisionBeforeOutOfBand,
    });
    expect(sharedNoteTransport.getRow(sharedNoteId)?.revision).toBe(sharedNoteRevisionBeforeOutOfBand + 1);

    for (let i = 0; i < 2; i += 1) {
      await act(async () => {
        browserA.status?.retry();
      });
      await flush();
      await act(async () => {
        browserB.status?.retry();
      });
      await flush();
    }

    expect(browserA.status?.conflictCount).toBe(0);
    expect(browserB.status?.conflictCount).toBe(0);
    expect(sharedNoteTransport.getRow(sharedNoteId)?.revision).toBe(sharedNoteRevisionBeforeOutOfBand + 1);

    // 8/Final: both sides fully converged -- identical domain state, both
    // new records present on both sides, the shared goal reads A's value
    // everywhere, the shared note reads the out-of-band content
    // everywhere, and neither side has any remaining pending/conflicting
    // operations.
    expect(browserA.status?.pendingCount).toBe(0);
    expect(browserA.status?.conflictCount).toBe(0);
    expect(browserB.status?.pendingCount).toBe(0);
    expect(browserB.status?.conflictCount).toBe(0);
    expect(browserA.goals).toEqual(browserB.goals);
    expect(browserA.notes).toEqual(browserB.notes);
    expect(browserA.customTricks).toEqual(browserB.customTricks);
    expect(browserA.profile).toEqual(browserB.profile);

    const finalGoalA = browserA.goals?.goals.find((goal) => goal.id === goalId);
    expect(finalGoalA?.kind === 'count' ? finalGoalA.targetCount : undefined).toBe(100);
    expect(browserA.notes?.notes.find((note) => note.id === sharedNoteId)?.body).toBe('Out-of-band update.');
    expect(browserA.notes?.notes.some((note) => note.id === newNoteAId)).toBe(true);
    expect(browserB.notes?.notes.some((note) => note.id === newNoteAId)).toBe(true);
    expect(browserA.customTricks?.tricks.some((trick) => trick.name === "B's new trick")).toBe(true);
    expect(browserB.customTricks?.tricks.some((trick) => trick.name === "B's new trick")).toBe(true);

    act(() => {
      rootA.unmount();
    });
    act(() => {
      rootB.unmount();
    });
  });
});
