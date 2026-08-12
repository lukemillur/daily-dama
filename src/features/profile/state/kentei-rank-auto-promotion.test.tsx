import { describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Pressable } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { getSeedLacedTrickIds, kenteiAssessmentReducer } from '@/features/onboarding/model/kentei-assessment';
import { KenteiRankAutoPromotion } from '@/features/profile/state/kentei-rank-auto-promotion';
import {
  deserializeUserProfile,
  serializeUserProfile,
  USER_PROFILE_STORAGE_KEY,
} from '@/features/profile/persistence/user-profile-persistence';
import {
  useUserProfileActions,
  UserProfileProvider,
} from '@/features/profile/state/user-profile-provider';
import { PracticeHistoryProvider } from '@/features/stats/state/practice-history-provider';
import { KENDAMA_KENTEI_TRICKS } from '@/features/tricks/data/kendama-kentei-tricks';

// Both mocks are hoisted above these imports by babel-jest, so the requires below run before
// the real modules are ever reached. The requires (rather than importing and referencing the
// real modules) are required by that hoisting: babel-plugin-jest-hoist forbids referencing
// out-of-scope imports from inside a jest.mock factory.
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required by jest hoisting, see comment above
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
// react-native-reanimated's native worklets module isn't available under Jest; the library
// ships a mock built for exactly this (used transitively by OnboardingRankRevealStep, which
// the rank-up celebration reuses).
jest.mock('react-native-reanimated', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required by jest hoisting, see comment above
  require('react-native-reanimated/mock'),
);

const RANK_1_TRICK_IDS = KENDAMA_KENTEI_TRICKS.filter((trick) => trick.kenteiRank === 1).map(
  (trick) => trick.id,
);

function hasAccessibilityLabel(root: ReactTestRenderer, label: string) {
  return root.root.findAll((node) => node.props.accessibilityLabel === label).length > 0;
}

function pressByAccessibilityLabel(root: ReactTestRenderer, label: string) {
  const [match] = root.root.findAll(
    (node) => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function',
  );
  match.props.onPress();
}

function Harness({
  rank = 1,
  selectedTrickIds = [],
  lacedTrickIds = [],
}: {
  readonly rank?: number;
  readonly selectedTrickIds?: readonly string[];
  readonly lacedTrickIds?: readonly string[];
}) {
  const { completeOnboarding, toggleManualUnlock } = useUserProfileActions();

  return (
    <>
      <StartOnboarding onPress={() => completeOnboarding(rank, selectedTrickIds, lacedTrickIds)} />
      {RANK_1_TRICK_IDS.map((trickId) => (
        <ToggleTrick key={trickId} trickId={trickId} onPress={() => toggleManualUnlock(trickId)} />
      ))}
    </>
  );
}

// Simple pressable stand-ins so the test can drive actions via accessibilityLabel lookups
// without depending on any real UI screen.
function StartOnboarding({ onPress }: { readonly onPress: () => void }) {
  return <Pressable accessibilityLabel="start-onboarding" onPress={onPress} />;
}

function ToggleTrick({ trickId, onPress }: { readonly trickId: string; readonly onPress: () => void }) {
  return <Pressable accessibilityLabel={`toggle-${trickId}`} onPress={onPress} />;
}

async function mountAndHydrate(harnessProps: {
  readonly rank?: number;
  readonly selectedTrickIds?: readonly string[];
  readonly lacedTrickIds?: readonly string[];
} = {}) {
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(
      <UserProfileProvider>
        <PracticeHistoryProvider>
          <KenteiRankAutoPromotion />
          <Harness {...harnessProps} />
        </PracticeHistoryProvider>
      </UserProfileProvider>,
    );
  });
  return root;
}

describe('KenteiRankAutoPromotion celebration', () => {
  it('renders the celebration when marking the last rank trick advances the assessed rank', async () => {
    const root = await mountAndHydrate();

    act(() => {
      pressByAccessibilityLabel(root, 'start-onboarding');
    });

    expect(hasAccessibilityLabel(root, 'Rank up celebration')).toBe(false);

    for (const trickId of RANK_1_TRICK_IDS) {
      act(() => {
        pressByAccessibilityLabel(root, `toggle-${trickId}`);
      });
    }

    expect(hasAccessibilityLabel(root, 'Rank up celebration')).toBe(true);

    const [dismissButton] = root.root.findAll(
      (node) => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function',
    );
    act(() => {
      dismissButton.props.onPress();
    });

    expect(hasAccessibilityLabel(root, 'Rank up celebration')).toBe(false);
  });

  it('does not render the celebration when hydrating an already-advanced profile', async () => {
    const advancedProfile = {
      hasCompletedOnboarding: true,
      kenteiRank: 2,
      selectedTrickIds: [],
      manuallyUnlockedTrickIds: [...RANK_1_TRICK_IDS],
    } as const;
    await AsyncStorage.setItem(USER_PROFILE_STORAGE_KEY, serializeUserProfile(advancedProfile));

    const root = await mountAndHydrate();

    // Give any effects a chance to run before asserting nothing fired.
    await act(async () => {});

    expect(hasAccessibilityLabel(root, 'Rank up celebration')).toBe(false);
  });

  it('does not promote the rank when onboarding seeds only prerequisite ranks (T032 regression)', async () => {
    // Start from a clean slate rather than whatever a prior test in this file left in
    // AsyncStorage (the mock persists across tests within a file, and other tests here
    // intentionally advance/seed a profile).
    await AsyncStorage.removeItem(USER_PROFILE_STORAGE_KEY);

    // Enter assessment at Rank 4 (Advanced), fail the very first trick shown -> resolved Rank 3
    // with nothing landed. This is the exact scenario that used to seed all of Rank 3 as
    // already-laced and immediately trigger an unearned promotion to Rank 4.
    let assessmentState = kenteiAssessmentReducer(
      { status: 'levelSelect' },
      { type: 'levelSelected', level: 'Advanced' },
    );
    assessmentState = kenteiAssessmentReducer(assessmentState, { type: 'trickNotLanded' });
    if (assessmentState.status !== 'rankReveal') throw new Error('Expected rankReveal status');
    expect(assessmentState.rank).toBe(3);

    const lacedTrickIds = getSeedLacedTrickIds(assessmentState.rank, assessmentState.landedTrickIds);

    const root = await mountAndHydrate({ rank: 3, selectedTrickIds: [], lacedTrickIds });

    act(() => {
      pressByAccessibilityLabel(root, 'start-onboarding');
    });

    // Let any promotion effect flush before asserting nothing fired.
    await act(async () => {});

    expect(hasAccessibilityLabel(root, 'Rank up celebration')).toBe(false);

    const persisted = await AsyncStorage.getItem(USER_PROFILE_STORAGE_KEY);
    expect(persisted).not.toBeNull();
    const profile = deserializeUserProfile(persisted!);
    expect(profile?.kenteiRank).toBe(3);

    const rank1Ids = KENDAMA_KENTEI_TRICKS.filter((trick) => trick.kenteiRank === 1).map((trick) => trick.id);
    const rank2Ids = KENDAMA_KENTEI_TRICKS.filter((trick) => trick.kenteiRank === 2).map((trick) => trick.id);
    const rank3Ids = KENDAMA_KENTEI_TRICKS.filter((trick) => trick.kenteiRank === 3).map((trick) => trick.id);

    for (const id of [...rank1Ids, ...rank2Ids]) {
      expect(profile?.manuallyUnlockedTrickIds).toContain(id);
    }
    for (const id of rank3Ids) {
      expect(profile?.manuallyUnlockedTrickIds).not.toContain(id);
    }
  });
});
