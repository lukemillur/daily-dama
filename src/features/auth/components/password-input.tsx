import { forwardRef, useContext, useState, type ComponentProps, type ReactNode } from 'react';
import { Pressable, TextInput } from 'react-native';
import { styled, ThemeContext } from 'styled-components/native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { AppColors } from '@/constants/theme';
import { TextField } from '@/components/ui/text-field';
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
    <TextField
      ref={ref}
      autoCapitalize="none"
      autoCorrect={false}
      blurOnSubmit={blurOnSubmit}
      error={error}
      hint={hint}
      label={label}
      onChangeText={onChangeText}
      onSubmitEditing={onSubmitEditing}
      placeholder={label}
      returnKeyType={returnKeyType}
      rightAccessory={
        <VisibilityToggle accessibilityLabel={toggleLabel} accessibilityRole="button" onPress={toggleVisibility}>
          <EyeIcon color={iconColor} isVisible={isVisible} />
        </VisibilityToggle>
      }
      secureTextEntry={!isVisible}
      textContentType={textContentType}
      value={value}
    />
  );
});

const VisibilityToggle = styled(Pressable)`
  align-self: stretch;
  align-items: center;
  justify-content: center;
  padding: 12px 14px;
`;
