// T157.4 exit criterion: "prove no sync effect changes active Sesh state."
// Mounts the real `Sesh` component alongside the real `UserProfileProvider`
// (with a fake transport), drives `Sesh` into an active/countdown status,
// then runs a full sync cycle that includes a pull-driven `profileRestored`
// dispatch -- the "most dangerous" path, since it replaces the whole
// profile object -- and asserts `Sesh`'s rendered output is byte-identical
// before and after. `Sesh` only ever calls `useUserProfileActions()`
// (stable, `useMemo`'d callbacks), never `useUserProfile()`, confirmed by
// reading `sesh.tsx`; this test is the positive, executable proof of that
// structural fact, not a restatement of it.

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { type PropsWithChildren, useEffect, useState } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('expo-audio', () => {
  const mockAudioPlayer = { play: jest.fn(), seekTo: jest.fn() };
  return { useAudioPlayer: jest.fn(() => mockAudioPlayer), __mockAudioPlayer: mockAudioPlayer };
});

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required by jest hoisting
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const mockCreateProfileSyncTransportAdapter = jest.fn();
jest.mock('@/features/profile/persistence/profile-sync-transport', () => ({
  createProfileSyncTransportAdapter: (...args: unknown[]) => mockCreateProfileSyncTransportAdapter(...args),
}));

jest.mock('@/shared/supabase/supabase-client', () => ({
  getSupabaseClient: () => ({}),
}));

import { GoalProvider } from '@/features/goals/state/goal-provider';
import { NoteProvider } from '@/features/notes/state/note-provider';
import type { ProfileRow, UserTrickStateRow } from '@/features/profile/persistence/profile-cloud-repository';
import type { ProfileSyncTransport } from '@/features/profile/persistence/profile-sync-transport';
import { Sesh } from '@/features/sesh/components/sesh';
import { PracticeHistoryProvider } from '@/features/stats/state/practice-history-provider';
import { UserProfileProvider, useUserProfileSync } from '@/features/profile/state/user-profile-provider';
import { createIdentityContext } from '@/shared/persistence/identity-context';
import { createUserIdentity, type Identity } from '@/shared/persistence/identity';
import { IdentityHandleContext } from '@/shared/persistence/identity-provider';
import type { PracticeTrick } from '@/features/tricks/model/trick';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const USER_IDENTITY: Identity = createUserIdentity(USER_ID)!;
const TRICK: PracticeTrick = { id: 'big-cup', name: 'Big Cup' };
const TIMESTAMP = '2026-01-01T00:00:00.000Z';

function createFakeTransport(seedProfile: ProfileRow, seedTrickStates: readonly UserTrickStateRow[]): ProfileSyncTransport {
  return {
    async pullProfileRow() {
      return { status: 'succeeded', page: { items: [seedProfile], nextCursor: null } };
    },
    async pullTrickStatePage() {
      return { status: 'succeeded', page: { items: [...seedTrickStates], nextCursor: null } };
    },
    async push() {
      return { status: 'failed', error: { kind: 'network', message: 'not exercised in this test' } };
    },
  };
}

// Static `user` identity throughout -- this test isn't exercising identity
// switching, just needs `UserProfileProvider`'s sync wiring to treat this
// session as signed-in from the start.
function IdentityHandleTestProvider({ children }: PropsWithChildren) {
  const [handle] = useState(() => {
    const context = createIdentityContext(USER_IDENTITY);
    return { identity: USER_IDENTITY, generation: context.getGeneration(), context };
  });
  return <IdentityHandleContext.Provider value={handle}>{children}</IdentityHandleContext.Provider>;
}

interface Captured {
  runSync?: ReturnType<typeof useUserProfileSync>['runSync'];
}

function makeSyncExposer(captured: Captured) {
  return function SyncExposer() {
    const sync = useUserProfileSync();
    useEffect(() => {
      captured.runSync = sync.runSync;
    });
    return null;
  };
}

async function mountHarness() {
  const captured: Captured = {};
  const SyncExposer = makeSyncExposer(captured);

  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(
      <IdentityHandleTestProvider>
        <UserProfileProvider>
          <NoteProvider>
            <GoalProvider>
              <PracticeHistoryProvider>
                <SyncExposer />
                <Sesh availableTricks={[TRICK]} selectedTrickIds={[TRICK.id]} />
              </PracticeHistoryProvider>
            </GoalProvider>
          </NoteProvider>
        </UserProfileProvider>
      </IdentityHandleTestProvider>,
    );
  });
  return { root, captured };
}

function pressByAccessibilityLabel(root: ReactTestRenderer, label: string) {
  const [match] = root.root.findAll(
    (node) => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function',
  );
  match.props.onPress();
}

describe('UserProfileProvider sync / Sesh isolation', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    mockCreateProfileSyncTransportAdapter.mockReset();
  });

  it('a full sync cycle, including a pull-adopt profileRestored dispatch, leaves an active Sesh unchanged', async () => {
    const seedProfile: ProfileRow = {
      user_id: USER_ID,
      has_completed_onboarding: true,
      kentei_rank: 9,
      last_sesh: null,
      streak_threshold_ms: null,
      theme_accent_color: '#123456',
      theme_background_color: '#654321',
      theme_text_color: null,
      created_at: TIMESTAMP,
      updated_at: TIMESTAMP,
      revision: 1,
    };
    const seedTrickState: UserTrickStateRow = {
      id: 'row-big-cup',
      user_id: USER_ID,
      trick_id: TRICK.id,
      is_selected: true,
      is_manually_unlocked: false,
      created_at: TIMESTAMP,
      updated_at: TIMESTAMP,
      revision: 1,
    };
    mockCreateProfileSyncTransportAdapter.mockReturnValue(createFakeTransport(seedProfile, [seedTrickState]));

    jest.useFakeTimers();
    try {
      const { root, captured } = await mountHarness();

      act(() => {
        pressByAccessibilityLabel(root, `Start a sesh with ${TRICK.name}`);
      });

      // Countdown ticks down from 3, one setTimeout(1000ms) step at a time --
      // the sesh is now in its 'countdown'/soon-'active' status, the exact
      // kind of in-progress state a background sync run must never disturb.
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      const beforeSync = JSON.stringify(root.toJSON());

      // A full pull-adopt sync cycle: the fake transport's seeded profile
      // differs meaningfully from local state (kenteiRank, theme colors,
      // trick selection), so if the primary reducer's `profileRestored`
      // dispatch leaked into anything Sesh reads, this would surface it.
      let result: Awaited<ReturnType<NonNullable<Captured['runSync']>>> | undefined;
      await act(async () => {
        result = await captured.runSync?.('manual');
      });

      // Confirms the sync actually ran (the fake transport was invoked and
      // reported a full success) rather than this being a vacuous pass from
      // a no-op call.
      expect(mockCreateProfileSyncTransportAdapter).toHaveBeenCalled();
      expect(result?.outcome).toEqual({ status: 'succeeded' });

      const afterSync = JSON.stringify(root.toJSON());
      expect(afterSync).toBe(beforeSync);

      act(() => {
        root.unmount();
      });
    } finally {
      jest.useRealTimers();
    }
  });
});
