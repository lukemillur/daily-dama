import { forwardRef, useContext, useState, type ComponentProps, type ReactNode } from 'react';
import { TextInput, View } from 'react-native';
import { styled, ThemeContext } from 'styled-components/native';

import { AppColors, Radii, Spacing, hexToRgba } from '@/constants/theme';

type NativeTextInputProps = ComponentProps<typeof TextInput>;

export interface TextFieldProps extends NativeTextInputProps {
  readonly label: string;
  readonly error?: string;
  readonly hint?: ReactNode;
  readonly rightAccessory?: ReactNode;
}

const SHADOW_OFFSET_PX = 3;
const SHADOW_ALPHA = 0.35;

function resolveHex(color: string | undefined): string {
  return color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : AppColors.ink;
}

function inputShadow(focusAwareColor: string | undefined): string {
  return `${SHADOW_OFFSET_PX}px ${SHADOW_OFFSET_PX}px 0 ${resolveHex(focusAwareColor)}`;
}

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  {
    accessibilityLabel,
    autoComplete,
    error,
    hint,
    inputMode,
    keyboardType,
    label,
    onBlur,
    onFocus,
    rightAccessory,
    ...props
  },
  ref,
) {
  const [isFocused, setIsFocused] = useState(false);
  const theme = useContext(ThemeContext);
  // Chrome applies an autofill/one-time-code heuristic to short numeric inputs that have
  // no explicit `autoComplete`, replacing the themed input background and hiding the text
  // cursor. Opt numeric fields out unless a caller supplies its own `autoComplete` value.
  const isNumericInput =
    inputMode === 'numeric' ||
    inputMode === 'decimal' ||
    keyboardType === 'number-pad' ||
    keyboardType === 'numeric' ||
    keyboardType === 'decimal-pad';
  const resolvedAutoComplete = autoComplete ?? (isNumericInput ? 'off' : undefined);

  const handleFocus: NonNullable<NativeTextInputProps['onFocus']> = (event) => {
    setIsFocused(true);
    onFocus?.(event);
  };

  const handleBlur: NonNullable<NativeTextInputProps['onBlur']> = (event) => {
    setIsFocused(false);
    onBlur?.(event);
  };

  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      {hint ? <FieldHint>{hint}</FieldHint> : null}
      <InputRow style={{ boxShadow: inputShadow(isFocused ? theme?.accent : theme?.text) }}>
        <Input
          ref={ref}
          accessibilityLabel={accessibilityLabel ?? label}
          autoComplete={resolvedAutoComplete}
          inputMode={inputMode}
          keyboardType={keyboardType}
          $hasAccessory={rightAccessory !== undefined}
          onBlur={handleBlur}
          onFocus={handleFocus}
          {...props}
        />
        {rightAccessory}
      </InputRow>
      {error ? <ErrorText>{error}</ErrorText> : null}
    </Field>
  );
});

const Field = styled.View`
  margin-top: ${Spacing.four}px;
`;
const FieldLabel = styled.Text`
  color: ${({ theme }) => theme.text};
  font-size: 13px;
  font-weight: 900;
  letter-spacing: 1px;
  text-transform: uppercase;
`;
const FieldHint = styled.Text`
  color: ${AppColors.textSubtle};
  font-size: 12px;
  font-weight: 700;
  margin-top: 4px;
`;
// The drop shadow is passed as an explicit `style` prop at the JSX call site rather than
// declared here in the styled-components template: styled-components/native silently drops
// `.attrs({ style })`, and the CSS `box-shadow` shorthand lowers to react-native-web's
// deprecated `shadow*` props (see `landing-cta.tsx`'s `CtaPanel` for the same tradeoff). The
// shadow color is read via `useContext(ThemeContext)` instead of `useTheme()` because
// `useTheme()` throws when a caller mounts this field without a `ThemeProvider`.
const InputRow = styled(View)`
  min-height: 56px;
  flex-direction: row;
  align-items: center;
  background-color: ${({ theme }) => theme.background};
  border: 3px solid ${({ theme }) => hexToRgba(resolveHex(theme.text), SHADOW_ALPHA)};
  border-radius: ${Radii.control}px;
  margin-top: 8px;
`;
const Input = styled(TextInput).attrs<{ readonly $hasAccessory: boolean }>(({ theme }) => ({
  placeholderTextColor: theme.textMuted,
}))<{ readonly $hasAccessory: boolean }>`
  flex: 1;
  min-width: 0;
  color: ${({ theme }) => theme.text};
  font-size: 18px;
  font-weight: 800;
  padding: ${({ $hasAccessory }) => ($hasAccessory ? '12px 0 12px 14px' : '12px 14px')};
  outline-style: none;
`;
const ErrorText = styled.Text`
  color: ${AppColors.red};
  font-size: 12px;
  font-weight: 800;
  margin-top: 7px;
`;
