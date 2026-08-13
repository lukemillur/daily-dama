import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';

import { Screen } from '@/components/ui/screen';
import { useCustomTricks } from '@/features/custom-tricks/state/custom-trick-provider';
import { useRequireOnboarding } from '@/features/onboarding/state/require-onboarding';
import { Sesh } from '@/features/sesh/components/sesh';
import { useUserProfile } from '@/features/profile/state/user-profile-provider';
import { createOpenEndedSeshPlan, createTimedSeshPlan, type SeshPlan } from '@/features/sesh/model/sesh';
import { KENDAMA_KENTEI_TRICKS } from '@/features/tricks/data/kendama-kentei-tricks';
import { selectAvailablePracticeTricks } from '@/features/tricks/model/trick-directory';

export default function SeshScreen() {
  const isOnboardingComplete = useRequireOnboarding();
  const { trickId: trickIdParam, plannedDurationMs: plannedDurationMsParam } = useLocalSearchParams<{
    trickId?: string | string[];
    plannedDurationMs?: string | string[];
  }>();
  const { lastSesh, selectedTrickIds } = useUserProfile();
  const { tricks: customTricks } = useCustomTricks();
  const availableTricks = useMemo(
    () => selectAvailablePracticeTricks(KENDAMA_KENTEI_TRICKS, customTricks),
    [customTricks],
  );
  const preferredTrickId =
    (typeof trickIdParam === 'string' ? trickIdParam : undefined) ?? lastSesh?.trickId;
  const challengeDurationMs =
    typeof plannedDurationMsParam === 'string' ? Number(plannedDurationMsParam) : undefined;
  const initialPlan: SeshPlan | undefined = challengeDurationMs
    ? createTimedSeshPlan(challengeDurationMs / 60_000)
    : lastSesh
      ? lastSesh.plan.kind === 'timed'
        ? createTimedSeshPlan(lastSesh.plan.durationMinutes)
        : createOpenEndedSeshPlan(lastSesh.plan.targetLandingCount)
      : undefined;

  if (!isOnboardingComplete) return null;

  return (
    <Screen edges={['top', 'left', 'right']}>
      <Sesh
        availableTricks={availableTricks}
        initialPlan={initialPlan}
        preferredTrickId={preferredTrickId}
        selectedTrickIds={selectedTrickIds}
      />
    </Screen>
  );
}
