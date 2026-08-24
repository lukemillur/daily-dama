// T157.6 exit criterion: "synchronization must never alter an in-progress
// Sesh reducer." Mounts the real `Sesh` component alongside the real
// `PracticeHistoryProvider` (with a fake transport), drives `Sesh` into
// active/countdown status, then runs a full sync cycle whose fake-seeded
// server state differs meaningfully from local practice history (an extra
// unrelated session with a different trick/duration than anything locally
// recorded) -- and asserts `Sesh`'s rendered output is byte-identical before
// and after. `Sesh` only ever calls `usePracticeHistoryActions()` for
// `recordCompletedSesh`, never `usePracticeHistory()` state, confirmed by
// reading `sesh.tsx`; this test is the positive, executable proof of that
// structural fact for the practice-history domain specifically, same
// framing as T157.5's own isolation test.

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

const mockCreatePracticeHistorySyncTransportAdapter = jest.fn();
jest.mock('@/features/stats/persistence/practice-history-sync-transport', () => ({
  createPracticeHistorySyncTransportAdapter: (...args: unknown[]) =>
    mockCreatePracticeHistorySyncTransportAdapter(...args),
}));

jest.mock('@/shared/supabase/supabase-client', () => ({
  getSupabaseClient: () => ({}),
}));

import { CustomTrickProvider } from '@/features/custom-tricks/state/custom-trick-provider';
import { GoalProvider } from '@/features/goals/state/goal-provider';
import { NoteProvider } from '@/features/notes/state/note-provider';
import { UserProfileProvider } from '@/features/profile/state/user-profile-provider';
import { Sesh } from '@/features/sesh/components/sesh';
import type { PracticeSessionRow } from '@/features/stats/persistence/practice-history-cloud-repository';
import { PracticeHistoryProvider, usePracticeHistorySync } from '@/features/stats/state/practice-history-provider';
import { createIdentityContext } from '@/shared/persistence/identity-context';
import { createUserIdentity, type Identity } from '@/shared/persistence/identity';
import { IdentityHandleContext } from '@/shared/persistence/identity-provider';
import type { PracticeTrick } from '@/features/tricks/model/trick';
import type { SyncTransportRepository } from '@/shared/sync/transport';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const USER_IDENTITY: Identity = createUserIdentity(USER_ID)!;
const TIMESTAMP = '2026-01-01T00:00:00.000Z';

const AIRPLANE_TRICK: PracticeTrick = { id: 'airplane', name: 'Airplane' };

function createFakeTransport(seedRows: readonly PracticeSessionRow[]): SyncTransportRepository<PracticeSessionRow> {
  return {
    async pull() {
      return { status: 'succeeded', page: { items: [...seedRows], nextCursor: null } };
    },
    async push() {
      return { status: 'failed', error: { kind: 'network', message: 'not exercised in this test' } };
    },
  };
}

// Static `user` identity throughout -- this test isn't exercising identity
// switching, just needs `PracticeHistoryProvider`'s sync wiring to treat
// this session as signed-in from the start.
function IdentityHandleTestProvider({ children }: PropsWithChildren) {
  const [handle] = useState(() => {
    const context = createIdentityContext(USER_IDENTITY);
    return { identity: USER_IDENTITY, generation: context.getGeneration(), context };
  });
  return <IdentityHandleContext.Provider value={handle}>{children}</IdentityHandleContext.Provider>;
}

interface Captured {
  runSync?: ReturnType<typeof usePracticeHistorySync>['runSync'];
}

function makeSyncExposer(captured: Captured) {
  return function SyncExposer() {
    const sync = usePracticeHistorySync();
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
          <CustomTrickProvider>
            <NoteProvider>
              <GoalProvider>
                <PracticeHistoryProvider>
                  <SyncExposer />
                  <Sesh availableTricks={[AIRPLANE_TRICK]} selectedTrickIds={[AIRPLANE_TRICK.id]} />
                </PracticeHistoryProvider>
              </GoalProvider>
            </NoteProvider>
          </CustomTrickProvider>
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

describe('PracticeHistoryProvider sync / Sesh isolation', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    mockCreatePracticeHistorySyncTransportAdapter.mockReset();
  });

  it('a full sync cycle, including a pull-adopt historyRestored merge, leaves an active Sesh unchanged', async () => {
    // The fake-seeded server state differs meaningfully from local practice
    // history: an extra unrelated session for a different trick with a
    // different duration -- if the primary reducer's `historyRestored`
    // dispatch leaked into anything Sesh reads, this would surface it.
    const seedSession: PracticeSessionRow = {
      user_id: USER_ID,
      id: 'seeded-unrelated-session',
      trick_id: 'unrelated-trick',
      trick_name: 'Unrelated trick',
      started_at: 1_000,
      completed_at: 61_000,
      duration_ms: 60_000,
      lace_count: 9,
      planned_duration_ms: null,
      origin: null,
      created_at: TIMESTAMP,
    };
    mockCreatePracticeHistorySyncTransportAdapter.mockReturnValue(createFakeTransport([seedSession]));

    jest.useFakeTimers();
    try {
      const { root, captured } = await mountHarness();

      act(() => {
        pressByAccessibilityLabel(root, `Start a sesh with ${AIRPLANE_TRICK.name}`);
      });

      // Countdown ticks down from 3, one setTimeout(1000ms) step at a time --
      // the sesh is now in its 'countdown'/soon-'active' status, the exact
      // kind of in-progress state a background sync run must never disturb.
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      const beforeSync = JSON.stringify(root.toJSON());

      let result: Awaited<ReturnType<NonNullable<Captured['runSync']>>> | undefined;
      await act(async () => {
        result = await captured.runSync?.('manual');
      });

      // Confirms the sync actually ran (the fake transport was invoked and
      // reported a full success) rather than this being a vacuous pass from
      // a no-op call.
      expect(mockCreatePracticeHistorySyncTransportAdapter).toHaveBeenCalled();
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
