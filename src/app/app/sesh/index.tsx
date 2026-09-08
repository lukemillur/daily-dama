import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';

import { Screen } from '@/components/ui/screen';
import { useAuthState } from '@/features/auth/state/auth-provider';
import { useCustomTricks } from '@/features/custom-tricks/state/custom-trick-provider';
import { useRequireOnboarding } from '@/features/onboarding/state/require-onboarding';
import { Sesh } from '@/features/sesh/components/sesh';
import { selectInitialSeshPlan } from '@/features/profile/model/user-profile';
import { useUserProfile } from '@/features/profile/state/user-profile-provider';
import { KENDAMA_KENTEI_TRICKS } from '@/features/tricks/data/kendama-kentei-tricks';
import { selectAvailablePracticeTricks } from '@/features/tricks/model/trick-directory';

export default function SeshScreen() {
  const isOnboardingComplete = useRequireOnboarding();
  const {
    trickId: trickIdParam,
    plannedDurationMs: plannedDurationMsParam,
    mode: modeParam,
  } = useLocalSearchParams<{
    trickId?: string | string[];
    plannedDurationMs?: string | string[];
    mode?: string | string[];
  }>();
  const { lastSesh, selectedTrickIds } = useUserProfile();
  const { tricks: customTricks } = useCustomTricks();
  const authState = useAuthState();
  const availableTricks = useMemo(
    () => selectAvailablePracticeTricks(KENDAMA_KENTEI_TRICKS, customTricks),
    [customTricks],
  );
  const linkedTrickId = typeof trickIdParam === 'string' ? trickIdParam : undefined;
  const isDirectPractice =
    linkedTrickId !== undefined && (typeof modeParam === 'string' ? modeParam : undefined) === 'practice';
  const preferredTrickId = linkedTrickId ?? lastSesh?.trickId;
  const challengeDurationMs =
    typeof plannedDurationMsParam === 'string' ? Number(plannedDurationMsParam) : undefined;
  const initialPlan = selectInitialSeshPlan(lastSesh, challengeDurationMs);

  if (!isOnboardingComplete) return null;

  return (
    <Screen edges={['top', 'left', 'right']}>
      <Sesh
        availableTricks={availableTricks}
        initialPlan={initialPlan}
        preferredTrickId={preferredTrickId}
        directPracticeTrickId={isDirectPractice ? linkedTrickId : undefined}
        selectedTrickIds={selectedTrickIds}
        authStatus={authState.status}
      />
    </Screen>
  );
}
