// T158, exit criterion: "other-device sessions remain signed in and
// subsequent guest/user identities cannot access discarded account cache
// or operations." Mounts the real five domain providers plus the real
// IdentityProvider-equivalent context plus the real SyncCoordinatorProvider
// (fake Supabase transports, real AsyncStorage mock) -- following
// sync-coordinator.sesh-isolation.test.tsxs "fully wired" precedent, but
// driving identity switches directly (mirrors
// use-identity-scoped-domain.test.tsxs own switchable
// IdentityHandleTestProvider) rather than through real Auth/Supabase, since
// what this file needs to prove is specifically storage durability and
// cross-identity isolation of a discarded outbox, not the sign-out call
// itself (already covered end-to-end, with these same hooks mocked, in
// account-section.test.tsx and use-logout-guard.test.tsx). scope: local in
// auth-provider.tsx signOut is unchanged by this ticket, so "other-device
// sessions remain signed in" needs no new test beyond that fact.

import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { type PropsWithChildren, useEffect, useState } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

jest.mock("@react-native-async-storage/async-storage", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required by jest hoisting
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

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
jest.mock("@/shared/supabase/supabase-client", () => ({
  getSupabaseClient: () => ({}),
}));

import { CustomTrickProvider, useCustomTrickActions, useCustomTricks } from "@/features/custom-tricks/state/custom-trick-provider";
import { CUSTOM_TRICK_SYNC_ENVELOPE_STORAGE_KEY } from "@/features/custom-tricks/persistence/custom-trick-sync-envelope";
import { GoalProvider } from "@/features/goals/state/goal-provider";
import { NoteProvider } from "@/features/notes/state/note-provider";
import { UserProfileProvider } from "@/features/profile/state/user-profile-provider";
import { PracticeHistoryProvider } from "@/features/stats/state/practice-history-provider";
import { createIdentityContext } from "@/shared/persistence/identity-context";
import { createUserIdentity, GUEST_IDENTITY, identityNamespace, type Identity } from "@/shared/persistence/identity";
import { IdentityHandleContext } from "@/shared/persistence/identity-provider";
import { SyncCoordinatorProvider, useSyncCoordinatorStatus } from "@/shared/sync/sync-coordinator-provider";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const USER_IDENTITY: Identity = createUserIdentity(USER_ID)!;

interface Driver {
  readonly setIdentity: (next: Identity) => void;
}

function IdentityHandleTestProvider({
  children,
  onDriverReady,
}: PropsWithChildren<{ readonly onDriverReady: (driver: Driver) => void }>) {
  const [context] = useState(() => createIdentityContext());
  const [handle, setHandle] = useState(() => ({
    identity: context.getIdentity(),
    generation: context.getGeneration(),
    context,
  }));

  onDriverReady({
    setIdentity: (next) => {
      const generation = context.setIdentity(next);
      setHandle({ identity: next, generation, context });
    },
  });

  return <IdentityHandleContext.Provider value={handle}>{children}</IdentityHandleContext.Provider>;
}

interface Captured {
  pendingCount?: number;
  discardAllPending?: () => Promise<void>;
  addCustomTrick?: ReturnType<typeof useCustomTrickActions>["addCustomTrick"];
  customTrickIds?: readonly string[];
  setIdentity?: Driver["setIdentity"];
}

function makeExposer(captured: Captured) {
  return function Exposer() {
    const status = useSyncCoordinatorStatus();
    const { addCustomTrick } = useCustomTrickActions();
    const collection = useCustomTricks();
    useEffect(() => {
      captured.pendingCount = status.pendingCount;
      captured.discardAllPending = status.discardAllPending;
      captured.addCustomTrick = addCustomTrick;
      captured.customTrickIds = collection.tricks.map((trick) => trick.id);
    });
    return null;
  };
}

async function mountHarness(captured: Captured) {
  const Exposer = makeExposer(captured);
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(
      <IdentityHandleTestProvider onDriverReady={(driver) => (captured.setIdentity = driver.setIdentity)}>
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
  return root;
}

async function flush(times = 4) {
  for (let i = 0; i < times; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

describe("logout-guard discard durability and cross-identity isolation", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("discardAllPending durably clears the persisted outbox, and neither a fresh guest nor a later same-user generation can observe it", async () => {
    const captured: Captured = {};
    const root = await mountHarness(captured);
    await flush();

    act(() => {
      captured.setIdentity?.(USER_IDENTITY);
    });
    await flush();

    act(() => {
      captured.addCustomTrick?.({ kind: "standalone", name: "Around the World", kenteiRank: undefined });
    });
    await flush();

    expect(captured.pendingCount).toBe(1);
    expect(captured.customTrickIds?.length).toBe(1);
    const trickId = captured.customTrickIds?.[0];

    await act(async () => {
      await captured.discardAllPending?.();
    });
    await flush();

    expect(captured.pendingCount).toBe(0);
    // The local edit itself is untouched immediately after discard -- only
    // the sync obligation was cleared.
    expect(captured.customTrickIds).toEqual([trickId]);

    const persistedKey = identityNamespace(USER_IDENTITY) + ":" + CUSTOM_TRICK_SYNC_ENVELOPE_STORAGE_KEY;
    const persisted = await AsyncStorage.getItem(persistedKey);
    expect(persisted).not.toBeNull();
    const parsedEnvelope = JSON.parse(persisted as string) as { outbox: readonly unknown[] };
    expect(parsedEnvelope.outbox).toEqual([]);

    // A fresh guest identity (a new generation) cannot observe the
    // discarded operation -- its own namespace never had it, and the
    // domain providers re-hydration for the new generation shows a clean
    // slate.
    act(() => {
      captured.setIdentity?.(GUEST_IDENTITY);
    });
    await flush();

    expect(captured.pendingCount).toBe(0);
    expect(captured.customTrickIds).toEqual([]);

    // Switching back to the SAME user (a new generation, same underlying
    // namespace) still shows no pending outbox -- the discard was durable
    // on this identitys own storage, not merely an in-memory clear. (Note,
    // not this tickets concern to fix: because the outbox was emptied, the
    // very next auto-login sync legitimately pull-adopts whatever the
    // fake-empty transport reports, which is a pre-existing, orthogonal
    // consequence of the discard-does-not-requeue limitation documented in
    // TASKS_DONE.md, not a T158 regression.)
    act(() => {
      captured.setIdentity?.(USER_IDENTITY);
    });
    await flush();

    expect(captured.pendingCount).toBe(0);

    act(() => {
      root.unmount();
    });
  });
});
