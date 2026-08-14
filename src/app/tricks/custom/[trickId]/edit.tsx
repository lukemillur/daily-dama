import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';

import { Screen } from '@/components/ui/screen';
import { CustomTrickForm } from '@/app/tricks';
import { useCustomTricks } from '@/features/custom-tricks/state/custom-trick-provider';
import { useRequireOnboarding } from '@/features/onboarding/state/require-onboarding';

export default function EditCustomTrickRoute() {
  const { trickId } = useLocalSearchParams<{ readonly trickId?: string }>();
  const isOnboardingComplete = useRequireOnboarding();
  const { tricks } = useCustomTricks();
  const router = useRouter();
  const trick = typeof trickId === 'string' ? tricks.find((candidate) => candidate.id === trickId) : undefined;
  useEffect(() => { if (isOnboardingComplete && !trick) router.replace('/tricks'); }, [isOnboardingComplete, router, trick]);
  if (!isOnboardingComplete || !trick) return null;
  return <Screen edges={['top', 'left', 'right']}><CustomTrickForm initialTrick={trick} kind={trick.kind} onCancel={() => router.replace('/tricks')} onSaved={() => router.replace('/tricks')} /></Screen>;
}
