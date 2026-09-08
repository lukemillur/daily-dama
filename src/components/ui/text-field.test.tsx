import { describe, expect, it } from '@jest/globals';
import { StyleSheet, Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { ThemeProvider as StyledThemeProvider, type DefaultTheme } from 'styled-components/native';

import { TextField } from '@/components/ui/text-field';
import { hexToRgba } from '@/constants/theme';

const customTheme: DefaultTheme = {
  background: '#123456',
  accent: '#abcdef',
  text: '#fedcba',
  textMuted: '#997755',
  buttonBackground: '#111111',
  buttonBackgroundSecondary: '#222222',
};

function flattenStyle(style: unknown) {
  return StyleSheet.flatten(style as never) as Record<string, string | number> | undefined;
}

function resolvedRowStyle(renderer: ReactTestRenderer) {
  const matches = renderer.root.findAll((node) => flattenStyle(node.props.style)?.minHeight === 56);
  const withResolvedStyle = matches.find(
    (node) => typeof flattenStyle(node.props.style)?.backgroundColor === 'string',
  );
  return flattenStyle(withResolvedStyle?.props.style);
}
function resolvedInputStyle(renderer: ReactTestRenderer, label: string) {
  const matches = renderer.root.findAll((node) => node.props.accessibilityLabel === label);
  const withPlainStyle = matches.find(
    (node) =>
      typeof node.props.style === 'object' &&
      node.props.style !== null &&
      !Array.isArray(node.props.style),
  );
  return withPlainStyle?.props.style as Record<string, string | number> | undefined;
}

async function mountField(props: Record<string, unknown> = {}) {
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(
      <StyledThemeProvider theme={customTheme}>
        <TextField label="Email" onChangeText={() => {}} value="" {...props} />
      </StyledThemeProvider>,
    );
  });
  return root;
}
describe('TextField', () => {
  it('renders the label, hint, and error text', async () => {
    const root = await mountField({ error: 'Enter a valid email.', hint: 'We will never share this.' });

    expect(root.root.findAll((node) => node.props.children === 'Email').length).toBeGreaterThan(0);
    expect(
      root.root.findAll((node) => node.props.children === 'We will never share this.').length,
    ).toBeGreaterThan(0);
    expect(
      root.root.findAll((node) => node.props.children === 'Enter a valid email.').length,
    ).toBeGreaterThan(0);
  });

  it('omits error text when the error prop is not provided', async () => {
    const root = await mountField();

    expect(root.root.findAll((node) => node.props.children === 'Enter a valid email.').length).toBe(0);
  });

  it('resolves the row background/border and input text/placeholder colors from the active theme', async () => {
    const root = await mountField();

    const rowStyle = resolvedRowStyle(root);
    expect(rowStyle).toMatchObject({
      backgroundColor: customTheme.background,
      borderColor: hexToRgba(customTheme.text, 0.35),
    });

    const inputStyle = resolvedInputStyle(root, 'Email');
    expect(inputStyle).toMatchObject({ color: customTheme.text });

    expect(
      root.root
        .findAll((node) => node.props.accessibilityLabel === 'Email')
        .find((node) => typeof node.props.placeholderTextColor === 'string')?.props.placeholderTextColor,
    ).toBe(customTheme.textMuted);
  });

  it('renders a drop shadow and a thicker border on the input row', async () => {
    const root = await mountField();

    const rowStyle = resolvedRowStyle(root);
    expect(rowStyle?.borderWidth).toBe(3);
    expect(typeof rowStyle?.boxShadow).toBe('string');
  });

  it('switches the row drop shadow to the accent color while focused, then reverts on blur', async () => {
    const root = await mountField();
    const input = root.root
      .findAll((node) => node.props.accessibilityLabel === 'Email')
      .find((node) => typeof node.props.onFocus === 'function');

    const unfocusedShadow = resolvedRowStyle(root)?.boxShadow;
    expect(unfocusedShadow).toEqual(expect.stringContaining(customTheme.text));

    await act(async () => {
      input?.props.onFocus?.({});
    });
    expect(resolvedRowStyle(root)?.boxShadow).toEqual(expect.stringContaining(customTheme.accent));

    await act(async () => {
      input?.props.onBlur?.({});
    });
    expect(resolvedRowStyle(root)?.boxShadow).toBe(unfocusedShadow);

    expect(resolvedRowStyle(root)?.borderColor).toBe(hexToRgba(customTheme.text, 0.35));
  });

  it('forwards a ref to the underlying host text input', async () => {
    const ref = { current: null } as { current: unknown };
    await act(async () => {
      create(
        <StyledThemeProvider theme={customTheme}>
          <TextField ref={ref as never} label="Email" onChangeText={() => {}} value="" />
        </StyledThemeProvider>,
      );
    });

    expect(ref.current).not.toBeNull();
  });

  it('renders a rightAccessory inside the row when provided, and omits it otherwise', async () => {
    const withAccessory = await mountField({ rightAccessory: <Text>Toggle</Text> });
    expect(withAccessory.root.findAll((node) => node.props.children === 'Toggle').length).toBeGreaterThan(0);

    const withoutAccessory = await mountField();
    expect(withoutAccessory.root.findAll((node) => node.props.children === 'Toggle').length).toBe(0);
  });

  it('passes arbitrary native TextInput props through untouched', async () => {
    const root = await mountField({ keyboardType: 'email-address', accessibilityLabel: 'Custom label' });

    const input = root.root
      .findAll((node) => node.props.accessibilityLabel === 'Custom label')
      .find((node) => typeof node.props.keyboardType === 'string');
    expect(input?.props.keyboardType).toBe('email-address');
  });
});
