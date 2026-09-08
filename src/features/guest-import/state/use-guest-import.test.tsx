import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { type PropsWithChildren, useEffect, useState } from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required by jest hoisting
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Untyped jest.fn() stand-ins for the mocked module below; each test
// asserts a concrete shape via mockResolvedValue/mockReturnValue.
const mockCountLocalGuestRecords = jest.fn<(...args: any[]) => any>();
const mockCountCloudRecords = jest.fn<(...args: any[]) => any>();
const mockBuildGuestImportTransports = jest.fn<(...args: any[]) => any>();

jest.mock('@/features/guest-import/persistence/guest-import-inventory', () => ({
  countLocalGuestRecords: (...args: unknown[]) => mockCountLocalGuestRecords(...args),
  countCloudRecords: (...args: unknown[]) => mockCountCloudRecords(...args),
  buildGuestImportTransports: (...args: unknown[]) => mockBuildGuestImportTransports(...args),
}));

const mockGetSupabaseClient = jest.fn<(...args: any[]) => any>();
jest.mock('@/shared/supabase/supabase-client', () => ({
  getSupabaseClient: () => mockGetSupabaseClient(),
}));

import { useGuestImport } from '@/features/guest-import/state/use-guest-import';
import type { GuestImportDomainCounts } from '@/features/guest-import/model/guest-import';
import { createIdentityContext } from '@/shared/persistence/identity-context';
import { createUserIdentity, GUEST_IDENTITY, type Identity } from '@/shared/persistence/identity';
import { IdentityHandleContext } from '@/shared/persistence/identity-provider';
import { createGuestMigratingStorage } from '@/shared/persistence/scoped-storage';
import { saveGoals } from '@/features/goals/persistence/goal-persistence';
import { saveUserProfile } from '@/features/profile/persistence/user-profile-persistence';
import { INITIAL_USER_PROFILE } from '@/features/profile/model/user-profile';
import type { SyncPushRequest } from '@/shared/sync/transport';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const USER_IDENTITY: Identity = createUserIdentity(USER_ID)!;
const OTHER_USER_ID = '22222222-2222-2222-2222-222222222222';
const OTHER_USER_IDENTITY: Identity = createUserIdentity(OTHER_USER_ID)!;

function zeroCounts(): GuestImportDomainCounts {
  return {
    profile: { local: 0, cloud: 0 },
    customTricks: { local: 0, cloud: 0 },
    practiceHistory: { local: 0, cloud: 0 },
    goals: { local: 0, cloud: 0 },
    notes: { local: 0, cloud: 0 },
  };
}

function localOnlyCounts(): GuestImportDomainCounts {
  const counts = zeroCounts();
  return {
    profile: { ...counts.profile, local: 2 },
    customTricks: { ...counts.customTricks, local: 3 },
    practiceHistory: { ...counts.practiceHistory, local: 1 },
    goals: { ...counts.goals, local: 0 },
    notes: { ...counts.notes, local: 0 },
  };
}

interface Driver {
  readonly setIdentity: (next: Identity) => void;
}

function IdentityHandleTestProvider({
  children,
  onDriverReady,
}: PropsWithChildren<{ onDriverReady: (driver: Driver) => void }>) {
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
  result?: ReturnType<typeof useGuestImport>;
}

function makeHarness(captured: Captured) {
  return function Harness() {
    const result = useGuestImport();
    useEffect(() => {
      captured.result = result;
    });
    return <Text>{JSON.stringify(result.state)}</Text>;
  };
}

async function mountHarness(identity: Identity = GUEST_IDENTITY) {
  const captured: Captured = { };
  const Harness = makeHarness(captured);
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

  return { root, captured, setIdentity: (next: Identity) => setIdentity?.(next) };
}

async function flush(times = 6) {
  for (let i = 0; i < times; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

describe('useGuestImport', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    mockCountLocalGuestRecords.mockReset();
    mockCountCloudRecords.mockReset();
    mockBuildGuestImportTransports.mockReset();
    mockGetSupabaseClient.mockReset();
    mockGetSupabaseClient.mockReturnValue({ kind: 'fake-client' }); // truthy stand-in
    mockBuildGuestImportTransports.mockReturnValue({ kind: 'fake-transports' });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('a guest identity never inventories: no transport calls, state stays idle with no importId', async () => {
    const { captured } = await mountHarness(GUEST_IDENTITY);
    await flush();

    expect(mockCountLocalGuestRecords).not.toHaveBeenCalled();
    expect(mockCountCloudRecords).not.toHaveBeenCalled();
    expect(captured.result?.state.status).toBe('idle');
    expect(captured.result?.state.importId).toBeUndefined();
  });

  it('auto-inventories on first hydration for a signed-in identity: idle -> inventorying -> awaitingConfirmation, targetKind "empty" for a reachable-but-empty cloud', async () => {
    mockCountLocalGuestRecords.mockResolvedValue(localOnlyCounts());
    mockCountCloudRecords.mockResolvedValue({ status: 'succeeded', counts: { profile: 0, customTricks: 0, practiceHistory: 0, goals: 0, notes: 0 } });

    const { captured } = await mountHarness(USER_IDENTITY);
    await flush();

    expect(mockCountLocalGuestRecords).toHaveBeenCalledTimes(1);
    expect(mockCountCloudRecords).toHaveBeenCalledTimes(1);
    // T186.1: awaitingConfirmation with local data auto-confirms without any
    // confirmImport() caller action, so by the time flush() settles this has
    // already progressed to uploading.
    expect(captured.result?.state.status).toBe('uploading');
    expect(captured.result?.state.targetKind).toBe('empty');
    expect(captured.result?.state.inventory).toEqual(localOnlyCounts());
  });

  it('a nonzero cloud count yields targetKind "existing"', async () => {
    mockCountLocalGuestRecords.mockResolvedValue(localOnlyCounts());
    mockCountCloudRecords.mockResolvedValue({ status: 'succeeded', counts: { profile: 1, customTricks: 0, practiceHistory: 0, goals: 0, notes: 0 } });
    // T206: unlike the 'empty'-target case above, the 'existing'-target
    // upload path unconditionally calls readExistingAccountSnapshot before
    // it ever reaches the transports.profile?.push dry-run check below --
    // the bare `{ kind: 'fake-transports' }` stub's missing
    // pullProfileRow/pull methods would throw a real TypeError here (this
    // used to be silently masked by the pre-fix bug that mis-wedged any
    // mid-upload exception in 'uploading' forever; now it correctly
    // resets to 'idle', so this stub needs real (if empty) pull methods to
    // freeze at the same push-check early return the 'empty' case relies on).
    const emptyPage = async () => ({ status: 'succeeded' as const, page: { items: [] as unknown[], nextCursor: null } });
    mockBuildGuestImportTransports.mockReturnValue({
      profile: { pullProfileRow: async () => ({ status: 'succeeded' as const, page: { items: [], nextCursor: null } }), pullTrickStatePage: emptyPage },
      customTricks: { pull: emptyPage },
      practiceHistory: { pull: emptyPage },
      goals: { pull: emptyPage },
      notes: { pull: emptyPage },
    });

    const { captured } = await mountHarness(USER_IDENTITY);
    await flush();

    expect(captured.result?.state.status).toBe('uploading');
    expect(captured.result?.state.targetKind).toBe('existing');
  });

  it('awaitingConfirmation with local data transitions to uploading without any confirmImport() caller action (T186.1)', async () => {
    mockCountLocalGuestRecords.mockResolvedValue(localOnlyCounts());
    mockCountCloudRecords.mockResolvedValue({ status: 'succeeded', counts: { profile: 0, customTricks: 0, practiceHistory: 0, goals: 0, notes: 0 } });

    const { captured } = await mountHarness(USER_IDENTITY);
    await flush();

    // No confirmImport() call anywhere in this test -- the hook's own
    // effect must dispatch confirmPressed as soon as awaitingConfirmation
    // is reached with local data.
    expect(captured.result?.state.status).toBe('uploading');
    expect(Object.values(captured.result?.state.domainOutcomes ?? { }).every((o) => o?.status === 'pending')).toBe(
      true,
    );
  });

  it('awaitingConfirmation with an all-zero inventory stays parked and never auto-dispatches confirmPressed', async () => {
    mockCountLocalGuestRecords.mockResolvedValue(zeroCounts());
    mockCountCloudRecords.mockResolvedValue({ status: 'succeeded', counts: { profile: 0, customTricks: 0, practiceHistory: 0, goals: 0, notes: 0 } });

    const { captured } = await mountHarness(USER_IDENTITY);
    await flush();

    expect(captured.result?.state.status).toBe('awaitingConfirmation');
  });

  it('a client/transport failure lands in idle with errorMessage set instead of hanging in inventorying', async () => {
    mockCountLocalGuestRecords.mockResolvedValue(localOnlyCounts());
    mockGetSupabaseClient.mockReturnValue(null);

    const { captured } = await mountHarness(USER_IDENTITY);
    await flush();

    expect(mockCountCloudRecords).not.toHaveBeenCalled();
    expect(captured.result?.state.status).toBe('idle');
    expect(captured.result?.state.errorMessage).toBeDefined();
  });

  it('a cloud counting failure also lands in idle with errorMessage set', async () => {
    mockCountLocalGuestRecords.mockResolvedValue(localOnlyCounts());
    mockCountCloudRecords.mockResolvedValue({ status: 'failed', domain: 'goals', errorMessage: 'boom' });

    const { captured } = await mountHarness(USER_IDENTITY);
    await flush();

    expect(captured.result?.state.status).toBe('idle');
    expect(captured.result?.state.errorMessage).toBe('boom');
  });
});

describe('useGuestImport: remount/resume and identity change', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    mockCountLocalGuestRecords.mockReset();
    mockCountCloudRecords.mockReset();
    mockBuildGuestImportTransports.mockReset();
    mockGetSupabaseClient.mockReset();
    mockGetSupabaseClient.mockReturnValue({ kind: 'fake-client' });
    mockBuildGuestImportTransports.mockReturnValue({ kind: 'fake-transports' });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('remounting with a persisted awaitingConfirmation record resumes without re-inventorying', async () => {
    // Uses zeroCounts() (not localOnlyCounts()) so the T186.1 auto-confirm
    // effect doesn't fire on the very first mount, before the record can
    // even be unmounted/persisted at awaitingConfirmation -- this test is
    // about resume-without-re-inventorying, not about auto-confirm.
    mockCountLocalGuestRecords.mockResolvedValue(zeroCounts());
    mockCountCloudRecords.mockResolvedValue({ status: 'succeeded', counts: { profile: 0, customTricks: 0, practiceHistory: 0, goals: 0, notes: 0 } });

    const first = await mountHarness(USER_IDENTITY);
    await flush();
    expect(first.captured.result?.state.status).toBe('awaitingConfirmation');

    act(() => {
      first.root.unmount();
    });

    mockCountLocalGuestRecords.mockClear();
    mockCountCloudRecords.mockClear();

    const second = await mountHarness(USER_IDENTITY);
    await flush();

    expect(second.captured.result?.state.status).toBe('awaitingConfirmation');
    expect(second.captured.result?.state.targetKind).toBe('empty');
    expect(mockCountLocalGuestRecords).not.toHaveBeenCalled();
    expect(mockCountCloudRecords).not.toHaveBeenCalled();
  });

  it('remounting with a persisted inventorying record re-runs the inventory', async () => {
    let resolveLocalCounts: ((counts: GuestImportDomainCounts) => void) | undefined;
    mockCountLocalGuestRecords.mockImplementation(
      () => new Promise<GuestImportDomainCounts>((resolve) => {
        resolveLocalCounts = resolve;
      }),
    );

    const first = await mountHarness(USER_IDENTITY);
    await flush();
    expect(first.captured.result?.state.status).toBe('inventorying');

    act(() => {
      first.root.unmount();
    });

    expect(resolveLocalCounts).toBeDefined();
    mockCountLocalGuestRecords.mockReset();
    mockCountLocalGuestRecords.mockResolvedValue(localOnlyCounts());
    mockCountCloudRecords.mockResolvedValue({ status: 'succeeded', counts: { profile: 0, customTricks: 0, practiceHistory: 0, goals: 0, notes: 0 } });

    const second = await mountHarness(USER_IDENTITY);
    await flush();

    expect(mockCountLocalGuestRecords).toHaveBeenCalledTimes(1);
    // T186.1: localOnlyCounts() has local data, so the resumed
    // awaitingConfirmation auto-confirms past to uploading by the time
    // flush() settles -- the re-inventorying assertion above is this
    // test's actual subject.
    expect(second.captured.result?.state.status).toBe('uploading');
  });

  it('an identity change while awaitingConfirmation resets to idle, and the new identity hydrates its own independent record', async () => {
    // Uses zeroCounts() (not localOnlyCounts()) so the T186.1 auto-confirm
    // effect doesn't move the first identity's record past
    // awaitingConfirmation before the identity switch this test exercises.
    mockCountLocalGuestRecords.mockResolvedValue(zeroCounts());
    mockCountCloudRecords.mockResolvedValue({ status: 'succeeded', counts: { profile: 0, customTricks: 0, practiceHistory: 0, goals: 0, notes: 0 } });

    const { captured, setIdentity } = await mountHarness(USER_IDENTITY);
    await flush();
    expect(captured.result?.state.status).toBe('awaitingConfirmation');

    mockCountLocalGuestRecords.mockClear();
    mockCountCloudRecords.mockClear();
    mockCountLocalGuestRecords.mockResolvedValue(zeroCounts());
    mockCountCloudRecords.mockResolvedValue({ status: 'succeeded', counts: { profile: 0, customTricks: 0, practiceHistory: 0, goals: 0, notes: 0 } });

    await act(async () => {
      setIdentity(OTHER_USER_IDENTITY);
      await Promise.resolve();
      await Promise.resolve();
    });
    await flush();

    // The new identity's own record starts fresh and inventories
    // independently -- it must not carry over the first identity's
    // awaitingConfirmation status or inventory contents.
    expect(captured.result?.state.status).toBe('awaitingConfirmation');
    expect(captured.result?.state.ownerIdentityNamespace).toBe(`user:${OTHER_USER_ID}`);
    expect(captured.result?.state.inventory).toEqual(zeroCounts());
  });
});

// T186.2: an existing-account merge's profile-preference and record
// conflicts are resolved automatically by updatedAt at merge-planning time
// (planExistingAccountMerge), so this drives a genuine targetKind:
// 'existing' merge with a guest/cloud mismatch all the way through the
// hook to 'completed', with a fuller mocked transports object (the "dry-run
// inventory" stub used above deliberately no-ops the upload effect).
describe('useGuestImport: existing-account merge resolves automatically', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    mockCountLocalGuestRecords.mockReset();
    mockCountCloudRecords.mockReset();
    mockBuildGuestImportTransports.mockReset();
    mockGetSupabaseClient.mockReset();
    mockGetSupabaseClient.mockReturnValue({ kind: 'fake-client' });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('resolves a strictly-newer guest edit automatically, pushes it, and completes with no chooseProfile/resolveConflict/finishConflicts caller action', async () => {
    // Seed the guest's own local goal, strictly newer than the cloud's.
    const guestStorage = createGuestMigratingStorage(AsyncStorage, { getIdentity: () => GUEST_IDENTITY });
    await saveUserProfile(guestStorage, { ...INITIAL_USER_PROFILE, hasCompletedOnboarding: true });
    await saveGoals(guestStorage, {
      goals: [{ id: 'goal-1', trickId: 'trick-1', trickName: 'Trick', kind: 'count', targetCount: 3, createdAt: 500, updatedAt: 2000 }],
    });

    mockCountLocalGuestRecords.mockResolvedValue({
      profile: { local: 0, cloud: 0 }, customTricks: { local: 0, cloud: 0 }, practiceHistory: { local: 0, cloud: 0 },
      goals: { local: 1, cloud: 0 }, notes: { local: 0, cloud: 0 },
    });
    mockCountCloudRecords.mockResolvedValue({
      status: 'succeeded', counts: { profile: 0, customTricks: 0, practiceHistory: 0, goals: 1, notes: 0 },
    });

    const pushedByDomain: Record<string, SyncPushRequest[]> = { profile: [], customTricks: [], practiceHistory: [], goals: [], notes: [] };
    function trackingPush(domain: string) {
      return async (request: SyncPushRequest) => {
        pushedByDomain[domain].push(request);
        return { status: 'succeeded' as const, row: {} };
      };
    }
    const emptyPage = async () => ({ status: 'succeeded' as const, page: { items: [] as unknown[], nextCursor: null } });
    const cloudGoalRow = {
      id: 'goal-1', user_id: USER_ID, trick_id: 'trick-1', trick_name: 'Trick', kind: 'count',
      target_count: 5, target_ms: null, created_at: new Date(500).toISOString(), updated_at: new Date(1000).toISOString(),
      revision: 2, deleted_at: null,
    };
    mockBuildGuestImportTransports.mockReturnValue({
      profile: {
        pullProfileRow: async () => ({ status: 'succeeded', page: { items: [], nextCursor: null } }),
        pullTrickStatePage: emptyPage,
        push: trackingPush('profile'),
      },
      customTricks: { pull: emptyPage, push: trackingPush('customTricks') },
      practiceHistory: { pull: emptyPage, push: trackingPush('practiceHistory') },
      goals: {
        pull: async () => ({ status: 'succeeded', page: { items: [cloudGoalRow], nextCursor: null } }),
        push: trackingPush('goals'),
      },
      notes: { pull: emptyPage, push: trackingPush('notes') },
    });

    const { captured } = await mountHarness(USER_IDENTITY);
    await flush(20);

    expect(captured.result?.state.status).toBe('completed');
    expect('chooseProfile' in (captured.result ?? {})).toBe(false);
    expect('resolveConflict' in (captured.result ?? {})).toBe(false);
    expect('finishConflicts' in (captured.result ?? {})).toBe(false);

    // The guest's strictly-newer goal (updatedAt 2000 vs. cloud's 1000) won
    // automatically -- its pushed payload carries the guest's targetCount,
    // not the cloud's.
    expect(pushedByDomain.goals).toHaveLength(1);
    expect(pushedByDomain.goals[0].recordId).toBe('goal-1');
    expect(pushedByDomain.goals[0].payload).toEqual(expect.objectContaining({ target_count: 3 }));
  });

  // T206: a mid-upload exception during readExistingAccountSnapshot (any
  // pull failure, thrown as `new Error(target.error.message)`) must not
  // wedge the state machine in 'uploading' forever -- pre-fix, the catch
  // block only ever marked the 'profile' domain settled via
  // domainUploadSettled, leaving the other 4 domains permanently 'pending'
  // and isGuestImportPendingResolution stuck `true`, which is exactly what
  // blanked Home. This is the regression test for that bug.
  it('a mid-upload exception (existing-account cloud pull failure) resets to idle with an errorMessage instead of wedging in uploading', async () => {
    mockCountLocalGuestRecords.mockResolvedValue({
      profile: { local: 1, cloud: 0 }, customTricks: { local: 0, cloud: 0 }, practiceHistory: { local: 0, cloud: 0 },
      goals: { local: 0, cloud: 0 }, notes: { local: 0, cloud: 0 },
    });
    mockCountCloudRecords.mockResolvedValue({
      status: 'succeeded', counts: { profile: 1, customTricks: 0, practiceHistory: 0, goals: 0, notes: 0 },
    });

    const emptyPage = async () => ({ status: 'succeeded' as const, page: { items: [] as unknown[], nextCursor: null } });
    mockBuildGuestImportTransports.mockReturnValue({
      profile: {
        pullProfileRow: async () => ({ status: 'failed', error: { kind: 'network', message: 'could not reach cloud profile' } }),
        pullTrickStatePage: emptyPage,
        push: async () => ({ status: 'succeeded' as const, row: {} }),
      },
      customTricks: { pull: emptyPage, push: async () => ({ status: 'succeeded' as const, row: {} }) },
      practiceHistory: { pull: emptyPage, push: async () => ({ status: 'succeeded' as const, row: {} }) },
      goals: { pull: emptyPage, push: async () => ({ status: 'succeeded' as const, row: {} }) },
      notes: { pull: emptyPage, push: async () => ({ status: 'succeeded' as const, row: {} }) },
    });

    const { captured } = await mountHarness(USER_IDENTITY);
    await flush(20);

    expect(captured.result?.state.status).toBe('idle');
    expect(captured.result?.state.errorMessage).toBe('could not reach cloud profile');
    // Every domain must be cleared back out, not left half-'pending' --
    // this is what the pre-fix bug got wrong.
    expect(Object.keys(captured.result?.state.domainOutcomes ?? {})).toHaveLength(0);
  });
});
