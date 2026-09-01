import { beforeEach, afterAll, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
// A CommonJS require (rather than `import * as ReactNative`) resolves to the exact same
// module.exports object react-native's own named imports use elsewhere in this file's module
// graph -- Babel's ES-module namespace-import interop otherwise wraps it in a fresh object,
// so mutating Platform.OS or spying on useWindowDimensions here wouldn't be visible to
// LandingPage's own `import { Platform, useWindowDimensions } from 'react-native'`.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ReactNative = require('react-native') as typeof import('react-native');

import type { AuthState } from '@/features/auth/model/auth-state';
import { LandingPage, MOBILE_SCREENSHOTS, WEB_SCREENSHOTS } from '@/features/landing/components/landing-page';
import type { CachedOnboardingStatus } from '@/features/profile/persistence/read-cached-onboarding-status';

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

const mockUseCachedOnboardingStatus = jest.fn<() => CachedOnboardingStatus>();
jest.mock('@/features/landing/state/use-cached-onboarding-status', () => ({
  useCachedOnboardingStatus: () => mockUseCachedOnboardingStatus(),
}));

let mockAuthState: AuthState = { status: 'guest', reason: 'signedOut' };
jest.mock('@/features/auth/state/auth-provider', () => ({
  useAuthState: () => mockAuthState,
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
  mockUseCachedOnboardingStatus.mockReset();
  mockUseCachedOnboardingStatus.mockReturnValue({
    hasCompletedOnboarding: false,
    kenteiRank: undefined,
  });
  mockUseWindowDimensions.mockReset();
  mockUseWindowDimensions.mockReturnValue({ width: 375, height: 812, scale: 2, fontScale: 1 });
  mockAuthState = { status: 'guest', reason: 'signedOut' };
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
});

describe('LandingPage sign-up/sign-in entry points', () => {
  function findAllByLabel(root: ReactTestRenderer, label: string) {
    return root.root.findAll((node) => node.props.accessibilityLabel === label);
  }

  it('renders Sign up and Sign in entry points for a guest visitor', async () => {
    mockAuthState = { status: 'guest', reason: 'signedOut' };
    const root = await mount();

    expect(findAllByLabel(root, 'Sign up').length).toBeGreaterThan(0);
    expect(findAllByLabel(root, 'Sign in').length).toBeGreaterThan(0);
  });

  it('hides the sign-up/sign-in entry points once authenticated', async () => {
    mockAuthState = {
      status: 'authenticated',
      session: { access_token: 'tok', user: { email: 'someone@example.com' } } as never,
      lastEvent: 'SIGNED_IN',
    };
    const root = await mount();

    expect(findAllByLabel(root, 'Sign up').length).toBe(0);
    expect(findAllByLabel(root, 'Sign in').length).toBe(0);
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

function resolvedStyleFor(
  root: ReactTestRenderer,
  matches: ReturnType<ReactTestRenderer['root']['findAll']>,
) {
  // Style may arrive as a plain object (styled-components-only, e.g. a text node) or as an
  // array (once a JSX call site also passes its own `style` prop, e.g. ScreenshotItem's
  // boxShadow, which styled-components merges with its generated CSS into an array on the
  // rendered node). Prefer an array-style match -- it holds the fully merged style -- and fall
  // back to a plain-object match otherwise, then flatten either shape the same way react-native
  // does at render time.
  const arrayStyleMatch = matches.find((node) => Array.isArray(node.props.style));
  const plainStyleMatch = matches.find(
    (node) => typeof node.props.style === 'object' && node.props.style !== null && !Array.isArray(node.props.style),
  );
  const resolved = arrayStyleMatch ?? plainStyleMatch;
  return ReactNative.StyleSheet.flatten(resolved?.props.style) as
    | { maxWidth?: number; fontSize?: number; padding?: unknown; alignItems?: string }
    | undefined;
}

describe('LandingPage screenshot showcase centering', () => {
  it('centers the screenshot showcase items at a mobile viewport', async () => {
    mockUseWindowDimensions.mockReturnValue({ width: 375, height: 812, scale: 2, fontScale: 1 });
    const root = await mount();

    const sectionNodes = root.root.findAllByProps({ testID: 'screenshot-section' });
    const sectionStyle = resolvedStyleFor(root, sectionNodes);
    expect(sectionStyle?.alignItems).toBe('center');
  });

  it('centers the screenshot showcase items at a desktop viewport', async () => {
    mockUseWindowDimensions.mockReturnValue({ width: 1280, height: 900, scale: 1, fontScale: 1 });
    const root = await mount();

    const sectionNodes = root.root.findAllByProps({ testID: 'screenshot-section' });
    const sectionStyle = resolvedStyleFor(root, sectionNodes);
    expect(sectionStyle?.alignItems).toBe('center');
  });
});

describe('LandingPage screenshot showcase sizing', () => {
  it('renders mobile-width screenshot item, title, and caption sizing at a mobile viewport', async () => {
    mockUseWindowDimensions.mockReturnValue({ width: 375, height: 812, scale: 2, fontScale: 1 });
    const root = await mount();

    const itemNodes = root.root.findAllByProps({ testID: 'screenshot-item' });
    const itemStyle = resolvedStyleFor(root, itemNodes);
    expect(itemStyle?.maxWidth).toBe(360);

    const titleNodes = findByVisibleText(root, SCREENSHOT_TITLES_AND_CAPTIONS[0]!.title);
    const titleStyle = resolvedStyleFor(root, titleNodes);
    expect(titleStyle?.fontSize).toBe(19);

    const captionNodes = findByVisibleText(root, SCREENSHOT_TITLES_AND_CAPTIONS[0]!.caption);
    const captionStyle = resolvedStyleFor(root, captionNodes);
    expect(captionStyle?.fontSize).toBe(16);
  });

  it('renders larger screenshot item, title, and caption sizing at a desktop viewport', async () => {
    mockUseWindowDimensions.mockReturnValue({ width: 1280, height: 900, scale: 1, fontScale: 1 });
    const root = await mount();

    const webTitle = WEB_SCREENSHOTS[0]!.title;
    const webCaption = WEB_SCREENSHOTS[0]!.caption;

    const itemNodes = root.root.findAllByProps({ testID: 'screenshot-item' });
    const itemStyle = resolvedStyleFor(root, itemNodes);
    expect(itemStyle?.maxWidth).toBeGreaterThan(360);

    const contentNodes = root.root.findAllByProps({ testID: 'landing-content' });
    const contentStyle = resolvedStyleFor(root, contentNodes);
    expect(itemStyle?.maxWidth).toBe(contentStyle?.maxWidth);

    const titleNodes = findByVisibleText(root, webTitle);
    const titleStyle = resolvedStyleFor(root, titleNodes);
    expect(titleStyle?.fontSize).toBe(24);
    expect(titleStyle?.fontSize).toBeGreaterThan(19);

    const captionNodes = findByVisibleText(root, webCaption);
    const captionStyle = resolvedStyleFor(root, captionNodes);
    expect(captionStyle?.fontSize).toBe(18);
    expect(captionStyle?.fontSize).toBeGreaterThan(16);
  });

  it("matches the screenshot showcase's max-width to the content column's max-width at a desktop viewport", async () => {
    mockUseWindowDimensions.mockReturnValue({ width: 1280, height: 900, scale: 1, fontScale: 1 });
    const root = await mount();

    const itemNodes = root.root.findAllByProps({ testID: 'screenshot-item' });
    const itemStyle = resolvedStyleFor(root, itemNodes);

    const contentNodes = root.root.findAllByProps({ testID: 'landing-content' });
    const contentStyle = resolvedStyleFor(root, contentNodes);

    expect(itemStyle?.maxWidth).toBe(contentStyle?.maxWidth);
  });
});

describe('LandingPage screenshot showcase heading', () => {
  it('renders the screenshot showcase heading larger than the previous 17px body-adjacent size', async () => {
    mockUseWindowDimensions.mockReturnValue({ width: 375, height: 812, scale: 2, fontScale: 1 });
    const root = await mount();

    const headingNodes = findByVisibleText(root, 'See it in action');
    const headingStyle = resolvedStyleFor(root, headingNodes);
    expect(headingStyle?.fontSize).toBeGreaterThan(17);
  });
});

describe('LandingPage content column width', () => {
  it('keeps the mobile content-column max-width unchanged at a mobile viewport', async () => {
    mockUseWindowDimensions.mockReturnValue({ width: 375, height: 812, scale: 2, fontScale: 1 });
    const root = await mount();

    const contentNodes = root.root.findAllByProps({ testID: 'landing-content' });
    const contentStyle = resolvedStyleFor(root, contentNodes);
    expect(contentStyle?.maxWidth).toBe(620);
  });

  it('widens the content column to occupy the majority of the viewport at a desktop viewport', async () => {
    mockUseWindowDimensions.mockReturnValue({ width: 1280, height: 900, scale: 1, fontScale: 1 });
    const root = await mount();

    const contentNodes = root.root.findAllByProps({ testID: 'landing-content' });
    const contentStyle = resolvedStyleFor(root, contentNodes);
    expect(contentStyle?.maxWidth).toBeGreaterThan(620);
    expect(contentStyle?.maxWidth).toBeGreaterThan(1280 / 2);
    expect(contentStyle?.maxWidth).toBeGreaterThan(1100);
  });
});

describe('LandingPage platform-based screenshot set', () => {
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
