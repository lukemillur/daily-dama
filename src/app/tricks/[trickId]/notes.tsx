import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo } from 'react';

import { Screen } from '@/components/ui/screen';
import { useCustomTricks } from '@/features/custom-tricks/state/custom-trick-provider';
import { TrickNotesScreen } from '@/features/notes/components/trick-notes-screen';
import { useRequireOnboarding } from '@/features/onboarding/state/require-onboarding';
import { KENDAMA_KENTEI_TRICKS } from '@/features/tricks/data/kendama-kentei-tricks';
import { createProfileDirectoryTricks } from '@/features/tricks/model/trick-directory';

export default function TrickNotesRoute() {
  const { trickId } = useLocalSearchParams<{ readonly trickId?: string }>();
  const isOnboardingComplete = useRequireOnboarding();
  const { tricks } = useCustomTricks();
  const router = useRouter();
  const directoryTricks = useMemo(() => createProfileDirectoryTricks(KENDAMA_KENTEI_TRICKS, tricks), [tricks]);
  const trick = typeof trickId === 'string' ? directoryTricks.find((candidate) => candidate.id === trickId) : undefined;

  useEffect(() => {
    if (isOnboardingComplete && !trick) router.replace('/tricks');
  }, [isOnboardingComplete, router, trick]);

  if (!isOnboardingComplete || !trick) return null;
  return <Screen edges={['top', 'left', 'right']}><TrickNotesScreen trickId={trick.id} trickName={trick.name} onBack={() => router.replace('/tricks')} /></Screen>;
}
