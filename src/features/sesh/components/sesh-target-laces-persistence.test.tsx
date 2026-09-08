import AsyncStorage from '@react-native-async-storage/async-storage';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { selectInitialSeshPlan } from '@/features/profile/model/user-profile';
import { GoalProvider } from '@/features/goals/state/goal-provider';
import { NoteProvider } from '@/features/notes/state/note-provider';
import { UserProfileProvider, useUserProfile } from '@/features/profile/state/user-profile-provider';
import { Sesh } from '@/features/sesh/components/sesh';
import { PracticeHistoryProvider } from '@/features/stats/state/practice-history-provider';
import type { PracticeTrick } from '@/features/tricks/model/trick';

// See sesh.test.tsx for why these two mocks are required: ActiveSesh/CompletedSesh transitively
// import expo-audio and AsyncStorage, and this suite never touches either directly.
jest.mock('expo-audio', () => {
  const mockAudioPlayer = { play: jest.fn(), seekTo: jest.fn() };
  return { useAudioPlayer: jest.fn(() => mockAudioPlayer), __mockAudioPlayer: mockAudioPlayer };
});

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required by jest hoisting
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const TRICK: PracticeTrick = { id: 'big-cup', name: 'Big Cup' };

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

// This is the route's own derivation (see src/app/app/sesh/index.tsx): the harness must call the
// same selectInitialSeshPlan the route calls, not re-derive the mapping, or the test would still
// pass if the route regressed.
function SeshRouteHarness() {
  const { lastSesh } = useUserProfile();
  return (
    <Sesh availableTricks={[TRICK]} selectedTrickIds={[TRICK.id]} initialPlan={selectInitialSeshPlan(lastSesh)} />
  );
}

async function mountHarness() {
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(
      <UserProfileProvider>
        <NoteProvider>
          <GoalProvider>
            <PracticeHistoryProvider>
              <SeshRouteHarness />
            </PracticeHistoryProvider>
          </GoalProvider>
        </NoteProvider>
      </UserProfileProvider>,
    );
  });
  return root;
}

function runAndEndOpenEndedSesh(root: ReactTestRenderer, targetLandingCount: string) {
  act(() => {
    pressByVisibleText(root, 'Open-ended');
  });
  if (targetLandingCount.length > 0) {
    act(() => {
      root.root
        .findAllByProps({ accessibilityLabel: 'Target lace count' })[0]
        .props.onChangeText(targetLandingCount);
    });
  }
  act(() => {
    pressByAccessibilityLabel(root, `Start a sesh with ${TRICK.name}`);
  });
  act(() => {
    jest.advanceTimersByTime(1000);
  });
  act(() => {
    jest.advanceTimersByTime(1000);
  });
  act(() => {
    jest.advanceTimersByTime(1000);
  });
  act(() => {
    pressByAccessibilityLabel(root, 'Laced');
  });
  act(() => {
    pressByVisibleText(root, 'End Sesh');
  });
}

function getTargetLaceCountField(root: ReactTestRenderer) {
  return root.root.findAllByProps({ accessibilityLabel: 'Target lace count' })[0];
}

describe('open-ended target-laces persistence (T239)', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  afterEach(async () => {
    await AsyncStorage.clear();
  });

  it('pre-fills the target laces value the next time sesh setup is opened', async () => {
    jest.useFakeTimers();
    try {
      const first = await mountHarness();
      runAndEndOpenEndedSesh(first, '5');

      // Flush the write queue's promise chain so the profile actually lands in storage before
      // the tree unmounts and a second tree hydrates from it.
      await act(async () => {
        await Promise.resolve();
      });

      act(() => {
        first.unmount();
      });

      const second = await mountHarness();

      const targetField = getTargetLaceCountField(second);
      expect(targetField.props.value).toBe('5');

      const openEndedRadios = second.root.findAll(
        (node) =>
          node.props.accessibilityRole === 'radio' &&
          node.props.accessibilityState?.checked === true,
      );
      expect(openEndedRadios.length).toBeGreaterThan(0);

      act(() => {
        second.unmount();
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('leaves the target laces field blank (not "0") when none was set', async () => {
    jest.useFakeTimers();
    try {
      const first = await mountHarness();
      runAndEndOpenEndedSesh(first, '');

      await act(async () => {
        await Promise.resolve();
      });

      act(() => {
        first.unmount();
      });

      const second = await mountHarness();

      act(() => {
        pressByVisibleText(second, 'Open-ended');
      });

      const targetField = getTargetLaceCountField(second);
      expect(targetField.props.value).toBe('');
      expect(targetField.props.value).not.toBe('0');

      act(() => {
        second.unmount();
      });
    } finally {
      jest.useRealTimers();
    }
  });
});
