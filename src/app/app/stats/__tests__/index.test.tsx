import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import StatsScreen from '@/app/app/stats/index';
import { CustomTrickProvider } from '@/features/custom-tricks/state/custom-trick-provider';
import {
  serializeUserProfile,
  USER_PROFILE_STORAGE_KEY,
} from '@/features/profile/persistence/user-profile-persistence';
import { UserProfileProvider } from '@/features/profile/state/user-profile-provider';
import type { PracticeSessionRecord } from '@/features/stats/model/practice-history';
import {
  PRACTICE_HISTORY_STORAGE_KEY,
  serializePracticeHistory,
} from '@/features/stats/persistence/practice-history-persistence';
import { PracticeHistoryProvider } from '@/features/stats/state/practice-history-provider';
import { KENDAMA_KENTEI_TRICKS } from '@/features/tricks/data/kendama-kentei-tricks';

// StatsScreen (transitively, via the providers) pulls in AsyncStorage — mocked the same way other
// provider-backed tests in this repo do.
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required by jest hoisting
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const TRICK = KENDAMA_KENTEI_TRICKS[0]!;

function findByText(root: ReactTestRenderer, text: string | number | RegExp) {
  return root.root.findAll((node) => {
    const { children } = node.props;
    if (typeof children === 'string' || typeof children === 'number') {
      const value = String(children);
      return typeof text === 'string' || typeof text === 'number' ? value === String(text) : text.test(value);
    }
    if (Array.isArray(children) && typeof text !== 'number') {
      const value = children.map((child) => (typeof child === 'string' || typeof child === 'number' ? String(child) : '')).join('');
      return typeof text === 'string' ? value === text : text.test(value);
    }
    return false;
  });
}

function makeSession(overrides: Partial<PracticeSessionRecord> & { readonly completedAt: number }): PracticeSessionRecord {
  const { completedAt, durationMs = 60_000, ...rest } = overrides;
  return {
    id: `session-${completedAt}`,
    trickId: TRICK.id,
    trickName: TRICK.name,
    startedAt: completedAt - durationMs,
    completedAt,
    durationMs,
    laceCount: 1,
    ...rest,
  };
}

async function seedProfile() {
  await AsyncStorage.setItem(
    USER_PROFILE_STORAGE_KEY,
    serializeUserProfile({
      hasCompletedOnboarding: true,
      kenteiRank: 3,
      selectedTrickIds: [],
    }),
  );
}

async function seedSessions(sessions: readonly PracticeSessionRecord[]) {
  await AsyncStorage.setItem(PRACTICE_HISTORY_STORAGE_KEY, serializePracticeHistory({ sessions }));
}

async function mountStatsScreen() {
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(
      <CustomTrickProvider>
        <UserProfileProvider>
          <PracticeHistoryProvider>
            <StatsScreen />
          </PracticeHistoryProvider>
        </UserProfileProvider>
      </CustomTrickProvider>,
    );
  });
  return root;
}

describe('StatsScreen excludes assessment-origin sessions', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('reflects only the regular session in Overview and By-trick totals', async () => {
    await seedProfile();
    const regularSession = makeSession({ completedAt: 1_000_000, durationMs: 60_000, laceCount: 4 });
    const assessmentSession = makeSession({
      completedAt: 2_000_000,
      durationMs: 90_000,
      laceCount: 9,
      origin: 'assessment',
    });
    await seedSessions([regularSession, assessmentSession]);

    const root = await mountStatsScreen();

    // Overview: total laces reflects only the regular session (4, not 4+9).
    expect(findByText(root, 4).length).toBeGreaterThan(0);
    expect(findByText(root, 13).length).toBe(0);
    // Overview: session count reflects only the regular session.
    expect(findByText(root, 'Sesh').length).toBeGreaterThan(0);

    // By-trick: the trick's card shows only the regular session's lace/session totals.
    expect(findByText(root, TRICK.name).length).toBeGreaterThan(0);

    await act(async () => {
      root.unmount();
    });
  });

  it('shows the empty state when only assessment-origin sessions exist', async () => {
    await seedProfile();
    await seedSessions([makeSession({ completedAt: 1_000_000, origin: 'assessment' })]);

    const root = await mountStatsScreen();

    expect(findByText(root, /starts with a sesh/).length).toBeGreaterThan(0);

    await act(async () => {
      root.unmount();
    });
  });
});
