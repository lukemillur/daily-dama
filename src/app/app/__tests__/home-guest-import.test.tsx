// T186.1: gate-only coverage for HomeScreen's onboarding gate awareness of
// an in-progress/pending guest import. use-guest-import.ts is mocked so
// each scenario can set state.status/state.inventory directly without
// driving the real inventory/upload pipeline -- that pipeline already has
// its own dedicated coverage (guest-import-empty-account.test.ts,
// guest-import-existing-account.test.ts, use-guest-import.test.tsx). This
// file's job is only the gate (isGuestImportPendingResolution wired into
// home.tsx), kept separate from the large home.test.tsx since it needs a
// different mount harness (an identity-scoped provider wrapper).

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import HomeScreen from '@/app/app/home';
import { CustomTrickProvider } from '@/features/custom-tricks/state/custom-trick-provider';
import { INITIAL_GUEST_IMPORT_STATE, type GuestImportDomainCounts, type GuestImportState } from '@/features/guest-import/model/guest-import';
import {
  serializeUserProfile,
  USER_PROFILE_STORAGE_KEY,
} from '@/features/profile/persistence/user-profile-persistence';
import { UserProfileProvider } from '@/features/profile/state/user-profile-provider';
import { PracticeHistoryProvider } from '@/features/stats/state/practice-history-provider';
import { createIdentityContext } from '@/shared/persistence/identity-context';
import type { Identity } from '@/shared/persistence/identity';
import { IdentityHandleContext } from '@/shared/persistence/identity-provider';
import { physicalKey } from '@/shared/persistence/scoped-storage';

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

const USER_ID = '11111111-1111-1111-1111-111111111111';
const USER_IDENTITY: Identity = { kind: 'user', userId: USER_ID };

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
  return { ...counts, profile: { ...counts.profile, local: 2 } };
}

function findByText(root: ReactTestRenderer, text: string) {
  return root.root.findAll((node) => node.props.children === text);
}

async function mountHomeScreen(identity: Identity) {
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

describe('HomeScreen onboarding gate: guest-import awareness (T186.1)', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    mockRouter.replace.mockClear();
    mockGuestImportState = INITIAL_GUEST_IMPORT_STATE;
  });

  it('does not show onboarding while awaitingConfirmation has local data yet to auto-confirm', async () => {
    mockGuestImportState = {
      ...INITIAL_GUEST_IMPORT_STATE,
      status: 'awaitingConfirmation',
      inventory: localOnlyCounts(),
      targetKind: 'empty',
    };

    const root = await mountHomeScreen(USER_IDENTITY);

    expect(findByText(root, 'Get started').length).toBe(0);

    await act(async () => {
      root.unmount();
    });
  });

  it('skips onboarding once the import has completed and written the profile', async () => {
    await AsyncStorage.setItem(
      physicalKey(USER_IDENTITY, USER_PROFILE_STORAGE_KEY),
      serializeUserProfile({
        hasCompletedOnboarding: true,
        kenteiRank: 3,
        selectedTrickIds: [],
      }),
    );
    mockGuestImportState = { ...INITIAL_GUEST_IMPORT_STATE, status: 'completed' };

    const root = await mountHomeScreen(USER_IDENTITY);

    expect(findByText(root, 'Get started').length).toBe(0);
    // DailyHome-only content confirming the real home screen rendered.
    expect(findByText(root, "You're putting in the work.").length).toBeGreaterThan(0);

    await act(async () => {
      root.unmount();
    });
  });

  it('still shows onboarding for awaitingConfirmation with an all-zero (permanently parked) inventory', async () => {
    mockGuestImportState = {
      ...INITIAL_GUEST_IMPORT_STATE,
      status: 'awaitingConfirmation',
      inventory: zeroCounts(),
      targetKind: 'empty',
    };

    const root = await mountHomeScreen(USER_IDENTITY);

    expect(findByText(root, 'Get started').length).toBeGreaterThan(0);

    await act(async () => {
      root.unmount();
    });
  });
});
