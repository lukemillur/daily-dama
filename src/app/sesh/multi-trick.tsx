import { Screen } from '@/components/ui/screen';
import { useRequireOnboarding } from '@/features/onboarding/state/require-onboarding';
import { MultiTrickSeshEntry } from '@/features/sesh/components/multi-trick-sesh-entry';

export default function SeshMultiTrickScreen() {
  const isOnboardingComplete = useRequireOnboarding();

  if (!isOnboardingComplete) return null;

  return (
    <Screen align="center" edges={['top', 'left', 'right']}>
      <MultiTrickSeshEntry />
    </Screen>
  );
}
