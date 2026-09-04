import { forwardRef, useState, type ComponentProps, type ReactNode } from 'react';
import { TextInput, View } from 'react-native';
import { styled } from 'styled-components/native';

import { AppColors, Radii, Spacing } from '@/constants/theme';

type NativeTextInputProps = ComponentProps<typeof TextInput>;

export interface TextFieldProps extends NativeTextInputProps {
  readonly label: string;
  readonly error?: string;
  readonly hint?: ReactNode;
  readonly rightAccessory?: ReactNode;
}

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { accessibilityLabel, error, hint, label, onBlur, onFocus, rightAccessory, ...props },
  ref,
) {
  const [isFocused, setIsFocused] = useState(false);

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
      <InputRow $isFocused={isFocused}>
        <Input
          ref={ref}
          accessibilityLabel={accessibilityLabel ?? label}
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
const InputRow = styled(View)<{ readonly $isFocused: boolean }>`
  min-height: 56px;
  flex-direction: row;
  align-items: center;
  background-color: ${({ theme }) => theme.background};
  border: 2px solid ${({ $isFocused, theme }) => ($isFocused ? theme.accent : theme.text)};
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
