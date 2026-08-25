import type { PropsWithChildren } from 'react';
import { ThemeProvider as StyledThemeProvider } from 'styled-components/native';

import { useCachedGuestTheme } from '@/features/profile/state/use-cached-guest-theme';
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
 * preferences applied) for routes that render outside `UserProfileProvider` and so cannot call
 * `useResolvedTheme()` -- currently just the landing route, `/`. This remains the ambient default
 * inherited pre-hydration by every route (including the auth route group), but the auth route
 * group now overrides it with its own resolved theme via `CachedAppThemeProvider` below rather
 * than settling on this fixed value. This is a no-op for the common case: theme fields are only
 * ever set post-onboarding, so every pre-onboarding user already sees exactly this resolved theme
 * today. The one behavior change is a returning user who has picked custom theme colors and
 * navigates back out to `/`: they'll see the fixed default palette here instead of their personal
 * colors, matching every other landing surface (`CtaPanel`, `Screen`'s explicit
 * `background={AppColors.paper}`, etc.), which already use the fixed palette rather than the
 * personalized theme.
 */
export function DefaultAppThemeProvider({ children }: PropsWithChildren) {
  return <StyledThemeProvider theme={resolveTheme({})}>{children}</StyledThemeProvider>;
}

/**
 * Mounts a styled-components theme resolved from a synchronous, pre-hydration cache read of the
 * guest-scoped user profile (see `useCachedGuestTheme`), for the auth route group (sign-up,
 * sign-in, forgot-password, reset-password). Those screens render entirely outside
 * `IdentityProvider`/`UserProfileProvider` and must not gate first paint on their hydration (see
 * T145), so this cannot use `useResolvedTheme()` the way `AppThemeProvider` does. See
 * `useCachedGuestTheme`'s doc comment for the guest-scoping rationale and the documented
 * reset-password approximation.
 */
export function CachedAppThemeProvider({ children }: PropsWithChildren) {
  const theme = useCachedGuestTheme();
  return <StyledThemeProvider theme={theme}>{children}</StyledThemeProvider>;
}
