// T157.5 exit criterion: "prove no sync effect changes active Sesh state."
// Mounts the real `Sesh` component alongside the real `CustomTrickProvider`
// (with a fake transport), drives `Sesh` into an active/countdown status
// using a custom-sequence `PracticeTrick` (including its `sequenceSteps`
// name-string snapshot per AGENTS.md), then runs a full sync cycle whose
// fake-seeded server state differs meaningfully from local custom-trick
// state (different step names, an extra/missing trick) -- and asserts
// `Sesh`'s rendered output is byte-identical before and after. `Sesh` only
// ever calls `useUserProfileActions()`/its own `PracticeTrick` prop, never
// `useCustomTricks()`, confirmed by reading `sesh.tsx`; this test is the
// positive, executable proof of that structural fact for the custom-tricks
// domain specifically, not a restatement of it.

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

const mockCreateCustomTrickSyncTransportAdapter = jest.fn();
jest.mock('@/features/custom-tricks/persistence/custom-trick-sync-transport', () => ({
  createCustomTrickSyncTransportAdapter: (...args: unknown[]) => mockCreateCustomTrickSyncTransportAdapter(...args),
}));

jest.mock('@/shared/supabase/supabase-client', () => ({
  getSupabaseClient: () => ({}),
}));

import type { CustomTrickRow } from '@/features/custom-tricks/persistence/custom-trick-cloud-repository';
import { CustomTrickProvider, useCustomTrickSync } from '@/features/custom-tricks/state/custom-trick-provider';
import { GoalProvider } from '@/features/goals/state/goal-provider';
import { NoteProvider } from '@/features/notes/state/note-provider';
import { UserProfileProvider } from '@/features/profile/state/user-profile-provider';
import { Sesh } from '@/features/sesh/components/sesh';
import { PracticeHistoryProvider } from '@/features/stats/state/practice-history-provider';
import { createIdentityContext } from '@/shared/persistence/identity-context';
import { createUserIdentity, type Identity } from '@/shared/persistence/identity';
import { IdentityHandleContext } from '@/shared/persistence/identity-provider';
import type { PracticeTrick } from '@/features/tricks/model/trick';
import type { SyncTransportRepository } from '@/shared/sync/transport';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const USER_IDENTITY: Identity = createUserIdentity(USER_ID)!;
const TIMESTAMP = '2026-01-01T00:00:00.000Z';

// A custom-sequence PracticeTrick, matching how the Tricks route builds the
// prop passed into Sesh -- `sequenceSteps` as name strings, per AGENTS.md.
const SEQUENCE_TRICK: PracticeTrick = {
  id: 'custom-sequence-live',
  name: 'Morning line',
  sequenceSteps: ['Big cup', 'Freehand spike'],
};

function createFakeTransport(seedRows: readonly CustomTrickRow[]): SyncTransportRepository<CustomTrickRow> {
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
// switching, just needs `CustomTrickProvider`'s sync wiring to treat this
// session as signed-in from the start.
function IdentityHandleTestProvider({ children }: PropsWithChildren) {
  const [handle] = useState(() => {
    const context = createIdentityContext(USER_IDENTITY);
    return { identity: USER_IDENTITY, generation: context.getGeneration(), context };
  });
  return <IdentityHandleContext.Provider value={handle}>{children}</IdentityHandleContext.Provider>;
}

interface Captured {
  runSync?: ReturnType<typeof useCustomTrickSync>['runSync'];
}

function makeSyncExposer(captured: Captured) {
  return function SyncExposer() {
    const sync = useCustomTrickSync();
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
                  <Sesh availableTricks={[SEQUENCE_TRICK]} selectedTrickIds={[SEQUENCE_TRICK.id]} />
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

describe('CustomTrickProvider sync / Sesh isolation', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    mockCreateCustomTrickSyncTransportAdapter.mockReset();
  });

  it('a full sync cycle, including a pull-adopt customTricksRestored dispatch, leaves an active Sesh unchanged', async () => {
    // The fake-seeded server state differs meaningfully from the local
    // custom-trick collection the Sesh session was started from: a
    // different step name for the referenced sequence, plus an extra
    // unrelated trick -- if the primary reducer's `customTricksRestored`
    // dispatch leaked into anything Sesh reads, this would surface it.
    const seedSequence: CustomTrickRow = {
      id: SEQUENCE_TRICK.id,
      user_id: USER_ID,
      kind: 'sequence',
      name: 'Morning line (renamed server-side)',
      kentei_rank: null,
      steps: [
        { kind: 'customText', name: 'Different big cup name' },
        { kind: 'customText', name: 'Different freehand spike name' },
      ],
      created_at: TIMESTAMP,
      updated_at: TIMESTAMP,
      revision: 1,
    };
    const seedExtra: CustomTrickRow = {
      id: 'custom-unrelated',
      user_id: USER_ID,
      kind: 'standalone',
      name: 'Unrelated trick',
      kentei_rank: null,
      steps: null,
      created_at: TIMESTAMP,
      updated_at: TIMESTAMP,
      revision: 1,
    };
    mockCreateCustomTrickSyncTransportAdapter.mockReturnValue(createFakeTransport([seedSequence, seedExtra]));

    jest.useFakeTimers();
    try {
      const { root, captured } = await mountHarness();

      act(() => {
        pressByAccessibilityLabel(root, `Start a sesh with ${SEQUENCE_TRICK.name}`);
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
      expect(mockCreateCustomTrickSyncTransportAdapter).toHaveBeenCalled();
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
