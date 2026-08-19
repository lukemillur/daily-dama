import { beforeEach, afterAll, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
// A CommonJS require (rather than `import * as ReactNative`) resolves to the exact same
// module.exports object react-native's own named imports use elsewhere in this file's module
// graph -- Babel's ES-module namespace-import interop otherwise wraps it in a fresh object,
// so mutating Platform.OS or spying on useWindowDimensions here wouldn't be visible to
// LandingPage's own `import { Platform, useWindowDimensions } from 'react-native'`.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ReactNative = require('react-native') as typeof import('react-native');

import { LandingPage, MOBILE_SCREENSHOTS, WEB_SCREENSHOTS } from '@/features/landing/components/landing-page';
import type { UserProfile } from '@/features/profile/model/user-profile';

const mockRouter = { push: jest.fn() };
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
}));

// jest-expo defaults Platform.OS to 'ios' in tests, so the Platform.OS === 'web' branch in
// LandingPage is unreachable without forcing Platform.OS to 'web'. Fixed for the whole file --
// both width branches are still exercised because the component ANDs it with width, and native
// Platform.OS behavior isn't under test here. Mutating Platform.OS directly (rather than
// jest.mock('react-native', ...)) avoids eagerly evaluating react-native's lazy native-module
// exports, which throws under jest-expo when the whole module is spread.
const originalPlatformOS = ReactNative.Platform.OS;
ReactNative.Platform.OS = 'web';
afterAll(() => {
  ReactNative.Platform.OS = originalPlatformOS;
});

const mockUseWindowDimensions = jest.spyOn(ReactNative, 'useWindowDimensions');

// expo-image's native oversized-image observer wiring (initObserveIntegrationIfNeeded) throws
// under jest-expo's native-module mock ('observe.getIntegrations is not a function') -- it isn't
// exercised in this test, so mock the component with a lightweight stand-in.
jest.mock('expo-image', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { Image: (props: Record<string, unknown>) => React.createElement(View, props) };
});

const mockUseUserProfile = jest.fn<() => UserProfile>();
jest.mock('@/features/profile/state/user-profile-provider', () => ({
  useUserProfile: () => mockUseUserProfile(),
}));

function findByVisibleText(root: ReactTestRenderer, text: string) {
  return root.root.findAll((node) => node.props.children === text);
}

async function mount() {
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(<LandingPage />);
  });
  return root;
}

const SCREENSHOT_TITLES_AND_CAPTIONS: ReadonlyArray<{ title: string; caption: string }> = [
  {
    title: 'Your practice loop, at a glance',
    caption:
      'Open the app and the loop is right there: what you last practiced, what’s next, and how the streak is going.',
  },
  {
    title: 'First lace, first cheer',
    caption: 'The moment a trick actually lands for the first time, Daily Dama says so.',
  },
  {
    title: 'Your move, your rank',
    caption: 'Got a move that’s not in the standard Kentei set? Name it, rank it, and it joins your rotation.',
  },
  {
    title: 'Progress you can point to',
    caption: 'Climb the ladder on purpose — set a target per trick and watch the progress add up.',
  },
];

beforeEach(() => {
  mockRouter.push.mockClear();
  mockUseUserProfile.mockReset();
  mockUseUserProfile.mockReturnValue({
    selectedTrickIds: [],
    hasCompletedOnboarding: false,
  });
  mockUseWindowDimensions.mockReset();
  mockUseWindowDimensions.mockReturnValue({ width: 375, height: 812, scale: 2, fontScale: 1 });
});

describe('LandingPage', () => {
  it('renders the CTA before the feature-list content in document order', async () => {
    const root = await mount();

    const textNodes = root.root.findAll((node) => typeof node.props.children === 'string');
    const allText = textNodes.map((node) => node.props.children as string);

    const ctaIndex = allText.findIndex((text) => text === 'Start your first Sesh');
    const featureHeadingIndex = allText.findIndex((text) => text === 'Pick one trick and stick to it');

    expect(ctaIndex).toBeGreaterThanOrEqual(0);
    expect(featureHeadingIndex).toBeGreaterThanOrEqual(0);
    expect(ctaIndex).toBeLessThan(featureHeadingIndex);
  });

  it('renders the hero banner', async () => {
    const root = await mount();

    expect(root.root.findAllByProps({ testID: 'landing-hero' }).length).toBeGreaterThan(0);
  });
});

describe('LandingPage screenshot showcase', () => {
  it.each(SCREENSHOT_TITLES_AND_CAPTIONS)(
    'renders both a title and a caption as distinct text nodes for "$title"',
    async ({ title, caption }) => {
      const root = await mount();

      const titleNodes = findByVisibleText(root, title);
      const captionNodes = findByVisibleText(root, caption);

      expect(titleNodes.length).toBeGreaterThan(0);
      expect(captionNodes.length).toBeGreaterThan(0);
      expect(titleNodes[0]).not.toBe(captionNodes[0]);
    },
  );
});

describe('LandingPage platform-based screenshot set', () => {
  it('defines both a mobile and a web screenshot set', () => {
    expect(MOBILE_SCREENSHOTS.length).toBe(4);
    expect(WEB_SCREENSHOTS.length).toBe(4);
  });

  it('renders the mobile screenshot set at a mobile-width viewport', async () => {
    mockUseWindowDimensions.mockReturnValue({ width: 375, height: 812, scale: 2, fontScale: 1 });
    const root = await mount();

    const images = root.root.findAll((node) => node.props.alt === MOBILE_SCREENSHOTS[0]!.alt);
    const webImages = root.root.findAll((node) => node.props.alt === WEB_SCREENSHOTS[0]!.alt);

    expect(images.length).toBeGreaterThan(0);
    expect(webImages.length).toBe(0);
  });

  it('renders the web screenshot set at a desktop-width viewport', async () => {
    mockUseWindowDimensions.mockReturnValue({ width: 1280, height: 900, scale: 1, fontScale: 1 });
    const root = await mount();

    const images = root.root.findAll((node) => node.props.alt === WEB_SCREENSHOTS[0]!.alt);
    const mobileImages = root.root.findAll((node) => node.props.alt === MOBILE_SCREENSHOTS[0]!.alt);

    expect(images.length).toBeGreaterThan(0);
    expect(mobileImages.length).toBe(0);
  });
});
