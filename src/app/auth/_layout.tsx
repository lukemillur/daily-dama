import { Slot } from 'expo-router';

import { CachedAppThemeProvider } from '@/features/profile/components/app-theme-provider';
import { AccountUnavailableScreen } from '@/features/auth/components/account-unavailable-screen';
import { useAccountsAvailable } from '@/features/auth/model/account-availability';
import { PendingVerificationEmailProvider } from '@/features/auth/state/pending-verification-email';

export default function AuthLayout() {
  const accountsAvailable = useAccountsAvailable();

  return (
    <CachedAppThemeProvider>
      <PendingVerificationEmailProvider>
        {accountsAvailable ? <Slot /> : <AccountUnavailableScreen />}
      </PendingVerificationEmailProvider>
    </CachedAppThemeProvider>
  );
}
