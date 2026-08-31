import { forwardRef, useState, type ComponentProps, type ReactNode } from 'react';
import { Pressable, TextInput } from 'react-native';
import { styled } from 'styled-components/native';

import { AppColors } from '@/constants/theme';

type NativeTextInputProps = ComponentProps<typeof TextInput>;

export interface PasswordInputProps {
  readonly label: string;
  readonly value: string;
  readonly onChangeText: (value: string) => void;
  readonly error?: string;
  readonly hint?: ReactNode;
  readonly textContentType?: NativeTextInputProps['textContentType'];
  readonly returnKeyType?: NativeTextInputProps['returnKeyType'];
  readonly blurOnSubmit?: NativeTextInputProps['blurOnSubmit'];
  readonly onSubmitEditing?: NativeTextInputProps['onSubmitEditing'];
}

export const PasswordInput = forwardRef<TextInput, PasswordInputProps>(function PasswordInput(
  {
    label,
    value,
    onChangeText,
    error,
    hint,
    textContentType = 'password',
    returnKeyType,
    blurOnSubmit,
    onSubmitEditing,
  },
  ref,
) {
  const [isVisible, setIsVisible] = useState(false);
  const toggleLabel = `${isVisible ? 'Hide' : 'Show'} ${label}`;

  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      {hint ? <FieldHint>{hint}</FieldHint> : null}
      <InputRow>
        <Input
          ref={ref}
          accessibilityLabel={label}
          autoCapitalize="none"
          autoCorrect={false}
          blurOnSubmit={blurOnSubmit}
          onChangeText={onChangeText}
          onSubmitEditing={onSubmitEditing}
          placeholder={label}
          placeholderTextColor={AppColors.textSubtle}
          returnKeyType={returnKeyType}
          secureTextEntry={!isVisible}
          textContentType={textContentType}
          value={value}
        />
        <VisibilityToggle
          accessibilityLabel={toggleLabel}
          accessibilityRole="button"
          onPress={() => setIsVisible((visible) => !visible)}>
          <ToggleText>{isVisible ? 'Hide' : 'Show'}</ToggleText>
        </VisibilityToggle>
      </InputRow>
      {error ? <ErrorText>{error}</ErrorText> : null}
    </Field>
  );
});

const Field = styled.View`
  margin-top: 28px;
`;
const FieldLabel = styled.Text`
  color: ${({ theme }) => theme.text};
  font-size: 13px;
  font-weight: 900;
  letter-spacing: 1px;
  text-transform: uppercase;
`;
const InputRow = styled.View`
  min-height: 56px;
  flex-direction: row;
  align-items: center;
  background-color: ${({ theme }) => theme.background};
  border: 2px solid ${({ theme }) => theme.text};
  margin-top: 8px;
`;
const FieldHint = styled.Text`
  color: ${AppColors.textSubtle};
  font-size: 12px;
  font-weight: 700;
  margin-top: 4px;
`;
const Input = styled(TextInput)`
  flex: 1;
  color: ${({ theme }) => theme.text};
  font-size: 18px;
  font-weight: 800;
  padding: 12px 0 12px 14px;
`;
const VisibilityToggle = styled(Pressable)`
  align-self: stretch;
  align-items: center;
  justify-content: center;
  padding: 12px 14px;
`;
const ToggleText = styled.Text`
  color: ${({ theme }) => theme.text};
  font-size: 13px;
  font-weight: 900;
  text-transform: uppercase;
`;
const ErrorText = styled.Text`
  color: ${AppColors.red};
  font-size: 12px;
  font-weight: 800;
  margin-top: 7px;
`;
