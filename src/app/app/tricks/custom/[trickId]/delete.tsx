import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';

import { Screen } from '@/components/ui/screen';
import { DeleteConfirmation } from '@/app/app/tricks';
import { useCustomTricks } from '@/features/custom-tricks/state/custom-trick-provider';
import { useRequireOnboarding } from '@/features/onboarding/state/require-onboarding';

export default function DeleteCustomTrickRoute() {
  const { trickId } = useLocalSearchParams<{ readonly trickId?: string }>();
  const isOnboardingComplete = useRequireOnboarding();
  const { tricks } = useCustomTricks();
  const router = useRouter();
  const trick = typeof trickId === 'string' ? tricks.find((candidate) => candidate.id === trickId) : undefined;
  useEffect(() => { if (isOnboardingComplete && !trick) router.replace('/app/tricks'); }, [isOnboardingComplete, router, trick]);
  if (!isOnboardingComplete || !trick) return null;
  return <Screen edges={['top', 'left', 'right']}><DeleteConfirmation trick={trick} onCancel={() => router.replace('/app/tricks')} onDeleted={() => router.replace('/app/tricks')} /></Screen>;
}
