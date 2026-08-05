import { forwardRef, type ComponentProps, type ReactNode } from 'react';
import { Pressable, type View } from 'react-native';
import { styled } from 'styled-components/native';

import { AppColors, Radii } from '@/constants/theme';

type NativePressableProps = ComponentProps<typeof Pressable>;

export interface ButtonProps extends NativePressableProps {
  readonly children: ReactNode;
  readonly variant?: 'primary' | 'secondary';
  readonly size?: 'medium' | 'large';
  readonly fill?: boolean;
}

export const Button = forwardRef<View, ButtonProps>(function Button(
  { accessibilityRole = 'button', children, fill = false, size = 'large', variant = 'primary', ...props },
  ref,
) {
  return (
    <ButtonRoot
      ref={ref}
      accessibilityRole={accessibilityRole}
      $fill={fill}
      $size={size}
      $variant={variant}
      {...props}>
      <ButtonLabel $size={size} $variant={variant}>
        {children}
      </ButtonLabel>
    </ButtonRoot>
  );
});

const ButtonRoot = styled(Pressable)<{
  readonly $fill: boolean;
  readonly $size: NonNullable<ButtonProps['size']>;
  readonly $variant: NonNullable<ButtonProps['variant']>;
}>`
  min-height: ${({ $size }) => ($size === 'large' ? 56 : 54)}px;
  ${({ $fill }) => $fill && 'width: 100%;'}
  align-items: center;
  justify-content: center;
  padding: ${({ $size }) => ($size === 'large' ? '12px 20px' : '10px 18px')};
  background-color: ${({ $variant }) => ($variant === 'primary' ? AppColors.ink : AppColors.paperStrong)};
  border: 2px solid ${AppColors.ink};
  border-radius: ${Radii.control}px;
  opacity: ${({ disabled }) => (disabled ? 0.35 : 1)};
`;

const ButtonLabel = styled.Text<{
  readonly $size: NonNullable<ButtonProps['size']>;
  readonly $variant: NonNullable<ButtonProps['variant']>;
}>`
  color: ${({ $variant }) => ($variant === 'primary' ? AppColors.yellow : AppColors.ink)};
  font-size: ${({ $size }) => ($size === 'large' ? 17 : 16)}px;
  font-weight: 900;
`;
