import { describe, expect, it, jest } from '@jest/globals';
import { Pressable } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { GoalProvider, useGoalActions } from '@/features/goals/state/goal-provider';
import {
  useUserProfile,
  useUserProfileActions,
  UserProfileProvider,
} from '@/features/profile/state/user-profile-provider';

// Hoisted above the imports by babel-jest, so the require below runs before the real module
// is ever reached. The require (rather than importing and referencing the real module) is
// required by that hoisting: babel-plugin-jest-hoist forbids referencing out-of-scope imports
// from inside a jest.mock factory.
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required by jest hoisting, see comment above
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

function Harness({ seedTrickId }: { readonly seedTrickId?: string }) {
  const { selectedTrickIds } = useUserProfile();
  const { completeOnboarding } = useUserProfileActions();
  const { addGoal } = useGoalActions();

  return (
    <>
      <Pressable
        accessibilityLabel="seed-selected-trick"
        onPress={() => {
          if (seedTrickId) completeOnboarding(1, [seedTrickId], []);
        }}
      />
      <Pressable
        accessibilityLabel="add-goal"
        onPress={() =>
          addGoal({
            kind: 'count',
            trickId: 'big-cup',
            trickName: 'Big Cup',
            targetCount: 10,
          })
        }
      />
      <Pressable
        accessibilityLabel={`selected-trick-ids:${selectedTrickIds.join(',')}`}
        onPress={() => {}}
      />
    </>
  );
}

function selectedTrickIdsOf(root: ReactTestRenderer): string {
  const [match] = root.root.findAll(
    (node) =>
      typeof node.props.accessibilityLabel === 'string' &&
      node.props.accessibilityLabel.startsWith('selected-trick-ids:'),
  );
  return match.props.accessibilityLabel.slice('selected-trick-ids:'.length);
}

function pressByAccessibilityLabel(root: ReactTestRenderer, label: string) {
  const [match] = root.root.findAll(
    (node) => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function',
  );
  match.props.onPress();
}

async function mountAndHydrate(harnessProps: { readonly seedTrickId?: string } = {}) {
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(
      <UserProfileProvider>
        <GoalProvider>
          <Harness {...harnessProps} />
        </GoalProvider>
      </UserProfileProvider>,
    );
  });
  return root;
}

describe('GoalProvider cross-domain focused-trick wiring', () => {
  it('adds a goal trick to selectedTrickIds when it is not already focused', async () => {
    const root = await mountAndHydrate();

    expect(selectedTrickIdsOf(root).split(',').filter(Boolean)).not.toContain('big-cup');

    act(() => {
      pressByAccessibilityLabel(root, 'add-goal');
    });

    expect(selectedTrickIdsOf(root).split(',').filter(Boolean)).toEqual(['big-cup']);
  });

  it('is a no-op on the focused list when the goal trick is already focused', async () => {
    const root = await mountAndHydrate({ seedTrickId: 'big-cup' });

    act(() => {
      pressByAccessibilityLabel(root, 'seed-selected-trick');
    });

    expect(selectedTrickIdsOf(root).split(',').filter(Boolean)).toEqual(['big-cup']);

    act(() => {
      pressByAccessibilityLabel(root, 'add-goal');
    });

    expect(selectedTrickIdsOf(root).split(',').filter(Boolean)).toEqual(['big-cup']);
  });
});
