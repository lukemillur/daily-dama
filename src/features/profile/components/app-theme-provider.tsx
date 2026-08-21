import type { PropsWithChildren } from 'react';
import { ThemeProvider as StyledThemeProvider } from 'styled-components/native';

import { resolveTheme, useResolvedTheme } from '@/features/profile/state/use-resolved-theme';

/**
 * Mounts the styled-components theme (resolved from the user's saved theme preferences, or the
 * fixed prototype palette when unset) so post-onboarding screens can read `theme.background`/
 * `theme.accent` via the automatic `theme` prop. Must be mounted inside `UserProfileProvider`.
 */
export function AppThemeProvider({ children }: PropsWithChildren) {
  const theme = useResolvedTheme();
  return <StyledThemeProvider theme={theme}>{children}</StyledThemeProvider>;
}

/**
 * Mounts the fixed prototype-palette styled-components theme (`resolveTheme({})`, with no user
 * preferences applied) for routes -- currently just the landing route, `/` -- that render
 * outside `UserProfileProvider` and so cannot call `useResolvedTheme()`. This is a no-op for the
 * common case: theme fields are only ever set post-onboarding, so every pre-onboarding user
 * already sees exactly this resolved theme today. The one behavior change is a returning user
 * who has picked custom theme colors and navigates back out to `/`: they'll see the fixed
 * default palette here instead of their personal colors, matching every other landing surface
 * (`CtaPanel`, `Screen`'s explicit `background={AppColors.paper}`, etc.), which already use the
 * fixed palette rather than the personalized theme.
 */
export function DefaultAppThemeProvider({ children }: PropsWithChildren) {
  return <StyledThemeProvider theme={resolveTheme({})}>{children}</StyledThemeProvider>;
}
