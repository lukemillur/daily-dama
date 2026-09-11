// T215: StatsScreen must never render EmptyStats for a signed-in identity
// whose guest import is still resolving, and must show the imported
// practice history once it resolves without requiring a remount.
//
// Structurally this is home.guest-import-resync.test.tsx (T199) adapted to
// the practiceHistory domain instead of profile: the guest import's upload
// phase pushes imported practice-session rows straight to the cloud
// practice-history repository via its own outbox push, never through
// PracticeHistoryProvider's own reducer/sync path. Once the import reaches
// 'completed', the import-pending gate lifts, but the local practice
// history was never told to re-pull the cloud rows the import just wrote --
// so StatsScreen needs its own explicit resync (targeting
// usePracticeHistorySync(), not useUserProfileSync()) and must keep gating
// render on it.
//
// Two cloud-transport mocks are needed here (profile and practiceHistory)
// because useRequireOnboarding() inside StatsScreen must resolve true
// before the component ever reaches the code under test -- so a seeded
// guest profile plus a mocked profile sync transport is required scaffolding,
// exactly as in home.guest-import-resync.test.tsx, in addition to the
// practice-history transport that's this task's actual point.

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
const mockRouter = { replace: jest.fn(), push: jest.fn() };
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

const mockCreatePracticeHistorySyncTransportAdapter = jest.fn();
jest.mock('@/features/stats/persistence/practice-history-sync-transport', () => ({
  createPracticeHistorySyncTransportAdapter: (...args: unknown[]) =>
    mockCreatePracticeHistorySyncTransportAdapter(...args),
}));

const mockGetSupabaseClient = jest.fn<(...args: any[]) => any>();
jest.mock('@/shared/supabase/supabase-client', () => ({
  getSupabaseClient: () => mockGetSupabaseClient(),
}));

import HomeScreen from '@/app/app/home';
import StatsScreen from '@/app/app/stats/index';
import { CustomTrickProvider } from '@/features/custom-tricks/state/custom-trick-provider';
import type { ProfileRow, UserTrickStateRow } from '@/features/profile/persistence/profile-cloud-repository';
import {
  serializeUserProfile,
  USER_PROFILE_STORAGE_KEY,
} from '@/features/profile/persistence/user-profile-persistence';
import { UserProfileProvider } from '@/features/profile/state/user-profile-provider';
import type { PracticeSessionRecord } from '@/features/stats/model/practice-history';
import type { PracticeSessionRow } from '@/features/stats/persistence/practice-history-cloud-repository';
import {
  PRACTICE_HISTORY_STORAGE_KEY,
  serializePracticeHistory,
} from '@/features/stats/persistence/practice-history-persistence';
import { PracticeHistoryProvider } from '@/features/stats/state/practice-history-provider';
import { createIdentityContext } from '@/shared/persistence/identity-context';
import { createUserIdentity, GUEST_IDENTITY, type Identity } from '@/shared/persistence/identity';
import { IdentityHandleContext } from '@/shared/persistence/identity-provider';
import { physicalKey } from '@/shared/persistence/scoped-storage';
import type { SyncPushRequest } from '@/shared/sync/transport';

const USER_ID = '44444444-4444-4444-4444-444444444444';
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
  return {
    ...counts,
    profile: { ...counts.profile, local: 1 },
    practiceHistory: { ...counts.practiceHistory, local: 1 },
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

const GUEST_SESSION: PracticeSessionRecord = {
  id: 'sesh-guest-1',
  trickId: 'trick-guest-1',
  trickName: 'Lighthouse',
  startedAt: 1_000,
  completedAt: 61_000,
  durationMs: 60_000,
  laceCount: 12,
};

async function seedGuestPracticeHistory() {
  await AsyncStorage.setItem(
    physicalKey(GUEST_IDENTITY, PRACTICE_HISTORY_STORAGE_KEY),
    serializePracticeHistory({ sessions: [GUEST_SESSION] }),
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

describe('StatsScreen never flashes EmptyStats after a guest import completes (T215)', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    mockRouter.replace.mockClear();
    mockRouter.push.mockClear();
    mockCountLocalGuestRecords.mockReset();
    mockCountCloudRecords.mockReset();
    mockBuildGuestImportTransports.mockReset();
    mockCreateProfileSyncTransportAdapter.mockReset();
    mockCreatePracticeHistorySyncTransportAdapter.mockReset();
    mockGetSupabaseClient.mockReset();
    mockGetSupabaseClient.mockReturnValue({ kind: 'fake-client' }); // truthy stand-in
  });

  it('shows the imported practice history directly, without EmptyStats ever painting, once the import completes', async () => {
    await seedGuestProfile();
    await seedGuestPracticeHistory();

    let cloudProfileRow: ProfileRow | undefined;
    const cloudPracticeSessionRows: PracticeSessionRow[] = [];

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
      practiceHistory: {
        push: async (request: SyncPushRequest) => {
          const payload = request.payload as Record<string, unknown>;
          const row: PracticeSessionRow = {
            user_id: USER_ID,
            id: payload.id as string,
            trick_id: payload.trick_id as string,
            trick_name: payload.trick_name as string,
            started_at: payload.started_at as number,
            completed_at: payload.completed_at as number,
            duration_ms: payload.duration_ms as number,
            lace_count: payload.lace_count as number,
            planned_duration_ms: (payload.planned_duration_ms as number | null) ?? null,
            origin: (payload.origin as string | null) ?? null,
            created_at: TIMESTAMP,
          };
          cloudPracticeSessionRows.push(row);
          return { status: 'succeeded', row };
        },
      },
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

    mockCreatePracticeHistorySyncTransportAdapter.mockReturnValue({
      pull: async () => ({
        status: 'succeeded',
        page: { items: cloudPracticeSessionRows, nextCursor: null },
      }),
      push: async () => ({
        status: 'succeeded',
        row: cloudPracticeSessionRows[0] as PracticeSessionRow,
      }),
    });

    let setIdentity: Driver['setIdentity'] | undefined;
    let root!: ReactTestRenderer;

    // T215: real navigation always lands a post-signup identity on Home
    // first (see T207's /app/home redirect). Home's own T199 resync effect
    // (useUserProfileSync().runSync) is what resolves the *profile*
    // domain's hasCompletedOnboarding/kenteiRank against the just-imported
    // cloud row -- StatsScreen intentionally does not duplicate that; it
    // only adds its own resync for the practiceHistory domain. Mounting
    // Home first, driving it to completion, and only then swapping the
    // route to Stats (root.update, keeping the same provider instances --
    // exactly like _layout.tsx's single provider tree persisting across a
    // route change) reproduces that real precondition sequentially,
    // instead of racing two independent useGuestImport() instances against
    // each other the way mounting both screens at once would.
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

    // Drive Home's own guest-import + profile-resync sequence to
    // completion (mirrors home.guest-import-resync.test.tsx's own loop).
    for (let i = 0; i < 20; i += 1) {
      await flush(1);
      expect(findByText(root, 'Get started').length).toBe(0);
    }
    expect(findByText(root, "You're putting in the work.").length).toBeGreaterThan(0);

    // Now simulate navigating from Home to Stats: same provider instances
    // (identity/profile/practice-history state all persists), but Home's
    // screen unmounts and Stats mounts fresh -- this is the moment
    // StatsScreen's own guest-import state observes an *already-completed*
    // import (T215's actual scenario) and must trigger its own
    // practiceHistory resync rather than relying on Home's.
    await act(async () => {
      root.update(
        <IdentityHandleTestProvider onDriverReady={(driver) => (setIdentity = driver.setIdentity)}>
          <CustomTrickProvider>
            <UserProfileProvider>
              <PracticeHistoryProvider>
                <StatsScreen />
              </PracticeHistoryProvider>
            </UserProfileProvider>
          </CustomTrickProvider>
        </IdentityHandleTestProvider>,
      );
    });

    // Snapshot EmptyStats-vs-populated content after every flush tick so a
    // transient flash can't hide between assertions.
    for (let i = 0; i < 20; i += 1) {
      await flush(1);
      expect(
        findByText(
          root,
          'Complete a focused practice session and your time, laces, and trick history will collect here.',
        ).length,
      ).toBe(0);
    }

    // The imported session surfaced without a remount -- same root
    // instance throughout, no root.unmount()/remount in between.
    expect(findByText(root, 'Lighthouse').length).toBeGreaterThan(0);

    await act(async () => {
      root.unmount();
    });
  });
});
