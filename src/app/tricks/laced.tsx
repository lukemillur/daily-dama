import { useRouter } from 'expo-router';
import { useMemo } from 'react';

import { Screen } from '@/components/ui/screen';
import { useRequireOnboarding } from '@/features/onboarding/state/require-onboarding';
import { useCustomTricks } from '@/features/custom-tricks/state/custom-trick-provider';
import { useUserProfileActions, useUserProfile } from '@/features/profile/state/user-profile-provider';
import { usePracticeHistory } from '@/features/stats/state/practice-history-provider';
import { LacedTricksScreen } from '@/features/tricks/components/laced-tricks-screen';
import { KENDAMA_KENTEI_TRICKS } from '@/features/tricks/data/kendama-kentei-tricks';
import { createProfileDirectoryTricks, selectEffectiveLacedTrickIds, selectLacedTrickIds } from '@/features/tricks/model/trick-directory';

export default function LacedRoute() {
  const isOnboardingComplete = useRequireOnboarding();
  const { tricks } = useCustomTricks();
  const { manuallyUnlockedTrickIds = [] } = useUserProfile();
  const { toggleManualUnlock } = useUserProfileActions();
  const { sessions } = usePracticeHistory();
  const router = useRouter();
  const directoryTricks = useMemo(() => createProfileDirectoryTricks(KENDAMA_KENTEI_TRICKS, tricks), [tricks]);
  const unlockedTrickIds = useMemo(() => selectEffectiveLacedTrickIds(selectLacedTrickIds(sessions), manuallyUnlockedTrickIds), [manuallyUnlockedTrickIds, sessions]);
  if (!isOnboardingComplete) return null;
  return <Screen edges={['top', 'left', 'right']}><LacedTricksScreen tricks={directoryTricks} unlockedTrickIds={unlockedTrickIds} onToggleTrick={toggleManualUnlock} onBack={() => router.replace('/tricks')} /></Screen>;
}
