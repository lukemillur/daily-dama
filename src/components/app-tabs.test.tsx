import { describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { ReactNode } from 'react';

import AppTabs, { TAB_ICON_SYMBOLS } from '@/components/app-tabs';

jest.mock('expo-router/unstable-native-tabs', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const Passthrough = ({ children }: { children?: ReactNode }) =>
    React.createElement(React.Fragment, null, children);
  const Trigger = Object.assign(
    ({ name, children }: { name: string; children?: ReactNode }) =>
      React.createElement('trigger', { name }, children),
    {
      Label: Passthrough,
      Icon: (props: Record<string, unknown>) => React.createElement('icon', props),
    },
  );
  return { NativeTabs: Object.assign(Passthrough, { Trigger }) };
});

jest.mock('@/features/profile/state/user-profile-provider', () => ({
  useUserProfile: () => ({ hasCompletedOnboarding: true, kenteiRank: 3 }),
}));

describe('AppTabs native iconography', () => {
  it('gives every route an SF Symbol icon in the trigger', () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(<AppTabs />);
    });
    const triggers = tree.root.findAllByType('trigger' as never);
    expect(triggers.map((t) => t.props.name)).toEqual([
      'home',
      'sesh',
      'tricks',
      'stats',
      'profile',
    ]);
    for (const trigger of triggers) {
      const icon = trigger.findByType('icon' as never);
      expect(icon.props.sf).toEqual(
        TAB_ICON_SYMBOLS[trigger.props.name as keyof typeof TAB_ICON_SYMBOLS],
      );
    }
  });

  it('uses a distinct default symbol per route', () => {
    const names = Object.values(TAB_ICON_SYMBOLS).map((symbol) => symbol.default);
    expect(new Set(names).size).toBe(names.length);
  });
});
