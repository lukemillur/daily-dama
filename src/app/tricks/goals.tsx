import { useRouter } from 'expo-router';

import { Screen } from '@/components/ui/screen';
import { AllTrickGoalsScreen } from '@/features/goals/components/all-trick-goals-screen';
import { useRequireOnboarding } from '@/features/onboarding/state/require-onboarding';
import { useCustomTricks } from '@/features/custom-tricks/state/custom-trick-provider';
import { useUserProfile } from '@/features/profile/state/user-profile-provider';
import { KENDAMA_KENTEI_TRICKS } from '@/features/tricks/data/kendama-kentei-tricks';
import { createProfileDirectoryTricks } from '@/features/tricks/model/trick-directory';
import { useMemo } from 'react';

export default function AllGoalsRoute() {
  const isOnboardingComplete = useRequireOnboarding();
  const { tricks } = useCustomTricks();
  const { selectedTrickIds } = useUserProfile();
  const router = useRouter();
  const directoryTricks = useMemo(() => createProfileDirectoryTricks(KENDAMA_KENTEI_TRICKS, tricks), [tricks]);
  if (!isOnboardingComplete) return null;
  return <Screen edges={['top', 'left', 'right']}><AllTrickGoalsScreen tricks={directoryTricks} focusedTrickIds={selectedTrickIds} onBack={() => router.replace('/tricks')} /></Screen>;
}
