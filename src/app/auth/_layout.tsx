import { Slot } from 'expo-router';

import { PendingVerificationEmailProvider } from '@/features/auth/state/pending-verification-email';

export default function AuthLayout() {
  return (
    <PendingVerificationEmailProvider>
      <Slot />
    </PendingVerificationEmailProvider>
  );
}
