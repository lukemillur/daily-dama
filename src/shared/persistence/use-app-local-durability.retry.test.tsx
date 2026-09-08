import { describe, expect, it, jest } from "@jest/globals";
import { useEffect } from "react";
import { Text } from "react-native";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

jest.mock("@react-native-async-storage/async-storage", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required by jest hoisting
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

import type { LocalDurabilityStatus, ScopedSaveOutcome } from "@/shared/persistence/storage";

let mockGoalsStatus: LocalDurabilityStatus<unknown> = { status: "saved" };
let mockNotesStatus: LocalDurabilityStatus<unknown> = { status: "saved" };
const mockCustomTricksStatus: LocalDurabilityStatus<unknown> = { status: "saved" };
const mockProfileStatus: LocalDurabilityStatus<unknown> = { status: "saved" };
const mockPracticeHistoryStatus: LocalDurabilityStatus<unknown> = { status: "saved" };

jest.mock("@/features/goals/state/goal-provider", () => ({
  useGoalDurability: () => mockGoalsStatus,
}));
jest.mock("@/features/notes/state/note-provider", () => ({
  useNoteDurability: () => mockNotesStatus,
}));
jest.mock("@/features/custom-tricks/state/custom-trick-provider", () => ({
  useCustomTrickDurability: () => mockCustomTricksStatus,
}));
jest.mock("@/features/profile/state/user-profile-provider", () => ({
  useUserProfileDurability: () => mockProfileStatus,
}));
jest.mock("@/features/stats/state/practice-history-provider", () => ({
  usePracticeHistoryDurability: () => mockPracticeHistoryStatus,
}));

import { useAppLocalDurability, type AppLocalDurabilitySummary } from "@/shared/persistence/use-app-local-durability";

interface Captured {
  summary?: AppLocalDurabilitySummary;
}

function makeHarness(captured: Captured) {
  return function Harness() {
    const summary = useAppLocalDurability();
    useEffect(() => {
      captured.summary = summary;
    });
    return <Text>{JSON.stringify(summary.failedLabels)}</Text>;
  };
}

async function flush(times = 4) {
  for (let i = 0; i < times; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

describe("useAppLocalDurability", () => {
  it("reports no failure when every domain is saved", async () => {
    mockGoalsStatus = { status: "saved" };
    mockNotesStatus = { status: "saved" };
    const captured: Captured = {};
    const Harness = makeHarness(captured);
    let root!: ReactTestRenderer;
    await act(async () => {
      root = create(<Harness />);
    });

    expect(captured.summary?.hasFailure).toBe(false);
    expect(captured.summary?.failedLabels).toEqual([]);

    act(() => {
      root.unmount();
    });
  });

  it("retryAll calls each failed domains retry once and ignores a concurrent second call", async () => {
    let resolveFirst: (() => void) | undefined;
    const goalRetry = jest.fn<() => Promise<ScopedSaveOutcome>>(
      () =>
        new Promise((resolve) => {
          resolveFirst = () => resolve({ status: "saved" });
        }),
    );
    const noteRetry = jest.fn<() => Promise<ScopedSaveOutcome>>(async () => ({ status: "saved" }));
    mockGoalsStatus = { status: "failed", snapshot: undefined, retry: goalRetry };
    mockNotesStatus = { status: "failed", snapshot: undefined, retry: noteRetry };

    const captured: Captured = {};
    const Harness = makeHarness(captured);
    let root!: ReactTestRenderer;
    await act(async () => {
      root = create(<Harness />);
    });
    await flush();

    expect(captured.summary?.hasFailure).toBe(true);
    expect(captured.summary?.failedLabels).toEqual(["Goals", "Notes"]);

    let firstCall: Promise<void> | undefined;
    let secondCall: Promise<void> | undefined;
    act(() => {
      firstCall = captured.summary?.retryAll();
      secondCall = captured.summary?.retryAll();
    });
    await flush();

    expect(goalRetry).toHaveBeenCalledTimes(1);
    expect(noteRetry).toHaveBeenCalledTimes(1);

    resolveFirst?.();
    await act(async () => {
      await Promise.all([firstCall, secondCall]);
    });

    expect(goalRetry).toHaveBeenCalledTimes(1);
    expect(noteRetry).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
  });
});
