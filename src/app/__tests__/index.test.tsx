import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Image } from 'expo-image';
import { act, create } from 'react-test-renderer';

import RootRoute from '@/app/index';
import type { UserProfile } from '@/features/profile/model/user-profile';

jest.mock('react-native-reanimated', () =>
  require('react-native-reanimated/mock'),
);

// expo-image's native oversized-image observer wiring (initObserveIntegrationIfNeeded) throws
// under jest-expo's native-module mock ('observe.getIntegrations is not a function') -- it isn't
// exercised in this test, so mock the component with a lightweight stand-in that preserves the
// props this suite asserts on (source, accessibilityLabel, alt).
jest.mock('expo-image', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { Image: (props: Record<string, unknown>) => React.createElement(View, props) };
});

const mockRouter = { replace: jest.fn(), push: jest.fn() };
let mockSearchParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockSearchParams,
  useRouter: () => mockRouter,
}));

const mockUseUserProfile = jest.fn<() => UserProfile>();
jest.mock('@/features/profile/state/user-profile-provider', () => ({
  useUserProfile: () => mockUseUserProfile(),
}));

describe('RootRoute (landing page)', () => {
  beforeEach(() => {
    mockRouter.replace.mockClear();
    mockRouter.push.mockClear();
    mockSearchParams = {};
    mockUseUserProfile.mockReset();
    mockUseUserProfile.mockReturnValue({
      selectedTrickIds: [],
      hasCompletedOnboarding: false,
    });
  });

  it('renders distinct headline, lede, and feature copy using the typography components', async () => {
    let root!: ReturnType<typeof create>;
    await act(async () => {
      root = create(<RootRoute />);
    });

    const headline = root.root.findAll(
      (node) => node.props.children === 'Why Daily Dama',
    );
    expect(headline.length).toBeGreaterThan(0);

    const lede = root.root.findAll(
      (node) =>
        typeof node.props.children === 'string' &&
        node.props.children.includes('deliberate-practice half of your play'),
    );
    expect(lede.length).toBeGreaterThan(0);

    const featureHeading = root.root.findAll(
      (node) => node.props.children === 'Pick one trick and stick to it',
    );
    expect(featureHeading.length).toBeGreaterThan(0);

    const ctaHeadline = root.root.findAll(
      (node) => node.props.children === 'Start your first sesh.',
    );
    expect(ctaHeadline.length).toBeGreaterThan(0);

    const ctaLabel = root.root.findAll(
      (node) => node.props.children === 'Start your first Sesh',
    );
    expect(ctaLabel.length).toBeGreaterThan(0);
  });

  it('renders the four screenshot images with descriptive alt text', async () => {
    let root!: ReturnType<typeof create>;
    await act(async () => {
      root = create(<RootRoute />);
    });

    const images = root.root.findAll((node) => node.type === Image);

    const expectedAltFragments = [
      'home screen',
      'first-ever lace',
      'Custom trick form',
      'Trick goals screen',
    ];
    // The landing page also renders a kendama photo (see landing-photo.tsx) via the same
    // expo-image component, so scope this count to the screenshot images specifically rather
    // than asserting on the raw total.
    const screenshotImages = images.filter(
      (node) =>
        typeof node.props.accessibilityLabel === 'string' &&
        expectedAltFragments.some((fragment) => node.props.accessibilityLabel.includes(fragment)),
    );
    expect(screenshotImages.length).toBe(4);

    expectedAltFragments.forEach((fragment) => {
      const matches = images.filter(
        (node) =>
          typeof node.props.accessibilityLabel === 'string' &&
          node.props.accessibilityLabel.includes(fragment),
      );
      expect(matches.length).toBeGreaterThan(0);
    });
  });

  it('redirects a fresh, fully-onboarded arrival straight to /app/home without rendering the landing page', async () => {
    mockUseUserProfile.mockReturnValue({
      selectedTrickIds: [],
      hasCompletedOnboarding: true,
      kenteiRank: 5,
    });

    let root!: ReturnType<typeof create>;
    await act(async () => {
      root = create(<RootRoute />);
    });

    expect(mockRouter.replace).toHaveBeenCalledWith('/app/home');
    const headline = root.root.findAll(
      (node) => node.props.children === 'Why Daily Dama',
    );
    expect(headline.length).toBe(0);
  });

  it('renders the landing page with no redirect when the in-app arrival signal is present', async () => {
    mockUseUserProfile.mockReturnValue({
      selectedTrickIds: [],
      hasCompletedOnboarding: true,
      kenteiRank: 5,
    });
    mockSearchParams = { from: 'app' };

    let root!: ReturnType<typeof create>;
    await act(async () => {
      root = create(<RootRoute />);
    });

    expect(mockRouter.replace).not.toHaveBeenCalled();
    const headline = root.root.findAll(
      (node) => node.props.children === 'Why Daily Dama',
    );
    expect(headline.length).toBeGreaterThan(0);
  });

  it('renders the landing page for an incomplete onboarding profile even when the signal is present', async () => {
    mockUseUserProfile.mockReturnValue({
      selectedTrickIds: [],
      hasCompletedOnboarding: false,
    });
    mockSearchParams = { from: 'app' };

    let root!: ReturnType<typeof create>;
    await act(async () => {
      root = create(<RootRoute />);
    });

    expect(mockRouter.replace).not.toHaveBeenCalled();
    const headline = root.root.findAll(
      (node) => node.props.children === 'Why Daily Dama',
    );
    expect(headline.length).toBeGreaterThan(0);
  });
});
