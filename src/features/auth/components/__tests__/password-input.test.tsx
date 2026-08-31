import { describe, expect, it, jest } from '@jest/globals';
import { View } from 'react-native';
import { act, create } from 'react-test-renderer';
import { ThemeProvider as StyledThemeProvider, type DefaultTheme } from 'styled-components/native';

import { PasswordInput } from '@/features/auth/components/password-input';
import { PasswordVisibilityProvider } from '@/features/auth/components/password-visibility-context';

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

  it('renders the toggle as an icon with an accessible label, not "Show"/"Hide" text', async () => {
    const onChangeText = jest.fn();
    let root!: ReturnType<typeof create>;

    await act(async () => {
      root = create(<PasswordInput label="Password" value="secret-value" onChangeText={onChangeText} />);
    });

    const toggle = root.root.find((node) => node.props.accessibilityLabel === 'Show Password');
    expect(toggle.props.accessibilityRole).toBe('button');
    expect(root.root.findAll((node) => node.props.children === 'Show')).toHaveLength(0);
    expect(root.root.findAll((node) => node.props.children === 'Hide')).toHaveLength(0);
  });

  it("updates a sibling PasswordInput's visibility when both share a PasswordVisibilityProvider", async () => {
    const onChangeText = jest.fn();
    let root!: ReturnType<typeof create>;

    await act(async () => {
      root = create(
        <PasswordVisibilityProvider>
          <PasswordInput label="Password" value="secret-value" onChangeText={onChangeText} />
          <PasswordInput label="Confirm password" value="secret-value" onChangeText={onChangeText} />
        </PasswordVisibilityProvider>,
      );
    });

    const passwordField = () => root.root.find((node) => node.props.accessibilityLabel === 'Password');
    const confirmField = () =>
      root.root.find((node) => node.props.accessibilityLabel === 'Confirm password');

    expect(passwordField().props.secureTextEntry).toBe(true);
    expect(confirmField().props.secureTextEntry).toBe(true);

    await act(async () => {
      root.root.find((node) => node.props.accessibilityLabel === 'Show Password').props.onPress();
    });

    expect(passwordField().props.secureTextEntry).toBe(false);
    expect(confirmField().props.secureTextEntry).toBe(false);
    expect(root.root.find((node) => node.props.accessibilityLabel === 'Hide Password')).toBeTruthy();
    expect(root.root.find((node) => node.props.accessibilityLabel === 'Hide Confirm password')).toBeTruthy();
  });

  it('does not share visibility between two PasswordInput instances outside a shared provider', async () => {
    const onChangeText = jest.fn();
    let root!: ReturnType<typeof create>;

    await act(async () => {
      root = create(
        <View>
          <PasswordInput label="Password" value="secret-value" onChangeText={onChangeText} />
          <PasswordInput label="Confirm password" value="secret-value" onChangeText={onChangeText} />
        </View>,
      );
    });

    await act(async () => {
      root.root.find((node) => node.props.accessibilityLabel === 'Show Password').props.onPress();
    });

    expect(
      root.root.find((node) => node.props.accessibilityLabel === 'Password').props.secureTextEntry,
    ).toBe(false);
    expect(
      root.root.find((node) => node.props.accessibilityLabel === 'Confirm password').props.secureTextEntry,
    ).toBe(true);
  });

  it('resolves the input row background/border and field text colors from the active theme', async () => {
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
  });

  it("resolves the toggle icon's color from the active theme", async () => {
    const onChangeText = jest.fn();
    let root!: ReturnType<typeof create>;

    await act(async () => {
      root = create(
        <StyledThemeProvider theme={customTheme}>
          <PasswordInput label="Password" value="secret-value" onChangeText={onChangeText} />
        </StyledThemeProvider>,
      );
    });

    const strokedNodes = root.root.findAll(
      (node) => typeof node.props.stroke === 'string' && node.props.stroke === customTheme.text,
    );
    expect(strokedNodes.length).toBeGreaterThan(0);
  });
});
