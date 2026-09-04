import { describe, expect, it } from '@jest/globals';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { ThemeProvider as StyledThemeProvider, type DefaultTheme } from 'styled-components/native';

import { TextField } from '@/components/ui/text-field';

const customTheme: DefaultTheme = {
  background: '#123456',
  accent: '#abcdef',
  text: '#fedcba',
  textMuted: '#997755',
  buttonBackground: '#111111',
  buttonBackgroundSecondary: '#222222',
};

function resolvedRowStyle(renderer: ReactTestRenderer) {
  const matches = renderer.root.findAll((node) => node.props.style?.minHeight === 56);
  const withPlainStyle = matches.find(
    (node) =>
      typeof node.props.style === 'object' &&
      node.props.style !== null &&
      !Array.isArray(node.props.style) &&
      typeof node.props.style.backgroundColor === 'string',
  );
  return withPlainStyle?.props.style as Record<string, string | number> | undefined;
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
      borderColor: customTheme.text,
    });

    const inputStyle = resolvedInputStyle(root, 'Email');
    expect(inputStyle).toMatchObject({ color: customTheme.text });

    expect(
      root.root
        .findAll((node) => node.props.accessibilityLabel === 'Email')
        .find((node) => typeof node.props.placeholderTextColor === 'string')?.props.placeholderTextColor,
    ).toBe(customTheme.textMuted);
  });

  it('switches the row border to the accent color while focused, then reverts on blur', async () => {
    const root = await mountField();
    const input = root.root
      .findAll((node) => node.props.accessibilityLabel === 'Email')
      .find((node) => typeof node.props.onFocus === 'function');

    await act(async () => {
      input?.props.onFocus?.({});
    });
    expect(resolvedRowStyle(root)?.borderColor).toBe(customTheme.accent);

    await act(async () => {
      input?.props.onBlur?.({});
    });
    expect(resolvedRowStyle(root)?.borderColor).toBe(customTheme.text);
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
