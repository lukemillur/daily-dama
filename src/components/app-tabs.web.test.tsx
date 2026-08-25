import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';

// RootRoute now transitively imports use-cached-onboarding-status.ts (T145), which imports
// AsyncStorage directly for its native fallback path -- mock it before RootRoute is imported
// below, same pattern as read-cached-theme-background.test.ts.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { CustomTabList } from '@/components/app-tabs.web';
import RootRoute from '@/app/index';
import type { UserProfile } from '@/features/profile/model/user-profile';

const mockRouter = { push: jest.fn(), replace: jest.fn() };
let mockSearchParams: Record<string, string> = {};
let mockPathname = '/app/profile';
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockSearchParams,
  usePathname: () => mockPathname,
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

const defaultProfile: UserProfile = {
  selectedTrickIds: [],
  hasCompletedOnboarding: false,
  kenteiRank: undefined,
};

const customThemeProfile: UserProfile = {
  ...defaultProfile,
  hasCompletedOnboarding: true,
  kenteiRank: 5,
  themeBackgroundColor: '#123456',
  themeAccentColor: '#654321',
};

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

function findFooterBar(root: ReactTestRenderer) {
  return root.root.findByProps({ testID: 'app-footer-bar' });
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
  mockUseUserProfile.mockReturnValue(defaultProfile);
  mockSearchParams = {};
  mockPathname = '/app/profile';
});

describe('CustomTabList leave-app footer bar', () => {
  it('renders a footer-bar container holding "Leave app" as a left-aligned element', async () => {
    const root = await mountTabList();

    const footerBar = findFooterBar(root);
    const flattenedStyle = [footerBar.props.style].flat();
    expect(flattenedStyle).toEqual(
      expect.arrayContaining([expect.objectContaining({ justifyContent: 'flex-start' })])
    );

    const leaveAppNodes = findByVisibleText(root, 'Leave app');
    expect(leaveAppNodes.length).toBeGreaterThan(0);
    expect(footerBar.findAllByProps({ children: 'Leave app' }).length).toBeGreaterThan(0);
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
    mockUseUserProfile.mockReturnValue(customThemeProfile);

    const tabListRoot = await mountTabList();
    act(() => pressByVisibleText(tabListRoot, 'Leave app'));

    const pushedArg = mockRouter.push.mock.calls[0][0] as { params: Record<string, string> };
    mockSearchParams = pushedArg.params;

    const rootRoot = await mountRootRoute();

    expect(findByVisibleText(rootRoot, 'Landing Page').length).toBeGreaterThan(0);
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('changes the footer background and link text color when a custom theme is set', async () => {
    const defaultRoot = await mountTabList();
    const defaultFooter = findFooterBar(defaultRoot);
    const defaultFooterStyle = Object.assign({}, ...[defaultFooter.props.style].flat());
    const defaultLinkText = defaultFooter.findAllByProps({ children: 'Leave app' })[0];
    const defaultLinkStyle = Object.assign({}, ...[defaultLinkText.props.style].flat());

    mockUseUserProfile.mockReturnValue(customThemeProfile);
    const customRoot = await mountTabList();
    const customFooter = findFooterBar(customRoot);
    const customFooterStyle = Object.assign({}, ...[customFooter.props.style].flat());
    const customLinkText = customFooter.findAllByProps({ children: 'Leave app' })[0];
    const customLinkStyle = Object.assign({}, ...[customLinkText.props.style].flat());

    expect(customFooterStyle.backgroundColor).not.toBe(defaultFooterStyle.backgroundColor);
    expect(customLinkStyle.color).not.toBe(defaultLinkStyle.color);
  });
});

describe('CustomTabList footer bar route gating', () => {
  it.each(['/app/home', '/app/sesh', '/app/tricks', '/app/stats'])(
    'omits the footer bar on %s',
    async (pathname) => {
      mockPathname = pathname;
      const root = await mountTabList();

      expect(() => findFooterBar(root)).toThrow();
    },
  );

  it('renders the footer bar on /app/profile', async () => {
    mockPathname = '/app/profile';
    const root = await mountTabList();

    expect(findFooterBar(root)).toBeTruthy();
  });
});
