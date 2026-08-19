import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { act, create } from 'react-test-renderer';

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
    let root!: ReturnType<typeof create>;
    await act(async () => {
      root = create(<LandingPage />);
    });

    const textNodes = root.root.findAll(
      (node) => typeof node.props.children === 'string',
    );
    const allText = textNodes.map((node) => node.props.children as string);

    const ctaIndex = allText.findIndex((text) => text === 'Start your first Sesh');
    const featureHeadingIndex = allText.findIndex((text) => text === 'Pick one trick and stick to it');

    expect(ctaIndex).toBeGreaterThanOrEqual(0);
    expect(featureHeadingIndex).toBeGreaterThanOrEqual(0);
    expect(ctaIndex).toBeLessThan(featureHeadingIndex);
  });
});
