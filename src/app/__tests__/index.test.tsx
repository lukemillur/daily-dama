import { describe, expect, it, jest } from '@jest/globals';
import { Image } from 'expo-image';
import type { ReactElement } from 'react';
import { act, create } from 'react-test-renderer';

import RootRoute from '@/app/index';

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

jest.mock('expo-router', () => ({
  Link: ({ children }: { children: ReactElement }) => children,
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
}));

describe('RootRoute (landing page)', () => {
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

    const cta = root.root.findAll(
      (node) => node.props.accessibilityRole === 'link',
    );
    expect(cta.length).toBeGreaterThan(0);

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
    expect(images.length).toBe(4);

    const expectedAltFragments = [
      'home screen',
      'first-ever lace',
      'Custom trick form',
      'Trick goals screen',
    ];
    expectedAltFragments.forEach((fragment) => {
      const matches = images.filter(
        (node) =>
          typeof node.props.accessibilityLabel === 'string' &&
          node.props.accessibilityLabel.includes(fragment),
      );
      expect(matches.length).toBeGreaterThan(0);
    });
  });
});
