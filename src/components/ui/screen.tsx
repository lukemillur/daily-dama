import { useContext, type ComponentProps, type ReactNode } from 'react';
import { HeaderHeightContext } from 'expo-router/build/react-navigation/elements';
import { Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { styled, ThemeContext } from 'styled-components/native';

import { AppColors } from '@/constants/theme';

type SafeAreaProps = ComponentProps<typeof SafeAreaView>;
type Edges = NonNullable<SafeAreaProps['edges']>;
const ALL_EDGES: Edges = ['top', 'right', 'bottom', 'left'];

interface ScreenProps extends SafeAreaProps {
  readonly children: ReactNode;
  readonly background?: string;
  readonly align?: 'stretch' | 'center';
  readonly includeWebHeaderInset?: boolean;
  readonly webBottomInset?: number;
}

function withoutTopEdge(edges: Edges): Edges {
  return Array.isArray(edges)
    ? (edges as readonly string[]).filter((edge) => edge !== 'top') as unknown as Edges
    : { ...edges, top: 'off' };
}

export function Screen(props: ScreenProps) {
  const align = props.align ?? 'stretch';
  const background = props.background;
  const children = props.children;
  const includeWebHeaderInset = props.includeWebHeaderInset ?? true;
  const webBottomInset = props.webBottomInset ?? 0;
  const theme = useContext(ThemeContext);
  // A visible native stack header already consumes the top inset; keeping the 'top' edge would
  // double the gap above the content. The context is 0 or absent when no header is shown.
  const hasNativeHeader = (useContext(HeaderHeightContext) ?? 0) > 0;
  const edges = hasNativeHeader ? withoutTopEdge(props.edges ?? ALL_EDGES) : props.edges;
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
      {...restProps}
      edges={edges}>
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
