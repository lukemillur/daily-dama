import { describe, expect, it } from '@jest/globals';
import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import { ThemeProvider as StyledThemeProvider, type DefaultTheme } from 'styled-components/native';

import { BodyText, DISPLAY_MAX_FONT_SIZE_MULTIPLIER, DisplayTitle, Eyebrow } from '@/components/ui/typography';

// Custom theme distinct from the fixed AppColors palette, so a test failure that falls back to a
// hardcoded constant is distinguishable from a pass on this theme's tokens.
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
  onAccent: '#000000',
  onAccentMuted: '#222222',
};

async function mountTypography() {
  let root!: ReturnType<typeof create>;
  await act(async () => {
    root = create(
      <StyledThemeProvider theme={customTheme}>
        <Eyebrow accessibilityLabel="eyebrow">Eyebrow</Eyebrow>
        <DisplayTitle accessibilityLabel="display-title">Title</DisplayTitle>
        <BodyText accessibilityLabel="body-text">Body</BodyText>
      </StyledThemeProvider>,
    );
  });
  return root;
}

function resolvedTextStyle(root: ReturnType<typeof create>, label: string) {
  const matches = root.root.findAll(
    (node) => node.type === Text && node.props.accessibilityLabel === label,
  );
  const withPlainStyle = matches.find(
    (node) =>
      typeof node.props.style === 'object' &&
      node.props.style !== null &&
      !Array.isArray(node.props.style) &&
      typeof node.props.style.color === 'string',
  );
  return withPlainStyle?.props.style as { color?: string } | undefined;
}

describe('typography', () => {
  it('resolves Eyebrow color from theme.textMuted', async () => {
    const root = await mountTypography();
    const style = resolvedTextStyle(root, 'eyebrow');
    expect(style?.color).toBe(customTheme.textMuted);
  });

  it('resolves DisplayTitle color from theme.text', async () => {
    const root = await mountTypography();
    const style = resolvedTextStyle(root, 'display-title');
    expect(style?.color).toBe(customTheme.text);
  });

  it('resolves BodyText color from theme.textMuted', async () => {
    const root = await mountTypography();
    const style = resolvedTextStyle(root, 'body-text');
    expect(style?.color).toBe(customTheme.textMuted);
  });

  it('caps font scaling on DisplayTitle but not on body or eyebrow text', async () => {
    const root = await mountTypography();
    const multiplier = (label: string) =>
      root.root.findAll((n) => n.type === Text && n.props.accessibilityLabel === label)[0]?.props
        .maxFontSizeMultiplier;
    expect(multiplier('display-title')).toBe(DISPLAY_MAX_FONT_SIZE_MULTIPLIER);
    expect(multiplier('body-text')).toBeUndefined();
    expect(multiplier('eyebrow')).toBeUndefined();
  });
});
