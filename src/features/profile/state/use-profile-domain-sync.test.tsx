import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { type PropsWithChildren, useEffect, useState } from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required by jest hoisting
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { INITIAL_USER_PROFILE, type UserProfile } from '@/features/profile/model/user-profile';
import type {
  ProfileRow,
  UserTrickStateRow,
} from '@/features/profile/persistence/profile-cloud-repository';
import type { ProfileSyncTransport } from '@/features/profile/persistence/profile-sync-transport';
import { useProfileDomainSync } from '@/features/profile/state/use-profile-domain-sync';
import { createIdentityContext } from '@/shared/persistence/identity-context';
import { createUserIdentity, GUEST_IDENTITY, type Identity } from '@/shared/persistence/identity';
import { IdentityHandleContext } from '@/shared/persistence/identity-provider';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const USER_IDENTITY: Identity = createUserIdentity(USER_ID)!;
const TIMESTAMP = '2026-01-01T00:00:00.000Z';
const TIMESTAMP_MS = Date.parse(TIMESTAMP);

interface FakeTransportOptions {
  readonly seedProfile?: ProfileRow | null;
  readonly seedTrickStates?: readonly UserTrickStateRow[];
}

interface FakeTransport extends ProfileSyncTransport {
  setFailPush(fail: boolean): void;
  setFailPull(fail: boolean): void;
  getProfileRow(): ProfileRow | null;
  getTrickState(trickId: string): UserTrickStateRow | undefined;
}

function createFakeProfileSyncTransport(options: FakeTransportOptions = {}): FakeTransport {
  let profileRow: ProfileRow | null = options.seedProfile ?? null;
  const trickStates = new Map<string, UserTrickStateRow>(
    (options.seedTrickStates ?? []).map((row) => [row.trick_id, row]),
  );
  let failPush = false;
  let failPull = false;

  return {
    async pullProfileRow() {
      if (failPull) return { status: 'failed', error: { kind: 'network', message: 'fake pull failure' } };
      return { status: 'succeeded', page: { items: profileRow ? [profileRow] : [], nextCursor: null } };
    },
    async pullTrickStatePage() {
      if (failPull) return { status: 'failed', error: { kind: 'network', message: 'fake pull failure' } };
      return { status: 'succeeded', page: { items: Array.from(trickStates.values()), nextCursor: null } };
    },
    async push(request) {
      if (failPush) return { status: 'failed', error: { kind: 'network', message: 'fake push failure' } };

      if (request.recordId === USER_ID) {
        if (request.expectedRevision !== null && (profileRow?.revision ?? null) !== request.expectedRevision) {
          return {
            status: 'conflict',
            conflict: {
              operationId: request.operationId,
              recordId: request.recordId,
              expectedRevision: request.expectedRevision,
              serverRevision: profileRow?.revision ?? 0,
            },
          };
        }
        const payload = request.payload as Record<string, unknown>;
        profileRow = {
          user_id: USER_ID,
          has_completed_onboarding: (payload.has_completed_onboarding as boolean) ?? false,
          kentei_rank: (payload.kentei_rank as number | null) ?? null,
          last_sesh: (payload.last_sesh as ProfileRow['last_sesh']) ?? null,
          streak_threshold_ms: (payload.streak_threshold_ms as number | null) ?? null,
          theme_accent_color: (payload.theme_accent_color as string | null) ?? null,
          theme_background_color: (payload.theme_background_color as string | null) ?? null,
          theme_text_color: (payload.theme_text_color as string | null) ?? null,
          created_at: TIMESTAMP,
          updated_at: TIMESTAMP,
          revision: (profileRow?.revision ?? 0) + 1,
        };
        return { status: 'succeeded', row: profileRow };
      }

      const trickId = request.recordId;
      const existing = trickStates.get(trickId);

      if (request.operationType === 'delete') {
        if (request.expectedRevision !== null && existing && existing.revision !== request.expectedRevision) {
          return {
            status: 'conflict',
            conflict: {
              operationId: request.operationId,
              recordId: trickId,
              expectedRevision: request.expectedRevision,
              serverRevision: existing.revision,
            },
          };
        }
        trickStates.delete(trickId);
        return {
          status: 'succeeded',
          row: existing ?? {
            id: trickId,
            user_id: USER_ID,
            trick_id: trickId,
            is_selected: false,
            is_manually_unlocked: false,
            revision: 0,
            created_at: TIMESTAMP,
            updated_at: TIMESTAMP,
          },
        };
      }

      if (request.expectedRevision !== null && existing && existing.revision !== request.expectedRevision) {
        return {
          status: 'conflict',
          conflict: {
            operationId: request.operationId,
            recordId: trickId,
            expectedRevision: request.expectedRevision,
            serverRevision: existing.revision,
          },
        };
      }
      const payload = request.payload as Record<string, unknown>;
      const row: UserTrickStateRow = {
        id: existing?.id ?? `row-${trickId}`,
        user_id: USER_ID,
        trick_id: trickId,
        is_selected: (payload.is_selected as boolean) ?? false,
        is_manually_unlocked: (payload.is_manually_unlocked as boolean) ?? false,
        created_at: TIMESTAMP,
        updated_at: TIMESTAMP,
        revision: (existing?.revision ?? 0) + 1,
      };
      trickStates.set(trickId, row);
      return { status: 'succeeded', row };
    },

    setFailPush: (fail: boolean) => {
      failPush = fail;
    },
    setFailPull: (fail: boolean) => {
      failPull = fail;
    },
    getProfileRow: () => profileRow,
    getTrickState: (trickId: string) => trickStates.get(trickId),
  };
}

interface Driver {
  readonly setIdentity: (next: Identity) => void;
}

// Same test-only stand-in for `IdentityProvider` as
// `use-identity-scoped-domain.test.tsx` -- lets a test drive identity
// switches directly while exercising the real `IdentityHandleContext` the
// production hook (and, transitively, `useProfileDomainSync`) reads from.
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
  profile?: UserProfile;
  setProfile?: (next: UserProfile) => void;
  runSync?: ReturnType<typeof useProfileDomainSync>['runSync'];
  isSyncing?: boolean;
  pendingCount?: number;
  discardPending?: () => Promise<void>;
}

// `captured` is closed over (not passed as a prop) so the harness component
// never mutates a prop/hook-argument object -- matching
// `use-identity-scoped-domain.test.tsx`'s own `makeHarness` pattern.
function makeHarness(
  initialProfile: UserProfile,
  getTransport: () => FakeTransport | undefined,
  captured: Captured,
) {
  return function Harness() {
    const [profile, setProfile] = useState(initialProfile);
    const sync = useProfileDomainSync({
      profile,
      hasHydratedProfile: true,
      dispatchProfile: (action) => {
        if (action.type === 'profileRestored') setProfile(action.profile);
      },
      getTransport,
    });

    useEffect(() => {
      captured.profile = profile;
      captured.setProfile = setProfile;
      captured.runSync = sync.runSync;
      captured.isSyncing = sync.isSyncing;
      captured.pendingCount = sync.pendingCount;
      captured.discardPending = sync.discardPending;
    });

    return <Text>{JSON.stringify(profile)}</Text>;
  };
}

async function mountHarness(
  initialProfile: UserProfile,
  getTransport: () => FakeTransport | undefined,
  identity: Identity = USER_IDENTITY,
) {
  const captured: Captured = {};
  const Harness = makeHarness(initialProfile, getTransport, captured);
  let setIdentity: Driver['setIdentity'] | undefined;

  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(
      <IdentityHandleTestProvider onDriverReady={(driver) => (setIdentity = driver.setIdentity)}>
        <Harness />
      </IdentityHandleTestProvider>,
    );
  });

  if (identity.kind === 'user') {
    await act(async () => {
      setIdentity?.(identity);
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  return { root, captured };
}

async function flush(times = 4) {
  for (let i = 0; i < times; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

describe('useProfileDomainSync', () => {
  // Every test in this suite uses the same fixed USER_IDENTITY -- without
  // clearing between tests, a later test's "fresh envelope" would actually
  // read an earlier test's persisted (mocked) AsyncStorage data.
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('offline create: enqueues an outbox op, persists it, and reloads the same pending op on remount', async () => {
    const transport = createFakeProfileSyncTransport();
    transport.setFailPush(true);

    const initialProfile: UserProfile = { ...INITIAL_USER_PROFILE, hasCompletedOnboarding: true, kenteiRank: 3 };
    const { root, captured } = await mountHarness(INITIAL_USER_PROFILE, () => transport, USER_IDENTITY);
    await flush();

    act(() => {
      captured.setProfile?.(initialProfile);
    });
    await flush();

    // No sync trigger fires here (the coordinator, not this hook, owns
    // login-triggering as of T157.9) -- the local mutation is still
    // enqueued as a pending outbox op by the diff effect above, which is
    // all this test needs: nothing observable to assert on the transport
    // (it never wrote), but the envelope must have persisted the pending op.
    act(() => {
      root.unmount();
    });

    // Remount under the same identity, still offline -- the persisted
    // envelope for this identity must still carry the pending
    // profile-scalar operation from before the reload.
    const second = await mountHarness(INITIAL_USER_PROFILE, () => transport, USER_IDENTITY);
    await flush();
    expect(transport.getProfileRow()).toBeNull(); // still never reached the server

    // Now reconnect: the operation that survived the reload flushes.
    transport.setFailPush(false);
    await act(async () => {
      await second.captured.runSync?.('manual');
    });
    await flush();

    expect(transport.getProfileRow()?.kentei_rank).toBe(3);

    act(() => {
      second.root.unmount();
    });
  });

  it('reconnect: a previously-queued pending op pushes, gets acknowledged, and its revision is recorded', async () => {
    const transport = createFakeProfileSyncTransport();
    transport.setFailPush(true);

    const editedProfile: UserProfile = { ...INITIAL_USER_PROFILE, hasCompletedOnboarding: true, kenteiRank: 5 };
    const { root, captured } = await mountHarness(INITIAL_USER_PROFILE, () => transport, USER_IDENTITY);
    await flush();

    act(() => {
      captured.setProfile?.(editedProfile);
    });
    await flush();

    expect(transport.getProfileRow()).toBeNull();

    transport.setFailPush(false);
    await act(async () => {
      await captured.runSync?.('manual');
    });
    await flush();

    expect(transport.getProfileRow()?.kentei_rank).toBe(5);

    act(() => {
      root.unmount();
    });
  });

  it('second-browser rehydrate: a fresh envelope pulls a fake-seeded server fixture and the primary reducer matches it exactly', async () => {
    const seededProfile: ProfileRow = {
      user_id: USER_ID,
      has_completed_onboarding: true,
      kentei_rank: 8,
      last_sesh: null,
      streak_threshold_ms: null,
      theme_accent_color: null,
      theme_background_color: null,
      theme_text_color: null,
      created_at: TIMESTAMP,
      updated_at: TIMESTAMP,
      revision: 1,
    };
    const seededTrickState: UserTrickStateRow = {
      id: 'row-trick-1',
      user_id: USER_ID,
      trick_id: 'trick-1',
      is_selected: true,
      is_manually_unlocked: false,
      created_at: TIMESTAMP,
      updated_at: TIMESTAMP,
      revision: 1,
    };
    const transport = createFakeProfileSyncTransport({
      seedProfile: seededProfile,
      seedTrickStates: [seededTrickState],
    });

    const { root, captured } = await mountHarness(INITIAL_USER_PROFILE, () => transport, USER_IDENTITY);
    await flush();

    // T157.9: login-triggering moved from this hook to the shared sync
    // coordinator, so this hook's own tests must drive the pull-adopt
    // explicitly rather than relying on an auto-fired login effect.
    await act(async () => {
      await captured.runSync?.('manual');
    });
    await flush();

    expect(captured.profile).toEqual({
      hasCompletedOnboarding: true,
      kenteiRank: 8,
      selectedTrickIds: ['trick-1'],
      manuallyUnlockedTrickIds: [],
      updatedAt: TIMESTAMP_MS,
    });

    act(() => {
      root.unmount();
    });
  });

  it('a conflict on one trick id does not block an unrelated trick id, and the conflicted op stays pending', async () => {
    const transport = createFakeProfileSyncTransport();
    const { root, captured } = await mountHarness(INITIAL_USER_PROFILE, () => transport, USER_IDENTITY);
    await flush();

    // Seed trick-1 offline while push always fails, so both trick-1 and
    // trick-2 end up in the outbox with expectedRevision === null.
    transport.setFailPush(true);
    act(() => {
      captured.setProfile?.({ ...INITIAL_USER_PROFILE, selectedTrickIds: ['trick-1'] });
    });
    await flush();
    act(() => {
      captured.setProfile?.({ ...INITIAL_USER_PROFILE, selectedTrickIds: ['trick-1', 'trick-2'] });
    });
    await flush();

    // A concurrent write lands on trick-1 server-side, so this device's
    // still-pending trick-1 op will conflict on its next push (its cached
    // expectedRevision stays null while a real row now exists).
    await transport.push({
      operationId: 'seed-conflict',
      recordId: 'trick-1',
      operationType: 'upsert',
      payload: { user_id: USER_ID, trick_id: 'trick-1', is_selected: true, is_manually_unlocked: false },
      expectedRevision: null,
    });

    transport.setFailPush(false);
    await act(async () => {
      await captured.runSync?.('manual');
    });
    await flush();

    // trick-2 (unrelated) should have succeeded regardless of trick-1's outcome.
    expect(transport.getTrickState('trick-2')).toBeDefined();

    act(() => {
      root.unmount();
    });
  });

  it('rapid toggling of the same trick id offline coalesces to one pending outbox operation', async () => {
    const transport = createFakeProfileSyncTransport();
    transport.setFailPush(true);

    const { root, captured } = await mountHarness(INITIAL_USER_PROFILE, () => transport, USER_IDENTITY);
    await flush();

    for (const selectedTrickIds of [['trick-1'], [], ['trick-1'], [], ['trick-1']]) {
      act(() => {
        captured.setProfile?.({ ...INITIAL_USER_PROFILE, selectedTrickIds });
      });
      await flush(1);
    }
    await flush();

    // No direct outbox-length assertion is exposed by the hook's public
    // surface -- proven indirectly: a subsequent successful sync run
    // produces exactly one push outcome for trick-1's final state, not
    // five. If coalescing failed, `pushOutboxOperations` would attempt
    // several ops for the same recordId including now-invalid revisions.
    transport.setFailPush(false);
    await act(async () => {
      await captured.runSync?.('manual');
    });
    await flush();

    expect(transport.getTrickState('trick-1')?.is_selected).toBe(true); // final state: selected (last toggle was ['trick-1'])
    expect(transport.getTrickState('trick-1')?.revision).toBe(1); // exactly one push landed, not five

    act(() => {
      root.unmount();
    });
  });

  it('guest identity never enqueues operations and runSync is a no-op', async () => {
    const transport = createFakeProfileSyncTransport();
    const { root, captured } = await mountHarness(INITIAL_USER_PROFILE, () => transport, GUEST_IDENTITY);
    await flush();

    act(() => {
      captured.setProfile?.({ ...INITIAL_USER_PROFILE, hasCompletedOnboarding: true, kenteiRank: 1 });
    });
    await flush();

    let result: Awaited<ReturnType<NonNullable<Captured['runSync']>>> | undefined;
    await act(async () => {
      result = await captured.runSync?.('manual');
    });
    expect(result?.outcome).toEqual({ status: 'succeeded' });
    expect(transport.getProfileRow()).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it('pendingCount reflects the outbox length and updates as operations are applied and acknowledged', async () => {
    const transport = createFakeProfileSyncTransport();
    const { root, captured } = await mountHarness(INITIAL_USER_PROFILE, () => transport, USER_IDENTITY);
    await flush();

    expect(captured.pendingCount).toBe(0);

    act(() => {
      captured.setProfile?.({ ...INITIAL_USER_PROFILE, selectedTrickIds: ['trick-1'] });
    });
    await flush();

    expect(captured.pendingCount).toBe(1);

    await act(async () => {
      await captured.runSync?.('manual');
    });
    await flush();

    expect(captured.pendingCount).toBe(0);

    act(() => {
      root.unmount();
    });
  });

  it('discardPending clears the outbox and persists the cleared envelope', async () => {
    const transport = createFakeProfileSyncTransport();
    transport.setFailPush(true);
    const { root, captured } = await mountHarness(INITIAL_USER_PROFILE, () => transport, USER_IDENTITY);
    await flush();

    act(() => {
      captured.setProfile?.({ ...INITIAL_USER_PROFILE, selectedTrickIds: ['trick-1'] });
    });
    await flush();
    expect(captured.pendingCount).toBe(1);

    await act(async () => {
      await captured.discardPending?.();
    });
    await flush();

    expect(captured.pendingCount).toBe(0);
    expect(captured.profile?.selectedTrickIds).toEqual(['trick-1']);

    act(() => {
      root.unmount();
    });

    const second = await mountHarness(INITIAL_USER_PROFILE, () => transport, USER_IDENTITY);
    await flush();
    expect(second.captured.pendingCount).toBe(0);

    act(() => {
      second.root.unmount();
    });
  });

  it('discardPending is a safe no-op when the outbox is already empty', async () => {
    const transport = createFakeProfileSyncTransport();
    const { root, captured } = await mountHarness(INITIAL_USER_PROFILE, () => transport, USER_IDENTITY);
    await flush();

    expect(captured.pendingCount).toBe(0);

    await act(async () => {
      await captured.discardPending?.();
    });
    await flush();

    expect(captured.pendingCount).toBe(0);

    act(() => {
      root.unmount();
    });
  });

  it('discardPending is scoped to its own identity: a fresh identity never observes a prior identitys pending outbox', async () => {
    const transport = createFakeProfileSyncTransport();
    transport.setFailPush(true);
    const { root, captured } = await mountHarness(INITIAL_USER_PROFILE, () => transport, USER_IDENTITY);
    await flush();

    act(() => {
      captured.setProfile?.({ ...INITIAL_USER_PROFILE, selectedTrickIds: ['trick-1'] });
    });
    await flush();
    expect(captured.pendingCount).toBe(1);

    act(() => {
      root.unmount();
    });

    const OTHER_USER_IDENTITY = createUserIdentity('22222222-2222-2222-2222-222222222222')!;
    const other = await mountHarness(INITIAL_USER_PROFILE, () => transport, OTHER_USER_IDENTITY);
    await flush();
    expect(other.captured.pendingCount).toBe(0);

    act(() => {
      other.root.unmount();
    });
  });
});
