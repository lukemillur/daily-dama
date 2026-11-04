import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { ReactNode } from 'react';

import AppTabs, { TAB_ICON_SYMBOLS, deriveTabBarColors } from '@/components/app-tabs';
import { resolveTheme } from '@/features/profile/state/use-resolved-theme';

const mockState = {
  theme: resolveTheme({}),
  onboarded: true,
  systemScheme: 'light',
};

jest.mock('expo-router', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const Screen = (props: Record<string, unknown>) => React.createElement('screen', props);
  const Tabs = Object.assign(
    (props: { children?: ReactNode; screenOptions?: unknown }) =>
      React.createElement('tabs', { screenOptions: props.screenOptions }, props.children),
    { Screen },
  );
  return { Tabs };
});

jest.mock('expo-symbols', () => {
  const React = jest.requireActual('react') as typeof import('react');
  return { SymbolView: (props: Record<string, unknown>) => React.createElement('symbol', props) };
});

jest.mock('@/features/profile/state/use-resolved-theme', () => {
  const actual = jest.requireActual(
    '@/features/profile/state/use-resolved-theme',
  ) as typeof import('@/features/profile/state/use-resolved-theme');
  return { ...actual, useResolvedTheme: () => mockState.theme };
});

jest.mock('@/hooks/use-color-scheme', () => ({
  useColorScheme: () => mockState.systemScheme,
}));

jest.mock('@/features/profile/state/user-profile-provider', () => ({
  useUserProfile: () => ({
    hasCompletedOnboarding: mockState.onboarded,
    kenteiRank: mockState.onboarded ? 3 : undefined,
  }),
}));

function render(): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<AppTabs />);
  });
  return tree;
}

type Options = {
  tabBarStyle: { backgroundColor: string; borderTopColor: string; display?: string };
  tabBarActiveTintColor: string;
  tabBarInactiveTintColor: string;
};

function barOptions(tree: ReactTestRenderer): Options {
  return tree.root.findByType('tabs' as never).props.screenOptions as Options;
}

const darkTheme = resolveTheme({
  themeBackgroundColor: '#101820',
  themeAccentColor: '#f2c14e',
  themeTextColor: '#f5f5f0',
});

describe('AppTabs native fixed bar', () => {
  beforeEach(() => {
    mockState.theme = resolveTheme({});
    mockState.onboarded = true;
    mockState.systemScheme = 'light';
  });

  it('renders the five routes in order with titles', () => {
    const screens = render().root.findAllByType('screen' as never);
    expect(screens.map((s) => [s.props.name, s.props.options.title])).toEqual([
      ['home', 'Home'],
      ['sesh', 'Sesh'],
      ['tricks', 'Tricks'],
      ['stats', 'Stats'],
      ['profile', 'Profile'],
    ]);
  });

  it('draws the selected symbol when focused and the default when not', () => {
    const screens = render().root.findAllByType('screen' as never);
    for (const screen of screens) {
      const symbols = TAB_ICON_SYMBOLS[screen.props.name as keyof typeof TAB_ICON_SYMBOLS];
      for (const focused of [true, false]) {
        let icon!: ReactTestRenderer;
        act(() => {
          icon = create(screen.props.options.tabBarIcon({ color: '#123456', focused }));
        });
        const symbol = icon.root.findByType('symbol' as never);
        expect(symbol.props.name).toBe(focused ? symbols.selected : symbols.default);
        expect(symbol.props.tintColor).toBe('#123456');
      }
    }
  });

  it('uses a distinct default symbol per route', () => {
    const names = Object.values(TAB_ICON_SYMBOLS).map((symbol) => symbol.default);
    expect(new Set(names).size).toBe(names.length);
  });

  it('follows the app theme and ignores the system appearance', () => {
    const light = barOptions(render());
    mockState.theme = darkTheme;
    const dark = barOptions(render());
    expect(light.tabBarStyle.backgroundColor).toBe(resolveTheme({}).background);
    expect(dark.tabBarStyle.backgroundColor).toBe('#101820');
    expect(dark.tabBarActiveTintColor).toBe('#f5f5f0');
    expect(dark.tabBarActiveTintColor).not.toBe(light.tabBarActiveTintColor);
    expect(dark.tabBarInactiveTintColor).not.toBe(light.tabBarInactiveTintColor);

    mockState.theme = resolveTheme({});
    mockState.systemScheme = 'dark';
    expect(barOptions(render())).toEqual(light);
  });

  it('hides the bar until onboarding completes', () => {
    expect(barOptions(render()).tabBarStyle.display).toBeUndefined();
    mockState.onboarded = false;
    expect(barOptions(render()).tabBarStyle.display).toBe('none');
  });

  it('never makes the bar float', () => {
    expect(barOptions(render()).tabBarStyle).not.toHaveProperty('position');
  });

  it('derives bar colors from the theme', () => {
    expect(deriveTabBarColors(darkTheme)).toMatchObject({
      background: '#101820',
      active: '#f5f5f0',
      inactive: darkTheme.textMuted,
    });
  });
});
