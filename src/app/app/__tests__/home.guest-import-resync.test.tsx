// T199: HomeScreen must never render KenteiOnboarding after a guest's
// import completes, even during the window between the import's own
// 'completed' status (which lifts the T186.1 import-pending gate) and the
// local primary UserProfile reducer actually adopting the imported
// hasCompletedOnboarding/kenteiRank. This exercises the real composition
// bug (not just the reducer, which was already individually correct):
// guest-import's upload phase pushes straight to the cloud profile row via
// its own outbox push, never through the primary reducer's own sync path,
// so home.tsx must trigger an explicit resync and keep gating render on it.
//
// Mocking approach mirrors two established patterns in this repo rather
// than inventing a new one:
// - `IdentityHandleTestProvider` + mocked guest-import-inventory functions,
//   from `use-guest-import.test.tsx` (drives a real
//   inventorying -> awaitingConfirmation -> uploading -> completed
//   sequence against a real reducer, not a hand-stubbed one).
// - A mocked `createProfileSyncTransportAdapter` module, from
//   `two-browser-convergence.integration.test.tsx` (lets `home.tsx`'s new
//   `runSync('login')` call really run against
//   `UserProfileProvider`'s real `useProfileDomainSync`, pulling from a
//   fake cloud `profiles` row instead of a real Supabase client).
//
// Both fakes share one mutable "cloud profile row" object so the guest
// import's push and the resync's pull are actually talking to the same
// simulated backend, the way the real bug's timing gap requires.

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { type PropsWithChildren, useState } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required by jest hoisting
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-reanimated', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required by jest hoisting
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
import type { ProfileRow, UserTrickStateRow } from '@/features/profile/persistence/profile-cloud-repository';
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
import type { SyncPushRequest } from '@/shared/sync/transport';

const USER_ID = '33333333-3333-3333-3333-333333333333';
const USER_IDENTITY: Identity = createUserIdentity(USER_ID)!;
const TIMESTAMP = '2026-01-01T00:00:00.000Z';

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

async function flush(times = 8) {
  for (let i = 0; i < times; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

describe('HomeScreen never flashes onboarding after a guest import completes (T199)', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    mockRouter.replace.mockClear();
    mockCountLocalGuestRecords.mockReset();
    mockCountCloudRecords.mockReset();
    mockBuildGuestImportTransports.mockReset();
    mockCreateProfileSyncTransportAdapter.mockReset();
    mockGetSupabaseClient.mockReset();
    mockGetSupabaseClient.mockReturnValue({ kind: 'fake-client' }); // truthy stand-in
  });

  it('lands on DailyHome directly, without KenteiOnboarding ever painting, once the import completes', async () => {
    await seedGuestProfile();

    // Shared fake "cloud profiles row" -- guest-import's upload phase
    // writes to it, and the resync's pull reads it back. Starts undefined
    // (a genuinely brand-new cloud account), exactly like the real bug's
    // preconditions.
    let cloudProfileRow: ProfileRow | undefined;

    mockCountLocalGuestRecords.mockResolvedValue(guestLocalCounts());
    mockCountCloudRecords.mockResolvedValue({
      status: 'succeeded',
      counts: { profile: 0, customTricks: 0, practiceHistory: 0, goals: 0, notes: 0 },
    });
    mockBuildGuestImportTransports.mockReturnValue({
      profile: {
        push: async (request: SyncPushRequest) => {
          const payload = request.payload as Record<string, unknown>;
          const row: ProfileRow = {
            user_id: USER_ID,
            has_completed_onboarding: payload.has_completed_onboarding as boolean,
            kentei_rank: (payload.kentei_rank as number | null) ?? null,
            last_sesh: (payload.last_sesh as ProfileRow['last_sesh']) ?? null,
            streak_threshold_ms: (payload.streak_threshold_ms as number | null) ?? null,
            theme_accent_color: (payload.theme_accent_color as string | null) ?? null,
            theme_background_color: (payload.theme_background_color as string | null) ?? null,
            theme_text_color: (payload.theme_text_color as string | null) ?? null,
            created_at: TIMESTAMP,
            updated_at: TIMESTAMP,
            revision: 1,
          };
          cloudProfileRow = row;
          return { status: 'succeeded', row };
        },
      },
      customTricks: { push: async () => ({ status: 'succeeded', row: {} }) },
      practiceHistory: { push: async () => ({ status: 'succeeded', row: {} }) },
      goals: { push: async () => ({ status: 'succeeded', row: {} }) },
      notes: { push: async () => ({ status: 'succeeded', row: {} }) },
    });

    mockCreateProfileSyncTransportAdapter.mockReturnValue({
      pullProfileRow: async () => ({
        status: 'succeeded',
        page: { items: cloudProfileRow ? [cloudProfileRow] : [], nextCursor: null },
      }),
      pullTrickStatePage: async () => ({
        status: 'succeeded',
        page: { items: [] as UserTrickStateRow[], nextCursor: null },
      }),
      push: async () => ({ status: 'succeeded', row: cloudProfileRow as ProfileRow }),
    });

    let setIdentity: Driver['setIdentity'] | undefined;
    let root!: ReactTestRenderer;
    await act(async () => {
      root = create(
        <IdentityHandleTestProvider onDriverReady={(driver) => (setIdentity = driver.setIdentity)}>
          <CustomTrickProvider>
            <UserProfileProvider>
              <PracticeHistoryProvider>
                <HomeScreen />
              </PracticeHistoryProvider>
            </UserProfileProvider>
          </CustomTrickProvider>
        </IdentityHandleTestProvider>,
      );
    });

    await flush();

    // Simulate the real signup: the identity flips to a brand-new `user`
    // generation, exactly like IdentityProvider does post-signup.
    await act(async () => {
      setIdentity?.(USER_IDENTITY);
      await Promise.resolve();
      await Promise.resolve();
    });

    // Drive the whole guest-import + resync sequence to completion, taking
    // a snapshot of onboarding-vs-DailyHome content after every flush tick
    // so a transient flash can't hide between assertions.
    for (let i = 0; i < 20; i += 1) {
      await flush(1);
      expect(findByText(root, 'Get started').length).toBe(0);
    }

    expect(findByText(root, 'Showing up, in three numbers.').length).toBeGreaterThan(0);

    await act(async () => {
      root.unmount();
    });
  });
});
