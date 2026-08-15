import AsyncStorage from '@react-native-async-storage/async-storage';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { useEffect, useState, type ReactElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';

import { CustomTrickProvider } from '@/features/custom-tricks/state/custom-trick-provider';
import { GoalProvider } from '@/features/goals/state/goal-provider';
import { NoteProvider } from '@/features/notes/state/note-provider';
import {
  serializeUserProfile,
  USER_PROFILE_STORAGE_KEY,
} from '@/features/profile/persistence/user-profile-persistence';
import { UserProfileProvider } from '@/features/profile/state/user-profile-provider';
import { MultiTrickSeshEntry } from '@/features/sesh/components/multi-trick-sesh-entry';
import { Sesh } from '@/features/sesh/components/sesh';
import { PracticeHistoryProvider, usePracticeHistory } from '@/features/stats/state/practice-history-provider';
import { KENDAMA_KENTEI_TRICKS } from '@/features/tricks/data/kendama-kentei-tricks';

// MultiTrickSeshEntry pulls in UserProfileProvider/CustomTrickProvider, which are backed by
// AsyncStorage. Mock it the same way sesh.test.tsx does.
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required by jest hoisting
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

let mockNavigate: ((path: string) => void) | undefined;
const mockReplace = jest.fn((path: string) => mockNavigate?.(path));

jest.mock('expo-router', () => ({
  Link: ({ children }: { children: ReactElement }) => children,
  useRouter: () => ({ replace: mockReplace }),
}));

function collectStrings(json: unknown, out: string[]): void {
  if (typeof json === 'string') {
    out.push(json);
    return;
  }
  if (Array.isArray(json)) {
    for (const child of json) collectStrings(child, out);
    return;
  }
  if (json && typeof json === 'object' && 'children' in json) {
    collectStrings((json as { children: unknown }).children, out);
  }
}

function allText(root: ReactTestRenderer): string[] {
  const out: string[] = [];
  collectStrings(root.toJSON(), out);
  return out;
}

function SessionSummary() {
  const { sessions } = usePracticeHistory();
  return <Text accessibilityLabel={`session-count:${sessions.length}`} />;
}

function RouteHarness({ selectedTrickIds }: { readonly selectedTrickIds: readonly string[] }) {
  const [route, setRoute] = useState('/sesh/multi-trick');

  useEffect(() => {
    mockNavigate = setRoute;
    return () => {
      mockNavigate = undefined;
    };
  }, []);

  return route === '/sesh' ? (
    <Sesh
      availableTricks={KENDAMA_KENTEI_TRICKS}
      selectedTrickIds={selectedTrickIds}
    />
  ) : (
    <MultiTrickSeshEntry key={route} />
  );
}

async function mountRouteHarness(selectedTrickIds: readonly string[]) {
  jest.useRealTimers();
  await AsyncStorage.clear();
  await AsyncStorage.setItem(
    USER_PROFILE_STORAGE_KEY,
    serializeUserProfile({
      hasCompletedOnboarding: true,
      kenteiRank: 12,
      selectedTrickIds,
    }),
  );

  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(
      <CustomTrickProvider>
        <UserProfileProvider>
          <PracticeHistoryProvider>
            <NoteProvider>
              <GoalProvider>
                <RouteHarness selectedTrickIds={[...selectedTrickIds]} />
                <SessionSummary />
              </GoalProvider>
            </NoteProvider>
          </PracticeHistoryProvider>
        </UserProfileProvider>
      </CustomTrickProvider>,
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  jest.useFakeTimers();
  return root;
}

function pressByAccessibilityLabel(root: ReactTestRenderer, label: string) {
  const [match] = root.root.findAll(
    (node) => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function',
  );
  if (!match) {
    throw new Error(
      `No pressable node found with accessibility label: ${label}; labels=${root.root
        .findAll((node) => typeof node.props.accessibilityLabel === 'string')
        .map((node) => node.props.accessibilityLabel)
        .join('|')}`,
    );
  }
  act(() => {
    match.props.onPress();
  });
}

function pressByVisibleText(root: ReactTestRenderer, text: string) {
  const [textNode] = root.root.findAll((node) => node.props.children === text);
  if (!textNode) throw new Error(`No text node found: ${text}`);
  let current: typeof textNode | null = textNode;
  while (current && typeof current.props.onPress !== 'function') current = current.parent;
  if (!current) throw new Error(`No pressable ancestor found for text: ${text}`);
  act(() => {
    current!.props.onPress();
  });
}

function advanceThroughCountdown() {
  for (let index = 0; index < 4; index += 1) {
    act(() => {
      jest.advanceTimersByTime(1_000);
    });
  }
}

function selectTrick(root: ReactTestRenderer, trickName: string) {
  const [match] = root.root.findAll(
    (node) =>
      node.props.accessibilityRole === 'checkbox' &&
      typeof node.props.accessibilityLabel === 'string' &&
      node.props.accessibilityLabel.startsWith(`${trickName},`) &&
      typeof node.props.onPress === 'function',
  );
  if (!match) throw new Error(`No trick checkbox found for: ${trickName}`);
  act(() => {
    match.props.onPress();
  });
}

async function mount(selectedTrickIds: readonly string[]) {
  await AsyncStorage.setItem(
    USER_PROFILE_STORAGE_KEY,
    serializeUserProfile({
      hasCompletedOnboarding: true,
      kenteiRank: 12,
      selectedTrickIds,
    }),
  );

  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(
      <UserProfileProvider>
        <CustomTrickProvider>
          <MultiTrickSeshEntry />
        </CustomTrickProvider>
      </UserProfileProvider>,
    );
  });
  // VirtualizedList schedules a follow-up cell-range update via setTimeout; flush it inside
  // act() so the warning about unwrapped state updates doesn't surface in this suite.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return root;
}

describe('MultiTrickSeshEntry focused section', () => {
  it("sections the user's focused tricks first, matching the Tricks screen, and keeps them there after toggling a run selection", async () => {
    // Pick two focused tricks from different, non-first ranks so their presence at the top of
    // the list can only be explained by focused-section placement, not rank order.
    const focused = KENDAMA_KENTEI_TRICKS.filter((trick) => trick.kenteiRank && trick.kenteiRank >= 2).slice(
      0,
      2,
    );
    expect(focused.length).toBe(2);
    const focusedIds = focused.map((trick) => trick.id);

    const root = await mount(focusedIds);

    const text = allText(root);
    const focusedHeaderIndex = text.indexOf('Focused tricks');
    expect(focusedHeaderIndex).toBeGreaterThanOrEqual(0);
    for (const trick of focused) {
      const nameIndex = text.indexOf(trick.name);
      expect(nameIndex).toBeGreaterThan(focusedHeaderIndex);
    }
    const rank1HeaderIndex = text.indexOf('Rank 1');
    expect(rank1HeaderIndex).toBeGreaterThan(focusedHeaderIndex);

    // Toggling a trick's in-progress selection for this run must not move it out of (or into)
    // the Focused section — sectioning is driven by the persisted profile focus list, not by
    // the run's local selection state.
    const [firstFocusedToggle] = root.root.findAll(
      (node) =>
        node.props.accessibilityRole === 'checkbox' &&
        typeof node.props.accessibilityLabel === 'string' &&
        node.props.accessibilityLabel.startsWith(focused[0]!.name),
    );
    await act(async () => {
      firstFocusedToggle.props.onPress();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const textAfterToggle = allText(root);
    const focusedHeaderIndexAfter = textAfterToggle.indexOf('Focused tricks');
    expect(focusedHeaderIndexAfter).toBeGreaterThanOrEqual(0);
    for (const trick of focused) {
      expect(textAfterToggle.indexOf(trick.name)).toBeGreaterThan(focusedHeaderIndexAfter);
    }

    // Unmount inside act() so VirtualizedList's pending cell-range timer doesn't fire (and
    // trigger an unwrapped-act warning) once this test has finished.
    await act(async () => {
      root.unmount();
    });
  });
});

describe('MultiTrickSeshEntry route completion', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockReplace.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns a completed multi-trick run to the Sesh home picker and remounts fresh on re-entry', async () => {
    const tricks = KENDAMA_KENTEI_TRICKS.slice(0, 2);
    const root = await mountRouteHarness(tricks.map((trick) => trick.id));

    selectTrick(root, tricks[0]!.name);
    selectTrick(root, tricks[1]!.name);
    pressByAccessibilityLabel(root, 'Continue to timing setup');
    pressByAccessibilityLabel(root, 'Advance after one lace, unchecked');
    pressByAccessibilityLabel(root, 'Start sesh');

    for (const trick of tricks) {
      advanceThroughCountdown();
      expect(allText(root)).toContain(trick.name);
      pressByAccessibilityLabel(root, 'Laced');
      act(() => {
        jest.advanceTimersByTime(1_000);
      });
      await act(async () => {
        await Promise.resolve();
      });
    }
    act(() => {
      jest.advanceTimersByTime(1_000);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(allText(root)).toContain('Finish sesh');
    expect(root.root.findAll((node) => node.props.accessibilityLabel === 'session-count:2').length).toBeGreaterThan(0);

    pressByAccessibilityLabel(root, 'Finish sesh');

    expect(mockReplace).toHaveBeenCalledWith('/sesh');
    expect(allText(root)).toEqual(expect.arrayContaining(['Practice format', 'Practice several tricks']));
    expect(allText(root)).not.toContain('Pick your\nlineup.');
    expect(root.root.findAll((node) => node.props.accessibilityLabel === 'session-count:2').length).toBeGreaterThan(0);

    // A new visit is a new child-route mount, so the old lineup cannot leak into it.
    await act(async () => {
      mockNavigate?.('/sesh/multi-trick');
      await Promise.resolve();
    });
    expect(allText(root)).toContain('Pick your\nlineup.');
    expect(allText(root)).toContain('Select at least one trick to continue.');

    await act(async () => {
      root.unmount();
    });
  });

  it('returns setup back and first-countdown cancel to Sesh home without recording a session', async () => {
    const trick = KENDAMA_KENTEI_TRICKS[0]!;
    const root = await mountRouteHarness([trick.id]);

    pressByAccessibilityLabel(root, 'Back to Sesh');
    expect(mockReplace).toHaveBeenCalledWith('/sesh');
    expect(allText(root)).toEqual(expect.arrayContaining(['Practice format', 'Practice several tricks']));

    await act(async () => {
      mockNavigate?.('/sesh/multi-trick');
      await Promise.resolve();
    });
    selectTrick(root, trick.name);
    pressByAccessibilityLabel(root, 'Continue to timing setup');
    pressByAccessibilityLabel(root, 'Start sesh');
    pressByVisibleText(root, 'Cancel');

    expect(mockReplace).toHaveBeenLastCalledWith('/sesh');
    expect(allText(root)).toEqual(expect.arrayContaining(['Practice format', 'Practice several tricks']));
    expect(root.root.findAll((node) => node.props.accessibilityLabel === 'session-count:0').length).toBeGreaterThan(0);

    await act(async () => {
      root.unmount();
    });
  });

  it('uses the compact linked back action on selection and preserves timing setup back', async () => {
    const trick = KENDAMA_KENTEI_TRICKS[0]!;
    const root = await mountRouteHarness([trick.id]);

    const [backLink] = root.root.findAll(
      (node) =>
        node.props.accessibilityLabel === 'Back to Sesh' &&
        node.props.accessibilityRole === 'link' &&
        node.props.children === '← Back to Sesh' &&
        typeof node.props.onPress === 'function',
    );
    expect(backLink).toBeDefined();

    selectTrick(root, trick.name);
    pressByAccessibilityLabel(root, 'Continue to timing setup');
    expect(root.root.findAll((node) => node.props.accessibilityLabel === 'Back to trick selection').length).toBeGreaterThan(0);

    pressByAccessibilityLabel(root, 'Back to trick selection');
    expect(allText(root)).toContain('Pick your\nlineup.');
    expect(root.root.findAll((node) => node.props.accessibilityLabel === 'Back to Sesh').length).toBeGreaterThan(0);

    await act(async () => {
      root.unmount();
    });
  });
});
