import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import HomeScreen from '@/app/app/home';
import { AppColors } from '@/constants/theme';
import { CustomTrickProvider } from '@/features/custom-tricks/state/custom-trick-provider';
import { getCurrentAssessmentTrick } from '@/features/onboarding/model/kentei-assessment';
import { RAINBOW_THEME_PRESETS } from '@/features/profile/model/theme-presets';
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

// HomeScreen (transitively, via the three providers) pulls in AsyncStorage — mocked the same way
// other provider-backed tests in this repo do.
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required by jest hoisting
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-reanimated', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required by jest hoisting
  require('react-native-reanimated/mock'),
);
// KenteiOnboarding (rendered by HomeScreen pre-onboarding) calls router.replace on finish; the
// rest of expo-router (e.g. the dev-only <Link> HomeScreen renders) stays real.
const mockRouter = { replace: jest.fn() };
// Mutable so individual tests can simulate arriving via auth-callback-screen.tsx's one-time
// newAccount signal (T207) without affecting the plain-mount default of no params.
let mockSearchParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  ...(jest.requireActual('expo-router') as Record<string, unknown>),
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockSearchParams,
}));

const STREAK_THRESHOLD_MS = 300_000; // matches DEFAULT_STREAK_THRESHOLD_MS

function findByText(root: ReactTestRenderer, text: string | RegExp) {
  return root.root.findAll((node) => {
    const { children } = node.props;
    if (typeof children !== 'string' && typeof children !== 'number') return false;
    const value = String(children);
    return typeof text === 'string' ? value === text : text.test(value);
  });
}

// The rendered "Last sesh" line also shows a duration in mm:ss form, which can collide with the
// Time Logged "day" tile's value (e.g. right after mount, before the record ages out). Scope the
// lookup to the smallest ancestor of the tile's label that also contains an mm:ss-shaped value,
// rather than matching mm:ss text anywhere on the screen.
function findTimeLoggedTileValue(root: ReactTestRenderer, label: string) {
  const [labelNode] = findByText(root, label);
  if (!labelNode) return undefined;

  let node = labelNode.parent;
  while (node) {
    const matches = node.findAll((candidate) => {
      const { children } = candidate.props;
      return typeof children === 'string' && /^\d{2}:\d{2}$/.test(children);
    });
    if (matches.length > 0) return matches[0]!.props.children as string;
    node = node.parent;
  }
  return undefined;
}

function makeSession(overrides: Partial<PracticeSessionRecord> & { readonly completedAt: number }): PracticeSessionRecord {
  const trick = KENDAMA_KENTEI_TRICKS[0]!;
  const { completedAt, durationMs = STREAK_THRESHOLD_MS, ...rest } = overrides;
  return {
    id: `session-${completedAt}`,
    trickId: trick.id,
    trickName: trick.name,
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

async function mountHomeScreen() {
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(
      <CustomTrickProvider>
        <UserProfileProvider>
          <PracticeHistoryProvider>
            <HomeScreen />
          </PracticeHistoryProvider>
        </UserProfileProvider>
      </CustomTrickProvider>,
    );
  });
  return root;
}

function getForegroundHandler() {
  const addEventListenerMock = AppState.addEventListener as jest.Mock;
  const call = addEventListenerMock.mock.calls[addEventListenerMock.mock.calls.length - 1];
  return call[1] as (state: string) => void;
}

describe('HomeScreen excludes assessment-origin sessions', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('reflects only regular sessions in Momentum and the Last sesh summary', async () => {
    jest.useFakeTimers();
    const start = Date.parse('2026-06-15T12:00:00.000Z');
    jest.setSystemTime(start);

    await seedProfile();
    const regularSession = makeSession({
      completedAt: start - 60 * 60 * 1000,
      durationMs: 120_000,
      laceCount: 4,
    });
    const assessmentSession = makeSession({
      completedAt: start - 30 * 60 * 1000,
      durationMs: 90_000,
      laceCount: 9,
      origin: 'assessment',
    });
    await seedSessions([regularSession, assessmentSession]);

    const root = await mountHomeScreen();

    // Momentum totals should reflect only the regular session.
    expect(findByText(root, '1').length).toBeGreaterThan(0); // Seshes count
    expect(findByText(root, '4').length).toBeGreaterThan(0); // Laces count

    // "Last sesh" should surface the regular session, not the more-recent assessment session.
    const lastSeshLine = root.root.findAll((node) => {
      const { children } = node.props;
      if (!Array.isArray(children)) return false;
      return children.some((child) => typeof child === 'string' && child.includes('Last sesh'));
    });
    expect(lastSeshLine.length).toBeGreaterThan(0);
    const lastSeshText = lastSeshLine.map((node) => (node.props.children as unknown[]).join('')).join(' ');
    expect(lastSeshText).toContain('02:00');
    expect(lastSeshText).toContain('4');
    expect(lastSeshText).not.toContain('01:30');
    expect(lastSeshText).not.toContain('9 laces');

    await act(async () => {
      root.unmount();
    });
    jest.useRealTimers();
  });
});

describe('HomeScreen live time-based summaries', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('ages a record out of the 24-hour summary while Home remains mounted', async () => {
    jest.useFakeTimers();
    const start = Date.parse('2026-06-15T12:00:00.000Z');
    jest.setSystemTime(start);

    await seedProfile();
    // Completed 23h before "now" — inside the 24h window at mount time.
    await seedSessions([makeSession({ completedAt: start - 23 * 60 * 60 * 1000 })]);

    const root = await mountHomeScreen();

    expect(findByText(root, 'Last 24 hours').length).toBeGreaterThan(0);
    expect(findTimeLoggedTileValue(root, 'Last 24 hours')).toBe('05:00'); // 300_000ms == 5:00

    // Cross the 24h boundary (23h + 90min elapsed) while mounted, ticking the live clock.
    await act(async () => {
      jest.advanceTimersByTime(90 * 60 * 1000);
    });

    expect(findTimeLoggedTileValue(root, 'Last 24 hours')).toBe('00:00');

    await act(async () => {
      root.unmount();
    });
    jest.useRealTimers();
  });

  it('updates the streak presentation across a local-day boundary', async () => {
    jest.useFakeTimers();
    // Pin a start time late on a local day so advancing the clock crosses local midnight.
    const start = new Date(2026, 5, 15, 23, 30, 0, 0).getTime();
    jest.setSystemTime(start);

    const dayBefore = new Date(2026, 5, 14, 20, 0, 0, 0).getTime();
    const sameDay = new Date(2026, 5, 15, 20, 0, 0, 0).getTime();

    await seedProfile();
    await seedSessions([
      makeSession({ completedAt: dayBefore, durationMs: STREAK_THRESHOLD_MS }),
      makeSession({ completedAt: sameDay, durationMs: STREAK_THRESHOLD_MS }),
    ]);

    const root = await mountHomeScreen();

    // Both days qualify, and "now" is still within the second day, so the streak is 2.
    expect(findByText(root, '2').length).toBeGreaterThan(0);

    // Advance past local midnight into a day with no qualifying session — the still-completed
    // streak drops to reflect that today no longer qualifies but yesterday (the former "today")
    // still counts, plus the day before it.
    await act(async () => {
      jest.advanceTimersByTime(90 * 60 * 1000); // 23:30 -> 01:00 next local day
    });

    expect(findByText(root, /day streak/i).length).toBeGreaterThan(0);
    expect(findByText(root, '2').length).toBeGreaterThan(0);

    await act(async () => {
      root.unmount();
    });
    jest.useRealTimers();
  });

  it('refreshes immediately on foreground without waiting for the next tick', async () => {
    jest.useFakeTimers();
    const start = Date.parse('2026-06-15T12:00:00.000Z');
    jest.setSystemTime(start);

    await seedProfile();
    await seedSessions([makeSession({ completedAt: start - 23 * 60 * 60 * 1000 })]);

    const root = await mountHomeScreen();
    expect(findTimeLoggedTileValue(root, 'Last 24 hours')).toBe('05:00');

    // Move real time past the 24h boundary without advancing the interval timer.
    jest.setSystemTime(start + 90 * 60 * 1000);
    const handler = getForegroundHandler();
    await act(async () => {
      handler('active');
    });

    expect(findTimeLoggedTileValue(root, 'Last 24 hours')).toBe('00:00');

    await act(async () => {
      root.unmount();
    });
    jest.useRealTimers();
  });
});


function findByAccessibilityLabel(root: ReactTestRenderer, label: string) {
  return root.root.findAll((node) => node.props.accessibilityLabel === label);
}

function pressByAccessibilityLabel(root: ReactTestRenderer, label: string) {
  const [match] = findByAccessibilityLabel(root, label).filter(
    (node) => typeof node.props.onPress === 'function',
  );
  if (!match) throw new Error('No pressable found with accessibilityLabel: ' + label);
  match.props.onPress();
}

function pressByVisibleText(root: ReactTestRenderer, text: string) {
  const [textNode] = root.root.findAll((node) => node.props.children === text);
  if (!textNode) throw new Error('No node found with text: ' + text);
  let current: typeof textNode | null = textNode;
  while (current && typeof current.props.onPress !== 'function') {
    current = current.parent;
  }
  if (!current) throw new Error('No pressable ancestor found for text: ' + text);
  current.props.onPress();
}

// Drives the onboarding flow (rendered by HomeScreen pre-onboarding) up to the theme-selection
// step, mirroring kentei-onboarding.test.tsx's own helper -- HomeScreen has no separate onboarding
// entry point of its own.
async function driveToThemeSelect(root: ReactTestRenderer) {
  act(() => pressByVisibleText(root, 'Get started'));
  act(() =>
    pressByAccessibilityLabel(
      root,
      'Basic. New to kendama or still building your cup and spike fundamentals.',
    ),
  );

  const firstRank1Trick = getCurrentAssessmentTrick(1, 0);
  act(() => pressByAccessibilityLabel(root, 'I cannot land ' + firstRank1Trick.name));

  act(() => pressByVisibleText(root, 'Choose tricks'));

  const rank1TrickIds = KENDAMA_KENTEI_TRICKS.filter((trick) => trick.kenteiRank === 1).map(
    (trick) => trick.id,
  );
  const [firstTrickId] = rank1TrickIds;
  const firstTrickName = KENDAMA_KENTEI_TRICKS.find((trick) => trick.id === firstTrickId)!.name;
  act(() => pressByAccessibilityLabel(root, firstTrickName + ', not selected'));

  act(() => pressByVisibleText(root, 'Start practicing'));
  act(() => pressByAccessibilityLabel(root, 'Continue to theme selection'));
}

function findScreenBackgroundColor(root: ReactTestRenderer): unknown {
  const [safeAreaView] = root.root.findAll((node) => (node.type as unknown) === 'RNCSafeAreaView');
  return (safeAreaView?.props.style as { backgroundColor?: unknown } | undefined)?.backgroundColor;
}

describe('HomeScreen onboarding background preview', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    mockRouter.replace.mockClear();
  });

  it('reflects the live-previewed theme background instead of the fixed onboarding fallback', async () => {
    const root = await mountHomeScreen();

    // Before any preset selection, onboarding still shows the fixed mustard-yellow fallback.
    expect(findScreenBackgroundColor(root)).toBe(AppColors.yellow);

    await driveToThemeSelect(root);

    const preset = RAINBOW_THEME_PRESETS[2];
    act(() => pressByAccessibilityLabel(root, preset.label + ' theme preset'));
    await act(async () => {
      await Promise.resolve();
    });

    expect(findScreenBackgroundColor(root)).toBe(preset.backgroundColor);
    expect(findScreenBackgroundColor(root)).not.toBe(AppColors.yellow);

    await act(async () => {
      root.unmount();
    });
  });
});


describe('HomeScreen new-account acknowledgment banner (T207)', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    mockRouter.replace.mockClear();
    mockSearchParams = {};
  });

  it('does not render the banner on a plain mount', async () => {
    await seedProfile();
    const root = await mountHomeScreen();

    expect(findByAccessibilityLabel(root, 'Account verified').length).toBe(0);
    expect(mockRouter.replace).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });

  it('renders the banner when arriving via the newAccount signal, strips the param, and stays dismissed', async () => {
    await seedProfile();
    mockSearchParams = { newAccount: '1' };
    const root = await mountHomeScreen();

    expect(findByAccessibilityLabel(root, 'Account verified').length).toBeGreaterThan(0);
    // The one-time param is stripped from the URL right after mount so a refresh/back-nav can't
    // re-trigger it.
    expect(mockRouter.replace).toHaveBeenCalledWith('/app/home');

    act(() => pressByAccessibilityLabel(root, 'Dismiss'));

    expect(findByAccessibilityLabel(root, 'Account verified').length).toBe(0);

    await act(async () => {
      root.unmount();
    });
  });
});
