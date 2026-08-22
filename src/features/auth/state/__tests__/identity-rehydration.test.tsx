import { afterEach, describe, expect, it, jest } from '@jest/globals';
import type { AuthChangeEvent, Session, SupabaseClient } from '@supabase/supabase-js';
import { useEffect } from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { AuthProvider } from '@/features/auth/state/auth-provider';
import { CustomTrickProvider, useCustomTricks } from '@/features/custom-tricks/state/custom-trick-provider';
import { serializeCustomTricks } from '@/features/custom-tricks/persistence/custom-trick-persistence';
import { createCustomTrick } from '@/features/custom-tricks/model/custom-trick';
import { GoalProvider } from '@/features/goals/state/goal-provider';
import { NoteProvider } from '@/features/notes/state/note-provider';
import {
  useUserProfile,
  useUserProfileActions,
  UserProfileProvider,
} from '@/features/profile/state/user-profile-provider';
import { serializeUserProfile } from '@/features/profile/persistence/user-profile-persistence';
import { PracticeHistoryProvider } from '@/features/stats/state/practice-history-provider';
import { GUEST_IDENTITY } from '@/shared/persistence/identity';
import { IdentityProvider } from '@/shared/persistence/identity-provider';
import { physicalKey } from '@/shared/persistence/scoped-storage';

// Integration coverage for T156.2's actual exit criteria: the real five-provider tree, wired onto
// real Auth transitions, must rehydrate from the correct identity namespace every time, never leak
// data across identities, and never apply a late-arriving load for an identity that's since been
// superseded. `use-identity-scoped-domain.test.tsx` already proves the shared mechanism in
// isolation with a fake domain; this file proves the real wiring on top of it, using two real
// domains (user profile and custom tricks) as representative coverage of all five, which all share
// the exact same `useIdentityScopedDomain` call shape.
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required by jest hoisting
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-reanimated', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required by jest hoisting
  require('react-native-reanimated/mock'),
);

const mockGetSupabaseClient = jest.fn();
jest.mock('@/features/auth/persistence/supabase-client', () => ({
  getSupabaseClient: () => mockGetSupabaseClient(),
}));

const USER_A_ID = '11111111-1111-1111-1111-111111111111';
const USER_B_ID = '22222222-2222-2222-2222-222222222222';
const USER_A_IDENTITY = { kind: 'user', userId: USER_A_ID } as const;
const USER_B_IDENTITY = { kind: 'user', userId: USER_B_ID } as const;

const USER_PROFILE_KEY = 'daily-dama:user-profile';
const CUSTOM_TRICKS_KEY = 'daily-dama:custom-tricks';

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

async function seedFixture(rank: number, trickName: string, identity = GUEST_IDENTITY) {
  await AsyncStorage.setItem(
    physicalKey(identity, USER_PROFILE_KEY),
    serializeUserProfile({
      hasCompletedOnboarding: true,
      kenteiRank: rank,
      selectedTrickIds: [],
      manuallyUnlockedTrickIds: [],
    }),
  );
  await AsyncStorage.setItem(
    physicalKey(identity, CUSTOM_TRICKS_KEY),
    serializeCustomTricks({
      tricks: [createCustomTrick(`trick-${trickName}`, { kind: 'standalone', name: trickName })],
    }),
  );
}

const captured: {
  kenteiRank?: number;
  firstTrickName?: string;
  toggleSelectedTrick?: (trickId: string) => void;
} = {};

function Harness() {
  const profile = useUserProfile();
  const { toggleSelectedTrick } = useUserProfileActions();
  const { tricks } = useCustomTricks();

  useEffect(() => {
    captured.kenteiRank = profile.kenteiRank;
    captured.firstTrickName = tricks[0]?.name;
    captured.toggleSelectedTrick = toggleSelectedTrick;
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

describe('identity rehydration (real five-provider tree)', () => {
  afterEach(async () => {
    jest.restoreAllMocks();
    mockGetSupabaseClient.mockReset();
    await AsyncStorage.clear();
    captured.kenteiRank = undefined;
    captured.firstTrickName = undefined;
    captured.toggleSelectedTrick = undefined;
  });

  it('rehydrates each identity from its own namespace, in sequence, with no cross-identity leakage', async () => {
    await seedFixture(1, 'Guest Trick', GUEST_IDENTITY);
    await seedFixture(5, 'User A Trick', USER_A_IDENTITY);
    await seedFixture(9, 'User B Trick', USER_B_IDENTITY);

    const fake = createFakeClient();
    const root = await mount(fake);

    // Auth resolves to guest first (no session).
    await act(async () => {
      fake.emit('INITIAL_SESSION', null);
    });
    expect(captured.kenteiRank).toBe(1);
    expect(captured.firstTrickName).toBe('Guest Trick');

    await act(async () => {
      fake.emit('SIGNED_IN', sessionWithUserId(USER_A_ID));
    });
    expect(captured.kenteiRank).toBe(5);
    expect(captured.firstTrickName).toBe('User A Trick');

    await act(async () => {
      fake.emit('SIGNED_IN', sessionWithUserId(USER_B_ID));
    });
    expect(captured.kenteiRank).toBe(9);
    expect(captured.firstTrickName).toBe('User B Trick');

    await act(async () => {
      fake.emit('SIGNED_OUT', null);
    });
    expect(captured.kenteiRank).toBe(1);
    expect(captured.firstTrickName).toBe('Guest Trick');

    act(() => {
      root.unmount();
    });
  });

  it('never lets a write performed under one identity appear in another identity’s namespace', async () => {
    await seedFixture(1, 'Guest Trick', GUEST_IDENTITY);
    await seedFixture(5, 'User A Trick', USER_A_IDENTITY);

    const fake = createFakeClient();
    const root = await mount(fake);

    await act(async () => {
      fake.emit('SIGNED_IN', sessionWithUserId(USER_A_ID));
    });
    expect(captured.kenteiRank).toBe(5);

    // A user-driven write while on user A.
    await act(async () => {
      captured.toggleSelectedTrick?.('some-trick-id');
      await Promise.resolve();
      await Promise.resolve();
    });

    const userAStored = await AsyncStorage.getItem(physicalKey(USER_A_IDENTITY, USER_PROFILE_KEY));
    expect(userAStored).not.toBeNull();
    expect(JSON.parse(userAStored!).profile.selectedTrickIds).toContain('some-trick-id');

    // Switching to guest must never see user A's write, and guest's own stored profile must stay
    // exactly as seeded.
    await act(async () => {
      fake.emit('SIGNED_OUT', null);
    });
    expect(captured.kenteiRank).toBe(1);

    const guestStored = await AsyncStorage.getItem(physicalKey(GUEST_IDENTITY, USER_PROFILE_KEY));
    expect(JSON.parse(guestStored!).profile.selectedTrickIds).not.toContain('some-trick-id');

    act(() => {
      root.unmount();
    });
  });

  it('discards a delayed user-A load that resolves only after switching to user B', async () => {
    await seedFixture(5, 'User A Trick', USER_A_IDENTITY);
    await seedFixture(9, 'User B Trick', USER_B_IDENTITY);

    const userAProfileKey = physicalKey(USER_A_IDENTITY, USER_PROFILE_KEY);
    let releaseUserALoad!: () => void;
    const userALoadGate = new Promise<void>((resolve) => {
      releaseUserALoad = resolve;
    });

    // `AsyncStorage.getItem` from the jest mock module is already a jest.fn() -- `jest.spyOn`
    // returns that same underlying mock object rather than wrapping it in a new one, so binding a
    // reference to it before `mockImplementation` would just alias the live (about-to-be-replaced)
    // dispatcher and recurse into itself. Capturing `getMockImplementation()` grabs the actual
    // storage-backed function instead.
    const originalGetItem = (
      AsyncStorage.getItem as unknown as jest.Mock
    ).getMockImplementation()! as typeof AsyncStorage.getItem;
    jest.spyOn(AsyncStorage, 'getItem').mockImplementation(async (key: string) => {
      if (key === userAProfileKey) {
        await userALoadGate;
      }
      return originalGetItem(key);
    });

    const fake = createFakeClient();
    const root = await mount(fake);

    // Sign in as user A -- this load is now stuck behind the gate.
    await act(async () => {
      fake.emit('SIGNED_IN', sessionWithUserId(USER_A_ID));
    });
    // Still guest's initial (undefined/default) state -- user A's load hasn't resolved yet, and
    // UserProfileProvider gates children behind its own hydration fallback in the meantime.
    expect(captured.kenteiRank).toBeUndefined();

    // Switch to user B before user A's load resolves. User B has no gate, so it should hydrate
    // normally.
    await act(async () => {
      fake.emit('SIGNED_IN', sessionWithUserId(USER_B_ID));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(captured.kenteiRank).toBe(9);

    // Now let the stale user-A load resolve. It must never be applied -- state must stay on user
    // B's data, and the app must not silently revert to its own hydration-fallback screen (which
    // is what a naive "just discard the dispatch" fix would still let happen, since the stale load
    // would otherwise also drag `hydratedGeneration` back to user A's superseded generation).
    await act(async () => {
      releaseUserALoad();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(captured.kenteiRank).toBe(9);
    expect(captured.firstTrickName).toBe('User B Trick');
    expect(
      root.root.findAllByType(Text).some((node) => node.props.children === 'Loading your practice...'),
    ).toBe(false);

    act(() => {
      root.unmount();
    });
  });
});
