import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { Platform, Pressable } from 'react-native';
import { act, create } from 'react-test-renderer';

import {
  useUserProfileActions,
  UserProfileProvider,
} from '@/features/profile/state/user-profile-provider';

// Hoisted above the imports by babel-jest, so the require below runs before the real module is
// ever reached; jest.mock factories can't reference out-of-scope imports (babel-plugin-jest-hoist).
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required by jest hoisting, see comment above
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const mockTrack = jest.fn();
jest.mock('@vercel/analytics', () => ({ track: (...args: unknown[]) => mockTrack(...args) }));

function Harness() {
  const { completeOnboarding } = useUserProfileActions();
  return (
    <Pressable
      accessibilityLabel="complete-onboarding"
      onPress={() => completeOnboarding(1, [], [])}
    />
  );
}

async function mountAndHydrate() {
  let root!: ReturnType<typeof create>;
  await act(async () => {
    root = create(
      <UserProfileProvider>
        <Harness />
      </UserProfileProvider>,
    );
  });
  return root;
}

function pressCompleteOnboarding(root: ReturnType<typeof create>) {
  const [match] = root.root.findAll(
    (node) => node.props.accessibilityLabel === 'complete-onboarding' && typeof node.props.onPress === 'function',
  );
  match.props.onPress();
}

describe('completeOnboarding analytics', () => {
  const originalPlatformOS = Platform.OS;

  afterEach(() => {
    Platform.OS = originalPlatformOS;
    mockTrack.mockClear();
  });

  it('fires track("onboarding_completed") on web', async () => {
    Platform.OS = 'web';
    const root = await mountAndHydrate();

    act(() => {
      pressCompleteOnboarding(root);
    });

    expect(mockTrack).toHaveBeenCalledWith('onboarding_completed');
  });

  it('does not fire analytics on non-web platforms', async () => {
    Platform.OS = 'ios';
    const root = await mountAndHydrate();

    act(() => {
      pressCompleteOnboarding(root);
    });

    expect(mockTrack).not.toHaveBeenCalled();
  });
});
