import { describe, expect, it, jest } from '@jest/globals';
// Hoisted above imports; use-resolved-theme transitively imports AsyncStorage.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { ThemeProvider as StyledThemeProvider, type DefaultTheme } from 'styled-components/native';

import { Button } from '@/components/ui/button';
import { resolveTheme } from '@/features/profile/state/use-resolved-theme';
import { contrastRatio } from '@/shared/color/contrast';

// Custom theme distinct from the fixed AppColors palette, so a test failure that falls back to
// the hardcoded ink/paperStrong constants is distinguishable from a pass on this theme's tokens.
const customTheme: DefaultTheme = {
  background: '#123456',
  accent: '#abcdef',
  text: '#fedcba',
  textMuted: '#997755',
  buttonBackground: '#111111',
  buttonBackgroundSecondary: '#222222',
  onButton: '#ffffff',
  onButtonSecondary: '#ffffff',
  onInk: '#ffffff',
};

// styled-components/native flattens ButtonRoot's template into a resolved RN style object on the
// innermost host View node -- the styled Pressable's outer wrappers keep an unresolved
// styled-components inlineStyle descriptor instead of a plain object.
function resolvedButtonRootStyle(renderer: ReactTestRenderer, label: string) {
  const matches = renderer.root.findAll((node) => node.props.accessibilityLabel === label);
  const withPlainStyle = matches.find(
    (node) =>
      typeof node.props.style === 'object' &&
      node.props.style !== null &&
      !Array.isArray(node.props.style) &&
      typeof node.props.style.backgroundColor === 'string',
  );
  return withPlainStyle?.props.style;
}

async function mountButton(variant: 'primary' | 'secondary') {
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(
      <StyledThemeProvider theme={customTheme}>
        <Button accessibilityLabel={`${variant}-button`} variant={variant}>
          <Text>Go</Text>
        </Button>
      </StyledThemeProvider>,
    );
  });
  return root;
}

describe('Button', () => {
  it('resolves the primary variant background from theme.buttonBackground', async () => {
    const root = await mountButton('primary');
    const style = resolvedButtonRootStyle(root, 'primary-button');
    expect(style?.backgroundColor).toBe(customTheme.buttonBackground);
  });

  it('resolves the secondary variant background from theme.buttonBackgroundSecondary', async () => {
    const root = await mountButton('secondary');
    const style = resolvedButtonRootStyle(root, 'secondary-button');
    expect(style?.backgroundColor).toBe(customTheme.buttonBackgroundSecondary);
  });

  it('colors the primary label with theme.onButton, which reaches 4.5:1 on the blue theme', async () => {
    const blue = resolveTheme({ themeBackgroundColor: '#d8e8f7', themeAccentColor: '#1f6fb2' });
    let root!: ReactTestRenderer;
    await act(async () => {
      root = create(
        <StyledThemeProvider theme={blue}>
          <Button accessibilityLabel="blue-button" variant="primary">
            Go
          </Button>
        </StyledThemeProvider>,
      );
    });
    const style = resolvedButtonRootStyle(root, 'blue-button');
    expect(style?.backgroundColor).toBe(blue.buttonBackground);
    const label = root.root.findAll(
      (node) => typeof node.props.style === 'object' && node.props.style?.fontWeight === '900',
    )[0];
    expect(label?.props.style.color).toBe(blue.onButton);
    expect(contrastRatio(blue.onButton, blue.buttonBackground)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(blue.accent, blue.buttonBackground) ?? 0).toBeLessThan(4.5);
  });
});
