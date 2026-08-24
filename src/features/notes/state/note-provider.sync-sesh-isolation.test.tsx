// T157.8 exit criterion: "prove no sync effect changes active Sesh state."
// Mounts the real `Sesh` component alongside the real `NoteProvider` (with a
// fake transport), drives `Sesh` into an active/countdown status using a
// trick with sesh-linked notes, then runs a full sync cycle whose
// fake-seeded server state differs meaningfully from local note state
// (different body text, an extra/missing note for the practiced trick) --
// and asserts `Sesh`'s rendered output is byte-identical before and after.
//
// Confirmed by reading `sesh.tsx`/`multi-trick-sesh.tsx` directly: both call
// `useNotes()` and read the live `notes` array, but only to derive
// `trickNotes` via `selectNotesForTrick` for a display-only "From your
// notes" panel -- never for completion/achievement bookkeeping (unlike
// goals, where the live `goals` array feeds `justAchievedGoals` at
// completion). This test uses the lighter, single-assertion
// rendered-output-unchanged pattern (matching T157.4/T157.5's precedent),
// not goals' heavier two-assertion version -- there is no analogous
// derived-outcome logic for notes to prove separately.

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

const mockCreateNoteSyncTransportAdapter = jest.fn();
jest.mock('@/features/notes/persistence/note-sync-transport', () => ({
  createNoteSyncTransportAdapter: (...args: unknown[]) => mockCreateNoteSyncTransportAdapter(...args),
}));

jest.mock('@/shared/supabase/supabase-client', () => ({
  getSupabaseClient: () => ({}),
}));

import type { NoteRow } from '@/features/notes/persistence/note-cloud-repository';
import { NoteProvider, useNoteSync } from '@/features/notes/state/note-provider';
import { CustomTrickProvider } from '@/features/custom-tricks/state/custom-trick-provider';
import { GoalProvider } from '@/features/goals/state/goal-provider';
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

const PRACTICE_TRICK: PracticeTrick = {
  id: 'lighthouse',
  name: 'Lighthouse',
};

function createFakeTransport(seedRows: readonly NoteRow[]): SyncTransportRepository<NoteRow> {
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
// switching, just needs `NoteProvider`'s sync wiring to treat this session
// as signed-in from the start.
function IdentityHandleTestProvider({ children }: PropsWithChildren) {
  const [handle] = useState(() => {
    const context = createIdentityContext(USER_IDENTITY);
    return { identity: USER_IDENTITY, generation: context.getGeneration(), context };
  });
  return <IdentityHandleContext.Provider value={handle}>{children}</IdentityHandleContext.Provider>;
}

interface Captured {
  runSync?: ReturnType<typeof useNoteSync>['runSync'];
}

function makeSyncExposer(captured: Captured) {
  return function SyncExposer() {
    const sync = useNoteSync();
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
                  <Sesh availableTricks={[PRACTICE_TRICK]} selectedTrickIds={[PRACTICE_TRICK.id]} />
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

describe('NoteProvider sync / Sesh isolation', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    mockCreateNoteSyncTransportAdapter.mockReset();
  });

  it('a full sync cycle, including a pull-adopt notesRestored dispatch, leaves an active Sesh unchanged', async () => {
    // The fake-seeded server state differs meaningfully from the local note
    // collection the Sesh session was started from: a different body for a
    // note on the practiced trick, plus an extra unrelated note -- if the
    // primary reducer's `notesRestored` dispatch leaked into anything Sesh
    // reads, this would surface it.
    const seedNote: NoteRow = {
      id: 'note-live',
      user_id: USER_ID,
      trick_id: PRACTICE_TRICK.id,
      trick_name: PRACTICE_TRICK.name,
      body: 'A different body from the server.',
      practice_session_id: null,
      created_at: TIMESTAMP,
      updated_at: TIMESTAMP,
      deleted_at: null,
      revision: 1,
    };
    const seedExtra: NoteRow = {
      id: 'note-unrelated',
      user_id: USER_ID,
      trick_id: 'big-cup',
      trick_name: 'Big cup',
      body: 'Unrelated note.',
      practice_session_id: null,
      created_at: TIMESTAMP,
      updated_at: TIMESTAMP,
      deleted_at: null,
      revision: 1,
    };
    mockCreateNoteSyncTransportAdapter.mockReturnValue(createFakeTransport([seedNote, seedExtra]));

    jest.useFakeTimers();
    try {
      const { root, captured } = await mountHarness();

      act(() => {
        pressByAccessibilityLabel(root, `Start a sesh with ${PRACTICE_TRICK.name}`);
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
      expect(mockCreateNoteSyncTransportAdapter).toHaveBeenCalled();
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
