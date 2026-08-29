// T161.5, exit criterion: "a late in-flight sync result" must not
// resurrect a purged account namespace or land in the live (post-purge)
// guest namespace. This deliberately does not go through
// deleteAccount/Auth (that call path, purge-then-signOut ordering, and the
// four response-loss/offline scenarios are already covered at the unit
// level in auth-provider.test.tsx) -- it exercises purgeIdentityNamespace
// directly against the real, fully-wired domain providers plus
// SyncCoordinatorProvider, mirroring logout-guard.discard-isolation.test.tsx's
// own rationale: this level proves storage durability and cross-identity
// isolation, not the sign-out call itself.

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { type PropsWithChildren, useEffect, useState } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required by jest hoisting
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('@/features/profile/persistence/profile-sync-transport', () => ({
  createProfileSyncTransportAdapter: () => ({
    async pullProfileRow() {
      return { status: 'succeeded', page: { items: [], nextCursor: null } };
    },
    async pullTrickStatePage() {
      return { status: 'succeeded', page: { items: [], nextCursor: null } };
    },
    async push() {
      return { status: 'failed', error: { kind: 'network', message: 'not exercised in this test' } };
    },
  }),
}));

function mockCreateFakeRepositoryTransport() {
  return {
    async pull() {
      return { status: 'succeeded', page: { items: [], nextCursor: null } };
    },
    async push() {
      return { status: 'failed', error: { kind: 'network', message: 'not exercised in this test' } };
    },
  };
}

jest.mock('@/features/goals/persistence/goal-sync-transport', () => ({
  createGoalSyncTransportAdapter: () => mockCreateFakeRepositoryTransport(),
}));
jest.mock('@/features/notes/persistence/note-sync-transport', () => ({
  createNoteSyncTransportAdapter: () => mockCreateFakeRepositoryTransport(),
}));
jest.mock('@/features/stats/persistence/practice-history-sync-transport', () => ({
  createPracticeHistorySyncTransportAdapter: () => mockCreateFakeRepositoryTransport(),
}));
jest.mock('@/shared/supabase/supabase-client', () => ({
  getSupabaseClient: () => ({}),
}));

let deferredPushResolve: ((value: unknown) => void) | undefined;
const mockCustomTrickPush = jest.fn(
  (_request: unknown) =>
    new Promise((resolve) => {
      deferredPushResolve = resolve;
    }),
);
jest.mock('@/features/custom-tricks/persistence/custom-trick-sync-transport', () => ({
  createCustomTrickSyncTransportAdapter: () => ({
    async pull() {
      return { status: 'succeeded', page: { items: [], nextCursor: null } };
    },
    push: (request: unknown) => mockCustomTrickPush(request),
  }),
}));

import { CustomTrickProvider, useCustomTrickActions, useCustomTricks } from '@/features/custom-tricks/state/custom-trick-provider';
import { GoalProvider } from '@/features/goals/state/goal-provider';
import { NoteProvider } from '@/features/notes/state/note-provider';
import { UserProfileProvider } from '@/features/profile/state/user-profile-provider';
import { PracticeHistoryProvider } from '@/features/stats/state/practice-history-provider';
import { purgeIdentityNamespace } from '@/shared/persistence/account-purge';
import { createIdentityContext } from '@/shared/persistence/identity-context';
import { createUserIdentity, GUEST_IDENTITY, type Identity } from '@/shared/persistence/identity';
import { IdentityHandleContext } from '@/shared/persistence/identity-provider';
import { SyncCoordinatorProvider, useSyncCoordinatorStatus } from '@/shared/sync/sync-coordinator-provider';

function mustCreateUserIdentity(userId: string): Identity & { kind: 'user' } {
  const identity = createUserIdentity(userId);
  if (identity === undefined) {
    throw new Error('Expected a valid user identity in this test fixture.');
  }
  return identity;
}

const DELETED_USER_ID = '11111111-1111-1111-1111-111111111111';
const DELETED_USER_IDENTITY = mustCreateUserIdentity(DELETED_USER_ID);
const OTHER_USER_ID = '22222222-2222-2222-2222-222222222222';
const OTHER_USER_KEY = 'user:' + OTHER_USER_ID + ':daily-dama:sentinel';
const GUEST_KEY = 'guest:daily-dama:sentinel';

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
  retry?: () => void;
  addCustomTrick?: ReturnType<typeof useCustomTrickActions>['addCustomTrick'];
  customTrickIds?: readonly string[];
  setIdentity?: Driver['setIdentity'];
}

function makeExposer(captured: Captured) {
  return function Exposer() {
    const status = useSyncCoordinatorStatus();
    const { addCustomTrick } = useCustomTrickActions();
    const collection = useCustomTricks();
    useEffect(() => {
      captured.pendingCount = status.pendingCount;
      captured.retry = status.retry;
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

async function flush(times = 6) {
  for (let i = 0; i < times; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

describe('account deletion purge vs. a late in-flight sync result', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    deferredPushResolve = undefined;
    mockCustomTrickPush.mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('a push that lands after purge-and-switch-to-guest does not resurrect the deleted namespace or land in the live guest namespace, and leaves unrelated identities untouched', async () => {
    await AsyncStorage.setItem(GUEST_KEY, 'guest-sentinel-value');
    await AsyncStorage.setItem(OTHER_USER_KEY, 'other-user-sentinel-value');

    const captured: Captured = {};
    const root = await mountHarness(captured);
    await flush();

    act(() => {
      captured.setIdentity?.(DELETED_USER_IDENTITY);
    });
    await flush();

    act(() => {
      captured.addCustomTrick?.({ kind: 'standalone', name: 'Around the World', kenteiRank: undefined });
    });
    await flush();
    expect(captured.customTrickIds?.length).toBe(1);

    act(() => {
      captured.retry?.();
    });
    await flush();
    expect(mockCustomTrickPush).toHaveBeenCalledTimes(1);

    await act(async () => {
      await purgeIdentityNamespace(AsyncStorage, DELETED_USER_IDENTITY);
    });
    act(() => {
      captured.setIdentity?.(GUEST_IDENTITY);
    });
    await flush();

    expect(captured.customTrickIds).toEqual([]);

    await act(async () => {
      deferredPushResolve?.({
        status: 'succeeded',
        row: {
          id: 'late-ack-id',
          user_id: DELETED_USER_ID,
          kind: 'standalone',
          name: 'Around the World',
          kentei_rank: null,
          steps: null,
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
          revision: 1,
        },
      });
    });
    await flush();

    expect(captured.customTrickIds).toEqual([]);

    const allKeysAfter = await AsyncStorage.getAllKeys();
    const deletedUserKeys = allKeysAfter.filter((key) => key.startsWith('user:' + DELETED_USER_ID + ':'));
    expect(deletedUserKeys).toEqual([]);

    expect(await AsyncStorage.getItem(GUEST_KEY)).toBe('guest-sentinel-value');
    expect(await AsyncStorage.getItem(OTHER_USER_KEY)).toBe('other-user-sentinel-value');

    act(() => {
      root.unmount();
    });
  });
});
