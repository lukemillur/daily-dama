import { Slot } from 'expo-router';

import { CachedAppThemeProvider } from '@/features/profile/components/app-theme-provider';
import { PendingVerificationEmailProvider } from '@/features/auth/state/pending-verification-email';

export default function AuthLayout() {
  return (
    <CachedAppThemeProvider>
      <PendingVerificationEmailProvider>
        <Slot />
      </PendingVerificationEmailProvider>
    </CachedAppThemeProvider>
  );
}
