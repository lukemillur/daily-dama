import { Slot } from 'expo-router';

import { AppStatusBar } from '@/components/app-status-bar';
import { CachedAppThemeProvider } from '@/features/profile/components/app-theme-provider';
import { useCachedGuestTheme } from '@/features/profile/state/use-cached-guest-theme';
import { AccountUnavailableScreen } from '@/features/auth/components/account-unavailable-screen';
import { useAccountsAvailable } from '@/features/auth/model/account-availability';
import { PendingVerificationEmailProvider } from '@/features/auth/state/pending-verification-email';
import { HideSplashWhenMounted } from '@/shared/splash/splash-ready';

/** The single status-bar owner for the auth route group; reads the same cached theme as its screens. */
function AuthStatusBar() {
  return <AppStatusBar background={useCachedGuestTheme().background} />;
}

export default function AuthLayout() {
  const accountsAvailable = useAccountsAvailable();

  return (
    <CachedAppThemeProvider>
      <AuthStatusBar />
      <HideSplashWhenMounted />
      <PendingVerificationEmailProvider>
        {accountsAvailable ? <Slot /> : <AccountUnavailableScreen />}
      </PendingVerificationEmailProvider>
    </CachedAppThemeProvider>
  );
}
