import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { LandingCta } from '@/features/landing/components/landing-cta';
import type { UserProfile } from '@/features/profile/model/user-profile';

const mockRouter = { push: jest.fn() };
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
}));

const mockUseUserProfile = jest.fn<() => UserProfile>();
jest.mock('@/features/profile/state/user-profile-provider', () => ({
  useUserProfile: () => mockUseUserProfile(),
}));

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

function findByVisibleText(root: ReactTestRenderer, text: string) {
  return root.root.findAll((node) => node.props.children === text);
}

async function mount() {
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(<LandingCta />);
  });
  return root;
}

beforeEach(() => {
  mockRouter.push.mockClear();
  mockUseUserProfile.mockReset();
});

describe('LandingCta', () => {
  it('navigates to /app/home when pressed as a first-time visitor', async () => {
    mockUseUserProfile.mockReturnValue({
      selectedTrickIds: [],
      hasCompletedOnboarding: false,
    });

    const root = await mount();

    act(() => pressByVisibleText(root, 'Start your first Sesh'));

    expect(mockRouter.push).toHaveBeenCalledWith('/app/home');
  });

  it('shows returning-visitor copy and still navigates to /app/home when pressed', async () => {
    mockUseUserProfile.mockReturnValue({
      selectedTrickIds: [],
      hasCompletedOnboarding: true,
    });

    const root = await mount();

    expect(findByVisibleText(root, 'Welcome back').length).toBeGreaterThan(0);
    expect(findByVisibleText(root, 'Jump back into practice.').length).toBeGreaterThan(0);
    expect(findByVisibleText(root, 'Start your first sesh.').length).toBe(0);

    act(() => pressByVisibleText(root, 'Back to practice'));

    expect(mockRouter.push).toHaveBeenCalledWith('/app/home');
  });
});
