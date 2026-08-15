import type { PropsWithChildren } from 'react';
import { ThemeProvider as StyledThemeProvider } from 'styled-components/native';

import { useResolvedTheme } from '@/features/profile/state/use-resolved-theme';

/**
 * Mounts the styled-components theme (resolved from the user's saved theme preferences, or the
 * fixed prototype palette when unset) so post-onboarding screens can read `theme.background`/
 * `theme.accent` via the automatic `theme` prop. Must be mounted inside `UserProfileProvider`.
 */
export function AppThemeProvider({ children }: PropsWithChildren) {
  const theme = useResolvedTheme();
  return <StyledThemeProvider theme={theme}>{children}</StyledThemeProvider>;
}
