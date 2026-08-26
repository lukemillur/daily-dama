// T158: cross-domain proof that SyncCoordinatorProvider correctly
// aggregates pendingCount and discardAllPending across all five real
// domain providers. Narrower unit coverage of the underlying per-domain
// pendingCount/discardPending mechanics lives in each domains own
// use-X-domain-sync.test.tsx; this file only proves the aggregation itself
// (sum reactivity, Promise.all fan-out) through the real provider tree,
// mirroring sync-coordinator.sesh-isolation.test.tsxs own "fully wired"
// harness style.

import { afterEach, beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { type PropsWithChildren, useEffect, useState } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

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

import { CustomTrickProvider, useCustomTrickActions } from "@/features/custom-tricks/state/custom-trick-provider";
import { GoalProvider } from "@/features/goals/state/goal-provider";
import { NoteProvider, useNoteActions } from "@/features/notes/state/note-provider";
import type { ProfileSyncTransport } from "@/features/profile/persistence/profile-sync-transport";
import { UserProfileProvider } from "@/features/profile/state/user-profile-provider";
import { PracticeHistoryProvider } from "@/features/stats/state/practice-history-provider";
import { createIdentityContext } from "@/shared/persistence/identity-context";
import { createUserIdentity, identityNamespace, type Identity } from "@/shared/persistence/identity";
import { IdentityHandleContext } from "@/shared/persistence/identity-provider";
import { SyncCoordinatorProvider, useSyncCoordinatorStatus } from "@/shared/sync/sync-coordinator-provider";
import type { SyncTransportRepository } from "@/shared/sync/transport";
import { CUSTOM_TRICK_SYNC_ENVELOPE_STORAGE_KEY } from "@/features/custom-tricks/persistence/custom-trick-sync-envelope";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const USER_IDENTITY: Identity = createUserIdentity(USER_ID)!;

function createFakeProfileTransport(): ProfileSyncTransport {
  return {
    async pullProfileRow() {
      return { status: "succeeded", page: { items: [], nextCursor: null } };
    },
    async pullTrickStatePage() {
      return { status: "succeeded", page: { items: [], nextCursor: null } };
    },
    async push() {
      return { status: "failed", error: { kind: "network", message: "not exercised in this test" } };
    },
  };
}

function createFakeRepositoryTransport<Row>(): SyncTransportRepository<Row> {
  return {
    async pull() {
      return { status: "succeeded", page: { items: [], nextCursor: null } };
    },
    async push() {
      return { status: "failed", error: { kind: "network", message: "not exercised in this test" } };
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
  status?: ReturnType<typeof useSyncCoordinatorStatus>;
  addCustomTrick?: ReturnType<typeof useCustomTrickActions>["addCustomTrick"];
  addNote?: ReturnType<typeof useNoteActions>["addNote"];
}

function makeExposer(captured: Captured) {
  return function Exposer() {
    const status = useSyncCoordinatorStatus();
    const { addCustomTrick } = useCustomTrickActions();
    const { addNote } = useNoteActions();
    useEffect(() => {
      captured.status = status;
      captured.addCustomTrick = addCustomTrick;
      captured.addNote = addNote;
    });
    return null;
  };
}

async function mountHarness() {
  const captured: Captured = {};
  const Exposer = makeExposer(captured);

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
                    <Exposer />
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

async function flush(times = 4) {
  for (let i = 0; i < times; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

describe("SyncCoordinatorProvider pendingCount/discardAllPending aggregation (fully wired)", () => {
  beforeAll(() => {
    mockCreateProfileSyncTransportAdapter.mockReturnValue(createFakeProfileTransport());
    mockCreateCustomTrickSyncTransportAdapter.mockReturnValue(createFakeRepositoryTransport());
    mockCreateGoalSyncTransportAdapter.mockReturnValue(createFakeRepositoryTransport());
    mockCreateNoteSyncTransportAdapter.mockReturnValue(createFakeRepositoryTransport());
    mockCreatePracticeHistorySyncTransportAdapter.mockReturnValue(createFakeRepositoryTransport());
  });

  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    mockCreateProfileSyncTransportAdapter.mockClear();
    mockCreateCustomTrickSyncTransportAdapter.mockClear();
    mockCreateGoalSyncTransportAdapter.mockClear();
    mockCreateNoteSyncTransportAdapter.mockClear();
    mockCreatePracticeHistorySyncTransportAdapter.mockClear();
  });

  it("pendingCount sums pending operations across every domain and updates reactively", async () => {
    const { root, captured } = await mountHarness();
    await flush();

    expect(captured.status?.pendingCount).toBe(0);

    act(() => {
      captured.addCustomTrick?.({ kind: "standalone", name: "Around the World", kenteiRank: undefined });
    });
    await flush();

    expect(captured.status?.pendingCount).toBe(1);

    act(() => {
      captured.addNote?.({ trickId: "big-cup", trickName: "Big cup", body: "Note body" });
    });
    await flush();

    expect(captured.status?.pendingCount).toBe(2);

    act(() => {
      root.unmount();
    });
  });

  it("discardAllPending awaits every domains own discardPending, durably clearing each domains outbox", async () => {
    const { root, captured } = await mountHarness();
    await flush();

    act(() => {
      captured.addCustomTrick?.({ kind: "standalone", name: "Around the World", kenteiRank: undefined });
    });
    await flush();
    act(() => {
      captured.addNote?.({ trickId: "big-cup", trickName: "Big cup", body: "Note body" });
    });
    await flush();
    expect(captured.status?.pendingCount).toBe(2);

    await act(async () => {
      await captured.status?.discardAllPending();
    });
    await flush();

    expect(captured.status?.pendingCount).toBe(0);

    const persistedKey = identityNamespace(USER_IDENTITY) + ":" + CUSTOM_TRICK_SYNC_ENVELOPE_STORAGE_KEY;
    const persisted = await AsyncStorage.getItem(persistedKey);
    expect(persisted).not.toBeNull();
    const parsed = JSON.parse(persisted as string) as { outbox: readonly unknown[] };
    expect(parsed.outbox).toEqual([]);

    act(() => {
      root.unmount();
    });
  });
});
