import { forwardRef, useContext, useState, type ComponentProps, type ReactNode } from 'react';
import { Pressable, TextInput } from 'react-native';
import { styled, ThemeContext } from 'styled-components/native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { AppColors } from '@/constants/theme';
import { usePasswordVisibilityContext } from '@/features/auth/components/password-visibility-context';

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

interface EyeIconProps {
  readonly isVisible: boolean;
  readonly color: string;
}

function EyeIcon({ isVisible, color }: EyeIconProps) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M1.5 12S5.5 5 12 5s10.5 7 10.5 7-4 7-10.5 7-10.5-7-10.5-7Z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx="12" cy="12" r="3" stroke={color} strokeWidth={2} />
      {!isVisible ? (
        <Line x1="2.5" y1="21.5" x2="21.5" y2="2.5" stroke={color} strokeWidth={2} strokeLinecap="round" />
      ) : null}
    </Svg>
  );
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
  const sharedVisibility = usePasswordVisibilityContext();
  const [localIsVisible, setLocalIsVisible] = useState(false);
  // useContext (not the useTheme hook) so an unthemed render -- e.g. a screen or test that
  // doesn't wrap in a styled-components ThemeProvider -- falls back rather than throwing.
  const theme = useContext(ThemeContext);
  const iconColor = theme?.text ?? AppColors.ink;

  const isVisible = sharedVisibility ? sharedVisibility.isVisible : localIsVisible;
  const toggleVisibility = sharedVisibility
    ? sharedVisibility.toggle
    : () => setLocalIsVisible((visible) => !visible);

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
        <VisibilityToggle accessibilityLabel={toggleLabel} accessibilityRole="button" onPress={toggleVisibility}>
          <EyeIcon color={iconColor} isVisible={isVisible} />
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
const ErrorText = styled.Text`
  color: ${AppColors.red};
  font-size: 12px;
  font-weight: 800;
  margin-top: 7px;
`;
