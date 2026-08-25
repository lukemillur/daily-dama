// T157.9 exit criterion: the fully-wired proof that overlapping sync
// triggers coalesce into a single-flight run, and that sync activity of
// every kind never perturbs an active Sesh through every one of its
// statuses (choosing/countdown/active/completed). Combines the five
// per-domain '*-provider.sync-sesh-isolation.test.tsx' harnesses (T157.4-
// T157.8) into one file that mounts all five real domain providers plus
// the real SyncCoordinatorProvider plus the real Sesh component. The
// narrower, faster-to-debug unit coverage for the coordinator hook itself
// (in isolation, with fake domain handles) lives in
// use-sync-coordinator.test.tsx; this file is the top-of-the-stack proof.

import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { type PropsWithChildren, useEffect, useState } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

// A CommonJS require (rather than import * as ReactNative) resolves to the
// exact same module.exports object react-natives own named imports use
// elsewhere in this files module graph -- see landing-page.test.tsx for the
// full rationale. Needed so mutating Platform.OS is visible to
// use-sync-coordinator.ts own import { Platform } from react-native.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ReactNative = require("react-native") as typeof import("react-native");

jest.mock("expo-audio", () => {
  const mockAudioPlayer = { play: jest.fn(), seekTo: jest.fn() };
  return { useAudioPlayer: jest.fn(() => mockAudioPlayer), __mockAudioPlayer: mockAudioPlayer };
});

jest.mock("@react-native-async-storage/async-storage", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required by jest hoisting
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

const mockCreateProfileSyncTransportAdapter = jest.fn();
jest.mock("@/features/profile/persistence/profile-sync-transport", () => ({
  createProfileSyncTransportAdapter: (...args: unknown[]) => mockCreateProfileSyncTransportAdapter(...args),
}));

const mockCreateCustomTrickSyncTransportAdapter = jest.fn();
jest.mock("@/features/custom-tricks/persistence/custom-trick-sync-transport", () => ({
  createCustomTrickSyncTransportAdapter: (...args: unknown[]) => mockCreateCustomTrickSyncTransportAdapter(...args),
}));

const mockCreateGoalSyncTransportAdapter = jest.fn();
jest.mock("@/features/goals/persistence/goal-sync-transport", () => ({
  createGoalSyncTransportAdapter: (...args: unknown[]) => mockCreateGoalSyncTransportAdapter(...args),
}));

const mockCreateNoteSyncTransportAdapter = jest.fn();
jest.mock("@/features/notes/persistence/note-sync-transport", () => ({
  createNoteSyncTransportAdapter: (...args: unknown[]) => mockCreateNoteSyncTransportAdapter(...args),
}));

const mockCreatePracticeHistorySyncTransportAdapter = jest.fn();
jest.mock("@/features/stats/persistence/practice-history-sync-transport", () => ({
  createPracticeHistorySyncTransportAdapter: (...args: unknown[]) =>
    mockCreatePracticeHistorySyncTransportAdapter(...args),
}));

jest.mock("@/shared/supabase/supabase-client", () => ({
  getSupabaseClient: () => ({}),
}));

import type { CustomTrickRow } from "@/features/custom-tricks/persistence/custom-trick-cloud-repository";
import { CustomTrickProvider } from "@/features/custom-tricks/state/custom-trick-provider";
import type { GoalRow } from "@/features/goals/persistence/goal-cloud-repository";
import { GoalProvider } from "@/features/goals/state/goal-provider";
import type { NoteRow } from "@/features/notes/persistence/note-cloud-repository";
import { NoteProvider } from "@/features/notes/state/note-provider";
import type { ProfileRow, UserTrickStateRow } from "@/features/profile/persistence/profile-cloud-repository";
import type { ProfileSyncTransport } from "@/features/profile/persistence/profile-sync-transport";
import type { SyncTransportPullResult } from "@/shared/sync/transport";
import { UserProfileProvider } from "@/features/profile/state/user-profile-provider";
import { Sesh } from "@/features/sesh/components/sesh";
import type { PracticeSessionRow } from "@/features/stats/persistence/practice-history-cloud-repository";
import { PracticeHistoryProvider } from "@/features/stats/state/practice-history-provider";
import { createIdentityContext } from "@/shared/persistence/identity-context";
import { createUserIdentity, type Identity } from "@/shared/persistence/identity";
import { IdentityHandleContext } from "@/shared/persistence/identity-provider";
import { SyncCoordinatorProvider, useSyncCoordinatorStatus } from "@/shared/sync/sync-coordinator-provider";
import type { SyncTransportRepository } from "@/shared/sync/transport";
import type { PracticeTrick } from "@/features/tricks/model/trick";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const USER_IDENTITY: Identity = createUserIdentity(USER_ID)!;
const TIMESTAMP = "2026-01-01T00:00:00.000Z";

const TRICK: PracticeTrick = { id: "big-cup", name: "Big Cup" };

function createFakeProfileTransport(
  seedProfile: ProfileRow,
  seedTrickStates: readonly UserTrickStateRow[],
  pullProfileRowSpy: jest.Mock<() => Promise<SyncTransportPullResult<ProfileRow>>>,
): ProfileSyncTransport {
  return {
    pullProfileRow: pullProfileRowSpy.mockImplementation(async () => ({
      status: "succeeded",
      page: { items: [seedProfile], nextCursor: null },
    })),
    async pullTrickStatePage() {
      return { status: "succeeded", page: { items: [...seedTrickStates], nextCursor: null } };
    },
    async push() {
      return { status: "failed", error: { kind: "network", message: "not exercised in this test" } };
    },
  };
}

function createFakeRepositoryTransport<Row>(seedRows: readonly Row[]): SyncTransportRepository<Row> {
  return {
    async pull() {
      return { status: "succeeded", page: { items: [...seedRows], nextCursor: null } };
    },
    async push() {
      return { status: "failed", error: { kind: "network", message: "not exercised in this test" } };
    },
  };
}

// Static user identity throughout -- this test isnt exercising identity
// switching (thats covered by use-sync-coordinator.test.tsxs own
// logout-cancellation unit test), just needs every domain providers sync
// wiring to treat this session as signed-in from the start.
function IdentityHandleTestProvider({ children }: PropsWithChildren) {
  const [handle] = useState(() => {
    const context = createIdentityContext(USER_IDENTITY);
    return { identity: USER_IDENTITY, generation: context.getGeneration(), context };
  });
  return <IdentityHandleContext.Provider value={handle}>{children}</IdentityHandleContext.Provider>;
}

interface Captured {
  status?: ReturnType<typeof useSyncCoordinatorStatus>;
}

function makeStatusExposer(captured: Captured) {
  return function StatusExposer() {
    const status = useSyncCoordinatorStatus();
    useEffect(() => {
      captured.status = status;
    });
    return null;
  };
}

async function mountHarness() {
  const captured: Captured = {};
  const StatusExposer = makeStatusExposer(captured);

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
                    <StatusExposer />
                    <Sesh availableTricks={[TRICK]} selectedTrickIds={[TRICK.id]} />
                  </SyncCoordinatorProvider>
                </GoalProvider>
              </NoteProvider>
            </PracticeHistoryProvider>
          </UserProfileProvider>
        </CustomTrickProvider>
      </IdentityHandleTestProvider>,
    );
  });
  return { root, captured };
}

function pressByAccessibilityLabel(root: ReactTestRenderer, label: string) {
  const [match] = root.root.findAll(
    (node) => node.props.accessibilityLabel === label && typeof node.props.onPress === "function",
  );
  match.props.onPress();
}

// Some buttons (e.g. "End Sesh") only carry visible text, no accessibilityLabel -- same helper
// as sesh.test.tsx.
function pressByVisibleText(root: ReactTestRenderer, text: string) {
  const [textNode] = root.root.findAll((node) => node.props.children === text);
  if (!textNode) throw new Error("No node found with text: " + text);
  let current: typeof textNode | null = textNode;
  while (current && typeof current.props.onPress !== "function") {
    current = current.parent;
  }
  if (!current) throw new Error("No pressable ancestor found for text: " + text);
  current.props.onPress();
}

async function flush(times = 4) {
  for (let i = 0; i < times; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

describe("SyncCoordinator / Sesh isolation (fully wired)", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    mockCreateProfileSyncTransportAdapter.mockReset();
    mockCreateCustomTrickSyncTransportAdapter.mockReset();
    mockCreateGoalSyncTransportAdapter.mockReset();
    mockCreateNoteSyncTransportAdapter.mockReset();
    mockCreatePracticeHistorySyncTransportAdapter.mockReset();
  });

  it("login/foreground/reconnect/local-mutation/manual sync activity never perturbs any Sesh status, and overlapping triggers coalesce", async () => {
    const seededProfile: ProfileRow = {
      user_id: USER_ID,
      has_completed_onboarding: true,
      kentei_rank: 8,
      last_sesh: null,
      streak_threshold_ms: null,
      theme_accent_color: "#123456",
      theme_background_color: "#654321",
      theme_text_color: null,
      created_at: TIMESTAMP,
      updated_at: TIMESTAMP,
      revision: 1,
    };
    const seededTrickState: UserTrickStateRow = {
      id: "row-big-cup",
      user_id: USER_ID,
      trick_id: TRICK.id,
      is_selected: true,
      is_manually_unlocked: false,
      created_at: TIMESTAMP,
      updated_at: TIMESTAMP,
      revision: 1,
    };
    const pullProfileRowSpy: jest.Mock<() => Promise<SyncTransportPullResult<ProfileRow>>> = jest.fn();
    mockCreateProfileSyncTransportAdapter.mockReturnValue(
      createFakeProfileTransport(seededProfile, [seededTrickState], pullProfileRowSpy),
    );

    const seededCustomTrick: CustomTrickRow = {
      id: "custom-standalone-seed",
      user_id: USER_ID,
      kind: "standalone",
      name: "Seeded standalone",
      kentei_rank: 5,
      steps: null,
      created_at: TIMESTAMP,
      updated_at: TIMESTAMP,
      revision: 1,
    } as CustomTrickRow;
    mockCreateCustomTrickSyncTransportAdapter.mockReturnValue(createFakeRepositoryTransport([seededCustomTrick]));

    const seededGoal: GoalRow = {
      id: "goal-seed",
      user_id: USER_ID,
      trick_id: TRICK.id,
      trick_name: TRICK.name,
      kind: "count",
      target_count: 999,
      target_ms: null,
      created_at: TIMESTAMP,
      updated_at: TIMESTAMP,
      deleted_at: null,
      revision: 1,
    } as GoalRow;
    mockCreateGoalSyncTransportAdapter.mockReturnValue(createFakeRepositoryTransport([seededGoal]));

    const seededNote: NoteRow = {
      id: "note-seed",
      user_id: USER_ID,
      trick_id: TRICK.id,
      trick_name: TRICK.name,
      body: "A different body from the server.",
      practice_session_id: null,
      created_at: TIMESTAMP,
      updated_at: TIMESTAMP,
      deleted_at: null,
      revision: 1,
    } as NoteRow;
    mockCreateNoteSyncTransportAdapter.mockReturnValue(createFakeRepositoryTransport([seededNote]));

    const seededSession: PracticeSessionRow = {
      user_id: USER_ID,
      id: "seeded-unrelated-session",
      trick_id: "unrelated-trick",
      trick_name: "Unrelated trick",
      started_at: 1_000,
      completed_at: 61_000,
      duration_ms: 60_000,
      lace_count: 9,
      planned_duration_ms: null,
      origin: null,
      created_at: TIMESTAMP,
    };
    mockCreatePracticeHistorySyncTransportAdapter.mockReturnValue(createFakeRepositoryTransport([seededSession]));

    const originalPlatformOS = ReactNative.Platform.OS;
    const onlineListeners: (() => void)[] = [];
    const fakeWindow = {
      addEventListener: (type: string, handler: () => void) => {
        if (type === "online") onlineListeners.push(handler);
      },
      removeEventListener: (type: string, handler: () => void) => {
        if (type !== "online") return;
        const index = onlineListeners.indexOf(handler);
        if (index !== -1) onlineListeners.splice(index, 1);
      },
    };
    ReactNative.Platform.OS = "web";
    (globalThis as { window?: unknown }).window = fakeWindow;

    jest.useFakeTimers();
    try {
      const { root, captured } = await mountHarness();

      // 1. Idle (Sesh choosing, before starting a sesh): let the automatic
      // login trigger fire and settle.
      const beforeLogin = JSON.stringify(root.toJSON());
      await flush();
      expect(pullProfileRowSpy).toHaveBeenCalledTimes(1);
      const afterLogin = JSON.stringify(root.toJSON());
      expect(afterLogin).toBe(beforeLogin);

      // 2. Countdown.
      act(() => {
        pressByAccessibilityLabel(root, "Start a sesh with " + TRICK.name);
      });
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      const beforeCountdownSync = JSON.stringify(root.toJSON());
      await act(async () => {
        captured.status?.requestManualSync();
      });
      await flush();
      const afterCountdownSync = JSON.stringify(root.toJSON());
      expect(afterCountdownSync).toBe(beforeCountdownSync);

      // 3. Active -- finish the remaining countdown ticks, one
      // setTimeout(1000ms) step at a time (matches sesh.test.tsx own
      // convention: a single combined advance can race the countdown
      // effects re-scheduling of its own next timer).
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      const beforeActiveSync = JSON.stringify(root.toJSON());
      await act(async () => {
        onlineListeners.forEach((handler) => handler());
      });
      await flush();
      const afterActiveSync = JSON.stringify(root.toJSON());
      expect(afterActiveSync).toBe(beforeActiveSync);

      // 4. Completed.
      act(() => {
        pressByVisibleText(root, "End Sesh");
      });
      const beforeCompletedSync = JSON.stringify(root.toJSON());
      const pullCallsBeforeOverlap = pullProfileRowSpy.mock.calls.length;

      // Two overlapping triggers fired synchronously -- a manual retry
      // immediately followed by a simulated browser reconnect event.
      act(() => {
        captured.status?.requestManualSync();
        onlineListeners.forEach((handler) => handler());
      });
      // Only the first (coalesced) run has actually started so far -- proof
      // of single-flight coalescing at the fully-wired level, not just the
      // unit-tested reducer/driver in isolation.
      expect(pullProfileRowSpy.mock.calls.length - pullCallsBeforeOverlap).toBe(1);

      await flush();
      const afterCompletedSync = JSON.stringify(root.toJSON());
      expect(afterCompletedSync).toBe(beforeCompletedSync);

      act(() => {
        root.unmount();
      });
    } finally {
      jest.useRealTimers();
      ReactNative.Platform.OS = originalPlatformOS;
      delete (globalThis as { window?: unknown }).window;
    }
  });
});
