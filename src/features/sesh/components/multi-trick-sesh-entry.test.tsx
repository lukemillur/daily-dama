import AsyncStorage from '@react-native-async-storage/async-storage';
import { describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { CustomTrickProvider } from '@/features/custom-tricks/state/custom-trick-provider';
import {
  serializeUserProfile,
  USER_PROFILE_STORAGE_KEY,
} from '@/features/profile/persistence/user-profile-persistence';
import { UserProfileProvider } from '@/features/profile/state/user-profile-provider';
import { MultiTrickSeshEntry } from '@/features/sesh/components/multi-trick-sesh-entry';
import { KENDAMA_KENTEI_TRICKS } from '@/features/tricks/data/kendama-kentei-tricks';

// MultiTrickSeshEntry pulls in UserProfileProvider/CustomTrickProvider, which are backed by
// AsyncStorage. Mock it the same way sesh.test.tsx does.
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required by jest hoisting
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

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
