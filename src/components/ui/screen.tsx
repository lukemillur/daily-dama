import { useContext, type ComponentProps, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { styled, ThemeContext } from 'styled-components/native';

import { AppColors } from '@/constants/theme';

type SafeAreaProps = ComponentProps<typeof SafeAreaView>;

interface ScreenProps extends SafeAreaProps {
  readonly children: ReactNode;
  readonly background?: string;
  readonly align?: 'stretch' | 'center';
  readonly includeWebHeaderInset?: boolean;
  readonly webBottomInset?: number;
}

export function Screen(props: ScreenProps) {
  const align = props.align ?? 'stretch';
  const background = props.background;
  const children = props.children;
  const includeWebHeaderInset = props.includeWebHeaderInset ?? true;
  const webBottomInset = props.webBottomInset ?? 0;
  const theme = useContext(ThemeContext);
  const resolvedBackground = background ?? theme?.background ?? AppColors.sage;
  const restProps: Record<string, unknown> = { ...props };
  delete restProps.align;
  delete restProps.background;
  delete restProps.children;
  delete restProps.includeWebHeaderInset;
  delete restProps.webBottomInset;
  return (
    <Root
      $align={align}
      $background={resolvedBackground}
      $includeWebHeaderInset={includeWebHeaderInset}
      $webBottomInset={webBottomInset}
      {...restProps}>
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
