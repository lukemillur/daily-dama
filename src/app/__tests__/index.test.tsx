import { describe, expect, it, jest } from '@jest/globals';
import type { ReactElement } from 'react';
import { act, create } from 'react-test-renderer';

import RootRoute from '@/app/index';

jest.mock('react-native-reanimated', () =>
  require('react-native-reanimated/mock'),
);

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
});
