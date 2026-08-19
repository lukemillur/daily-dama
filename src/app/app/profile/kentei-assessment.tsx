import { Screen } from '@/components/ui/screen';
import { useRequireOnboarding } from '@/features/onboarding/state/require-onboarding';
import { AssessmentEntry } from '@/features/sesh/components/assessment-entry';

export default function KenteiAssessmentScreen() {
  const isOnboardingComplete = useRequireOnboarding();

  if (!isOnboardingComplete) return null;

  return (
    <Screen align="center" edges={['top', 'left', 'right']}>
      <AssessmentEntry />
    </Screen>
  );
}
