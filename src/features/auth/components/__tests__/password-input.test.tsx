import { describe, expect, it, jest } from '@jest/globals';
import { act, create } from 'react-test-renderer';
import { ThemeProvider as StyledThemeProvider, type DefaultTheme } from 'styled-components/native';

import { PasswordInput } from '@/features/auth/components/password-input';

const customTheme: DefaultTheme = {
  background: '#123456',
  accent: '#abcdef',
  text: '#fedcba',
  textMuted: '#997755',
  buttonBackground: '#111111',
  buttonBackgroundSecondary: '#222222',
};

function resolvedStyle(nodes: ReturnType<ReturnType<typeof create>['root']['findAll']>) {
  const node = nodes.find(
    (candidate) =>
      typeof candidate.props.style === 'object' &&
      candidate.props.style !== null &&
      !Array.isArray(candidate.props.style),
  );
  return node?.props.style as Record<string, string | number> | undefined;
}

describe('PasswordInput', () => {
  it('reveals and hides its value when the visibility toggle is pressed', async () => {
    const onChangeText = jest.fn();
    let root!: ReturnType<typeof create>;

    await act(async () => {
      root = create(<PasswordInput label="Password" value="secret-value" onChangeText={onChangeText} />);
    });

    const input = () => root.root.find((node) => node.props.accessibilityLabel === 'Password');
    expect(input().props.value).toBe('secret-value');
    expect(input().props.secureTextEntry).toBe(true);

    await act(async () => {
      root.root.find((node) => node.props.accessibilityLabel === 'Show Password').props.onPress();
    });

    expect(input().props.secureTextEntry).toBe(false);
    expect(root.root.find((node) => node.props.accessibilityLabel === 'Hide Password')).toBeTruthy();

    await act(async () => {
      root.root.find((node) => node.props.accessibilityLabel === 'Hide Password').props.onPress();
    });

    expect(input().props.secureTextEntry).toBe(true);
  });

  it('resolves the input row background/border and field/toggle text colors from the active theme', async () => {
    const onChangeText = jest.fn();
    let root!: ReturnType<typeof create>;

    await act(async () => {
      root = create(
        <StyledThemeProvider theme={customTheme}>
          <PasswordInput label="Password" value="secret-value" onChangeText={onChangeText} />
        </StyledThemeProvider>,
      );
    });

    const inputStyle = resolvedStyle(
      root.root.findAll((node) => node.props.accessibilityLabel === 'Password'),
    );
    expect(inputStyle).toMatchObject({ color: customTheme.text });

    const rowStyle = resolvedStyle(
      root.root.findAll((node) => node.props.style?.minHeight === 56),
    );
    expect(rowStyle).toMatchObject({
      backgroundColor: customTheme.background,
      borderColor: customTheme.text,
    });

    const toggleStyle = resolvedStyle(
      root.root.findAll((node) => node.props.children === 'Show'),
    );
    expect(toggleStyle?.color).toBe(customTheme.text);
  });
});
