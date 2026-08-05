import type { ComponentProps, ReactNode } from 'react';
import { Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { styled } from 'styled-components/native';

import { AppColors } from '@/constants/theme';

type SafeAreaProps = ComponentProps<typeof SafeAreaView>;

interface ScreenProps extends SafeAreaProps {
  readonly children: ReactNode;
  readonly background?: string;
  readonly align?: 'stretch' | 'center';
  readonly includeWebHeaderInset?: boolean;
  readonly webBottomInset?: number;
}

export function Screen({
  align = 'stretch',
  background = AppColors.sage,
  children,
  includeWebHeaderInset = true,
  webBottomInset = 0,
  ...props
}: ScreenProps) {
  return (
    <Root
      $align={align}
      $background={background}
      $includeWebHeaderInset={includeWebHeaderInset}
      $webBottomInset={webBottomInset}
      {...props}>
      {children}
    </Root>
  );
}

const Root = styled(SafeAreaView)<{
  readonly $align: NonNullable<ScreenProps['align']>;
  readonly $background: string;
  readonly $includeWebHeaderInset: boolean;
  readonly $webBottomInset: number;
}>`
  flex: 1;
  width: 100%;
  align-items: ${({ $align }) => $align};
  padding-top: ${({ $includeWebHeaderInset }) =>
    Platform.OS === 'web' && $includeWebHeaderInset ? 88 : 0}px;
  padding-bottom: ${({ $webBottomInset }) => (Platform.OS === 'web' ? $webBottomInset : 0)}px;
  background-color: ${({ $background }) => $background};
`;
