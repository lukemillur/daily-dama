// T248.2 exit criterion: "A fully wired five-provider integration test... prove that a failure
// in any domain shows one accessibly announced warning that remains visible across route
// changes; retry operates on every currently failed domains latest snapshot without duplicate
// concurrent attempts; repeated failure keeps the warning and actionable guidance visible; and
// the warning disappears only after every current-generation failed write succeeds." Follows
// logout-guard.discard-isolation.test.tsxs fully wired harness precedent: real five domain
// providers, real AsyncStorage mock, fake sync transports so SyncCoordinatorProvider never
// touches real Supabase.

import { afterEach, beforeAll, describe, expect, it, jest } from "@jest/globals";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect } from "react";
import { Text } from "react-native";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

jest.mock("@react-native-async-storage/async-storage", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required by jest hoisting
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

function mockCreateFakeRepositoryTransport() {
  return {
    async pull() {
      return { status: "succeeded", page: { items: [], nextCursor: null } };
    },
    async push() {
      return { status: "failed", error: { kind: "network", message: "not exercised in this test" } };
    },
  };
}

jest.mock("@/features/custom-tricks/persistence/custom-trick-sync-transport", () => ({
  createCustomTrickSyncTransportAdapter: () => mockCreateFakeRepositoryTransport(),
}));
jest.mock("@/features/goals/persistence/goal-sync-transport", () => ({
  createGoalSyncTransportAdapter: () => mockCreateFakeRepositoryTransport(),
}));
jest.mock("@/features/notes/persistence/note-sync-transport", () => ({
  createNoteSyncTransportAdapter: () => mockCreateFakeRepositoryTransport(),
}));
jest.mock("@/features/stats/persistence/practice-history-sync-transport", () => ({
  createPracticeHistorySyncTransportAdapter: () => mockCreateFakeRepositoryTransport(),
}));
jest.mock("@/features/profile/persistence/profile-sync-transport", () => ({
  createProfileSyncTransportAdapter: () => ({
    async pullProfileRow() {
      return { status: "succeeded", page: { items: [], nextCursor: null } };
    },
    async pullTrickStatePage() {
      return { status: "succeeded", page: { items: [], nextCursor: null } };
    },
    async push() {
      return { status: "failed", error: { kind: "network", message: "not exercised in this test" } };
    },
  }),
}));
jest.mock("@/shared/supabase/supabase-client", () => ({
  getSupabaseClient: () => ({}),
}));

import { LocalDurabilityWarningBanner } from "@/components/local-durability-warning-banner";
import { CustomTrickProvider, useCustomTrickActions } from "@/features/custom-tricks/state/custom-trick-provider";
import { CUSTOM_TRICKS_STORAGE_KEY } from "@/features/custom-tricks/persistence/custom-trick-persistence";
import { GoalProvider } from "@/features/goals/state/goal-provider";
import { NoteProvider, useNoteActions } from "@/features/notes/state/note-provider";
import { NOTES_STORAGE_KEY } from "@/features/notes/persistence/note-persistence";
import { AppThemeProvider } from "@/features/profile/components/app-theme-provider";
import { UserProfileProvider } from "@/features/profile/state/user-profile-provider";
import { PracticeHistoryProvider } from "@/features/stats/state/practice-history-provider";
import { SyncCoordinatorProvider } from "@/shared/sync/sync-coordinator-provider";

interface Captured {
  addNote?: ReturnType<typeof useNoteActions>["addNote"];
  addCustomTrick?: ReturnType<typeof useCustomTrickActions>["addCustomTrick"];
}

function makeExposer(captured: Captured) {
  return function Exposer() {
    const { addNote } = useNoteActions();
    const { addCustomTrick } = useCustomTrickActions();
    useEffect(() => {
      captured.addNote = addNote;
      captured.addCustomTrick = addCustomTrick;
    });
    return null;
  };
}

function RouteStandIn({ routeName }: { routeName: string }) {
  return <Text>{routeName}</Text>;
}

function Harness({
  ExposerComponent,
  routeName,
}: {
  ExposerComponent: () => null;
  routeName: string;
}) {
  return (
    <CustomTrickProvider>
      <UserProfileProvider>
        <PracticeHistoryProvider>
          <NoteProvider>
            <GoalProvider>
              <SyncCoordinatorProvider>
                <AppThemeProvider>
                  <LocalDurabilityWarningBanner />
                  <RouteStandIn routeName={routeName} />
                  <ExposerComponent />
                </AppThemeProvider>
              </SyncCoordinatorProvider>
            </GoalProvider>
          </NoteProvider>
        </PracticeHistoryProvider>
      </UserProfileProvider>
    </CustomTrickProvider>
  );
}

async function flush(times = 6) {
  for (let i = 0; i < times; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

function findByAccessibilityRole(root: ReactTestRenderer, role: string) {
  return root.root.findAll((node) => typeof node.type !== "string" && node.props.accessibilityRole === role);
}

describe("LocalDurabilityWarningBanner, fully wired across the five domain providers", () => {
  // Captured once, before either test spies on AsyncStorage.setItem: jest.spyOn on an
  // already-a-mock function (the async-storage manual mocks setItem is already a jest.fn) reuses
  // the same underlying mock rather than wrapping it, so a later tests spyOn/mockRestore cycle can
  // leave getMockImplementation() unable to recover the original implementation for a subsequent
  // test in this same file. Capturing it exactly once up front avoids relying on that recovery.
  let realSetItem: typeof AsyncStorage.setItem;

  beforeAll(() => {
    realSetItem = (AsyncStorage.setItem as unknown as jest.Mock).getMockImplementation()! as typeof AsyncStorage.setItem;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("shows one alert naming every failed domain, keeps it visible across a route change, and clears it only once every failed write succeeds", async () => {
    const setItemSpy = jest.spyOn(AsyncStorage, "setItem").mockImplementation((key, value) => {
      if (key.includes(NOTES_STORAGE_KEY) || key.includes(CUSTOM_TRICKS_STORAGE_KEY)) {
        return Promise.reject(new Error("disk full"));
      }
      return realSetItem(key, value);
    });

    const captured: Captured = {};
    const ExposerComponent = makeExposer(captured);
    let root!: ReactTestRenderer;
    await act(async () => {
      root = create(<Harness ExposerComponent={ExposerComponent} routeName="home" />);
    });
    await flush();

    act(() => {
      captured.addNote?.({ trickId: "big-cup", trickName: "Big Cup", body: "Notes body" });
    });
    await flush();
    act(() => {
      captured.addCustomTrick?.({ kind: "standalone", name: "My Trick" });
    });
    await flush();

    let alerts = findByAccessibilityRole(root, "alert");
    expect(alerts).toHaveLength(1);
    let alertText = JSON.stringify(root.toJSON());
    expect(alertText).toContain("Notes");
    expect(alertText).toContain("Custom tricks");

    act(() => {
      root.update(<Harness ExposerComponent={ExposerComponent} routeName="sesh" />);
    });
    await flush();

    alerts = findByAccessibilityRole(root, "alert");
    expect(alerts).toHaveLength(1);

    setItemSpy.mockRestore();

    const [retryButton] = findByAccessibilityRole(root, "button");
    await act(async () => {
      await retryButton.props.onPress();
    });
    await flush();

    expect(findByAccessibilityRole(root, "alert")).toHaveLength(0);

    act(() => {
      root.unmount();
    });
  });


  it("keeps the warning visible after a still-failing retry, and a concurrent second Retry press does not re-invoke a domains retry while the first is in flight", async () => {
    let noteWriteCallCount = 0;
    const setItemSpy = jest.spyOn(AsyncStorage, "setItem").mockImplementation((key) => {
      if (key.includes(NOTES_STORAGE_KEY)) {
        noteWriteCallCount += 1;
      }
      return Promise.reject(new Error("disk full"));
    });

    const captured: Captured = {};
    const ExposerComponent = makeExposer(captured);
    let root!: ReactTestRenderer;
    await act(async () => {
      root = create(<Harness ExposerComponent={ExposerComponent} routeName="home" />);
    });
    await flush();

    act(() => {
      captured.addNote?.({ trickId: "big-cup", trickName: "Big Cup", body: "Notes body" });
    });
    await flush();

    expect(findByAccessibilityRole(root, "alert")).toHaveLength(1);
    noteWriteCallCount = 0;

    const [retryButton] = findByAccessibilityRole(root, "button");
    act(() => {
      retryButton.props.onPress();
      retryButton.props.onPress();
    });
    await flush();

    // Still failing: the warning and its Retry affordance both remain visible.
    expect(findByAccessibilityRole(root, "alert")).toHaveLength(1);
    expect(findByAccessibilityRole(root, "button").length).toBeGreaterThan(0);
    // The aggregate dedup guard means the second, concurrent press never re-invoked the domains
    // own retry -- exactly one underlying write attempt for the failing domain during this window.
    expect(noteWriteCallCount).toBe(1);

    // Lifting the interception entirely (rather than toggling a branch inside it) matches the
    // first tests proven-working pattern for letting a subsequent write actually succeed.
    setItemSpy.mockRestore();

    const [retryButtonAgain] = findByAccessibilityRole(root, "button");
    act(() => {
      retryButtonAgain.props.onPress();
    });
    await flush();

    expect(findByAccessibilityRole(root, "alert")).toHaveLength(0);

    act(() => {
      root.unmount();
    });
  });
});
