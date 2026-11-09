import type { Href, NativeStackNavigationOptions } from 'expo-router';
import { Platform } from 'react-native';

import { useResolvedTheme, type ResolvedTheme } from '@/features/profile/state/use-resolved-theme';
import { blendHexColors } from '@/shared/color/blend';

import { HeaderBackFallback } from './nested-header-back';

/** Header colors come from the saved app theme, never the system appearance. */
export function deriveNestedHeaderColors(theme: ResolvedTheme) {
  return {
    background: theme.background,
    tint: theme.text,
    title: theme.text,
    border: blendHexColors(theme.text, theme.background, 0.2),
  };
}

export function deriveNestedStackScreenOptions(
  theme: ResolvedTheme,
  platformOS: string = Platform.OS,
): NativeStackNavigationOptions {
  if (platformOS === 'web') return { headerShown: false };
  const colors = deriveNestedHeaderColors(theme);
  return {
    headerShown: true,
    headerStyle: { backgroundColor: colors.background },
    headerTintColor: colors.tint,
    headerTitleStyle: { color: colors.title },
    headerShadowVisible: true,
    headerBackButtonDisplayMode: 'minimal',
    contentStyle: { backgroundColor: colors.background },
  };
}

/**
 * Tricks index header: web keeps the in-list header block, native shows a large title that
 * collapses with the list. Search and header buttons are supplied by the route (they need state).
 */
export function deriveTricksIndexScreenOptions(
  theme: ResolvedTheme,
  platformOS: string = Platform.OS,
): NativeStackNavigationOptions {
  if (platformOS === 'web') return { headerShown: false };
  const colors = deriveNestedHeaderColors(theme);
  return {
    title: 'Tricks',
    headerLargeTitleEnabled: true,
    headerLargeTitleStyle: { color: colors.title },
    // iOS 26 hides the large title when the header has an opaque background colour; the screen's
    // own `contentStyle` background shows through the translucent bar instead.
    headerStyle: { backgroundColor: 'transparent' },
    headerLargeTitleShadowVisible: false,
  };
}

export function useTricksIndexScreenOptions(): NativeStackNavigationOptions {
  return deriveTricksIndexScreenOptions(useResolvedTheme());
}

export function useNestedStackScreenOptions(): NativeStackNavigationOptions {
  return deriveNestedStackScreenOptions(useResolvedTheme());
}

/**
 * Per-screen options: when the stack has no history, supply a back control that returns to the
 * parent section instead of leaving the header without one.
 */
export function deriveNestedScreenOptions(
  canGoBack: boolean,
  parent: { readonly href: Href; readonly label: string },
  tintColor: string,
): NativeStackNavigationOptions {
  if (canGoBack) return {};
  return {
    headerLeft: () => (
      <HeaderBackFallback href={parent.href} parentLabel={parent.label} tintColor={tintColor} />
    ),
  };
}

type NestedParent = { readonly href: Href; readonly label: string };

/**
 * Returns a factory for per-screen `options` that set the title and, on native, fall back to a
 * parent link when the stack has no history. Web shows no header, so the factory is inert there.
 */
export function useNestedScreenOptions(parent: NestedParent) {
  const theme = useResolvedTheme();
  const tint = deriveNestedHeaderColors(theme).tint;
  return (title: string) =>
    ({ navigation }: { navigation: { getState: () => { readonly routes: readonly unknown[] } } }): NativeStackNavigationOptions => ({
      title,
      // The stack's own history, not `navigation.canGoBack()`: that also counts parent navigators
      // (tab history), which would hide the fallback on a single-entry stack.
      ...(Platform.OS === 'web'
        ? {}
        : deriveNestedScreenOptions(navigation.getState().routes.length > 1, parent, tint)),
    });
}
