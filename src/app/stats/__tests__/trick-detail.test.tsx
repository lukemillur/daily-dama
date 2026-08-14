import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import TrickDetailScreen from '@/app/stats/[trickId]';
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

const TRICK = KENDAMA_KENTEI_TRICKS[0]!;

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('expo-router', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- jest.mock factories may not
  // reference out-of-scope variables (banning the `expo-router` import at module scope), so this
  // is typed loosely and spread as an object.
  ...(jest.requireActual('expo-router') as Record<string, unknown>),
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories may not
  // reference out-of-scope variables, so the trick data is required inline instead.
  useLocalSearchParams: () => ({
    trickId: require('@/features/tricks/data/kendama-kentei-tricks').KENDAMA_KENTEI_TRICKS[0].id,
  }),
}));

function findByText(root: ReactTestRenderer, text: string | RegExp) {
  return root.root.findAll((node) => {
    const { children } = node.props;
    if (typeof children === 'string' || typeof children === 'number') {
      const value = String(children);
      return typeof text === 'string' ? value === text : text.test(value);
    }
    if (Array.isArray(children)) {
      const value = children
        .map((child) => (typeof child === 'string' || typeof child === 'number' ? String(child) : ''))
        .join('');
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

async function mountTrickDetailScreen() {
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(
      <UserProfileProvider>
        <PracticeHistoryProvider>
          <TrickDetailScreen />
        </PracticeHistoryProvider>
      </UserProfileProvider>,
    );
  });
  return root;
}

describe('TrickDetailScreen excludes assessment-origin sessions', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('keeps the regular session as the personal best and omits the assessment session from Past seshes', async () => {
    await seedProfile();
    const plannedDurationMs = 300_000;
    const regularSession = makeSession({
      completedAt: 1_000_000,
      durationMs: plannedDurationMs,
      plannedDurationMs,
      laceCount: 5,
    });
    const assessmentSession = makeSession({
      completedAt: 2_000_000,
      durationMs: plannedDurationMs,
      plannedDurationMs,
      laceCount: 20,
      origin: 'assessment',
    });
    await seedSessions([regularSession, assessmentSession]);

    const root = await mountTrickDetailScreen();

    expect(findByText(root, '5 laces').length).toBeGreaterThan(0);
    expect(findByText(root, '20 laces').length).toBe(0);
    expect(findByText(root, /5 laces/).length).toBeGreaterThan(0);
    expect(findByText(root, /20 laces/).length).toBe(0);

    await act(async () => {
      root.unmount();
    });
  });
});
