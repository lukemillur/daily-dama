import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';

import { Screen } from '@/components/ui/screen';
import { useCustomTricks } from '@/features/custom-tricks/state/custom-trick-provider';
import { Sesh } from '@/features/sesh/components/sesh';
import { useUserProfile } from '@/features/profile/state/user-profile-provider';
import { createTimedSeshPlan, OPEN_ENDED_SESH_PLAN, type SeshPlan } from '@/features/sesh/model/sesh';
import { KENDAMA_KENTEI_TRICKS } from '@/features/tricks/data/kendama-kentei-tricks';
import { selectAvailablePracticeTricks } from '@/features/tricks/model/trick-directory';

export default function SeshScreen() {
  const { trickId: trickIdParam } = useLocalSearchParams<{ trickId?: string | string[] }>();
  const { lastSesh, selectedTrickIds } = useUserProfile();
  const { tricks: customTricks } = useCustomTricks();
  const availableTricks = useMemo(
    () => selectAvailablePracticeTricks(KENDAMA_KENTEI_TRICKS, customTricks),
    [customTricks],
  );
  const preferredTrickId =
    (typeof trickIdParam === 'string' ? trickIdParam : undefined) ?? lastSesh?.trickId;
  const initialPlan: SeshPlan | undefined = lastSesh
    ? lastSesh.plan.kind === 'timed'
      ? createTimedSeshPlan(lastSesh.plan.durationMinutes)
      : OPEN_ENDED_SESH_PLAN
    : undefined;

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
