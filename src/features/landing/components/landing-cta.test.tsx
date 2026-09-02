import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { LandingCta } from '@/features/landing/components/landing-cta';
import type { CachedOnboardingStatus } from '@/features/profile/persistence/read-cached-onboarding-status';

const mockRouter = { push: jest.fn() };
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
}));

const mockUseCachedOnboardingStatus = jest.fn<() => CachedOnboardingStatus>();
jest.mock('@/features/landing/state/use-cached-onboarding-status', () => ({
  useCachedOnboardingStatus: () => mockUseCachedOnboardingStatus(),
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

function findAncestorWithStyleIncluding(root: ReactTestRenderer, text: string, needle: string) {
  const [textNode] = root.root.findAll((node) => node.props.children === text);
  if (!textNode) throw new Error('No node found with text: ' + text);
  let current: typeof textNode | null = textNode;
  while (current) {
    if (JSON.stringify(current.props.style ?? {}).includes(needle)) return current;
    current = current.parent;
  }
  return null;
}

function findNodeWithStyleIncluding(root: ReactTestRenderer, needle: string) {
  return root.root.findAll((node) => JSON.stringify(node.props.style ?? {}).includes(needle));
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
  mockUseCachedOnboardingStatus.mockReset();
});

describe('LandingCta', () => {
  it('navigates to /app/home when pressed as a first-time visitor', async () => {
    mockUseCachedOnboardingStatus.mockReturnValue({
      hasCompletedOnboarding: false,
      kenteiRank: undefined,
    });

    const root = await mount();

    act(() => pressByVisibleText(root, 'Start your first Sesh'));

    expect(mockRouter.push).toHaveBeenCalledWith('/app/home');
  });

  it('shows returning-visitor copy and still navigates to /app/home when pressed', async () => {
    mockUseCachedOnboardingStatus.mockReturnValue({
      hasCompletedOnboarding: true,
      kenteiRank: 5,
    });

    const root = await mount();

    expect(findByVisibleText(root, 'Welcome back').length).toBeGreaterThan(0);
    expect(findByVisibleText(root, 'Jump back into practice.').length).toBeGreaterThan(0);
    expect(findByVisibleText(root, 'Start your first sesh.').length).toBe(0);

    act(() => pressByVisibleText(root, 'Back to practice'));

    expect(mockRouter.push).toHaveBeenCalledWith('/app/home');
  });

  it('renders the sticker-card treatment for both variants', async () => {
    mockUseCachedOnboardingStatus.mockReturnValue({
      hasCompletedOnboarding: false,
      kenteiRank: undefined,
    });
    const firstTimeRoot = await mount();

    expect(findByVisibleText(firstTimeRoot, '●').length).toBeGreaterThan(0);
    expect(findAncestorWithStyleIncluding(firstTimeRoot, 'Ready when you are', 'rotate')).not.toBeNull();
    expect(findNodeWithStyleIncluding(firstTimeRoot, 'boxShadow').length).toBeGreaterThan(0);

    mockUseCachedOnboardingStatus.mockReturnValue({
      hasCompletedOnboarding: true,
      kenteiRank: 5,
    });
    const returningRoot = await mount();

    expect(findByVisibleText(returningRoot, '●').length).toBeGreaterThan(0);
    expect(findAncestorWithStyleIncluding(returningRoot, 'Welcome back', 'rotate')).not.toBeNull();
    expect(findNodeWithStyleIncluding(returningRoot, 'boxShadow').length).toBeGreaterThan(0);
  });
});
