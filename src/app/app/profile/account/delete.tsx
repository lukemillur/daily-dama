import { AccountDeletionScreen } from '@/features/auth/components/account-deletion-screen';
import { useRequireOnboarding } from '@/features/onboarding/state/require-onboarding';

export default function AccountDeletionRoute() {
  const isOnboardingComplete = useRequireOnboarding();
  if (!isOnboardingComplete) return null;
  return <AccountDeletionScreen />;
}
