import { describe, expect, it, jest } from "@jest/globals";

jest.mock("@react-native-async-storage/async-storage", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required by jest hoisting
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

import {
  deriveFailedDomainLabels,
  type AppLocalDurabilityDomainEntry,
} from "@/shared/persistence/use-app-local-durability";
import type { LocalDurabilityStatus, ScopedSaveOutcome } from "@/shared/persistence/storage";

function saved(): LocalDurabilityStatus<unknown> {
  return { status: "saved" };
}

function failed(retry: () => Promise<ScopedSaveOutcome> = jest.fn<() => Promise<ScopedSaveOutcome>>()): LocalDurabilityStatus<unknown> {
  return { status: "failed", snapshot: undefined, retry };
}

describe("deriveFailedDomainLabels", () => {
  it("returns an empty list when every domain is saved", () => {
    const entries: readonly AppLocalDurabilityDomainEntry[] = [
      { domain: "goals", label: "Goals", status: saved() },
      { domain: "notes", label: "Notes", status: saved() },
    ];

    expect(deriveFailedDomainLabels(entries)).toEqual([]);
  });

  it("returns the labels of only the failed domains, preserving order", () => {
    const entries: readonly AppLocalDurabilityDomainEntry[] = [
      { domain: "goals", label: "Goals", status: saved() },
      { domain: "notes", label: "Notes", status: failed() },
      { domain: "customTricks", label: "Custom tricks", status: failed() },
      { domain: "profile", label: "Profile", status: saved() },
    ];

    expect(deriveFailedDomainLabels(entries)).toEqual(["Notes", "Custom tricks"]);
  });
});
