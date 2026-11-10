// Gate coverage for HomeScreen holding the onboarding decision until a signed-in account's first
// profile pull settles. The sync coordinator status is mocked so each scenario can set the
// coordinator state directly; the coordinator itself has its own suites.

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import HomeScreen from '@/app/app/home';
import { CustomTrickProvider } from '@/features/custom-tricks/state/custom-trick-provider';
import {
  INITIAL_GUEST_IMPORT_STATE,
  type GuestImportDomainCounts,
  type GuestImportState,
} from '@/features/guest-import/model/guest-import';
import {
  serializeUserProfile,
  USER_PROFILE_STORAGE_KEY,
} from '@/features/profile/persistence/user-profile-persistence';
import { UserProfileProvider } from '@/features/profile/state/user-profile-provider';
import { PracticeHistoryProvider } from '@/features/stats/state/practice-history-provider';
import { createIdentityContext } from '@/shared/persistence/identity-context';
import { GUEST_IDENTITY, type Identity } from '@/shared/persistence/identity';
import { IdentityHandleContext } from '@/shared/persistence/identity-provider';
import { physicalKey } from '@/shared/persistence/scoped-storage';
import type { DomainSyncOutcome, SyncCoordinatorState } from '@/shared/sync/coordinator';

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

let mockGuestImportState: GuestImportState = INITIAL_GUEST_IMPORT_STATE;
jest.mock('@/features/guest-import/state/use-guest-import', () => ({
  useGuestImport: () => ({
    state: mockGuestImportState,
    confirmImport: jest.fn(),
    dismiss: jest.fn(),
  }),
}));

let mockCoordinatorState: SyncCoordinatorState;
const mockRetry = jest.fn();
jest.mock('@/shared/sync/sync-coordinator-provider', () => ({
  useSyncCoordinatorStatus: () => ({ state: mockCoordinatorState, retry: mockRetry }),
}));

const USER_IDENTITY: Identity = { kind: 'user', userId: '11111111-1111-1111-1111-111111111111' };
const GENERATION = 0;

function runningWithoutProfile(): SyncCoordinatorState {
  return {
    status: 'running',
    identityGeneration: GENERATION,
    run: {
      runId: 'r',
      identityGeneration: GENERATION,
      trigger: 'login',
      startedAt: 0,
      domainResults: {},
      queuedRerunTrigger: undefined,
    },
  };
}

function runningWithProfile(outcome: DomainSyncOutcome): SyncCoordinatorState {
  const state = runningWithoutProfile();
  if (state.status !== 'running') throw new Error('unreachable');
  return {
    ...state,
    run: { ...state.run, domainResults: { profile: { domain: 'profile', outcome, settledAt: 1 } } },
  };
}

function localOnlyCounts(): GuestImportDomainCounts {
  const zero = { local: 0, cloud: 0 };
  return {
    profile: { local: 2, cloud: 0 },
    customTricks: zero,
    practiceHistory: zero,
    goals: zero,
    notes: zero,
  };
}

function findByText(root: ReactTestRenderer, text: string) {
  return root.root.findAll((node) => node.props.children === text);
}

async function mountHome(identity: Identity) {
  const context = createIdentityContext(identity);
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(
      <IdentityHandleContext.Provider value={{ identity, generation: context.getGeneration(), context }}>
        <CustomTrickProvider>
          <UserProfileProvider>
            <PracticeHistoryProvider>
              <HomeScreen />
            </PracticeHistoryProvider>
          </UserProfileProvider>
        </CustomTrickProvider>
      </IdentityHandleContext.Provider>,
    );
    await Promise.resolve();
    await Promise.resolve();
  });
  return root;
}

const showsOnboarding = (root: ReactTestRenderer) => findByText(root, 'Get started').length > 0;
const showsDailyHome = (root: ReactTestRenderer) =>
  findByText(root, "You're putting in the work.").length > 0;
const showsRetry = (root: ReactTestRenderer) =>
  root.root.findAll((n) => n.props.accessibilityLabel === 'Retry' && typeof n.props.onPress === 'function');

describe('HomeScreen first profile pull gate', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    mockRetry.mockClear();
    mockGuestImportState = INITIAL_GUEST_IMPORT_STATE;
    mockCoordinatorState = runningWithoutProfile();
  });

  it('renders neither onboarding nor Home while the first pull is in flight', async () => {
    const root = await mountHome(USER_IDENTITY);

    expect(showsOnboarding(root)).toBe(false);
    expect(showsDailyHome(root)).toBe(false);
    expect(showsRetry(root)).toHaveLength(0);
    await act(async () => root.unmount());
  });

  it('shows a retry state, not onboarding, when the first pull fails, and retry re-runs the pull', async () => {
    mockCoordinatorState = runningWithProfile({ status: 'failed', errorMessage: 'offline' });
    const root = await mountHome(USER_IDENTITY);

    expect(showsOnboarding(root)).toBe(false);
    const [retry] = showsRetry(root);
    expect(retry).toBeDefined();
    act(() => retry.props.onPress());
    expect(mockRetry).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
  });

  it('reaches onboarding for a new account once the pull settles with no completed profile', async () => {
    mockCoordinatorState = runningWithProfile({ status: 'succeeded' });
    const root = await mountHome(USER_IDENTITY);

    expect(showsOnboarding(root)).toBe(true);
    expect(showsRetry(root)).toHaveLength(0);
    await act(async () => root.unmount());
  });

  it('goes straight to Home for a device whose profile already finished onboarding, without waiting', async () => {
    await AsyncStorage.setItem(
      physicalKey(USER_IDENTITY, USER_PROFILE_STORAGE_KEY),
      serializeUserProfile({ hasCompletedOnboarding: true, kenteiRank: 3, selectedTrickIds: [] }),
    );
    const root = await mountHome(USER_IDENTITY);

    expect(showsOnboarding(root)).toBe(false);
    expect(showsDailyHome(root)).toBe(true);
    await act(async () => root.unmount());
  });

  it('does not gate a guest on the coordinator', async () => {
    const root = await mountHome(GUEST_IDENTITY);

    expect(showsOnboarding(root)).toBe(true);
    await act(async () => root.unmount());
  });

  it('still blocks onboarding for a pending guest import even after the pull settles', async () => {
    mockCoordinatorState = runningWithProfile({ status: 'succeeded' });
    mockGuestImportState = {
      ...INITIAL_GUEST_IMPORT_STATE,
      status: 'awaitingConfirmation',
      inventory: localOnlyCounts(),
      targetKind: 'empty',
    };
    const root = await mountHome(USER_IDENTITY);

    expect(showsOnboarding(root)).toBe(false);
    await act(async () => root.unmount());
  });
});
