import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';

import { AssessmentEntry } from '@/features/sesh/components/assessment-entry';
import { NoteProvider } from '@/features/notes/state/note-provider';
import { KenteiRankAutoPromotion } from '@/features/profile/state/kentei-rank-auto-promotion';
import {
  serializeUserProfile,
  USER_PROFILE_STORAGE_KEY,
} from '@/features/profile/persistence/user-profile-persistence';
import { UserProfileProvider } from '@/features/profile/state/user-profile-provider';
import {
  PracticeHistoryProvider,
  usePracticeHistory,
} from '@/features/stats/state/practice-history-provider';
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

// Renders each recorded session's origin behind an accessibility label so tests can assert on
// practice-history writes, mirroring the SessionSummary pattern in multi-trick-sesh.test.tsx.
function SessionSummary() {
  const { sessions } = usePracticeHistory();
  return (
    <>
      {sessions.map((session, index) => (
        <Text
          key={session.id}
          accessibilityLabel={`session-${index}-origin:${session.origin ?? 'none'}`}
        />
      ))}
    </>
  );
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
          <SessionSummary />
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

    // Press "End assessment" on the very first trick, without ever
    // pressing "Laced", so no trick in the rank records a lace and the
    // auto-promotion effect never fires. "End assessment" now ends the
    // whole run immediately (not just the current trick), so a single
    // press is enough to reach the result screen.
    advanceThroughCountdown();
    act(() => {
      pressByVisibleText(root, 'End assessment');
    });

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

describe('AssessmentEntry origin (T062.1)', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('tags every practice-history session recorded through the assessment flow with an assessment origin', async () => {
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

    advanceThroughCountdown();
    act(() => {
      pressByAccessibilityLabel(root, 'Laced');
    });

    await act(async () => {});

    expect(findByAccessibilityLabel(root, 'session-0-origin:assessment').length).toBeGreaterThan(0);

    act(() => {
      root.unmount();
    });
  });
});

describe('AssessmentEntry rank standing (T055)', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows the current rank/class while a rank-1 trick is in countdown, then active', async () => {
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

    const rank1Trick = KENDAMA_KENTEI_TRICKS.find((trick) => trick.kenteiRank === 1);
    if (!rank1Trick) throw new Error('Expected at least one rank-1 trick in KENDAMA_KENTEI_TRICKS');
    const expectedLabel = `Rank ${rank1Trick.kenteiRank} · ${rank1Trick.kenteiClass} · ${rank1Trick.kenteiLevel}`;

    expect(JSON.stringify(root.toJSON())).toContain(expectedLabel);

    advanceThroughCountdown();

    expect(JSON.stringify(root.toJSON())).toContain(expectedLabel);

    act(() => {
      root.unmount();
    });
  });
});

describe('AssessmentEntry countdown cancel (T047)', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns to the flow picker when Cancel is pressed during the first trick countdown', async () => {
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

    // Advance partway through the first trick's countdown, not to completion.
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    act(() => {
      pressByVisibleText(root, 'Cancel');
    });

    expect(findByAccessibilityLabel(root, 'Assessment result')).toHaveLength(0);
    expect(root.root.findAll((node) => node.props.children === 'Current rank only').length).toBeGreaterThan(0);

    act(() => {
      root.unmount();
    });
  });
});

describe('AssessmentEntry gap notice (T060)', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows the gap notice when a fromRank run starts above the stored rank and does not promote', async () => {
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
      pressByVisibleText(root, 'Start from a rank');
    });
    act(() => {
      pressByAccessibilityLabel(root, 'Start from rank 3');
    });

    advanceThroughCountdown();
    act(() => {
      pressByVisibleText(root, 'End assessment');
    });

    await act(async () => {});

    const [gapNotice] = findByAccessibilityLabel(root, 'Assessment gap notice');
    expect(gapNotice).toBeDefined();
    expect(String(gapNotice.props.children)).toMatch(/clear|earlier|skip/i);

    act(() => {
      root.unmount();
    });
  });

  it('does not show the gap notice when a skip happens but the run still promotes', async () => {
    // Promotion (selectPromotedKenteiRank) only ever needs the profiles CURRENT stored rank
    // (and any above it) fully laced in practice history — it never depends on which flow or
    // order this run itself used to get there. So the only way a skip-containing run can still
    // promote is by fully lacing the stored rank itself (rank 1 here) before skipping a later
    // rank: that alone advances the profile from 1 to 2, regardless of the later skip.
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
      pressByVisibleText(root, 'Full assessment');
    });

    advanceThroughCountdown();
    for (let index = 0; index < RANK_1_TRICK_IDS.length; index += 1) {
      act(() => {
        pressByAccessibilityLabel(root, 'Laced');
      });
    }

    act(() => {
      pressByVisibleText(root, 'Skip this rank');
    });
    act(() => {
      pressByAccessibilityLabel(root, 'Confirm skip rank');
    });
    act(() => {
      pressByVisibleText(root, 'End assessment');
    });

    await act(async () => {});

    const resultText = assessmentResultText(root);
    expect(resultText).toMatch(/rank up/i);

    expect(findByAccessibilityLabel(root, 'Assessment gap notice')).toHaveLength(0);

    act(() => {
      root.unmount();
    });
  });

  it('does not show the gap notice for a normal in-order, non-promoting run', async () => {
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

    advanceThroughCountdown();
    act(() => {
      pressByVisibleText(root, 'End assessment');
    });

    await act(async () => {});

    expect(findByAccessibilityLabel(root, 'Assessment gap notice')).toHaveLength(0);

    act(() => {
      root.unmount();
    });
  });

  it('shows the gap notice after a skip during the run, even though the run started in order', async () => {
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
      pressByVisibleText(root, 'Full assessment');
    });

    advanceThroughCountdown();
    act(() => {
      pressByVisibleText(root, 'Skip this rank');
    });
    act(() => {
      pressByAccessibilityLabel(root, 'Confirm skip rank');
    });
    act(() => {
      pressByVisibleText(root, 'End assessment');
    });

    await act(async () => {});

    const [gapNotice] = findByAccessibilityLabel(root, 'Assessment gap notice');
    expect(gapNotice).toBeDefined();
    expect(String(gapNotice.props.children)).toMatch(/clear|earlier|skip/i);

    act(() => {
      root.unmount();
    });
  });
});
