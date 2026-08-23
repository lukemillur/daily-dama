// T157.7 exit criterion: "prove no sync effect changes active Sesh state,"
// with a domain-specific addition beyond `custom-trick-provider.sync-sesh-isolation.test.tsx`'s
// precedent -- unlike profile/custom-tricks, `Sesh` (src/features/sesh/components/sesh.tsx)
// calls `useGoals()` directly and reads the LIVE `goals` array twice: once to snapshot
// `goalBaselines` at session start, and again at completion via `selectGoalsForTrick(goals,
// trickId)` to compute `justAchievedGoals`. A background pull-adopt `goalsRestored` dispatch
// mid-session is therefore a genuinely new class of risk this domain introduces: it's not
// enough to prove Sesh's rendered output is unchanged immediately after a sync cycle (the
// prior domains' own precedent) -- this test additionally proves sync doesn't corrupt Sesh's
// in-flight goal-achievement bookkeeping. The fake transport is seeded with the SAME goal id
// but a DIFFERENT target than local state started with (as if a second device edited it), and
// the fake transport's push always fails (network) -- keeping the local create op pending in
// the outbox for the whole test, which is what makes the pull-adopt in
// `use-goal-domain-sync.ts` skip the collection dispatch entirely (its own
// `outboxIsEmpty` gate). This is the concrete mechanism that keeps the session's live `goals`
// read stable across a mid-session sync run; if that mechanism ever regressed, this test would
// observe the achievement outcome flip to the server-seeded target instead.

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

const mockCreateGoalSyncTransportAdapter = jest.fn();
jest.mock('@/features/goals/persistence/goal-sync-transport', () => ({
  createGoalSyncTransportAdapter: (...args: unknown[]) => mockCreateGoalSyncTransportAdapter(...args),
}));

jest.mock('@/shared/supabase/supabase-client', () => ({
  getSupabaseClient: () => ({}),
}));

import type { GoalRow } from '@/features/goals/persistence/goal-cloud-repository';
import { GoalProvider, useGoalActions, useGoalSync } from '@/features/goals/state/goal-provider';
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

const TRICK: PracticeTrick = { id: 'lighthouse', name: 'Lighthouse' };
const LOCAL_TARGET_COUNT = 3;
const SERVER_TARGET_COUNT = 999;

interface FakeTransport extends SyncTransportRepository<GoalRow> {
  setSeedRow(row: GoalRow | undefined): void;
}

function createFakeTransport(): FakeTransport {
  let seedRow: GoalRow | undefined;
  return {
    async pull() {
      return { status: 'succeeded', page: { items: seedRow ? [seedRow] : [], nextCursor: null } };
    },
    async push() {
      // Always fails (network) -- keeps every local mutation pending in the
      // outbox for the whole test, which is what keeps `use-goal-domain-sync.ts`'s
      // pull-adopt gate (`outboxIsEmpty`) closed throughout.
      return { status: 'failed', error: { kind: 'network', message: 'not exercised in this test' } };
    },
    setSeedRow(row) {
      seedRow = row;
    },
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
  runSync?: ReturnType<typeof useGoalSync>['runSync'];
  goalId?: string;
}

function makeExposer(captured: Captured) {
  return function Exposer() {
    const sync = useGoalSync();
    const { addGoal } = useGoalActions();
    useEffect(() => {
      captured.runSync = sync.runSync;
    });
    useEffect(() => {
      if (captured.goalId !== undefined) return;
      const result = addGoal({
        kind: 'count',
        trickId: TRICK.id,
        trickName: TRICK.name,
        targetCount: LOCAL_TARGET_COUNT,
      });
      if (result.status === 'saved') captured.goalId = result.goal.id;
      // eslint-disable-next-line react-hooks/exhaustive-deps -- runs exactly once to seed the goal
    }, []);
    return null;
  };
}

function pressByAccessibilityLabel(root: ReactTestRenderer, label: string) {
  const [match] = root.root.findAll(
    (node) => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function',
  );
  match.props.onPress();
}

// The "End Sesh"/"Pause Sesh" action buttons carry accessibilityRole="button"
// and an onPress handler, but no accessibilityLabel of their own -- only a
// child <Text> with the button's copy. Finds the Text node with that exact
// copy, then walks up to the nearest ancestor with an onPress handler.
function pressByButtonText(root: ReactTestRenderer, text: string) {
  const textNodes = root.root.findAll(
    (node) => String(node.type) === 'Text' && node.children.length === 1 && node.children[0] === text,
  );
  for (const textNode of textNodes) {
    let current = textNode.parent;
    while (current) {
      if (typeof current.props.onPress === 'function') {
        current.props.onPress();
        return;
      }
      current = current.parent;
    }
  }
  throw new Error(`No pressable ancestor found for button text ${JSON.stringify(text)}.`);
}

async function mountHarness() {
  const captured: Captured = {};
  const Exposer = makeExposer(captured);

  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(
      <IdentityHandleTestProvider>
        <UserProfileProvider>
          <NoteProvider>
            <GoalProvider>
              <PracticeHistoryProvider>
                <Exposer />
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

describe('GoalProvider sync / Sesh isolation', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    mockCreateGoalSyncTransportAdapter.mockReset();
  });

  it('a mid-session sync run leaves an active Sesh unchanged, and the goal-achievement outcome at completion reflects the pre-sync target', async () => {
    const transport = createFakeTransport();
    mockCreateGoalSyncTransportAdapter.mockReturnValue(transport);

    jest.useFakeTimers();
    try {
      const { root, captured } = await mountHarness();

      // Wait for the initial mount-time effects (including addGoal and the
      // once-per-generation login-triggered runSync, whose pull returns
      // nothing yet) to settle.
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(captured.goalId).toBeDefined();

      // Now seed the fake transport as if a second device edited the same
      // goal to a very different target -- this row is what a naive
      // pull-adopt would otherwise resurrect into Sesh's live `goals` mid-session.
      const goalId = captured.goalId as string;
      transport.setSeedRow({
        id: goalId,
        user_id: USER_ID,
        trick_id: TRICK.id,
        trick_name: TRICK.name,
        kind: 'count',
        target_count: SERVER_TARGET_COUNT,
        target_ms: null,
        revision: 2,
        created_at: TIMESTAMP,
        updated_at: TIMESTAMP,
        deleted_at: null,
      });

      act(() => {
        pressByAccessibilityLabel(root, `Start a sesh with ${TRICK.name}`);
      });

      // Countdown ticks down from 3, one setTimeout(1000ms) step at a time --
      // the sesh is now in its 'countdown' status, the exact kind of
      // in-progress state a background sync run must never disturb.
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      const beforeSync = JSON.stringify(root.toJSON());

      let result: Awaited<ReturnType<NonNullable<Captured['runSync']>>> | undefined;
      await act(async () => {
        result = await captured.runSync?.('manual');
      });

      expect(mockCreateGoalSyncTransportAdapter).toHaveBeenCalled();
      expect(result?.outcome).toEqual({ status: 'succeeded' });

      const afterSync = JSON.stringify(root.toJSON());
      expect(afterSync).toBe(beforeSync);

      // Advance through the remaining countdown into 'active', one
      // setTimeout(1000ms) tick at a time (matches the countdown's own
      // re-scheduling-on-each-render shape).
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      // Lace the trick exactly LOCAL_TARGET_COUNT times -- enough to
      // achieve the goal against its PRE-sync target (3), nowhere near the
      // server-seeded target (999).
      for (let i = 0; i < LOCAL_TARGET_COUNT; i += 1) {
        act(() => {
          pressByAccessibilityLabel(root, 'Laced');
        });
      }

      act(() => {
        pressByButtonText(root, 'End Sesh');
      });

      const rendered = JSON.stringify(root.toJSON());
      // The completion celebration banner renders the achieved goal's own
      // formatted target -- if a mid-session pull-adopt had leaked the
      // server-seeded goal into Sesh's live state, this would show 999,
      // not 3, and/or fail to celebrate at all (999 was never reached).
      expect(rendered).toContain('You reached your goal');
      expect(rendered).toContain(String(LOCAL_TARGET_COUNT));
      expect(rendered).not.toContain(String(SERVER_TARGET_COUNT));

      act(() => {
        root.unmount();
      });
    } finally {
      jest.useRealTimers();
    }
  });
});
