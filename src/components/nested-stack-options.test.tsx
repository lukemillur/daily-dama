import { describe, expect, it, jest } from '@jest/globals';
import { act, create } from 'react-test-renderer';

import {
  deriveNestedHeaderColors,
  deriveNestedScreenOptions,
  deriveNestedStackScreenOptions,
  deriveTricksIndexScreenOptions,
} from './nested-stack-options';
import type { ResolvedTheme } from '@/features/profile/state/use-resolved-theme';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/features/profile/state/use-resolved-theme', () => ({ useResolvedTheme: jest.fn() }));

const darkTheme: ResolvedTheme = {
  background: '#101820',
  accent: '#ff8800',
  text: '#f5f0e0',
  textMuted: '#aaaaaa',
  buttonBackground: '#ff8800',
  buttonBackgroundSecondary: '#223344',
  onButton: '#000000',
  onButtonSecondary: '#ffffff',
  onInk: '#ffffff',
};
const lightTheme: ResolvedTheme = { ...darkTheme, background: '#fff8e8', text: '#1a1a1a' };

describe('nested stack options', () => {
  it('derives header colors from the saved theme', () => {
    expect(deriveNestedHeaderColors(darkTheme)).toMatchObject({ background: '#101820', tint: '#f5f0e0' });
    expect(deriveNestedHeaderColors(lightTheme)).toMatchObject({ background: '#fff8e8', tint: '#1a1a1a' });
  });

  it('shows a themed header on native', () => {
    for (const os of ['ios', 'android']) {
      const options = deriveNestedStackScreenOptions(darkTheme, os);
      expect(options.headerShown).toBe(true);
      expect(options.headerTintColor).toBe('#f5f0e0');
      expect(options.headerStyle).toEqual({ backgroundColor: '#101820' });
    }
  });

  // AppStatusBar is the only status-bar owner: any screen-level statusBarStyle would make
  // react-native-screens re-apply its own style on every transition and override it.
  it('never sets a screen-level statusBarStyle', () => {
    for (const os of ['ios', 'android', 'web']) {
      expect(deriveNestedStackScreenOptions(darkTheme, os)).not.toHaveProperty('statusBarStyle');
      expect(deriveTricksIndexScreenOptions(darkTheme, os)).not.toHaveProperty('statusBarStyle');
    }
  });

  it('shows no header on web', () => {
    expect(deriveNestedStackScreenOptions(darkTheme, 'web')).toEqual({ headerShown: false });
  });

  it('adds a fallback back control only when the stack has no history', () => {
    const parent = { href: '/app/tricks', label: 'Tricks' } as const;
    expect(deriveNestedScreenOptions(true, parent, '#fff')).toEqual({});

    const options = deriveNestedScreenOptions(false, parent, '#fff');
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<>{options.headerLeft!({ canGoBack: false })}</>);
    });
    const button = tree.root.findByProps({ accessibilityLabel: 'Back to Tricks' });
    button.props.onPress();
    expect(mockReplace).toHaveBeenCalledWith('/app/tricks');
  });
});
