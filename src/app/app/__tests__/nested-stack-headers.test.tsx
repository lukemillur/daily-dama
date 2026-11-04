import { describe, expect, it, jest } from '@jest/globals';
import { readdirSync } from 'fs';
import { join } from 'path';
import type { ReactElement } from 'react';
import { act, create } from 'react-test-renderer';

import ProfileLayout from '@/app/app/profile/_layout';
import SeshLayout from '@/app/app/sesh/_layout';
import StatsLayout from '@/app/app/stats/_layout';
import TricksLayout from '@/app/app/tricks/_layout';

interface CapturedScreen {
  readonly name: string;
  readonly options: unknown;
}
let mockScreens: CapturedScreen[] = [];

jest.mock('expo-router', () => {
  const Screen = () => null;
  const Stack = ({ children }: { children: ReactElement | ReactElement[] }) => {
    mockScreens = ([] as ReactElement[])
      .concat(children)
      .map((child) => ({
        name: (child.props as { name: string }).name,
        options: (child.props as { options: unknown }).options,
      }));
    return null;
  };
  Stack.Screen = Screen;
  return {
    Stack,
    useNavigation: () => ({ getParent: () => undefined }),
    useRouter: () => ({ replace: jest.fn() }),
  };
});
jest.mock('@/features/profile/state/use-resolved-theme', () => ({
  useResolvedTheme: () => ({ background: '#000000', text: '#ffffff' }),
}));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

const APP_DIR = join(__dirname, '..');

/** Route names relative to a section, as `Stack.Screen name` expects, excluding layouts and tests. */
function routeNames(section: string, dir = join(APP_DIR, section), prefix = ''): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === '__tests__' || entry.name.startsWith('_layout')) return [];
    if (entry.isDirectory()) return routeNames(section, join(dir, entry.name), `${prefix}${entry.name}/`);
    return [`${prefix}${entry.name.replace(/\.tsx?$/, '')}`];
  });
}

const CASES = [
  { section: 'tricks', Layout: TricksLayout },
  { section: 'profile', Layout: ProfileLayout },
  { section: 'sesh', Layout: SeshLayout },
  { section: 'stats', Layout: StatsLayout },
] as const;

function optionsFor(screen: CapturedScreen) {
  const options = screen.options;
  return typeof options === 'function'
    ? (options as (arg: { navigation: { getState: () => { routes: unknown[] } } }) => Record<string, unknown>)({
        navigation: { getState: () => ({ routes: [{}, {}] }) },
      })
    : (options as Record<string, unknown>);
}

describe('nested native stack headers', () => {
  it.each(CASES)('$section registers a titled header for every nested route file', ({ section, Layout }) => {
    act(() => {
      create(<Layout />);
    });

    const registered = mockScreens.map((screen) => screen.name).sort();
    expect(registered).toEqual(routeNames(section).sort());

    for (const screen of mockScreens) {
      const options = optionsFor(screen);
      if (screen.name === 'index') {
        expect(options).toEqual({ headerShown: false });
      } else {
        expect(typeof options.title).toBe('string');
        expect((options.title as string).length).toBeGreaterThan(0);
      }
    }
  });

  it('supplies a fallback back control only when the stack holds a single entry', () => {
    act(() => {
      create(<TricksLayout />);
    });
    const laced = mockScreens.find((screen) => screen.name === 'laced')!;
    const optionsFn = laced.options as (arg: { navigation: { getState: () => { routes: unknown[] } } }) => {
      headerLeft?: unknown;
    };

    expect(optionsFor(laced).headerLeft).toBeUndefined();
    expect(optionsFn({ navigation: { getState: () => ({ routes: [{}] }) } }).headerLeft).toBeDefined();
  });
});
