import { AccountSecurityScreen } from '@/features/auth/components/account-security-screen';
import { useRequireOnboarding } from '@/features/onboarding/state/require-onboarding';

export default function AccountSecurityRoute() {
  const isOnboardingComplete = useRequireOnboarding();

  if (!isOnboardingComplete) return null;

  return <AccountSecurityScreen />;
}
