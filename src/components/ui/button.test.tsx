import { describe, expect, it } from '@jest/globals';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { ThemeProvider as StyledThemeProvider, type DefaultTheme } from 'styled-components/native';

import { Button } from '@/components/ui/button';

// Custom theme distinct from the fixed AppColors palette, so a test failure that falls back to
// the hardcoded ink/paperStrong constants is distinguishable from a pass on this theme's tokens.
const customTheme: DefaultTheme = {
  background: '#123456',
  accent: '#abcdef',
  text: '#fedcba',
  buttonBackground: '#111111',
  buttonBackgroundSecondary: '#222222',
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
});
