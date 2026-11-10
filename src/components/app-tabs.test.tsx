import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { ReactNode } from 'react';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import AppTabs,{ TAB_ICON_SYMBOLS, deriveTabBarColors } from '@/components/app-tabs';
import { resolveTheme } from '@/features/profile/state/use-resolved-theme';
import { contrastRatio } from '@/shared/color/contrast';

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
  sceneStyle: { backgroundColor: string };
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
        expect(symbol.props.name).toEqual(focused ? symbols.selected : symbols.default);
        expect(symbol.props.tintColor).toBe('#123456');
        expect(symbol.props.size).toBe(24);
      }
    }
  });

  it('maps every route and state to the exact iOS and Android symbols', () => {
    expect(TAB_ICON_SYMBOLS).toEqual({
      home: {
        default: { ios: 'house', android: 'home' },
        selected: { ios: 'house.fill', android: 'home_filled' },
      },
      sesh: {
        default: { ios: 'timer', android: 'timer' },
        selected: { ios: 'timer', android: 'timer' },
      },
      tricks: {
        default: { ios: 'list.bullet.rectangle', android: 'format_list_bulleted' },
        selected: { ios: 'list.bullet.rectangle.fill', android: 'list_alt' },
      },
      stats: {
        default: { ios: 'chart.bar', android: 'bar_chart' },
        selected: { ios: 'chart.bar.fill', android: 'leaderboard' },
      },
      profile: {
        default: { ios: 'person.crop.circle', android: 'person_outline' },
        selected: { ios: 'person.crop.circle.fill', android: 'account_circle' },
      },
    });
  });

  it.each(['ios', 'android'] as const)('uses a distinct default %s symbol per route', (platform) => {
    const names = Object.values(TAB_ICON_SYMBOLS).map((symbol) => symbol.default[platform]);
    expect(new Set(names).size).toBe(names.length);
  });

  it('only names Android glyphs that exist in the Material Symbols font', () => {
    // Read from disk: the package `exports` map does not expose the JSON to the resolver.
    const symbolGlyphs = JSON.parse(
      readFileSync(
        join(process.cwd(), 'node_modules/expo-symbols/build/android/symbols.json'),
        'utf8',
      ),
    ) as Record<string, unknown>;
    const glyphs = Object.keys(symbolGlyphs);
    for (const { default: d, selected } of Object.values(TAB_ICON_SYMBOLS)) {
      expect(glyphs).toContain(d.android);
      expect(glyphs).toContain(selected.android);
    }
  });

  it('follows the app theme and ignores the system appearance', () => {
    const light = barOptions(render());
    mockState.theme = darkTheme;
    const dark = barOptions(render());
    expect(light.tabBarStyle.backgroundColor).toBe(
      deriveTabBarColors(resolveTheme({})).background,
    );
    expect(light.sceneStyle.backgroundColor).toBe(resolveTheme({}).background);
    expect(dark.tabBarStyle.backgroundColor).toBe(deriveTabBarColors(darkTheme).background);
    expect(dark.sceneStyle.backgroundColor).toBe('#101820');
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
      screenBackground: '#101820',
      active: '#f5f5f0',
    });
    expect(deriveTabBarColors(darkTheme).background).not.toBe('#101820');
  });

  const customTheme = resolveTheme({
    themeBackgroundColor: '#4b2e83',
    themeAccentColor: '#f2c14e',
    themeTextColor: '#ffffff',
  });
  // Mid-grey with black text exercises the fallback path, where the theme's own muted text
  // would not be readable on the tinted bar.
  const midGreyTheme = resolveTheme({
    themeBackgroundColor: '#808080',
    themeAccentColor: '#f2c14e',
    themeTextColor: '#000000',
  });

  it.each([
    ['default light', resolveTheme({})],
    ['dark', darkTheme],
    ['custom purple', customTheme],
    ['mid-grey fallback', midGreyTheme],
  ])('gives the %s theme a distinct bar with readable tints', (_name, theme) => {
    mockState.theme = theme;
    const options = barOptions(render());
    const bar = options.tabBarStyle.backgroundColor;
    expect(bar).not.toBe(theme.background);
    expect(options.sceneStyle.backgroundColor).toBe(theme.background);
    expect(contrastRatio(options.tabBarActiveTintColor, bar)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(options.tabBarInactiveTintColor, bar)).toBeGreaterThanOrEqual(3);
  });
});
