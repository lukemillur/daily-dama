import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { AssessmentEntry } from '@/features/sesh/components/assessment-entry';
import { NoteProvider } from '@/features/notes/state/note-provider';
import { KenteiRankAutoPromotion } from '@/features/profile/state/kentei-rank-auto-promotion';
import {
  serializeUserProfile,
  USER_PROFILE_STORAGE_KEY,
} from '@/features/profile/persistence/user-profile-persistence';
import { UserProfileProvider } from '@/features/profile/state/user-profile-provider';
import { PracticeHistoryProvider } from '@/features/stats/state/practice-history-provider';
import { PRACTICE_HISTORY_STORAGE_KEY } from '@/features/stats/persistence/practice-history-persistence';
import { KENDAMA_KENTEI_TRICKS } from '@/features/tricks/data/kendama-kentei-tricks';

// AssessmentEntry (transitively, via MultiTrickSesh/practice-history-provider/user-profile-provider)
// pulls in AsyncStorage. Mock it the same way multi-trick-sesh.test.tsx and
// kentei-rank-auto-promotion.test.tsx do — these tests seed/read storage directly, never touch a
// real backend.
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required by jest hoisting
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
// KenteiRankAutoPromotion's rank-up celebration transitively needs react-native-reanimated's
// native worklets module, unavailable under Jest — same mock kentei-rank-auto-promotion.test.tsx uses.
jest.mock('react-native-reanimated', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required by jest hoisting
  require('react-native-reanimated/mock'),
);
// AssessmentEntry calls useRouter() directly for the post-run redirect. No test in the repo
// currently mocks expo-router, so this is new.
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: jest.fn(), push: jest.fn() }) }));

const RANK_1_TRICK_IDS = KENDAMA_KENTEI_TRICKS.filter((trick) => trick.kenteiRank === 1).map(
  (trick) => trick.id,
);

function pressByAccessibilityLabel(root: ReactTestRenderer, label: string) {
  const [match] = root.root.findAll(
    (node) => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function',
  );
  match.props.onPress();
}

function pressByVisibleText(root: ReactTestRenderer, text: string) {
  const [textNode] = root.root.findAll((node) => node.props.children === text);
  if (!textNode) throw new Error(`No node found with text: ${text}`);
  let current: typeof textNode | null = textNode;
  while (current && typeof current.props.onPress !== 'function') {
    current = current.parent;
  }
  if (!current) throw new Error(`No pressable ancestor found for text: ${text}`);
  current.props.onPress();
}

function findByAccessibilityLabel(root: ReactTestRenderer, label: string) {
  return root.root.findAll((node) => node.props.accessibilityLabel === label);
}

function assessmentResultText(root: ReactTestRenderer): string {
  const [match] = findByAccessibilityLabel(root, 'Assessment result');
  return String(match.props.children);
}

function advanceThroughCountdown() {
  act(() => {
    jest.advanceTimersByTime(1000);
  });
  act(() => {
    jest.advanceTimersByTime(1000);
  });
  act(() => {
    jest.advanceTimersByTime(1000);
  });
}

async function mountAssessmentEntry() {
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(
      <UserProfileProvider>
        <PracticeHistoryProvider>
          <NoteProvider>
            <KenteiRankAutoPromotion />
            <AssessmentEntry />
          </NoteProvider>
        </PracticeHistoryProvider>
      </UserProfileProvider>,
    );
  });
  return root;
}

describe('AssessmentEntry result copy', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows "held" copy, not assessed/replaced language, when the run does not lace every trick in the rank', async () => {
    await AsyncStorage.setItem(
      USER_PROFILE_STORAGE_KEY,
      serializeUserProfile({
        hasCompletedOnboarding: true,
        kenteiRank: 1,
        selectedTrickIds: [],
      }),
    );

    const root = await mountAssessmentEntry();

    act(() => {
      pressByVisibleText(root, 'Current rank only');
    });

    // Walk every rank-1 trick without ever pressing "Laced", so no trick in
    // the rank records a lace and the auto-promotion effect never fires.
    // AssessmentEntry always sets skipCountdownBetweenTricks, so only the
    // very first trick shows a countdown to advance through.
    advanceThroughCountdown();
    for (let index = 0; index < RANK_1_TRICK_IDS.length; index += 1) {
      act(() => {
        pressByVisibleText(root, 'End assessment');
      });
    }

    await act(async () => {});

    const resultText = assessmentResultText(root);
    expect(resultText).toMatch(/held/i);
    expect(resultText).toContain('Rank 1');
    expect(resultText).not.toMatch(/assess/i);

    act(() => {
      root.unmount();
    });
  });

  it('shows "advanced" copy with the new rank when the run laces every trick in the rank', async () => {
    await AsyncStorage.removeItem(USER_PROFILE_STORAGE_KEY);
    await AsyncStorage.removeItem(PRACTICE_HISTORY_STORAGE_KEY);
    await AsyncStorage.setItem(
      USER_PROFILE_STORAGE_KEY,
      serializeUserProfile({
        hasCompletedOnboarding: true,
        kenteiRank: 1,
        selectedTrickIds: [],
      }),
    );

    const root = await mountAssessmentEntry();

    act(() => {
      pressByVisibleText(root, 'Current rank only');
    });

    // AssessmentEntry always sets skipCountdownBetweenTricks (only the first
    // trick shows a countdown) and advanceOnFirstLace (a single "Laced" press
    // is enough to complete each trick and auto-advance — no separate
    // "Next trick"/"End assessment" press needed).
    advanceThroughCountdown();
    for (let index = 0; index < RANK_1_TRICK_IDS.length; index += 1) {
      act(() => {
        pressByAccessibilityLabel(root, 'Laced');
      });
    }

    await act(async () => {});

    const resultText = assessmentResultText(root);
    expect(resultText).toMatch(/rank up/i);
    expect(resultText).toContain('Rank 2');

    act(() => {
      root.unmount();
    });
  });
});
