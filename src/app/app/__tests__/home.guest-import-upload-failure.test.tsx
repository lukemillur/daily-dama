// T206: HomeScreen must never render null forever when a signed-in
// identity's guest import throws mid-upload against an existing, populated
// account. Pre-fix, use-guest-import.ts's upload-effect catch block only
// ever dispatched domainUploadSettled for the 'profile' domain on any
// thrown error, so guestImportReducer's domainUploadSettled case could
// never see allDomainsSettled across all 5 SYNC_DOMAINS -- the state
// machine wedged permanently at 'uploading', and
// isGuestImportPendingResolution (which treats any 'uploading' status
// as unconditionally pending) blocked home.tsx's render gate forever,
// surviving reload because the state is durably persisted. This mirrors
// home.guest-import-resync.test.tsx (T199)'s scaffolding but exercises
// the failure path instead of the success path.

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { type PropsWithChildren, useState } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-reanimated', () =>
  require('react-native-reanimated/mock'),
);
const mockRouter = { replace: jest.fn() };
jest.mock('expo-router', () => ({
  ...(jest.requireActual('expo-router') as Record<string, unknown>),
  useRouter: () => mockRouter,
}));

const mockCountLocalGuestRecords = jest.fn<(...args: any[]) => any>();
const mockCountCloudRecords = jest.fn<(...args: any[]) => any>();
const mockBuildGuestImportTransports = jest.fn<(...args: any[]) => any>();
jest.mock('@/features/guest-import/persistence/guest-import-inventory', () => ({
  countLocalGuestRecords: (...args: unknown[]) => mockCountLocalGuestRecords(...args),
  countCloudRecords: (...args: unknown[]) => mockCountCloudRecords(...args),
  buildGuestImportTransports: (...args: unknown[]) => mockBuildGuestImportTransports(...args),
}));

const mockCreateProfileSyncTransportAdapter = jest.fn();
jest.mock('@/features/profile/persistence/profile-sync-transport', () => ({
  createProfileSyncTransportAdapter: (...args: unknown[]) => mockCreateProfileSyncTransportAdapter(...args),
}));

const mockGetSupabaseClient = jest.fn<(...args: any[]) => any>();
jest.mock('@/shared/supabase/supabase-client', () => ({
  getSupabaseClient: () => mockGetSupabaseClient(),
}));

import HomeScreen from '@/app/app/home';
import { CustomTrickProvider } from '@/features/custom-tricks/state/custom-trick-provider';
import {
  serializeUserProfile,
  USER_PROFILE_STORAGE_KEY,
} from '@/features/profile/persistence/user-profile-persistence';
import { UserProfileProvider } from '@/features/profile/state/user-profile-provider';
import { PracticeHistoryProvider } from '@/features/stats/state/practice-history-provider';
import { createIdentityContext } from '@/shared/persistence/identity-context';
import { createUserIdentity, GUEST_IDENTITY, type Identity } from '@/shared/persistence/identity';
import { IdentityHandleContext } from '@/shared/persistence/identity-provider';
import { physicalKey } from '@/shared/persistence/scoped-storage';

const USER_ID = '44444444-4444-4444-4444-444444444444';
const USER_IDENTITY: Identity = createUserIdentity(USER_ID)!;

function zeroCounts() {
  return {
    profile: { local: 0, cloud: 0 },
    customTricks: { local: 0, cloud: 0 },
    practiceHistory: { local: 0, cloud: 0 },
    goals: { local: 0, cloud: 0 },
    notes: { local: 0, cloud: 0 },
  };
}

function guestLocalCounts() {
  const counts = zeroCounts();
  return { ...counts, profile: { ...counts.profile, local: 1 } };
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

async function seedGuestProfile() {
  await AsyncStorage.setItem(
    physicalKey(GUEST_IDENTITY, USER_PROFILE_STORAGE_KEY),
    serializeUserProfile({
      hasCompletedOnboarding: true,
      kenteiRank: 3,
      selectedTrickIds: [],
    }),
  );
}

function findByText(root: ReactTestRenderer, text: string | RegExp) {
  return root.root.findAll((node) => {
    const { children } = node.props;
    if (typeof children !== 'string' && typeof children !== 'number') return false;
    const value = String(children);
    return typeof text === 'string' ? value === text : text.test(value);
  });
}

// __DEV__ is always true under Jest, so home.tsx's two dev-sandbox <Link>
// elements always render regardless of blockingOnboardingRender --
// root.toJSON() is never literally null in this environment. The real
// "blank" symptom is neither onboarding's nor DailyHome's own content ever
// painting, so that's what this checks instead.
function isRenderingNeitherOnboardingNorHome(root: ReactTestRenderer): boolean {
  const onboarding = findByText(root, 'Get started').length > 0;
  const dailyHome = findByText(root, 'Showing up, in three numbers.').length > 0;
  return !onboarding && !dailyHome;
}

async function flush(times = 8) {
  for (let i = 0; i < times; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

function renderTree(onDriverReady: (driver: Driver) => void) {
  return (
    <IdentityHandleTestProvider onDriverReady={onDriverReady}>
      <CustomTrickProvider>
        <UserProfileProvider>
          <PracticeHistoryProvider>
            <HomeScreen />
          </PracticeHistoryProvider>
        </UserProfileProvider>
      </CustomTrickProvider>
    </IdentityHandleTestProvider>
  );
}

describe('HomeScreen never renders null forever when a guest import throws mid-upload against an existing account (T206)', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    mockRouter.replace.mockClear();
    mockCountLocalGuestRecords.mockReset();
    mockCountCloudRecords.mockReset();
    mockBuildGuestImportTransports.mockReset();
    mockCreateProfileSyncTransportAdapter.mockReset();
    mockCreateProfileSyncTransportAdapter.mockReturnValue({
      pullProfileRow: async () => ({ status: 'succeeded', page: { items: [], nextCursor: null } }),
      pullTrickStatePage: async () => ({ status: 'succeeded', page: { items: [], nextCursor: null } }),
      push: async () => ({ status: 'succeeded', row: {} }),
    });
    mockGetSupabaseClient.mockReset();
    mockGetSupabaseClient.mockReturnValue({ kind: 'fake-client' });
  });

  it('recovers to a real render on initial login, and stays that way after a simulated remount/reload', async () => {
    await seedGuestProfile();

    mockCountLocalGuestRecords.mockResolvedValue(guestLocalCounts());
    mockCountCloudRecords.mockResolvedValue({
      status: 'succeeded',
      counts: { profile: 1, customTricks: 0, practiceHistory: 0, goals: 0, notes: 0 },
    });

    const emptyPage = async () => ({ status: 'succeeded' as const, page: { items: [] as unknown[], nextCursor: null } });
    mockBuildGuestImportTransports.mockReturnValue({
      profile: {
        pullProfileRow: async () => ({
          status: 'failed',
          error: { kind: 'network', message: 'could not reach cloud profile' },
        }),
        pullTrickStatePage: emptyPage,
        push: async () => ({ status: 'succeeded' as const, row: {} }),
      },
      customTricks: { pull: emptyPage, push: async () => ({ status: 'succeeded' as const, row: {} }) },
      practiceHistory: { pull: emptyPage, push: async () => ({ status: 'succeeded' as const, row: {} }) },
      goals: { pull: emptyPage, push: async () => ({ status: 'succeeded' as const, row: {} }) },
      notes: { pull: emptyPage, push: async () => ({ status: 'succeeded' as const, row: {} }) },
    });

    let setIdentity: Driver['setIdentity'] | undefined;
    let root!: ReactTestRenderer;
    await act(async () => {
      root = create(renderTree((driver) => (setIdentity = driver.setIdentity)));
    });
    await flush();

    await act(async () => {
      setIdentity?.(USER_IDENTITY);
      await Promise.resolve();
      await Promise.resolve();
    });

    for (let i = 0; i < 20; i += 1) {
      await flush(1);
    }

    expect(isRenderingNeitherOnboardingNorHome(root)).toBe(false);

    await act(async () => {
      root.unmount();
    });

    let remountedSetIdentity: Driver['setIdentity'] | undefined;
    let remounted!: ReactTestRenderer;
    await act(async () => {
      remounted = create(renderTree((driver) => (remountedSetIdentity = driver.setIdentity)));
    });
    await act(async () => {
      remountedSetIdentity?.(USER_IDENTITY);
      await Promise.resolve();
      await Promise.resolve();
    });
    await flush(10);

    expect(isRenderingNeitherOnboardingNorHome(remounted)).toBe(false);

    await act(async () => {
      remounted.unmount();
    });
  });
});
