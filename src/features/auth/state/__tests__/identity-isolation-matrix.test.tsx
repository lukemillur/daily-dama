import { afterEach, describe, expect, it, jest } from '@jest/globals';
import type { AuthChangeEvent, Session, SupabaseClient } from '@supabase/supabase-js';
import { useEffect } from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { AuthProvider } from '@/features/auth/state/auth-provider';
import { CustomTrickProvider, useCustomTricks, useCustomTrickActions } from '@/features/custom-tricks/state/custom-trick-provider';
import {
  CUSTOM_TRICKS_STORAGE_KEY,
  deserializeCustomTricks,
  serializeCustomTricks,
} from '@/features/custom-tricks/persistence/custom-trick-persistence';
import { createCustomTrick } from '@/features/custom-tricks/model/custom-trick';
import { GoalProvider, useGoals, useGoalActions } from '@/features/goals/state/goal-provider';
import { GOALS_STORAGE_KEY, deserializeGoals, serializeGoals } from '@/features/goals/persistence/goal-persistence';
import { NoteProvider, useNotes, useNoteActions } from '@/features/notes/state/note-provider';
import { NOTES_STORAGE_KEY, deserializeNotes, serializeNotes } from '@/features/notes/persistence/note-persistence';
import {
  useUserProfile,
  useUserProfileActions,
  UserProfileProvider,
} from '@/features/profile/state/user-profile-provider';
import {
  USER_PROFILE_STORAGE_KEY,
  serializeUserProfile,
} from '@/features/profile/persistence/user-profile-persistence';
import type { PracticeTrick } from '@/features/tricks/model/trick';
import {
  PracticeHistoryProvider,
  usePracticeHistory,
  usePracticeHistoryActions,
} from '@/features/stats/state/practice-history-provider';
import {
  PRACTICE_HISTORY_STORAGE_KEY,
  deserializePracticeHistory,
  serializePracticeHistory,
} from '@/features/stats/persistence/practice-history-persistence';
import { GUEST_IDENTITY } from '@/shared/persistence/identity';
import { IdentityProvider } from '@/shared/persistence/identity-provider';
import { physicalKey } from '@/shared/persistence/scoped-storage';

// T156.3's own exit criteria: a single automated matrix proving that guest, user A, and user B
// each render, write, and re-visit only their own fixtures across all five identity-scoped
// domains, and that a late hydration result and a late queued write are both discarded after
// switching identity mid-flight. `identity-rehydration.test.tsx` (T156.2) proved the load-race
// and one write-leak case on two representative domains (profile, custom tricks) -- this file
// extends that same real five-provider tree to all five domains and adds the late-write race
// T156.2 deliberately deferred.
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required by jest hoisting
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-reanimated', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required by jest hoisting
  require('react-native-reanimated/mock'),
);

const mockGetSupabaseClient = jest.fn();
jest.mock('@/shared/supabase/supabase-client', () => ({
  getSupabaseClient: () => mockGetSupabaseClient(),
}));

const USER_A_ID = '11111111-1111-1111-1111-111111111111';
const USER_B_ID = '22222222-2222-2222-2222-222222222222';
const USER_A_IDENTITY = { kind: 'user', userId: USER_A_ID } as const;
const USER_B_IDENTITY = { kind: 'user', userId: USER_B_ID } as const;

type AuthCallback = (event: AuthChangeEvent, session: Session | null) => void;

function createFakeClient() {
  let capturedCallback: AuthCallback | undefined;
  const onAuthStateChange = jest.fn((cb: AuthCallback) => {
    capturedCallback = cb;
    return { data: { subscription: { unsubscribe: jest.fn() } } };
  });
  const client = { auth: { onAuthStateChange } } as unknown as SupabaseClient;
  return {
    client,
    emit: (event: AuthChangeEvent, session: Session | null) => capturedCallback?.(event, session),
  };
}

function sessionWithUserId(id: string): Session {
  return { access_token: 't', user: { id } } as unknown as Session;
}

const PRACTICE_TRICK: PracticeTrick = { id: 'some-trick-id', name: 'Some Trick' };

async function seedAllDomains(tag: string, identity = GUEST_IDENTITY) {
  await AsyncStorage.setItem(
    physicalKey(identity, USER_PROFILE_STORAGE_KEY),
    serializeUserProfile({
      hasCompletedOnboarding: true,
      kenteiRank: tag.length, // distinguishable, deterministic per tag
      selectedTrickIds: [],
      manuallyUnlockedTrickIds: [],
    }),
  );
  await AsyncStorage.setItem(
    physicalKey(identity, CUSTOM_TRICKS_STORAGE_KEY),
    serializeCustomTricks({
      tricks: [createCustomTrick(`trick-${tag}`, { kind: 'standalone', name: `${tag}-trick` }, 0)],
    }),
  );
  await AsyncStorage.setItem(
    physicalKey(identity, PRACTICE_HISTORY_STORAGE_KEY),
    serializePracticeHistory({
      sessions: [
        {
          id: `session-${tag}`,
          trickId: 'some-trick-id',
          trickName: `${tag}-trick`,
          startedAt: 0,
          completedAt: 1000,
          durationMs: 1000,
          laceCount: 1,
        },
      ],
    }),
  );
  await AsyncStorage.setItem(
    physicalKey(identity, GOALS_STORAGE_KEY),
    serializeGoals({
      goals: [
        {
          id: `goal-${tag}`,
          trickId: 'some-trick-id',
          trickName: `${tag}-trick`,
          kind: 'count',
          targetCount: 5,
          createdAt: 0,
          updatedAt: 0,
        },
      ],
    }),
  );
  await AsyncStorage.setItem(
    physicalKey(identity, NOTES_STORAGE_KEY),
    serializeNotes({
      notes: [
        {
          id: `note-${tag}`,
          trickId: 'some-trick-id',
          trickName: `${tag}-trick`,
          body: `${tag}-note`,
          createdAt: 0,
          updatedAt: 0,
        },
      ],
    }),
  );
}

const captured: {
  kenteiRank?: number;
  firstTrickName?: string;
  firstSessionId?: string;
  firstGoalId?: string;
  firstNoteBody?: string;
  toggleSelectedTrick?: (trickId: string) => void;
  addCustomTrick?: ReturnType<typeof useCustomTrickActions>['addCustomTrick'];
  recordCompletedSesh?: ReturnType<typeof usePracticeHistoryActions>['recordCompletedSesh'];
  addGoal?: ReturnType<typeof useGoalActions>['addGoal'];
  addNote?: ReturnType<typeof useNoteActions>['addNote'];
} = {};

function resetCaptured() {
  captured.kenteiRank = undefined;
  captured.firstTrickName = undefined;
  captured.firstSessionId = undefined;
  captured.firstGoalId = undefined;
  captured.firstNoteBody = undefined;
  captured.toggleSelectedTrick = undefined;
  captured.addCustomTrick = undefined;
  captured.recordCompletedSesh = undefined;
  captured.addGoal = undefined;
  captured.addNote = undefined;
}

function Harness() {
  const profile = useUserProfile();
  const { toggleSelectedTrick } = useUserProfileActions();
  const { tricks } = useCustomTricks();
  const { addCustomTrick } = useCustomTrickActions();
  const { sessions } = usePracticeHistory();
  const { recordCompletedSesh } = usePracticeHistoryActions();
  const { goals } = useGoals();
  const { addGoal } = useGoalActions();
  const { notes } = useNotes();
  const { addNote } = useNoteActions();

  useEffect(() => {
    captured.kenteiRank = profile.kenteiRank;
    captured.firstTrickName = tricks[0]?.name;
    captured.firstSessionId = sessions[0]?.id;
    captured.firstGoalId = goals[0]?.id;
    captured.firstNoteBody = notes[0]?.body;
    captured.toggleSelectedTrick = toggleSelectedTrick;
    captured.addCustomTrick = addCustomTrick;
    captured.recordCompletedSesh = recordCompletedSesh;
    captured.addGoal = addGoal;
    captured.addNote = addNote;
  });

  return <Text>{profile.kenteiRank}</Text>;
}

async function mount(fake: ReturnType<typeof createFakeClient>) {
  mockGetSupabaseClient.mockReturnValue(fake.client);
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(
      <AuthProvider>
        <IdentityProvider>
          <CustomTrickProvider>
            <UserProfileProvider>
              <PracticeHistoryProvider>
                <NoteProvider>
                  <GoalProvider>
                    <Harness />
                  </GoalProvider>
                </NoteProvider>
              </PracticeHistoryProvider>
            </UserProfileProvider>
          </CustomTrickProvider>
        </IdentityProvider>
      </AuthProvider>,
    );
  });
  return root;
}

function expectFixturesFor(tag: string) {
  expect(captured.firstTrickName).toBe(`${tag}-trick`);
  expect(captured.firstSessionId).toBe(`session-${tag}`);
  expect(captured.firstGoalId).toBe(`goal-${tag}`);
  expect(captured.firstNoteBody).toBe(`${tag}-note`);
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('identity isolation matrix (real five-provider tree, all five domains)', () => {
  afterEach(async () => {
    jest.restoreAllMocks();
    mockGetSupabaseClient.mockReset();
    await AsyncStorage.clear();
    resetCaptured();
  });

  it('renders exactly its own fixtures for guest, user A, user B, revisited A, and back to guest, across all five domains', async () => {
    await seedAllDomains('guest', GUEST_IDENTITY);
    await seedAllDomains('userA', USER_A_IDENTITY);
    await seedAllDomains('userB', USER_B_IDENTITY);

    const fake = createFakeClient();
    const root = await mount(fake);

    await act(async () => {
      fake.emit('INITIAL_SESSION', null);
    });
    expectFixturesFor('guest');

    await act(async () => {
      fake.emit('SIGNED_IN', sessionWithUserId(USER_A_ID));
    });
    expectFixturesFor('userA');

    await act(async () => {
      fake.emit('SIGNED_IN', sessionWithUserId(USER_B_ID));
    });
    expectFixturesFor('userB');

    // Repeated switch back to A must restore exactly A's original fixtures, not anything touched
    // while B was current.
    await act(async () => {
      fake.emit('SIGNED_IN', sessionWithUserId(USER_A_ID));
    });
    expectFixturesFor('userA');

    await act(async () => {
      fake.emit('SIGNED_OUT', null);
    });
    expectFixturesFor('guest');

    act(() => {
      root.unmount();
    });
  });

  it('never lets a write performed under user A appear under guest, across all five domains', async () => {
    await seedAllDomains('guest', GUEST_IDENTITY);
    await seedAllDomains('userA', USER_A_IDENTITY);

    const fake = createFakeClient();
    const root = await mount(fake);

    await act(async () => {
      fake.emit('SIGNED_IN', sessionWithUserId(USER_A_ID));
    });
    expectFixturesFor('userA');

    await act(async () => {
      captured.toggleSelectedTrick?.('some-trick-id');
      captured.addCustomTrick?.({ kind: 'standalone', name: 'userA-written-trick' });
      captured.recordCompletedSesh?.({
        trick: PRACTICE_TRICK,
        plan: { kind: 'openEnded' },
        startedAt: 10_000,
        endedAt: 12_000,
        durationMs: 2000,
        landings: [{ landedAt: 11_000, elapsedMs: 1000, intervalMs: 1000 }],
      });
      captured.addGoal?.({ kind: 'count', trickId: 'some-trick-id', trickName: 'Some Trick', targetCount: 3 });
      captured.addNote?.({ trickId: 'some-trick-id', trickName: 'Some Trick', body: 'userA-written-note' });
      await flush();
    });

    // Each write landed under user A's own namespace.
    const userAProfile = await AsyncStorage.getItem(physicalKey(USER_A_IDENTITY, USER_PROFILE_STORAGE_KEY));
    expect(JSON.parse(userAProfile!).profile.selectedTrickIds).toContain('some-trick-id');

    const userATricks = deserializeCustomTricks(
      (await AsyncStorage.getItem(physicalKey(USER_A_IDENTITY, CUSTOM_TRICKS_STORAGE_KEY)))!,
    );
    expect(userATricks?.tricks.some((trick) => trick.name === 'userA-written-trick')).toBe(true);

    const userAHistory = deserializePracticeHistory(
      (await AsyncStorage.getItem(physicalKey(USER_A_IDENTITY, PRACTICE_HISTORY_STORAGE_KEY)))!,
    );
    expect(userAHistory?.sessions.some((session) => session.startedAt === 10_000)).toBe(true);

    const userAGoals = deserializeGoals(
      (await AsyncStorage.getItem(physicalKey(USER_A_IDENTITY, GOALS_STORAGE_KEY)))!,
    );
    expect(userAGoals?.goals.some((goal) => goal.kind === 'count' && goal.targetCount === 3)).toBe(true);

    const userANotes = deserializeNotes(
      (await AsyncStorage.getItem(physicalKey(USER_A_IDENTITY, NOTES_STORAGE_KEY)))!,
    );
    expect(userANotes?.notes.some((note) => note.body === 'userA-written-note')).toBe(true);

    // None of those writes landed under guest -- guest's own seeded fixtures are byte-for-byte
    // unchanged, and switching back never renders A's written content.
    await act(async () => {
      fake.emit('SIGNED_OUT', null);
    });
    expectFixturesFor('guest');
    expect(captured.firstTrickName).not.toBe('userA-written-trick');
    expect(captured.firstNoteBody).not.toBe('userA-written-note');

    const guestProfile = await AsyncStorage.getItem(physicalKey(GUEST_IDENTITY, USER_PROFILE_STORAGE_KEY));
    expect(JSON.parse(guestProfile!).profile.selectedTrickIds).not.toContain('some-trick-id');

    const guestTricks = deserializeCustomTricks(
      (await AsyncStorage.getItem(physicalKey(GUEST_IDENTITY, CUSTOM_TRICKS_STORAGE_KEY)))!,
    );
    expect(guestTricks).toEqual({
      tricks: [createCustomTrick('trick-guest', { kind: 'standalone', name: 'guest-trick' }, 0)],
    });

    const guestHistory = deserializePracticeHistory(
      (await AsyncStorage.getItem(physicalKey(GUEST_IDENTITY, PRACTICE_HISTORY_STORAGE_KEY)))!,
    );
    expect(guestHistory?.sessions).toHaveLength(1);
    expect(guestHistory?.sessions[0]?.id).toBe('session-guest');

    const guestGoals = deserializeGoals(
      (await AsyncStorage.getItem(physicalKey(GUEST_IDENTITY, GOALS_STORAGE_KEY)))!,
    );
    expect(guestGoals?.goals).toHaveLength(1);
    expect(guestGoals?.goals[0]?.id).toBe('goal-guest');

    const guestNotes = deserializeNotes(
      (await AsyncStorage.getItem(physicalKey(GUEST_IDENTITY, NOTES_STORAGE_KEY)))!,
    );
    expect(guestNotes?.notes).toHaveLength(1);
    expect(guestNotes?.notes[0]?.id).toBe('note-guest');

    act(() => {
      root.unmount();
    });
  });

  it('discards a delayed user-A note load that resolves only after switching to user B', async () => {
    await seedAllDomains('userA', USER_A_IDENTITY);
    await seedAllDomains('userB', USER_B_IDENTITY);

    const userANotesKey = physicalKey(USER_A_IDENTITY, NOTES_STORAGE_KEY);
    let releaseUserALoad!: () => void;
    const userALoadGate = new Promise<void>((resolve) => {
      releaseUserALoad = resolve;
    });

    // See identity-rehydration.test.tsx's identical comment: capturing `getMockImplementation()`
    // before replacing it is required, not stylistic -- `jest.spyOn` on an already-a-mock reuses
    // the same underlying dispatcher, so a plain reference would alias the about-to-be-replaced
    // function and recurse into itself.
    const originalGetItem = (
      AsyncStorage.getItem as unknown as jest.Mock
    ).getMockImplementation()! as typeof AsyncStorage.getItem;
    jest.spyOn(AsyncStorage, 'getItem').mockImplementation(async (key: string) => {
      if (key === userANotesKey) {
        await userALoadGate;
      }
      return originalGetItem(key);
    });

    const fake = createFakeClient();
    const root = await mount(fake);

    // Sign in as user A -- notes' load is now stuck behind the gate, so the whole tree stays on
    // NoteProvider's hydration fallback.
    await act(async () => {
      fake.emit('SIGNED_IN', sessionWithUserId(USER_A_ID));
    });
    expect(captured.firstNoteBody).toBeUndefined();

    // Switch to user B before user A's notes load resolves. User B has no gate on notes, so it
    // should hydrate normally, including notes.
    await act(async () => {
      fake.emit('SIGNED_IN', sessionWithUserId(USER_B_ID));
      await flush();
    });
    expect(captured.firstNoteBody).toBe('userB-note');

    // Now let the stale user-A notes load resolve. It must never be applied.
    await act(async () => {
      releaseUserALoad();
      await flush();
    });
    expect(captured.firstNoteBody).toBe('userB-note');
    expect(
      root.root.findAllByType(Text).some((node) => node.props.children === 'Loading your tricks...'),
    ).toBe(false);

    act(() => {
      root.unmount();
    });
  });

  it('discards a late-queued user-A goal write that is still enqueued when the switch to user B lands (pending-write race)', async () => {
    await seedAllDomains('guest', GUEST_IDENTITY);
    await seedAllDomains('userA', USER_A_IDENTITY);
    await seedAllDomains('userB', USER_B_IDENTITY);

    const fake = createFakeClient();
    const root = await mount(fake);

    await act(async () => {
      fake.emit('SIGNED_IN', sessionWithUserId(USER_A_ID));
    });
    expect(captured.firstGoalId).toBe('goal-userA');

    // Dispatch a user-driven write under user A, then -- in the *same* synchronous tick, before
    // any microtask/effect has had a chance to run -- switch to user B. `useIdentityScopedDomain`
    // captures `taggedGeneration = context.getGeneration()` synchronously inside its write-enqueue
    // effect, but the write queue only actually *checks* that tag inside a `.then()` callback,
    // which can't run until the whole synchronous JS turn (including every effect from this same
    // commit, in particular the identity-switch effect that bumps the generation counter) has
    // finished. So this ordering reliably produces the exact race the exit criteria name -- a
    // write queued under one identity whose generation has already moved on by the time it's
    // actually checked -- without needing to artificially stall `AsyncStorage.setItem`.
    await act(async () => {
      captured.addGoal?.({ kind: 'count', trickId: 'some-trick-id', trickName: 'Some Trick', targetCount: 99 });
      fake.emit('SIGNED_IN', sessionWithUserId(USER_B_ID));
      await flush();
    });

    // The switch itself proceeds independently of the superseded write -- hydration and the write
    // queue are separate effects.
    expect(captured.firstGoalId).toBe('goal-userB');

    const userAStoredGoals = deserializeGoals(
      (await AsyncStorage.getItem(physicalKey(USER_A_IDENTITY, GOALS_STORAGE_KEY)))!,
    );
    expect(userAStoredGoals).toEqual({
      goals: [
        {
          id: 'goal-userA',
          trickId: 'some-trick-id',
          trickName: 'userA-trick',
          kind: 'count',
          targetCount: 5,
          createdAt: 0,
          updatedAt: 0,
        },
      ],
    });
    expect(userAStoredGoals?.goals.some((goal) => goal.kind === 'count' && goal.targetCount === 99)).toBe(
      false,
    );
    expect(captured.firstGoalId).toBe('goal-userB');

    act(() => {
      root.unmount();
    });
  });
});
