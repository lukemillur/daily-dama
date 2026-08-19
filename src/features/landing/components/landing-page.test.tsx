import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { LandingPage } from '@/features/landing/components/landing-page';
import type { UserProfile } from '@/features/profile/model/user-profile';

const mockRouter = { push: jest.fn() };
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
}));

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
