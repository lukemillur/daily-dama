import { useRouter } from 'expo-router';

import { Screen } from '@/components/ui/screen';
import { AllNotesScreen } from '@/features/notes/components/all-notes-screen';
import { useRequireOnboarding } from '@/features/onboarding/state/require-onboarding';

export default function AllNotesRoute() {
  const isOnboardingComplete = useRequireOnboarding();
  const router = useRouter();
  if (!isOnboardingComplete) return null;
  return <Screen edges={['top', 'left', 'right']}><AllNotesScreen onBack={() => router.replace('/app/tricks')} /></Screen>;
}
