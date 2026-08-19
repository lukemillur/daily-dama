import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';

import { CustomTabList } from '@/components/app-tabs.web';
import RootRoute from '@/app/index';
import type { UserProfile } from '@/features/profile/model/user-profile';

const mockRouter = { push: jest.fn(), replace: jest.fn() };
let mockSearchParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockSearchParams,
}));

const mockUseUserProfile = jest.fn<() => UserProfile>();
jest.mock('@/features/profile/state/user-profile-provider', () => ({
  useUserProfile: () => mockUseUserProfile(),
}));

jest.mock('@/features/landing/components/landing-page', () => ({
  LandingPage: () => {
    const { Text: RNText } = jest.requireActual('react-native') as typeof import('react-native');
    return <RNText>Landing Page</RNText>;
  },
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

async function mountTabList() {
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(
      <CustomTabList hidden={false}>
        <Text>Home</Text>
      </CustomTabList>
    );
  });
  return root;
}

async function mountRootRoute() {
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(<RootRoute />);
  });
  return root;
}

beforeEach(() => {
  mockRouter.push.mockClear();
  mockRouter.replace.mockClear();
  mockUseUserProfile.mockReset();
  mockSearchParams = {};
});

describe('CustomTabList leave-app link', () => {
  it('is present as a persistent footer-style affordance in the app shell', async () => {
    const root = await mountTabList();

    expect(findByVisibleText(root, 'Leave app').length).toBeGreaterThan(0);
  });

  it('navigates to / carrying the T112.5 in-app-arrival signal when pressed', async () => {
    const root = await mountTabList();

    act(() => pressByVisibleText(root, 'Leave app'));

    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/',
      params: { from: 'app' },
    });
  });

  it('activating the link lands on the landing page instead of redirecting back to /app/home', async () => {
    mockUseUserProfile.mockReturnValue({
      selectedTrickIds: [],
      hasCompletedOnboarding: true,
      kenteiRank: 5,
    });

    const tabListRoot = await mountTabList();
    act(() => pressByVisibleText(tabListRoot, 'Leave app'));

    const pushedArg = mockRouter.push.mock.calls[0][0] as { params: Record<string, string> };
    mockSearchParams = pushedArg.params;

    const rootRoot = await mountRootRoute();

    expect(findByVisibleText(rootRoot, 'Landing Page').length).toBeGreaterThan(0);
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
});
